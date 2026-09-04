//! The library-wide retag pass.
//!
//! No single row can be trusted: tags off Telegram are whatever the uploader
//! typed, so the library as a whole decides what an artist is called.

use std::collections::HashMap;

use sqlx::SqlitePool;

use crate::features::library::tags::metadata;
use crate::shared::error::AppError;

use super::repository;

/// Returns the ids of the tracks that actually changed.
pub(super) async fn run(db: &SqlitePool) -> Result<Vec<String>, AppError> {
    let tracks = repository::all(db).await?;

    let mut freq: HashMap<String, HashMap<String, u32>> = HashMap::new();
    let mut bump = |name: &str| {
        *freq
            .entry(name.to_lowercase())
            .or_default()
            .entry(name.to_string())
            .or_insert(0) += 1;
    };
    for track in &tracks {
        if let Some(a) = track.artist.as_deref().and_then(metadata::clean_artist_tag) {
            bump(&a);
        }
        if let Some(title) = &track.title {
            if let Some((left, _)) = metadata::find_dash_split(title) {
                bump(&left);
            }
        }
    }

    let canonical: HashMap<String, (String, u32)> = freq
        .into_iter()
        .map(|(key, variants)| {
            let total: u32 = variants.values().sum();
            let display = variants
                .into_iter()
                .max_by_key(|(name, count)| (*count, std::cmp::Reverse(name.len()), name.clone()))
                .map(|(name, _)| name)
                .unwrap();
            (key, (display, total))
        })
        .collect();

    const TRUST_THRESHOLD: u32 = 2;
    let known_artist = |name: &str| -> Option<String> {
        canonical
            .get(&name.to_lowercase())
            .filter(|(_, count)| *count >= TRUST_THRESHOLD)
            .map(|(display, _)| display.clone())
    };

    let normalize_case = |name: &str| -> String {
        canonical
            .get(&name.to_lowercase())
            .map(|(display, _)| display.clone())
            .unwrap_or_else(|| name.to_string())
    };

    let mut trusted: Vec<(String, String)> = canonical
        .iter()
        .filter(|(_, (_, count))| *count >= TRUST_THRESHOLD)
        .map(|(key, (display, _))| (key.clone(), display.clone()))
        .collect();
    trusted.sort_by_key(|(key, _)| std::cmp::Reverse(key.len()));

    struct Resolved {
        id: String,
        orig_title: Option<String>,
        orig_artist: Option<String>,
        title: Option<String>,
        artist: Option<String>,
    }
    let mut resolved: Vec<Resolved> = Vec::with_capacity(tracks.len());
    for track in tracks {
        let cleaned_artist = track.artist.as_deref().and_then(metadata::clean_artist_tag);

        if let (Some(title_str), Some(artist_str)) =
            (track.title.as_deref(), cleaned_artist.as_deref())
        {
            if let Some((new_title, new_artist)) =
                metadata::extract_redundant_collab(title_str, artist_str)
            {
                resolved.push(Resolved {
                    id: track.id.clone(),
                    orig_title: track.title.clone(),
                    orig_artist: track.artist.clone(),
                    title: Some(new_title),
                    artist: Some(new_artist),
                });
                continue;
            }
        }

        let cleaned_freq = cleaned_artist
            .as_deref()
            .map(|a| canonical.get(&a.to_lowercase()).map_or(1, |(_, c)| *c) as usize)
            .unwrap_or(0);

        let current_is_noise = cleaned_artist.as_deref().is_none_or(|a| {
            if metadata::is_noise_artist(a, cleaned_freq) {
                return true;
            }
            if let Some(ref t) = track.title {
                if metadata::find_dash_split(t).is_some() {
                    return !t.to_lowercase().contains(&a.to_lowercase());
                }
            }
            false
        });

        let segments = track
            .title
            .as_deref()
            .map(metadata::split_title_segments)
            .unwrap_or_default();
        let trusted_segment = segments
            .iter()
            .enumerate()
            .find_map(|(i, seg)| known_artist(seg).map(|known| (i, known)));

        let (title, artist) = match trusted_segment {
            Some((i, known))
                if known.to_lowercase()
                    != cleaned_artist.as_deref().unwrap_or("").to_lowercase() =>
            {
                let rest: Vec<&str> = segments
                    .iter()
                    .enumerate()
                    .filter(|(j, _)| *j != i)
                    .map(|(_, s)| s.as_str())
                    .collect();
                let new_title = if rest.is_empty() {
                    track.title.clone()
                } else {
                    Some(rest.join(" - "))
                };
                (new_title, Some(known))
            }
            _ if current_is_noise => {
                let haystack = format!(
                    "{} {}",
                    track.title.as_deref().unwrap_or(""),
                    track.artist.as_deref().unwrap_or(""),
                )
                .to_lowercase();
                let substring_match = trusted
                    .iter()
                    .find(|(key, _)| metadata::contains_word(&haystack, key))
                    .map(|(_, display)| display.clone());
                match substring_match {
                    Some(known) => (track.title.clone(), Some(known)),
                    None => match track.title.as_deref().and_then(metadata::find_dash_split) {
                        Some((left, right)) => (Some(right), Some(left)),
                        None => (track.title.clone(), cleaned_artist.clone()),
                    },
                }
            }
            _ => (
                track.title.clone(),
                cleaned_artist.clone().map(|a| normalize_case(&a)),
            ),
        };

        resolved.push(Resolved {
            id: track.id.clone(),
            orig_title: track.title.clone(),
            orig_artist: track.artist.clone(),
            title,
            artist,
        });
    }

    let mut artist_counts: HashMap<String, u32> = HashMap::new();
    for r in &resolved {
        if let Some(a) = &r.artist {
            *artist_counts.entry(a.clone()).or_insert(0) += 1;
        }
    }
    let distinct_artists: Vec<String> = artist_counts.keys().cloned().collect();

    let mut parent: Vec<usize> = (0..distinct_artists.len()).collect();
    fn find(parent: &mut [usize], x: usize) -> usize {
        if parent[x] != x {
            parent[x] = find(parent, parent[x]);
        }
        parent[x]
    }
    fn union(parent: &mut [usize], a: usize, b: usize) {
        let ra = find(parent, a);
        let rb = find(parent, b);
        if ra != rb {
            parent[ra] = rb;
        }
    }

    let member_counts: Vec<usize> = distinct_artists
        .iter()
        .map(|a| metadata::split_collab_names(a).len())
        .collect();

    const TRIGRAM_MERGE_THRESHOLD: f64 = 0.6;

    let trigrams: Vec<std::collections::HashSet<String>> = distinct_artists
        .iter()
        .map(|a| metadata::char_trigrams(a))
        .collect();

    for i in 0..distinct_artists.len() {
        for j in (i + 1)..distinct_artists.len() {
            if member_counts[i] != member_counts[j] {
                continue;
            }
            let (a, b) = (&trigrams[i], &trigrams[j]);
            if a.is_empty() || b.is_empty() {
                continue;
            }
            let (small, large) = if a.len() < b.len() {
                (a.len(), b.len())
            } else {
                (b.len(), a.len())
            };
            if (small as f64 / large as f64) < TRIGRAM_MERGE_THRESHOLD {
                continue;
            }
            let intersection = a.intersection(b).count();
            let union_len = a.len() + b.len() - intersection;
            if union_len > 0 && (intersection as f64 / union_len as f64) >= TRIGRAM_MERGE_THRESHOLD
            {
                union(&mut parent, i, j);
            }
        }
    }

    let mut groups: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..distinct_artists.len() {
        groups.entry(find(&mut parent, i)).or_default().push(i);
    }

    let mut artist_remap: HashMap<String, String> = HashMap::new();
    for members in groups.values() {
        if members.len() < 2 {
            continue;
        }
        let canonical = members
            .iter()
            .max_by_key(|&&idx| {
                let name = &distinct_artists[idx];
                (
                    artist_counts[name],
                    std::cmp::Reverse(name.len()),
                    name.clone(),
                )
            })
            .map(|&idx| distinct_artists[idx].clone())
            .unwrap();
        for &idx in members {
            let name = &distinct_artists[idx];
            if name != &canonical {
                artist_remap.insert(name.clone(), canonical.clone());
            }
        }
    }

    let mut changed_track_ids: Vec<String> = Vec::new();
    let mut pending: Vec<(String, Option<String>, Option<String>)> = Vec::new();
    for r in resolved {
        let mut artist = r.artist.map(|a| artist_remap.get(&a).cloned().unwrap_or(a));

        if let Some(title) = &r.title {
            let current_members: std::collections::HashSet<String> = artist
                .as_deref()
                .map(|a| {
                    metadata::split_collab_names(a)
                        .into_iter()
                        .map(|s| s.to_lowercase())
                        .collect()
                })
                .unwrap_or_default();
            let title_lower = title.to_lowercase();
            let extra: Vec<&String> = trusted
                .iter()
                .filter(|(key, _)| {
                    !current_members.contains(key)
                        && !current_members
                            .iter()
                            .any(|m| m.contains(key.as_str()) || key.contains(m.as_str()))
                        && metadata::is_actual_feature(&title_lower, key)
                })
                .map(|(_, display)| display)
                .collect();
            if !extra.is_empty() {
                let mut full = artist.clone().unwrap_or_default();
                for e in &extra {
                    full = if full.is_empty() {
                        (*e).clone()
                    } else {
                        format!("{full} & {e}")
                    };
                }
                artist = Some(full);
            }
        }

        if r.title != r.orig_title || artist != r.orig_artist {
            pending.push((r.id.clone(), r.title.clone(), artist));
            changed_track_ids.push(r.id);
        }
    }

    if !pending.is_empty() {
        repository::update_title_artist_batch(db, &pending).await?;
    }
    Ok(changed_track_ids)
}
