use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use grammers_client::client::{LoginToken, PasswordToken};
use grammers_client::Client;
use grammers_session::types::PeerRef;
use tokio::sync::Mutex;

mod auth;
mod avatars;
mod client;
mod emoji_status;
mod errors;
mod messages;
mod peers;
mod profile_colour;
mod profile_watch;
mod saved;

pub(crate) use auth::LoginOutcome;
pub(crate) use avatars::CurrentUser;
pub(crate) use errors::{is_dead_session, is_edit_forbidden, is_peer_gone};
pub(crate) use messages::{MessageMeta, TrackUpload};
pub(crate) use peers::{resolve_channel_peer_for, ChannelInfo};
pub(crate) use profile_watch::watch_profile;

#[derive(Default)]
pub(crate) struct TelegramState {
    inner: Mutex<Inner>,

    peer_cache: Mutex<HashMap<i64, PeerRef>>,

    session_invalid: AtomicBool,
}

#[derive(Default)]
struct Inner {
    client: Option<Client>,
    pending_login: Option<LoginToken>,
    pending_password: Option<PasswordToken>,

    runner: Option<tokio::task::JoinHandle<()>>,
    session: Option<Arc<crate::features::auth::session_store::FileSession>>,

    updates: Option<tokio::sync::mpsc::UnboundedReceiver<grammers_session::updates::UpdatesLike>>,
}

impl TelegramState {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) async fn take_updates(
        &self,
    ) -> Option<tokio::sync::mpsc::UnboundedReceiver<grammers_session::updates::UpdatesLike>> {
        self.inner.lock().await.updates.take()
    }

    pub(crate) async fn client(&self) -> Result<Client> {
        self.inner
            .lock()
            .await
            .client
            .clone()
            .ok_or_else(|| anyhow!("not connected to Telegram yet"))
    }

    pub(crate) fn session_invalid(&self) -> bool {
        self.session_invalid.load(Ordering::Relaxed)
    }

    pub(crate) fn mark_session_invalid(&self) {
        self.session_invalid.store(true, Ordering::Relaxed);
    }

    pub(crate) fn mark_session_alive(&self) {
        self.session_invalid.store(false, Ordering::Relaxed);
    }

    pub(crate) fn note_failure(&self, err: &anyhow::Error) {
        if is_dead_session(err) {
            self.mark_session_invalid();
        }
    }
}
