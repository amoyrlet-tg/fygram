//! The process names that count as a Telegram client.

pub(crate) const KNOWN_CLIENTS: &[&str] = &[
    "telegram",
    "tdesktop",
    "ayugram",
    "exteragram",
    "kotatogram",
    "materialgram",
    "forkgram",
    "nekogram",
    "swiftgram",
    "64gram",
    "unigram",
];

const NOT_CLIENTS: &[&str] = &[
    "fygram",
    "instagram",
    "diagram",
    "anagram",
    "program",
    "hologram",
    "kilogram",
    "monogram",
    "grammarly",
];

pub(crate) fn is_client(name: &str) -> bool {
    let name = name.to_lowercase();
    if KNOWN_CLIENTS.iter().any(|known| name.contains(known)) {
        return true;
    }
    name.split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.len() > 4 && word.ends_with("gram"))
        .any(|word| !NOT_CLIENTS.contains(&word))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_the_original_and_its_forks() {
        for name in [
            "Telegram",
            "AyuGram",
            "exteraGram",
            "64Gram",
            "com.tdesktop.Telegram",
            "com.ayugram.desktop",
        ] {
            assert!(is_client(name), "{name} should read as a Telegram client");
        }
    }

    #[test]
    fn leaves_unrelated_apps_alone() {
        for name in [
            "Instagram",
            "com.instagram.desktop",
            "Grammarly",
            "com.spotify.client",
            "chrome",
            "diagram",
            "Program Files",
            "gram",
        ] {
            assert!(
                !is_client(name),
                "{name} should not read as a Telegram client"
            );
        }
    }

    #[test]
    fn catches_a_fork_it_has_never_heard_of() {
        for name in ["ZerdoGram", "com.example.NewGram", "quokkagram-desktop"] {
            assert!(is_client(name), "{name} should read as a Telegram client");
        }
    }
}
