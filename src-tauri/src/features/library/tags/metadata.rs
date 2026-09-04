//! Cleaning up one tag at a time: the separators, the boilerplate, and the collaborators hiding in a title.

use std::sync::LazyLock;

use regex::Regex;

pub(crate) fn char_trigrams(s: &str) -> std::collections::HashSet<String> {
    let chars: Vec<char> = s.to_lowercase().chars().collect();
    if chars.len() < 3 {
        return std::collections::HashSet::from([chars.into_iter().collect()]);
    }
    chars.windows(3).map(|w| w.iter().collect()).collect()
}

pub(crate) fn contains_word(haystack_lower: &str, needle_lower: &str) -> bool {
    if needle_lower.is_empty() {
        return false;
    }
    let mut start = 0;
    while let Some(pos) = haystack_lower[start..].find(needle_lower) {
        let abs = start + pos;
        let before_ok = haystack_lower[..abs]
            .chars()
            .next_back()
            .is_none_or(|c| !c.is_alphanumeric());
        let after_idx = abs + needle_lower.len();
        let after_ok = haystack_lower[after_idx..]
            .chars()
            .next()
            .is_none_or(|c| !c.is_alphanumeric());
        if before_ok && after_ok {
            return true;
        }
        start = abs + 1;
    }
    false
}

const TITLE_SEPARATORS: [&str; 3] = [" - ", " – ", " — "];

const ARTIST_TRAILING_JUNK: [&str; 2] = ["- topic", "official"];

pub(crate) fn clean_artist_tag(artist: &str) -> Option<String> {
    let mut a = artist.trim();
    loop {
        let lower = a.to_lowercase();
        let mut stripped = None;
        for junk in ARTIST_TRAILING_JUNK {
            if let Some(prefix_len) = lower.strip_suffix(junk).map(|_| lower.len() - junk.len()) {
                let candidate = a[..prefix_len].trim_end();
                let candidate = candidate.strip_suffix('-').unwrap_or(candidate).trim_end();
                if !candidate.is_empty() {
                    stripped = Some(candidate);
                }
                break;
            }
        }
        match stripped {
            Some(next) if next != a => a = next,
            _ => break,
        }
    }
    let a = a.trim();
    if a.is_empty() {
        None
    } else {
        Some(a.to_string())
    }
}

pub(crate) fn find_dash_split(title: &str) -> Option<(String, String)> {
    let mut best: Option<(usize, usize)> = None;
    for sep in TITLE_SEPARATORS {
        if let Some(idx) = title.find(sep) {
            if best.is_none_or(|(best_idx, _)| idx < best_idx) {
                best = Some((idx, sep.len()));
            }
        }
    }
    let (idx, sep_len) = best?;
    let left = title[..idx].trim();
    let right = title[idx + sep_len..].trim();
    if left.is_empty() || right.is_empty() {
        None
    } else {
        Some((left.to_string(), right.to_string()))
    }
}

pub(crate) fn split_title_segments(title: &str) -> Vec<String> {
    let mut segments = vec![title.to_string()];
    for sep in TITLE_SEPARATORS {
        segments = segments
            .into_iter()
            .flat_map(|s| s.split(sep).map(str::to_string).collect::<Vec<_>>())
            .collect();
    }
    segments
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

static COLLAB_SEPARATOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*(?:,|&|/|\+|\bx\b|\bvs\b\.?|\bfeat\b\.?|\bft\b\.?|\bfeaturing\b|\bproduced by\b|\bprod\b\.?|\band\b)\s*")
        .expect("static regex is valid")
});

pub(crate) fn split_collab_names(s: &str) -> Vec<String> {
    COLLAB_SEPARATOR
        .split(s)
        .map(|p| {
            p.trim()
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_string()
        })
        .filter(|p| !p.is_empty())
        .collect()
}

pub(crate) fn extract_redundant_collab(title: &str, artist: &str) -> Option<(String, String)> {
    let (left, right) = find_dash_split(title)?;
    let left_members = split_collab_names(&left);
    let artist_lower = artist.to_lowercase();
    if left_members
        .iter()
        .any(|m| m.to_lowercase() == artist_lower)
    {
        Some((right, left_members.join(" & ")))
    } else {
        None
    }
}

pub(crate) fn is_noise_artist(artist: &str, freq: usize) -> bool {
    let a = artist.trim();
    if a.is_empty() || a.starts_with('@') {
        return true;
    }
    let letters = a.chars().filter(|c| c.is_alphabetic()).count();
    if letters == 0 || (letters as f64) < (a.chars().count() as f64) * 0.4 {
        return true;
    }

    let members = split_collab_names(a);
    if members.len() > 1 {
        return members.iter().any(|m| m.split_whitespace().count() >= 4);
    }
    let word_count = a.split_whitespace().count();
    word_count >= 4 || (word_count <= 1 && freq <= 1)
}

pub(crate) fn is_actual_feature(title_lower: &str, artist_key: &str) -> bool {
    if !contains_word(title_lower, artist_key) {
        return false;
    }

    let markers = [
        "feat",
        "ft",
        "prod",
        "vs",
        "featuring",
        "with",
        "x",
        "&",
        ",",
        "+",
    ];
    if let Some(idx) = title_lower.find(artist_key) {
        let before_segment = &title_lower[..idx];
        if markers.iter().any(|m| before_segment.contains(m)) {
            return true;
        }
    }

    title_lower.contains(&format!("({}", artist_key))
        || title_lower.contains(&format!("[{}", artist_key))
        || title_lower.contains(&format!(") {}", artist_key))
}
