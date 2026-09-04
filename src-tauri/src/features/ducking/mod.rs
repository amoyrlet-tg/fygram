//! Getting out of the way when Telegram itself starts playing something.

pub(crate) mod commands;
pub(crate) mod service;

// only these two can answer "is something else playing"
#[cfg(any(target_os = "linux", target_os = "windows"))]
pub(crate) mod apps;
#[cfg(any(target_os = "linux", target_os = "windows"))]
pub(crate) mod probe;
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
#[path = "probe_unsupported.rs"]
pub(crate) mod probe;

#[cfg(target_os = "linux")]
mod probe_linux;
#[cfg(target_os = "windows")]
mod probe_windows;

pub(crate) use service::spawn;
