//! Telling the errors that mean something apart from the ones that do not: a dead session, a peer that is gone.

fn chain_contains(err: &anyhow::Error, names: &[&str]) -> bool {
    let text = format!("{err:#}").to_uppercase();
    names.iter().any(|name| text.contains(name))
}

pub(crate) fn is_dead_session(err: &anyhow::Error) -> bool {
    chain_contains(
        err,
        &[
            "AUTH_KEY_UNREGISTERED",
            "AUTH_KEY_INVALID",
            "AUTH_KEY_DUPLICATED",
            "AUTH_KEY_PERM_EMPTY",
            "SESSION_REVOKED",
            "SESSION_EXPIRED",
            "USER_DEACTIVATED",
        ],
    )
}

/// "Not allowed to change this message", as opposed to a dropped line. Telegram
/// only says it after the file has gone up the wire.
pub(crate) fn is_edit_forbidden(err: &anyhow::Error) -> bool {
    chain_contains(
        err,
        &[
            "CHAT_ADMIN_REQUIRED",
            "MESSAGE_AUTHOR_REQUIRED",
            "CHAT_WRITE_FORBIDDEN",
            "USER_BANNED_IN_CHANNEL",
            "MESSAGE_EDIT_TIME_EXPIRED",
            "CHAT_SEND_MEDIA_FORBIDDEN",
            "CHAT_SEND_DOCS_FORBIDDEN",
        ],
    )
}

pub(crate) fn is_peer_gone(err: &anyhow::Error) -> bool {
    chain_contains(
        err,
        &[
            "CHANNEL_PRIVATE",
            "CHANNEL_INVALID",
            "CHAT_ID_INVALID",
            "PEER_ID_INVALID",
            "USERNAME_NOT_OCCUPIED",
            "USERNAME_INVALID",
        ],
    )
}
