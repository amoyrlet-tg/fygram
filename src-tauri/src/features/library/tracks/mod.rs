//! The tracks the library already knows about. Finding new ones is
//! `library::ingest`; the bytes are `library::media`.

pub(crate) mod commands;

mod permissions;
mod repository;
mod retag;
mod service;
