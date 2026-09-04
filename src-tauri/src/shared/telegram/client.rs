//! Connecting, and keeping the connection alive.

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use grammers_client::Client;
use grammers_mtsender::SenderPool;

use crate::features::auth::session_store::FileSession;

use super::TelegramState;

impl TelegramState {
    pub(crate) async fn connect(&self, session_path: PathBuf, api_id: i32) -> Result<()> {
        self.shutdown().await;

        let session = Arc::new(FileSession::open(session_path));
        let SenderPool { runner, handle, .. } = SenderPool::new(Arc::clone(&session), api_id);
        let client = Client::new(handle);
        let runner_task = tokio::spawn(runner.run());

        let mut inner = self.inner.lock().await;
        inner.client = Some(client);
        inner.runner = Some(runner_task);
        inner.session = Some(session);
        Ok(())
    }

    pub(crate) async fn is_authorized(&self) -> Result<bool> {
        let client = self.client().await?;
        Ok(client.is_authorized().await?)
    }

    pub(crate) async fn disconnect(&self) {
        if let Ok(client) = self.client().await {
            let _ = client.sign_out().await;
        }

        self.shutdown().await;
        self.peer_cache.lock().await.clear();
    }

    pub(crate) async fn shutdown(&self) {
        let (runner, session) = {
            let mut inner = self.inner.lock().await;
            inner.client = None;
            inner.pending_login = None;
            inner.pending_password = None;
            (inner.runner.take(), inner.session.take())
        };
        if let Some(handle) = runner {
            handle.abort();
            let _ = handle.await;
        }
        if let Some(session) = session {
            session.flush();
        }
    }
}
