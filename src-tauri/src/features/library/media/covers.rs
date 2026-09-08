//! The artwork a track carries, and the colours it is made of.
//!
//! Telegram keeps the picture inside the file, so changing a cover means
//! rewriting the file and uploading it again.

use std::path::Path;

use anyhow::{Context, Result};
use lofty::file::TaggedFileExt;
use sqlx::SqlitePool;

use crate::shared::media_paths;
use crate::shared::models::Track;

#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct Cover {
    pub(crate) path: String,
    pub(crate) palette: Vec<String>,
}

/// The two or three colours a cover is made of, for painting a page behind it.
///
/// Binned rather than averaged: averaging gives the same brown-grey for
/// everything. The picks are kept apart, or one hue returns three shades.
fn palette_of(bytes: &[u8]) -> Vec<String> {
    const BUCKETS: u32 = 5;
    const SIDE: u32 = 24;

    let Ok(image) = image::load_from_memory(bytes) else {
        return Vec::new();
    };
    let small = image
        .resize_exact(SIDE, SIDE, image::imageops::FilterType::Triangle)
        .to_rgb8();

    let step = 256 / BUCKETS;
    let mut bins: std::collections::HashMap<u32, (u64, u64, u64, u32, f32)> =
        std::collections::HashMap::new();

    for pixel in small.pixels() {
        let [r, g, b] = pixel.0;
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        if max < 10 || min > 248 {
            continue; // only the pure extremes say nothing about a cover
        }
        let saturation = if max == 0 {
            0.0
        } else {
            (max - min) as f32 / max as f32
        };
        let key =
            (r as u32 / step) * BUCKETS * BUCKETS + (g as u32 / step) * BUCKETS + (b as u32 / step);

        let entry = bins.entry(key).or_insert((0, 0, 0, 0, 0.0));
        entry.0 += r as u64;
        entry.1 += g as u64;
        entry.2 += b as u64;
        entry.3 += 1;
        entry.4 += 0.5 + saturation * 1.5;
    }

    let mut ranked: Vec<(f32, [u8; 3])> = bins
        .into_values()
        .map(|(r, g, b, count, score)| {
            let count = count.max(1) as u64;
            (
                score,
                [(r / count) as u8, (g / count) as u8, (b / count) as u8],
            )
        })
        .collect();
    ranked.sort_by(|a, b| b.0.total_cmp(&a.0));

    let mut picked: Vec<[u8; 3]> = Vec::new();
    for (_, colour) in ranked {
        if picked.len() == 3 {
            break;
        }
        let distinct = picked.iter().all(|chosen| {
            let distance = chosen
                .iter()
                .zip(colour.iter())
                .map(|(a, b)| (*a as i32 - *b as i32).abs())
                .sum::<i32>();
            distance >= 70
        });
        if distinct {
            picked.push(colour);
        }
    }

    picked
        .into_iter()
        .map(|[r, g, b]| format!("rgb({r}, {g}, {b})"))
        .collect()
}

/// The one colour a picture reads as, for tinting the page behind it.
///
/// This used to happen in the webview: the file crossed IPC as a base64 data
/// URL, became an `Image`, and was drawn to a canvas only to read 48x48 pixels
/// back out. Per cover that put a megabyte of string plus a full-size decoded
/// bitmap into the renderer, and the renderer was left holding it.
pub(crate) fn ambient_colour_of(bytes: &[u8]) -> Option<String> {
    const SIDE: u32 = 48;

    let image = image::load_from_memory(bytes).ok()?;
    let small = image
        .resize_exact(SIDE, SIDE, image::imageops::FilterType::Triangle)
        .to_rgba8();

    let (r, g, b) = dominant_colour(&small)?;
    let [r, g, b] = boost_vividness(r, g, b);
    Some(format!("{r}, {g}, {b}"))
}

fn saturation_of(r: f32, g: f32, b: f32) -> f32 {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    if max <= 0.0 {
        0.0
    } else {
        (max - min) / max
    }
}

