//! Turning a channel's message history into library rows. The read side:
//! pushing changes back is `features::sync`, the audio is `library::media`.

pub(crate) use service::{sync_channel, SyncDepth, SyncStats};

pub(crate) mod repository;
pub(crate) mod service;
