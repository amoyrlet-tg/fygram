//! The wire under a download: Telegram's chunked `upload.getFile`. The server
//! decides how fast this goes, not us.

use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use grammers_client::media::Document;
use grammers_client::tl;
use grammers_client::InvocationError;

const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(120);

const MAX_CHUNK_SIZE: i32 = 512 * 1024;
const CONCURRENT_DOWNLOAD_THRESHOLD: usize = 1024 * 1024;

const FILE_MIGRATE_ERROR: i32 = 303;
const FLOOD_WAIT_ERROR: i32 = 420;
const DOWNLOAD_WORKERS: i64 = 8;

// Telegram counts requests in flight per account, not per file, so every
// download shares one budget. Going wider than this only earned FLOOD_WAITs.
const MAX_INFLIGHT_CHUNK_REQUESTS: usize = 8;

// the server says exactly how long to back off; longer than this is a failure
// rather than a stall
const FLOOD_WAIT_CAP: u32 = 30;
const FLOOD_WAIT_RETRIES: u32 = 5;

fn chunk_slots() -> &'static tokio::sync::Semaphore {
    static SLOTS: std::sync::OnceLock<tokio::sync::Semaphore> = std::sync::OnceLock::new();
    SLOTS.get_or_init(|| tokio::sync::Semaphore::new(MAX_INFLIGHT_CHUNK_REQUESTS))
}

/// The seconds Telegram asked us to wait, if this error is a flood wait.
fn flood_wait_secs(err: &anyhow::Error) -> Option<u32> {
    err.chain()
        .find_map(|cause| match cause.downcast_ref::<InvocationError>() {
            Some(InvocationError::Rpc(rpc)) if rpc.code == FLOOD_WAIT_ERROR => {
                Some(rpc.value.unwrap_or(1))
            }
            _ => None,
        })
}

async fn download_with_progress<D: grammers_client::media::Downloadable>(
    client: &grammers_client::Client,
    downloadable: &D,
    path: &Path,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<()> {
    let total = downloadable.size().unwrap_or(0);
    if total > CONCURRENT_DOWNLOAD_THRESHOLD {
        if let Some(location) = downloadable.to_raw_input_location() {
            match download_concurrent(client, location, total, path, &mut on_progress).await? {
                Concurrent::Done => return Ok(()),
                Concurrent::NeedsSerial => {}
            }
        }
    }
    download_serial(client, downloadable, path, total, &mut on_progress).await
}

enum Concurrent {
    Done,
    NeedsSerial,
}

async fn download_serial<D: grammers_client::media::Downloadable>(
    client: &grammers_client::Client,
    downloadable: &D,
    path: &Path,
    total: usize,
    on_progress: &mut impl FnMut(usize, usize),
) -> Result<()> {
    use tokio::io::AsyncWriteExt;
    let mut iter = client.iter_download(downloadable);
    let mut file = tokio::fs::File::create(path).await?;
    let mut downloaded = 0usize;
    on_progress(0, total);
    let mut last_emit = std::time::Instant::now();
    while let Some(chunk) = iter.next().await.context("downloading audio chunk")? {
        file.write_all(&chunk)
            .await
            .context("writing downloaded chunk")?;
        downloaded += chunk.len();

        let is_last = total > 0 && downloaded >= total;
        if is_last || last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
            on_progress(downloaded, total);
            last_emit = std::time::Instant::now();
        }
    }
    Ok(())
}

