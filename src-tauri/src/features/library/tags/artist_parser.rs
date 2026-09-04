//! Deciding who an artist is by asking the rest of the library: one tag alone
//! is guesswork, a name repeated across many is not.

use std::collections::{HashMap, HashSet};

use anyhow::Result;
use regex::Regex;
use sqlx::SqlitePool;
use std::sync::LazyLock;

const BOILERPLATE_MIN_ARTISTS: usize = 3;

static PROD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)[\(\[\{]?\s*(?:prod(?:uced)?)\.?\s*(?:by|:)?\s*([^\)\]\}\[]*?[^\s.:])\s*[\)\]\}]",
    )
    .expect("valid")
});
static PROD_RU: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[\(\[]\s*(?:п\.|p/)\s*([^\)\]]*?[^\s.:])\s*[\)\]]").expect("valid")
});
static PROD_SLASH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bp/\s*([^\(\[\)\]]+)").expect("valid"));
static FEAT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:\b(?:feat|ft|featuring|фит)\b\.?\s+|\bw/\s*)([^\(\[\)\]]+)").expect("valid")
});
static HASHTAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"#[\w\p{Cyrillic}]+").expect("valid"));
static HANDLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@([\w\p{Cyrillic}.]+)").expect("valid"));
static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(?:https?://|t\.me/)\S+").expect("valid"));
static EXT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\.(mp3|m4a|flac|wav|ogg|opus|aac)\s*$").expect("valid"));
static TRACK_NO: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*[♯#]?\s*\d{1,3}\s*[.\-)]\s+").expect("valid"));
static BOT_SIG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\s*[-–—]\s*@\w+\s*$").expect("valid"));
static BLOCK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\(\[]([^()\[\]]*)[\)\]]").expect("valid"));
static EMPTY_BLOCK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\(\[]\s*[\)\]]").expect("valid"));
static SPLIT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*(?:,|;|&|＆|，|\bи\b|\bvs\b\.?|\bx\b|/|\+)\s*").expect("valid")
});
static VERSION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:slow\w*|sped\s*up|speed\s*up|pitch\w*|remix|rmx|instrumental\w*|demo|cover|bonus|live|acoustic|edit|full|reverb|snippet|mix|version|версия|ремикс|замедл\w*|ускор\w*|remake)\b")
        .expect("valid")
});

fn unify(s: &str) -> String {
    let mapped: String = s
        .chars()
        .map(|c| match c {
            'ᴀ' => 'a',
            'ʙ' => 'b',
            'ᴄ' => 'c',
            'ᴅ' => 'd',
            'ᴇ' => 'e',
            'ɢ' => 'g',
            'ʜ' => 'h',
            'ɪ' => 'i',
            'ᴊ' => 'j',
            'ᴋ' => 'k',
            'ʟ' => 'l',
            'ᴍ' => 'm',
            'ɴ' => 'n',
            'ᴏ' => 'o',
            'ᴘ' => 'p',
            'ʀ' => 'r',
            'ᴛ' => 't',
            'ᴜ' => 'u',
            'ᴠ' => 'v',
            'ᴡ' => 'w',
            'ʏ' => 'y',
            'ᴢ' => 'z',
            'ғ' => 'f',
            '，' => ',',
            '　' => ' ',
            other => other,
        })
        .collect();
    mapped.split_whitespace().collect::<Vec<_>>().join(" ")
}

const DECOR: &[char] = &[
    '♰', '☆', '★', '✞', '✝', '⋆', '♯', '♪', '♫', '•', '·', '×', '⚜', '†', '‡', '~', '*', '_', '-',
    '–', '—', '=', '+', '|', '/', '\\', ' ', ':', '#',
];