/// The heaviest bin of the picture, weighted towards saturated mid-tones: a
/// plain average gives the same brown-grey for every cover.
fn dominant_colour(image: &image::RgbaImage) -> Option<(f32, f32, f32)> {
    #[derive(Default)]
    struct Bin {
        weight: f32,
        r: f64,
        g: f64,
        b: f64,
        n: u32,
    }

    let mut bins: std::collections::HashMap<u32, Bin> = std::collections::HashMap::new();
    for pixel in image.pixels() {
        let [r, g, b, alpha] = pixel.0;
        if alpha < 200 {
            continue;
        }
        let max = r.max(g).max(b);
        if max < 60 || (r > 240 && g > 240 && b > 240) {
            continue; // near-black and near-white say nothing about a cover
        }

        let key = ((r as u32 >> 4) << 8) | ((g as u32 >> 4) << 4) | (b as u32 >> 4);
        let lightness = (max as f32 + r.min(g).min(b) as f32) / 510.0;
        let slot = bins.entry(key).or_default();
        slot.weight += (saturation_of(r as f32, g as f32, b as f32) + 0.1)
            * (1.0 - (lightness - 0.5).abs() * 1.6).max(0.05);
        slot.r += f64::from(r);
        slot.g += f64::from(g);
        slot.b += f64::from(b);
        slot.n += 1;
    }

    let best = bins
        .into_values()
        .max_by(|a, b| a.weight.total_cmp(&b.weight))?;
    let n = f64::from(best.n.max(1));
    Some((
        (best.r / n) as f32,
        (best.g / n) as f32,
        (best.b / n) as f32,
    ))
}

/// Covers run dark and muddy more often than not, and a tint has to read
/// against the page, so the pick is pushed towards something worth painting.
fn boost_vividness(r: f32, g: f32, b: f32) -> [u8; 3] {
    let (rn, gn, bn) = (r / 255.0, g / 255.0, b / 255.0);
    let max = rn.max(gn).max(bn);
    let min = rn.min(gn).min(bn);
    let lightness = (max + min) / 2.0;

    let mut hue = 0.0f32;
    let mut saturation = 0.0f32;
    if max != min {
        let d = max - min;
        saturation = if lightness > 0.5 {
            d / (2.0 - max - min)
        } else {
            d / (max + min)
        };
        hue = if max == rn {
            (gn - bn) / d + if gn < bn { 6.0 } else { 0.0 }
        } else if max == gn {
            (bn - rn) / d + 2.0
        } else {
            (rn - gn) / d + 4.0
        };
        hue /= 6.0;
    }

    let saturation = (saturation + 0.15).min(1.0);
    let lightness = (lightness * 1.15).clamp(0.46, 0.6);

    if saturation <= 0.0 {
        let value = (lightness * 255.0).round() as u8;
        return [value, value, value];
    }

    let q = if lightness < 0.5 {
        lightness * (1.0 + saturation)
    } else {
        lightness + saturation - lightness * saturation
    };
    let p = 2.0 * lightness - q;
    [
        (hue_to_rgb(p, q, hue + 1.0 / 3.0) * 255.0).round() as u8,
        (hue_to_rgb(p, q, hue) * 255.0).round() as u8,
        (hue_to_rgb(p, q, hue - 1.0 / 3.0) * 255.0).round() as u8,
    ]
}

fn hue_to_rgb(p: f32, q: f32, t: f32) -> f32 {
    let t = if t < 0.0 {
        t + 1.0
    } else if t > 1.0 {
        t - 1.0
    } else {
        t
    };
    if t < 1.0 / 6.0 {
        p + (q - p) * 6.0 * t
    } else if t < 1.0 / 2.0 {
        q
    } else if t < 2.0 / 3.0 {
        p + (q - p) * (2.0 / 3.0 - t) * 6.0
    } else {
        p
    }
}

/// Reads tags leniently: channel audio carries malformed metadata - a year that
/// is not four digits - and lofty's default mode refuses the whole file over it.
pub(super) fn read_tags(
    path: &Path,
) -> std::result::Result<lofty::file::TaggedFile, lofty::error::LoftyError> {
    lofty::probe::Probe::open(path)?
        .options(
            lofty::config::ParseOptions::new().parsing_mode(lofty::config::ParsingMode::Relaxed),
        )
        .read()
}

// never displayed larger, and a 12 MP photograph would ride along in every copy
const COVER_LONGEST_SIDE: u32 = 1000;

