//! The backend's error type. `commands.rs` is the only place it becomes a
//! string.

#[derive(Debug, thiserror::Error)]
pub(crate) enum AppError {
    #[error(transparent)]
    Db(#[from] sqlx::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Telegram(#[from] anyhow::Error),

    #[error("{0}")]
    Msg(String),
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

impl From<String> for AppError {
    fn from(msg: String) -> Self {
        AppError::Msg(msg)
    }
}

impl From<&str> for AppError {
    fn from(msg: &str) -> Self {
        AppError::Msg(msg.to_string())
    }
}
