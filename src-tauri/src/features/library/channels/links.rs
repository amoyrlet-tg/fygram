pub(crate) enum TelegramLink {
    Username(String),

    ChannelId(i64),
}

const HOSTS: [&str; 3] = ["t.me/", "telegram.me/", "telegram.dog/"];

const PREVIEW: &str = "s";

pub(super) fn parse_telegram_link(input: &str) -> Option<TelegramLink> {
    let trimmed = input.trim();

    if let Some(rest) = trimmed.strip_prefix("tg://") {
        return parse_tg_scheme(rest);
    }

    let bare_url = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);
    let bare_url = bare_url.strip_prefix("www.").unwrap_or(bare_url);

    if let Some(rest) = bare_url.strip_prefix("web.telegram.org/") {
        return parse_web_client(rest);
    }

    for host in HOSTS {
        if let Some(rest) = bare_url.strip_prefix(host) {
            return parse_t_me(rest);
        }
    }

    let name = bare_url.trim_start_matches('@');
    if !is_username(name) {
        return None;
    }
    Some(TelegramLink::Username(name.to_string()))
}

fn parse_t_me(rest: &str) -> Option<TelegramLink> {
    let mut parts = rest.trim_matches('/').split('/').filter(|p| !p.is_empty());
    let first = parts.next()?;

    if first == "c" {
        return channel_id(parts.next()?).map(TelegramLink::ChannelId);
    }
    if first.starts_with('+') || first == "joinchat" {
        return None;
    }

    let name = if first == PREVIEW {
        parts.next()?
    } else {
        first
    };
    let name = name.split('?').next()?;
    if !is_username(name) {
        return None;
    }
    Some(TelegramLink::Username(name.to_string()))
}

fn parse_web_client(rest: &str) -> Option<TelegramLink> {
    let hash = rest.split_once('#')?.1;
    let hash = hash.split('?').next()?.trim();
    if hash.is_empty() {
        return None;
    }

    if let Some(name) = hash.strip_prefix('@') {
        return is_username(name).then(|| TelegramLink::Username(name.to_string()));
    }
    if hash.starts_with('-') || hash.chars().all(|c| c.is_ascii_digit()) {
        return channel_id(hash).map(TelegramLink::ChannelId);
    }
    None
}

fn parse_tg_scheme(rest: &str) -> Option<TelegramLink> {
    let (action, query) = rest.split_once('?')?;
    let value = |key: &str| {
        query
            .split('&')
            .filter_map(|pair| pair.split_once('='))
            .find(|(k, _)| *k == key)
            .map(|(_, v)| v)
    };
    match action {
        "resolve" => {
            let name = value("domain")?;
            is_username(name).then(|| TelegramLink::Username(name.to_string()))
        }
        "privatepost" => channel_id(value("channel")?).map(TelegramLink::ChannelId),
        _ => None,
    }
}

fn channel_id(raw: &str) -> Option<i64> {
    let digits = raw.trim().strip_prefix('-').unwrap_or(raw.trim());
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let bare = match digits.strip_prefix("100") {
        Some(rest) if rest.len() >= 9 => rest,
        _ => digits,
    };
    bare.parse::<i64>().ok().filter(|id| *id > 0)
}

fn is_username(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 32
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(input: &str) -> Option<String> {
        match parse_telegram_link(input) {
            Some(TelegramLink::Username(name)) => Some(name),
            _ => None,
        }
    }

    fn id(input: &str) -> Option<i64> {
        match parse_telegram_link(input) {
            Some(TelegramLink::ChannelId(id)) => Some(id),
            _ => None,
        }
    }

    #[test]
    fn plain_names() {
        assert_eq!(name("@omnicap").as_deref(), Some("omnicap"));
        assert_eq!(name("omnicap").as_deref(), Some("omnicap"));
        assert_eq!(name("  @omnicap  ").as_deref(), Some("omnicap"));
    }

    #[test]
    fn t_me_links() {
        assert_eq!(name("https://t.me/omnicap").as_deref(), Some("omnicap"));
        assert_eq!(name("t.me/omnicap/").as_deref(), Some("omnicap"));
        assert_eq!(
            name("http://www.telegram.me/omnicap").as_deref(),
            Some("omnicap")
        );
        assert_eq!(
            name("https://t.me/omnicap/1274").as_deref(),
            Some("omnicap")
        );
        assert_eq!(name("https://t.me/s/omnicap").as_deref(), Some("omnicap"));
        assert_eq!(
            name("https://t.me/omnicap?before=10").as_deref(),
            Some("omnicap")
        );
    }

    #[test]
    fn private_links_carry_an_id() {
        assert_eq!(id("https://t.me/c/4458220367"), Some(4458220367));
        assert_eq!(id("https://t.me/c/4458220367/56"), Some(4458220367));
    }

    #[test]
    fn the_web_client_writes_them_after_a_hash() {
        assert_eq!(
            name("https://web.telegram.org/k/#@omnicap").as_deref(),
            Some("omnicap")
        );
        assert_eq!(
            id("https://web.telegram.org/k/#-4458220367"),
            Some(4458220367)
        );
        assert_eq!(
            id("https://web.telegram.org/a/#-4458220367"),
            Some(4458220367)
        );
        assert_eq!(id("web.telegram.org/k/#4458220367"), Some(4458220367));
    }

    #[test]
    fn the_bot_spelling_of_an_id_is_understood_too() {
        assert_eq!(
            id("https://web.telegram.org/k/#-1004458220367"),
            Some(4458220367)
        );
        assert_eq!(id("https://web.telegram.org/k/#-1004458"), Some(1004458));
    }

    #[test]
    fn tg_scheme() {
        assert_eq!(
            name("tg://resolve?domain=omnicap").as_deref(),
            Some("omnicap")
        );
        assert_eq!(id("tg://privatepost?channel=4458220367"), Some(4458220367));
    }

    #[test]
    fn what_names_nothing() {
        assert!(parse_telegram_link("").is_none());
        assert!(parse_telegram_link("https://t.me/+AbCdEf").is_none());
        assert!(parse_telegram_link("https://t.me/joinchat/AbCdEf").is_none());
        assert!(parse_telegram_link("https://example.com/omnicap").is_none());
        assert!(parse_telegram_link("две слова").is_none());
        assert!(parse_telegram_link("https://web.telegram.org/k/").is_none());
    }
}