/// Always JPEG, proportions kept. Decoding first refuses a broken file before
/// anything is written.
pub(crate) async fn encode_cover(picture: Vec<u8>) -> Result<Vec<u8>> {
    tokio::task::spawn_blocking(move || -> Result<Vec<u8>> {
        let decoded = image::load_from_memory(&picture).context("this file is not an image")?;
        let (width, height) = (decoded.width(), decoded.height());
        let resized = if width.max(height) > COVER_LONGEST_SIDE {
            decoded.resize(
                COVER_LONGEST_SIDE,
                COVER_LONGEST_SIDE,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            decoded
        };

        let mut out = std::io::Cursor::new(Vec::new());
        resized
            .into_rgb8()
            .write_to(&mut out, image::ImageFormat::Jpeg)
            .context("re-encoding the cover")?;
        Ok(out.into_inner())
    })
    .await?
}

/// Writes a picture into an audio file's tags. The edit only reaches the
/// channel once the file goes up again, so this runs before the upload.
pub(crate) async fn write_cover_into(audio: &Path, image: &Path) -> Result<()> {
    let picture = tokio::fs::read(image)
        .await
        .with_context(|| format!("reading {image:?}"))?;

    let picture = encode_cover(picture).await?;
    let mime = lofty::picture::MimeType::Jpeg;

    let audio = audio.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<()> {
        use lofty::file::{AudioFile, TaggedFileExt};
        use lofty::picture::{Picture, PictureType};
        use lofty::tag::Tag;

        let mut tagged = read_tags(&audio).context("reading the track's tags")?;
        if tagged.primary_tag_mut().is_none() {
            let kind = tagged.primary_tag_type();
            tagged.insert_tag(Tag::new(kind));
        }
        let tag = tagged
            .primary_tag_mut()
            .context("this file cannot hold tags")?;

        // ffmpeg files artwork under "Other" as often as "Cover (front)", and
        // lofty appends rather than replaces - removing only front covers left
        // the old picture ahead of the new one
        while !tag.pictures().is_empty() {
            tag.remove_picture(0);
        }
        tag.push_picture(Picture::new_unchecked(
            PictureType::CoverFront,
            Some(mime),
            None,
            picture,
        ));

        tagged
            .save_to_path(&audio, lofty::config::WriteOptions::default())
            .context("writing the cover into the track")
    })
    .await?
}

/// Any picture counts: ffmpeg marks artwork "Other" as often as "Cover
/// (front)". The front cover only wins when a file holds several.
fn embedded_picture(audio: &Path) -> Option<Vec<u8>> {
    let tagged = read_tags(audio).ok()?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    let pictures = tag.pictures();
    pictures
        .iter()
        .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
        .or_else(|| pictures.first())
        .map(|p| p.data().to_vec())
}

// Telegram never looks inside a file for artwork: a music message shows a
// thumbnail uploaded beside the document. Numbers from tdesktop's
// `PrepareFileThumbnail`, storage/localimageloader.cpp.
const THUMBNAIL_SIDE: u32 = 320;
const THUMBNAIL_QUALITY: u8 = 87;

/// None when the file carries no picture, or when Telegram would refuse its
/// shape - it rejects anything past twenty to one. Nothing is cropped.
pub(crate) async fn telegram_thumbnail(audio: &Path) -> Option<Vec<u8>> {
    use image::codecs::jpeg::JpegEncoder;
    use image::{ExtendedColorType, ImageEncoder};

    let audio = audio.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let picture = embedded_picture(&audio)?;
        let decoded = image::load_from_memory(&picture).ok()?;

        let (width, height) = (decoded.width(), decoded.height());
        if width == 0 || height == 0 || width > 20 * height || height > 20 * width {
            return None;
        }

        // `resize` keeps the ratio, the arithmetic tdesktop spells out by hand
        let scaled = if width.max(height) > THUMBNAIL_SIDE {
            decoded.resize(
                THUMBNAIL_SIDE,
                THUMBNAIL_SIDE,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            decoded
        };

        let rgb = scaled.to_rgb8();
        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, THUMBNAIL_QUALITY)
            .write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                ExtendedColorType::Rgb8,
            )
            .ok()?;
        Some(jpeg)
    })
    .await
    .ok()
    .flatten()
}

