use std::time::Duration;

use anyhow::{Context, Result};
use grammers_client::client::UpdatesConfiguration;
use grammers_client::tl;
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

const EVENT: &str = "account-changed";
const FIRST_BACKOFF: Duration = Duration::from_secs(2);
const LONGEST_BACKOFF: Duration = Duration::from_secs(60);

pub(crate) fn watch_profile(app: AppHandle) {
    crate::shutdown::spawn_tracked(&app.clone(), async move {
        if let Err(err) = run(&app).await {
            crate::log!("profile watch: stopped: {err:#}");
        }
    });
}

async fn run(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let client = state.telegram.client().await?;
    let updates = state
        .telegram
        .take_updates()
        .await
        .context("the update stream was already taken")?;

    let mut stream = client
        .stream_updates(updates, UpdatesConfiguration::default())
        .await
        .map_err(|err| anyhow::anyhow!("{err}"))?;

    let me = client.get_me().await?.id().bare_id().unwrap_or_default();

    let mut failures: u32 = 0;
    loop {
        let update = match stream.next_raw().await {
            Ok((update, _, _)) => {
                failures = 0;
                update
            }
            Err(err) => {
                failures += 1;
                let backoff = FIRST_BACKOFF
                    .saturating_mul(1 << failures.saturating_sub(1).min(5))
                    .min(LONGEST_BACKOFF);
                if failures <= 3 || failures.is_multiple_of(20) {
                    crate::log!(
                        "profile watch: update stream failed ({failures}), retrying in {}s: {err:#}",
                        backoff.as_secs()
                    );
                }
                tokio::time::sleep(backoff).await;
                continue;
            }
        };
        if touches_the_account(&update, me) {
            let _ = app.emit(EVENT, ());
        }
    }
}

fn touches_the_account(update: &tl::enums::Update, me: i64) -> bool {
    match update {
        tl::enums::Update::User(update) => update.user_id == me,
        tl::enums::Update::UserName(update) => update.user_id == me,
        tl::enums::Update::UserPhone(update) => update.user_id == me,
        tl::enums::Update::UserEmojiStatus(update) => update.user_id == me,
        tl::enums::Update::PeerSettings(_) => true,
        _ => false,
    }
}
