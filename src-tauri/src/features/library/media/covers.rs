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
