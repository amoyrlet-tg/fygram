//! The bytes behind a track. A subsystem rather than a feature: no commands of
//! its own, reached through channels, playlists and tracks.

pub(crate) mod covers;
pub(crate) mod download;
pub(crate) mod files;

mod repository;
mod transport;
