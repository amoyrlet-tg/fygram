//! Where the memory goes. A build-in account, written to `memory.log` beside
//! the database, because the growth only shows up on a machine we do not have.

pub(crate) mod commands;
pub(crate) mod memlog;
mod process;

pub(crate) use memlog::spawn;
