//! The outbox and the loop that drains it. Reading a channel's history is
//! `library::ingest`.

pub(crate) mod commands;
pub(crate) mod engine;
pub(crate) mod outbox;
pub(crate) mod stamp;
pub(crate) mod status;

pub(crate) use status::SyncHandle;