async fn download_concurrent(
    client: &grammers_client::Client,
    location: tl::enums::InputFileLocation,
    total: usize,
    path: &Path,
    on_progress: &mut impl FnMut(usize, usize),
) -> Result<Concurrent> {
    use tokio::io::{AsyncSeekExt, AsyncWriteExt};

    let mut file = tokio::fs::File::create(path).await?;
    file.set_len(total as u64).await?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(u64, Vec<u8>)>();
    let next_offset = Arc::new(AtomicI64::new(0));
    let file_dc = Arc::new(AtomicI32::new(0));
    let needs_serial = Arc::new(AtomicBool::new(false));
    let mut workers = Vec::with_capacity(DOWNLOAD_WORKERS as usize);
    for _ in 0..DOWNLOAD_WORKERS {
        let client = client.clone();
        let location = location.clone();
        let tx = tx.clone();
        let next_offset = next_offset.clone();
        let file_dc = file_dc.clone();
        let needs_serial = needs_serial.clone();
        workers.push(tokio::task::spawn(async move {
            loop {
                if needs_serial.load(Ordering::SeqCst) {
                    break;
                }
                let offset = next_offset.fetch_add(MAX_CHUNK_SIZE as i64, Ordering::SeqCst);
                if offset as usize >= total {
                    break;
                }
                let request = tl::functions::upload::GetFile {
                    precise: true,
                    cdn_supported: false,
                    location: location.clone(),
                    offset,
                    limit: MAX_CHUNK_SIZE,
                };
                let mut floods = 0u32;
                let response = loop {
                    let dc = file_dc.load(Ordering::SeqCst);
                    let sent = {
                        let _slot = chunk_slots().acquire().await;
                        if dc == 0 {
                            client.invoke(&request).await
                        } else {
                            client.invoke_in_dc(dc, &request).await
                        }
                    };
                    match sent {
                        Ok(response) => break Some(response),
                        Err(InvocationError::Rpc(err))
                            if err.code == FLOOD_WAIT_ERROR && floods < FLOOD_WAIT_RETRIES =>
                        {
                            let wait = err.value.unwrap_or(1);
                            if wait > FLOOD_WAIT_CAP {
                                return Err(anyhow::anyhow!(
                                    "Telegram asked for a {wait}s flood wait, which is too long to hold the download open"
                                ));
                            }
                            floods += 1;
                            tokio::time::sleep(Duration::from_secs(wait as u64 + 1)).await;
                        }
                        Err(InvocationError::Rpc(err)) if err.code == FILE_MIGRATE_ERROR => {
                            let Some(target) = err.value else {
                                needs_serial.store(true, Ordering::SeqCst);
                                break None;
                            };
                            file_dc.store(target as i32, Ordering::SeqCst);
                        }
                        Err(InvocationError::Rpc(err)) if err.name == "AUTH_KEY_UNREGISTERED" => {
                            needs_serial.store(true, Ordering::SeqCst);
                            break None;
                        }
                        Err(err) => {
                            return Err(anyhow::Error::from(err))
                                .context("downloading audio chunk");
                        }
                    }
                };
                let Some(response) = response else { break };
                let file = match response {
                    tl::enums::upload::File::File(f) => f,
                    tl::enums::upload::File::CdnRedirect(_) => {
                        anyhow::bail!("Telegram redirected the download to a CDN, which isn't supported");
                    }
                };
                if tx.send((offset as u64, file.bytes)).is_err() {
                    break;
                }
            }
            Ok::<(), anyhow::Error>(())
        }));
    }
    drop(tx);

    on_progress(0, total);
    let mut downloaded = 0usize;
    let mut last_emit = std::time::Instant::now();
    while let Some((offset, bytes)) = rx.recv().await {
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        file.write_all(&bytes)
            .await
            .context("writing downloaded chunk")?;
        downloaded += bytes.len();

        if downloaded >= total || last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
            on_progress(downloaded.min(total), total);
            last_emit = std::time::Instant::now();
        }
    }

    for worker in workers {
        worker.await.context("download worker task panicked")??;
    }
    Ok(if needs_serial.load(Ordering::SeqCst) {
        Concurrent::NeedsSerial
    } else {
        Concurrent::Done
    })
}

const DOWNLOAD_RETRY_ATTEMPTS: u32 = 3;
const DOWNLOAD_RETRY_BACKOFF: Duration = Duration::from_millis(800);

pub(super) async fn download_with_retries(
    client: &grammers_client::Client,
    document: &Document,
    path: &Path,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<()> {
    let mut attempt = 1;
    loop {
        match download_with_progress(client, document, path, &mut on_progress).await {
            Ok(()) => return Ok(()),
            Err(err) if attempt < DOWNLOAD_RETRY_ATTEMPTS => {
                let backoff = match flood_wait_secs(&err) {
                    Some(secs) => Duration::from_secs(secs.min(FLOOD_WAIT_CAP) as u64 + 1),
                    None => DOWNLOAD_RETRY_BACKOFF * attempt,
                };
                crate::log!(
                    "ingest: download attempt {attempt}/{DOWNLOAD_RETRY_ATTEMPTS} failed, retrying in {:.1}s: {err:#}",
                    backoff.as_secs_f32()
                );
                tokio::time::sleep(backoff).await;
                attempt += 1;
            }
            Err(err) => return Err(err),
        }
    }
}
