//! Reading a channel out of whatever the user pasted: a t.me link, an @name, or a bare id.

pub(crate) enum TelegramLink {
    Username(String),

    ChannelId(i64),
}

pub(super) fn parse_telegram_link(input: &str) -> Option<TelegramLink> {
    let trimmed = input.trim();
    let trimmed = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);
    let trimmed = trimmed.strip_prefix("www.").unwrap_or(trimmed);

    if let Some(rest) = trimmed.strip_prefix("t.me/") {
        let mut parts = rest.trim_matches('/').split('/');
        let first = parts.next()?;
        if first.is_empty() {
            return None;
        }
        if first == "c" {
            return parts
                .next()?
                .parse::<i64>()
                .ok()
                .map(TelegramLink::ChannelId);
        }
        if first.starts_with('+') || first == "joinchat" {
            return None;
        }
        return Some(TelegramLink::Username(first.to_string()));
    }

    let bare = trimmed.trim_start_matches('@');
    if bare.is_empty() || bare.contains(char::is_whitespace) {
        return None;
    }
    Some(TelegramLink::Username(bare.to_string()))
}