fn key_of(s: &str) -> String {
    let u = unify(s).to_lowercase();
    let trimmed = u.trim_matches(|c| DECOR.contains(&c));
    let cleaned: String = trimmed
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || "'!?.".contains(*c))
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn split_names(s: &str) -> Vec<String> {
    SPLIT
        .split(&unify(s))
        .map(|p| p.trim_matches(|c| DECOR.contains(&c)).to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

#[derive(Debug, Default, Clone)]
pub(crate) struct Parsed {
    pub(crate) artists: Option<Vec<String>>,
    pub(crate) title: Option<String>,
    pub(crate) producers: Vec<String>,
    pub(crate) features: Vec<String>,
    pub(crate) flags: Vec<&'static str>,
}

pub(crate) struct Parser {
    vocab: HashMap<String, String>,
    rows_per_artist: HashMap<String, usize>,
    producers: HashSet<String>,
    credits: HashSet<String>,
    boilerplate: HashSet<String>,
}

fn dedup(v: &mut Vec<String>) {
    let mut seen = HashSet::new();
    v.retain(|x| seen.insert(key_of(x)));
}

fn is_placeholder(k: &str) -> bool {
    matches!(
        k,
        "" | "-"
            | "unknown"
            | "unknown artist"
            | "various"
            | "various artists"
            | "va"
            | "n/a"
            | "none"
            | "null"
            | "audio"
            | "track"
            | "аудио"
    )
}

impl Parser {
    pub(crate) async fn fit(db: &SqlitePool) -> Result<Self> {
        let rows: Vec<(Option<String>, Option<String>)> =
            sqlx::query_as("SELECT artist, title FROM tracks")
                .fetch_all(db)
                .await?;

        let mut forms: HashMap<String, HashMap<String, usize>> = HashMap::new();
        let mut rows_per_artist: HashMap<String, usize> = HashMap::new();
        let mut producers = HashSet::new();
        let mut credits = HashSet::new();
        let mut block_artists: HashMap<String, HashSet<String>> = HashMap::new();

        for (artist, title) in &rows {
            let tag = unify(artist.as_deref().unwrap_or(""));
            if !tag.is_empty() && !is_placeholder(&key_of(&tag)) {
                *rows_per_artist.entry(key_of(&tag)).or_default() += 1;
                let dirty = URL.is_match(&tag) || HASHTAG.is_match(&tag);
                let parts = if dirty {
                    let base = HASHTAG
                        .replace_all(&URL.replace_all(&tag, ""), "")
                        .to_string();
                    let mut v = split_names(&base);
                    v.extend(HASHTAG.find_iter(&tag).map(|m| m.as_str().to_string()));
                    v
                } else if SPLIT.is_match(&tag) {
                    split_names(&tag)
                } else {
                    vec![tag.clone()]
                };
                let weight = if dirty || SPLIT.is_match(&tag) { 1 } else { 3 };
                for p in parts {
                    let k = key_of(&p);
                    if k.len() < 2 || is_placeholder(&k) {
                        continue;
                    }
                    *forms.entry(k).or_default().entry(p).or_default() += weight;
                }
            }

            let t = unify(title.as_deref().unwrap_or(""));
            for caps in PROD
                .captures_iter(&t)
                .chain(PROD_RU.captures_iter(&t))
                .chain(PROD_SLASH.captures_iter(&t))
            {
                for n in split_names(&caps[1]) {
                    producers.insert(key_of(&n));
                }
            }
            for caps in FEAT.captures_iter(&t) {
                for n in split_names(&caps[1]) {
                    credits.insert(key_of(&n));
                }
            }
            let akey = key_of(artist.as_deref().unwrap_or(""));
            for caps in BLOCK.captures_iter(&t) {
                let inner = key_of(&caps[1]);
                if !inner.is_empty() {
                    block_artists.entry(inner).or_default().insert(akey.clone());
                }
            }
        }

        let vocab: HashMap<String, String> = forms
            .into_iter()
            .map(|(k, forms)| {
                let best = forms
                    .into_iter()
                    .max_by_key(|(_, n)| *n)
                    .map(|(f, _)| f)
                    .unwrap_or_default();
                (k, best)
            })
            .collect();

        let boilerplate = block_artists
            .into_iter()
            .filter(|(inner, arts)| {
                arts.len() >= BOILERPLATE_MIN_ARTISTS
                    && !PROD.is_match(inner)
                    && !VERSION.is_match(inner)
                    && !vocab.contains_key(inner)
                    && !producers.contains(inner)
            })
            .map(|(inner, _)| inner)
            .collect();

        Ok(Self {
            vocab,
            rows_per_artist,
            producers,
            credits,
            boilerplate,
        })
    }

    fn canon(&self, name: &str) -> String {
        let nohash = HASHTAG
            .replace_all(name, "")
            .trim_matches(|c| DECOR.contains(&c))
            .to_string();
        let name = if !nohash.is_empty() && self.vocab.contains_key(&key_of(&nohash)) {
            nohash
        } else {
            name.to_string()
        };
        let name = HANDLE
            .replace_all(&name, "$1")
            .trim_matches(|c| DECOR.contains(&c))
            .to_string();
        self.vocab.get(&key_of(&name)).cloned().unwrap_or(name)
    }

    fn known(&self, name: &str) -> bool {
        self.vocab.contains_key(&key_of(name))
    }

    fn credit_score(&self, inner: &str, at_end: bool) -> i32 {
        let inner = inner.trim();
        if inner.is_empty() {
            return 0;
        }
        if VERSION.is_match(inner) {
            return -5;
        }
        if self.boilerplate.contains(&key_of(inner)) {
            return 6;
        }
        let names = split_names(inner);
        if names.is_empty() {
            return if at_end { -1 } else { -3 };
        }
        let mut score = if at_end { 1 } else { -1 };
        if names.iter().any(|n| self.known(n)) {
            score += 3;
        }
        if names
            .iter()
            .any(|n| self.producers.contains(&key_of(n)) || self.credits.contains(&key_of(n)))
        {
            score += 3;
        }
        if names.iter().any(|n| HANDLE.is_match(n)) {
            score += 3;
        }
        if inner.split_whitespace().count() > 4 {
            score -= 3;
        }
        score
    }

    pub(crate) fn parse(&self, artist_tag: Option<&str>, title_tag: Option<&str>) -> Parsed {
        let mut out = Parsed::default();
        let mut title = unify(title_tag.unwrap_or(""));
        let mut atag = unify(artist_tag.unwrap_or(""));

        if !title.is_empty() && !atag.is_empty() {
            let t_key = key_of(HASHTAG.replace_all(&title, "").as_ref());
            let a_key = key_of(HASHTAG.replace_all(&atag, "").as_ref());
            let looks_like_name = self.vocab.contains_key(&t_key)
                && !title.contains('+')
                && !title.contains('(')
                && !PROD.is_match(&title)
                && !FEAT.is_match(&title);
            let t_rows = if looks_like_name {
                *self.rows_per_artist.get(&t_key).unwrap_or(&0)
            } else {
                0
            };
            let a_rows = if a_key.is_empty() {
                99
            } else {
                *self.rows_per_artist.get(&a_key).unwrap_or(&0)
            };
            if t_rows >= 5 && a_rows <= 2 && t_rows >= 4 * a_rows.max(1) {
                std::mem::swap(&mut title, &mut atag);
                out.flags.push("swapped");
            }
        }

        let raw_title = title.clone();
        if EXT.is_match(&title) {
            title = EXT.replace(&title, "").to_string();
            out.flags.push("ext");
        }
        if title.matches('_').count() >= 2 && !title.contains(' ') {
            title = title.replace('_', " ");
            out.flags.push("underscores");
        }
        title = BOT_SIG.replace(&title, "").to_string();
        title = URL.replace_all(&title, "").to_string();
        title = TRACK_NO.replace(&title, "").to_string();

        let snapshot = title.clone();
        for caps in PROD
            .captures_iter(&snapshot)
            .chain(PROD_RU.captures_iter(&snapshot))
            .chain(PROD_SLASH.captures_iter(&snapshot))
        {
            for n in split_names(&caps[1]) {
                out.producers.push(self.canon(&n));
            }
        }
        title = PROD.replace_all(&title, " ").to_string();
        title = PROD_RU.replace_all(&title, " ").to_string();
        title = PROD_SLASH.replace_all(&title, " ").to_string();

        for caps in FEAT.captures_iter(&title.clone()) {
            for n in split_names(&caps[1]) {
                out.features.push(self.canon(&n));
            }
        }
        title = FEAT.replace_all(&title, " ").to_string();
        title = EMPTY_BLOCK.replace_all(&title, " ").to_string();

        for _ in 0..3 {
            let Some(caps) = BLOCK.captures(&title) else {
                break;
            };
            let m = caps.get(0).expect("group 0");
            let at_end = m.end() >= title.trim_end().len();
            if self.credit_score(&caps[1], at_end) > 0 {
                for n in split_names(&caps[1]) {
                    if self.known(&n) {
                        out.features.push(self.canon(&n));
                    }
                }
                title = format!("{} {}", &title[..m.start()], &title[m.end()..]);
            } else {
                break;
            }
        }

        if HASHTAG.is_match(&title) {
            let stripped = HASHTAG.replace_all(&title, " ").to_string();
            let stripped = stripped.trim_matches(|c| DECOR.contains(&c)).to_string();
            if !stripped.is_empty() {
                title = stripped;
            }
        }
        title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        let title = title.trim_matches(|c| DECOR.contains(&c)).to_string();
        let title = if title.is_empty() { raw_title } else { title };

        let mut artists: Option<Vec<String>> = None;
        if !atag.is_empty() && !is_placeholder(&key_of(&atag)) {
            let base = URL.replace_all(&atag, "").to_string();
            let mut parts = Vec::new();
            for p in split_names(&base) {
                let nohash = HASHTAG
                    .replace_all(&p, "")
                    .trim_matches(|c| DECOR.contains(&c))
                    .to_string();
                let p = if !nohash.is_empty() && nohash != p && self.known(&nohash) {
                    nohash
                } else {
                    p
                };
                let p = HANDLE
                    .replace_all(&p, "$1")
                    .trim_matches(|c| DECOR.contains(&c))
                    .to_string();
                if !p.is_empty() {
                    parts.push(self.canon(&p));
                }
            }
            if parts.len() == 1
                && !self.known(&parts[0])
                && parts[0].split_whitespace().count() >= 5
            {
                out.flags.push("tag-is-a-sentence");
            } else if !parts.is_empty() {
                artists = Some(parts);
            }
        }

        if let Some(list) = artists.as_mut() {
            let have: HashSet<String> = list.iter().map(|a| key_of(a)).collect();
            for f in &out.features {
                if !have.contains(&key_of(f)) {
                    list.push(f.clone());
                }
            }
        }

        out.artists = artists;
        out.title = if title.is_empty() { None } else { Some(title) };
        dedup(&mut out.producers);
        dedup(&mut out.features);
        if let Some(list) = out.artists.as_mut() {
            dedup(list);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parser_with(names: &[(&str, usize)], boilerplate: &[&str]) -> Parser {
        let mut vocab = HashMap::new();
        let mut rows_per_artist = HashMap::new();
        for (name, rows) in names {
            vocab.insert(key_of(name), name.to_string());
            rows_per_artist.insert(key_of(name), *rows);
        }
        Parser {
            vocab,
            rows_per_artist,
            producers: HashSet::new(),
            credits: HashSet::new(),
            boilerplate: boilerplate.iter().map(|b| key_of(b)).collect(),
        }
    }

    #[test]
    fn strips_producer_and_keeps_version() {
        let p = parser_with(&[("ONDA ANDAR", 78)], &[]);
        let r = p.parse(Some("ONDA ANDAR"), Some("Ночное кафе [prod. onda andar]"));
        assert_eq!(r.title.as_deref(), Some("Ночное кафе"));
        assert_eq!(r.producers, vec!["ONDA ANDAR"]);

        let r = p.parse(Some("ONDA ANDAR"), Some("RANE [slowed]"));
        assert_eq!(r.title.as_deref(), Some("RANE [slowed]"));
    }

    #[test]
    fn feature_becomes_a_performer() {
        let p = parser_with(&[("CLONNEX", 34)], &[]);
        let r = p.parse(Some("CLONNEX"), Some("Chocolate Haze (feat. МС Петя)"));
        assert_eq!(r.title.as_deref(), Some("Chocolate Haze"));
        assert_eq!(r.artists, Some(vec!["CLONNEX".into(), "МС Петя".into()]));
    }

    #[test]
    fn splits_multi_artist_tag() {
        let p = parser_with(&[("chrome", 4), ("akiko!", 16)], &[]);
        let r = p.parse(Some("chrome & akiko!"), Some("Limb"));
        assert_eq!(r.artists, Some(vec!["chrome".into(), "akiko!".into()]));
    }

    #[test]
    fn hashtag_suffix_merges_but_hashtag_name_survives() {
        let p = parser_with(&[("ONDA ANDAR", 78), ("#keyoo", 22)], &[]);
        let r = p.parse(Some("ONDA ANDAR #2016"), Some("Низко"));
        assert_eq!(r.artists, Some(vec!["ONDA ANDAR".into()]));
        let r = p.parse(Some("#keyoo"), Some("old summer"));
        assert_eq!(r.artists, Some(vec!["#keyoo".into()]));
    }

    #[test]
    fn detects_swapped_fields() {
        let p = parser_with(&[("ONDA ANDAR", 78), ("сны не меняются", 1)], &[]);
        let r = p.parse(Some("сны не меняются(full)"), Some("onda andar"));
        assert_eq!(r.artists, Some(vec!["ONDA ANDAR".into()]));
        assert!(r.flags.contains(&"swapped"));
    }

    #[test]
    fn learned_boilerplate_goes_but_rare_block_stays() {
        let p = parser_with(&[("Playboi Carti", 9)], &["official video"]);
        let r = p.parse(Some("Playboi Carti"), Some("Magnolia (Official Video)"));
        assert_eq!(r.title.as_deref(), Some("Magnolia"));

        let p = parser_with(&[("leverfall", 106)], &[]);
        let r = p.parse(Some("leverfall"), Some("(Melancholy)"));
        assert_eq!(r.title.as_deref(), Some("(Melancholy)"));
    }

    #[test]
    fn refuses_instead_of_guessing() {
        let p = parser_with(&[], &[]);
        assert_eq!(p.parse(Some("<unknown>"), Some("stranij")).artists, None);
        assert_eq!(
            p.parse(Some("Various Artists"), Some("Уличные Коты"))
                .artists,
            None
        );
        assert_eq!(p.parse(None, Some("clown.mp3")).artists, None);
        let r = p.parse(
            Some("'If Ripsquad Produced For Sematary And Ghost Mountain'"),
            Some("Hi Score"),
        );
        assert_eq!(r.artists, None);
        assert!(r.flags.contains(&"tag-is-a-sentence"));
    }

    #[test]
    fn local_shorthand_markers() {
        let p = parser_with(
            &[
                ("глоу", 12),
                ("сияя", 3),
                ("джесси белкман", 4),
                ("tryavoid", 216),
            ],
            &[],
        );
        let r = p.parse(Some("глоу"), Some("ливень w/сияя"));
        assert_eq!(r.title.as_deref(), Some("ливень"));
        assert_eq!(r.artists, Some(vec!["глоу".into(), "сияя".into()]));

        let r = p.parse(
            Some("джесси белкман"),
            Some("криминальное чтиво w/ tryavoid [p/ rayx]"),
        );
        assert_eq!(r.title.as_deref(), Some("криминальное чтиво"));
        assert_eq!(r.producers, vec!["rayx"]);
        assert_eq!(
            r.artists,
            Some(vec!["джесси белкман".into(), "tryavoid".into()])
        );
    }

    #[test]
    fn never_empties_a_title() {
        let p = parser_with(&[], &["official video"]);
        let r = p.parse(Some("кто-то"), Some("(Official Video)"));
        assert!(r.title.is_some(), "название не должно исчезать целиком");
    }
}