/// Drops the extracted copy, so the next request reads the file again.
pub(crate) async fn forget_cached_cover(media_dir: &Path, channel_id: &str, hash: &str) {
    tokio::fs::remove_file(media_paths::cover_path(media_dir, channel_id, hash))
        .await
        .ok();
    tokio::fs::remove_file(media_paths::no_cover_path(media_dir, channel_id, hash))
        .await
        .ok();
}

/// Paths only, for mosaic tiles. Not `ensure_cover` in a loop: that one also
/// bins the pixels for a palette, which is ruinous sixty tiles at a time.
/// Tracks with no artwork are absent from the result.
pub(crate) async fn cover_paths(
    db: &SqlitePool,
    media_dir: &Path,
    track_ids: &[String],
) -> Result<std::collections::HashMap<String, String>> {
    let mut found = std::collections::HashMap::new();
    for track_id in track_ids {
        let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
            .bind(track_id)
            .fetch_optional(db)
            .await?;
        let Some(track) = track else { continue };
        if track.file_path.is_empty() || track.file_hash.is_empty() {
            continue;
        }

        let cover = media_paths::cover_path(media_dir, &track.channel_id, &track.file_hash);
        if tokio::fs::metadata(&cover).await.is_ok_and(|m| m.len() > 0) {
            found.insert(track_id.clone(), cover.to_string_lossy().to_string());
            continue;
        }

        let no_cover = media_paths::no_cover_path(media_dir, &track.channel_id, &track.file_hash);
        if tokio::fs::metadata(&no_cover).await.is_ok() {
            continue;
        }
        if tokio::fs::metadata(&track.file_path).await.is_err() {
            continue;
        }

        let audio = track.file_path.clone();
        let picture = tokio::task::spawn_blocking(move || embedded_picture(Path::new(&audio)))
            .await
            .unwrap_or(None);
        if let Some(parent) = cover.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        match picture {
            Some(bytes) if !bytes.is_empty() => {
                tokio::fs::write(&cover, &bytes).await?;
                found.insert(track_id.clone(), cover.to_string_lossy().to_string());
            }
            _ => {
                tokio::fs::write(&no_cover, []).await?;
            }
        }
    }
    Ok(found)
}

/// Extracted once and kept beside the audio; files without a picture get a
/// marker instead. None when there is nothing to show.
pub(crate) async fn ensure_cover(
    db: &SqlitePool,
    media_dir: &Path,
    track_id: &str,
) -> Result<Option<Cover>> {
    let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
        .bind(track_id)
        .fetch_optional(db)
        .await?;
    let Some(track) = track else { return Ok(None) };
    if track.file_path.is_empty() || track.file_hash.is_empty() {
        return Ok(None);
    }

    let cover = media_paths::cover_path(media_dir, &track.channel_id, &track.file_hash);
    let no_cover = media_paths::no_cover_path(media_dir, &track.channel_id, &track.file_hash);
    if tokio::fs::metadata(&no_cover).await.is_ok() {
        return Ok(None);
    }
    if let Ok(meta) = tokio::fs::metadata(&cover).await {
        // the older marker was written for anything the strict parser refused,
        // so those verdicts are worth taking again
        if meta.len() > 0 {
            let bytes = tokio::fs::read(&cover).await.unwrap_or_default();
            return Ok(Some(Cover {
                path: cover.to_string_lossy().to_string(),
                palette: tokio::task::spawn_blocking(move || palette_of(&bytes))
                    .await
                    .unwrap_or_default(),
            }));
        }
    }

    if tokio::fs::metadata(&track.file_path).await.is_err() {
        return Ok(None);
    }

    let audio = track.file_path.clone();
    let picture = tokio::task::spawn_blocking(move || embedded_picture(Path::new(&audio)))
        .await
        .unwrap_or(None);

    if let Some(parent) = cover.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    match picture {
        Some(bytes) if !bytes.is_empty() => {
            tokio::fs::write(&cover, &bytes).await?;
            Ok(Some(Cover {
                path: cover.to_string_lossy().to_string(),
                palette: tokio::task::spawn_blocking(move || palette_of(&bytes))
                    .await
                    .unwrap_or_default(),
            }))
        }
        _ => {
            tokio::fs::write(&no_cover, []).await?;
            tokio::fs::remove_file(&cover).await.ok();
            Ok(None)
        }
    }
}
