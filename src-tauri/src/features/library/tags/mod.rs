//! Working out what a track is actually called.
//!
//! Tags off Telegram are whatever the uploader typed. `metadata` cleans one row
//! at a time; `artist_parser` uses the rest of the library for the rest.

pub(crate) mod artist_parser;
pub(crate) mod metadata;
