//! The sign-in half of the client: the code, the password, and what the server says about either.

use anyhow::{anyhow, Result};
use grammers_client::SignInError;

use super::TelegramState;

pub(crate) enum LoginOutcome {
    Success,
    PasswordRequired,
}

impl TelegramState {
    pub(crate) async fn request_login_code(&self, phone: &str, api_hash: &str) -> Result<()> {
        let client = self.client().await?;
        let token = client.request_login_code(phone, api_hash).await?;
        self.inner.lock().await.pending_login = Some(token);
        Ok(())
    }

    pub(crate) async fn submit_code(&self, code: &str) -> Result<LoginOutcome> {
        let client = self.client().await?;
        let token = self
            .inner
            .lock()
            .await
            .pending_login
            .take()
            .ok_or_else(|| anyhow!("no login code was requested"))?;

        match client.sign_in(&token, code).await {
            Ok(_) => Ok(LoginOutcome::Success),
            Err(SignInError::PasswordRequired(password_token)) => {
                self.inner.lock().await.pending_password = Some(password_token);
                Ok(LoginOutcome::PasswordRequired)
            }
            Err(err) => Err(anyhow!(err)),
        }
    }

    pub(crate) async fn submit_password(&self, password: &str) -> Result<()> {
        let client = self.client().await?;
        let token = self
            .inner
            .lock()
            .await
            .pending_password
            .take()
            .ok_or_else(|| anyhow!("no pending 2FA password check"))?;
        client.check_password(token, password).await?;
        Ok(())
    }
}
