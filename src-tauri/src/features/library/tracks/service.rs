use std::path::Path;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, State};

use crate::features::library::channels::repository as channels_repository;
use crate::features::library::media;
use crate::features::playlists::service::queue_playlist;
use crate::shared::error::AppError;
use crate::shared::media_paths;
use crate::shared::models::Track;
use crate::shared::telegram::{resolve_channel_peer_for, TrackUpload};
use crate::AppState;

use super::permissions::{ensure_may_edit, ensure_may_repost, refusal};
use super::repository;
use super::retag;

pub(super) struct TagEdit {
    pub(crate) title: Option<String>,
    pub(crate) artist: Option<String>,
    pub(crate) album: Option<String>,
    pub(crate) cover_path: Option<String>,
}

impl TagEdit {
    fn trimmed(self) -> Self {
        let clean = |s: Option<String>| s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        Self {
            title: clean(self.title),
            artist: clean(self.artist),
            album: clean(self.album),
            cover_path: self.cover_path,
        }
    }
}

pub(super) async fn update_track(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
    edit: TagEdit,
) -> Result<Track, AppError> {
    let TagEdit {
        title,
        artist,
        album,
        cover_path,
    } = edit.trimmed();
    crate::log!(
        "update_track({track_id}): asked to set title={title:?} artist={artist:?} cover={cover_path:?}"
    );

    let mut track = repository::get(&state.db, &track_id)
        .await?
        .ok_or_else(|| AppError::Msg("track not found".to_string()))?;

    ensure_may_edit(&state, &app, &track.channel_id).await?;

    let peer = resolve_channel_peer_for(&state, &track.channel_id)
        .await
        .map_err(AppError::Msg)?;

    let meta = state
        .telegram
        .message_meta(peer, track.tg_message_id as i32)
        .await
        .map_err(|err| AppError::Msg(format!("{err}")))?;

    if meta.is_forward() {
        repository::mark_forwarded(&state.db, &track_id, &meta).await?;
        let _ = app.emit("library-changed", ());
        return Err(AppError::Msg(
            "Telegram не редактирует пересланные сообщения - его можно только \
             заменить: удалить и отправить заново."
                .to_string(),
        ));
    }
    if track.forwarded == Some(true) {
        repository::mark_not_forwarded(&state.db, &track_id).await?;
    }

    if track.file_path.is_empty() || tokio::fs::metadata(&track.file_path).await.is_err() {
        let dir = media_paths::media_root(&app, &state.db).await?;
        track.file_path = media::download::ensure_track_downloaded(
            &state.db,
            &state.telegram,
            &dir,
            &track,
            &state.download_locks,
            |_, _| {},
        )
        .await?;
    }

    if let Some(cover) = cover_path.as_deref().filter(|p| !p.trim().is_empty()) {
        crate::log!("update_track({track_id}): writing {cover} into the file");
        media::covers::write_cover_into(Path::new(&track.file_path), Path::new(cover))
            .await
            .map_err(|err| AppError::Msg(format!("{err:#}")))?;

        let dir = media_paths::media_root(&app, &state.db).await?;
        media::covers::forget_cached_cover(&dir, &track.channel_id, &track.file_hash).await;
    }

    let thumbnail = media::covers::telegram_thumbnail(Path::new(&track.file_path)).await;

    crate::log!(
        "update_track({track_id}): re-uploading {} to telegram",
        track.file_path
    );
    let started = Instant::now();
    let upload = state
        .telegram
        .rename_track(
            peer,
            track.tg_message_id as i32,
            TrackUpload {
                file_path: Path::new(&track.file_path),
                title: title.as_deref().unwrap_or(""),
                performer: artist.as_deref().unwrap_or(""),
                duration: Duration::from_secs(track.duration_sec.unwrap_or(0).max(0) as u64),
                thumbnail,
            },
            &meta.text,
        )
        .await;

    if let Err(err) = upload {
        crate::log!("update_track({track_id}): telegram refused it: {err}");
        return Err(refusal(&state, &app, &track.channel_id, &err).await);
    }
    crate::log!(
        "update_track({track_id}): telegram accepted it in {:.1}s",
        started.elapsed().as_secs_f32()
    );

    if let Err(err) =
        channels_repository::set_edit_right(&state.db, &track.channel_id, true, None).await
    {
        crate::log!("update_track({track_id}): could not store the granted right: {err}");
    }

    repository::update_tags(&state.db, &track_id, &title, &artist, &album).await?;

    let playlists = repository::playlist_ids_of_track(&state.db, &track_id).await?;
    for playlist_id in playlists {
        queue_playlist(&state.db, &playlist_id).await;
    }
    state.sync.nudge();

    repository::get_one(&state.db, &track_id).await
}

pub(super) struct Repost {
    pub(crate) tags: TagEdit,
    pub(crate) caption: String,
    pub(crate) delete_original: bool,
}

pub(super) async fn repost_track(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
    repost: Repost,
) -> Result<Track, AppError> {
    let Repost {
        tags,
        caption,
        delete_original,
    } = repost;
    let TagEdit {
        title,
        artist,
        album,
        cover_path,
    } = tags.trimmed();

    let mut track = repository::get(&state.db, &track_id)
        .await?
        .ok_or_else(|| AppError::Msg("track not found".to_string()))?;

    ensure_may_repost(&state, &app, &track.channel_id).await?;

    if track.file_path.is_empty() || tokio::fs::metadata(&track.file_path).await.is_err() {
        let dir = media_paths::media_root(&app, &state.db).await?;
        track.file_path = media::download::ensure_track_downloaded(
            &state.db,
            &state.telegram,
            &dir,
            &track,
            &state.download_locks,
            |_, _| {},
        )
        .await?;
    }

    if let Some(cover) = cover_path.as_deref().filter(|p| !p.trim().is_empty()) {
        media::covers::write_cover_into(Path::new(&track.file_path), Path::new(cover))
            .await
            .map_err(|err| AppError::Msg(format!("{err:#}")))?;

        let dir = media_paths::media_root(&app, &state.db).await?;
        media::covers::forget_cached_cover(&dir, &track.channel_id, &track.file_hash).await;
    }

    let thumbnail = media::covers::telegram_thumbnail(Path::new(&track.file_path)).await;
    let peer = resolve_channel_peer_for(&state, &track.channel_id)
        .await
        .map_err(AppError::Msg)?;

    crate::log!(
        "repost_track({track_id}): posting a replacement for message {}",
        track.tg_message_id
    );
    let posted = state
        .telegram
        .repost_track(
            peer,
            track.tg_message_id as i32,
            TrackUpload {
                file_path: Path::new(&track.file_path),
                title: title.as_deref().unwrap_or(""),
                performer: artist.as_deref().unwrap_or(""),
                duration: Duration::from_secs(track.duration_sec.unwrap_or(0).max(0) as u64),
                thumbnail,
            },
            &caption,
            delete_original,
        )
        .await;

    let posted = match posted {
        Ok(id) => id,
        Err(err) => {
            crate::log!("repost_track({track_id}): telegram refused it: {err}");
            return Err(refusal(&state, &app, &track.channel_id, &err).await);
        }
    };
    crate::log!("repost_track({track_id}): the track now lives in message {posted}");

    repository::replace_message(&state.db, &track_id, i64::from(posted)).await?;
    repository::update_tags(&state.db, &track_id, &title, &artist, &album).await?;

    for playlist_id in repository::playlist_ids_of_track(&state.db, &track_id).await? {
        queue_playlist(&state.db, &playlist_id).await;
    }
    state.sync.nudge();
    let _ = app.emit("library-changed", ());

    repository::get_one(&state.db, &track_id).await
}

pub(super) async fn cover(
    state: State<'_, AppState>,
    app: AppHandle,
    track_id: String,
) -> Result<Option<media::covers::Cover>, AppError> {
    let media_dir = media_paths::media_root(&app, &state.db).await?;
    Ok(media::covers::ensure_cover(&state.db, &media_dir, &track_id).await?)
}

pub(super) async fn retag_tracks(state: State<'_, AppState>) -> Result<u32, AppError> {
    let changed_track_ids = retag::run(&state.db).await?;
    let count = changed_track_ids.len() as u32;

    if !changed_track_ids.is_empty() {
        if let Ok(rows) =
            repository::distinct_playlists_for_tracks(&state.db, &changed_track_ids).await
        {
            for playlist_id in rows {
                queue_playlist(&state.db, &playlist_id).await;
            }
            state.sync.nudge();
        }
    }

    Ok(count)
}

pub(super) async fn list(state: State<'_, AppState>) -> Result<Vec<Track>, AppError> {
    repository::list_ordered(&state.db).await
}

pub(super) async fn search(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<Track>, AppError> {
    let words: Vec<String> = query.split_whitespace().map(|w| w.to_lowercase()).collect();
    if words.is_empty() {
        return Ok(Vec::new());
    }

    let tracks = repository::list_ordered(&state.db).await?;

    Ok(tracks
        .into_iter()
        .filter(|t| {
            let haystack = format!(
                "{} {} {}",
                t.title.as_deref().unwrap_or(""),
                t.artist.as_deref().unwrap_or(""),
                t.album.as_deref().unwrap_or(""),
            )
            .to_lowercase();
            words.iter().all(|w| haystack.contains(w.as_str()))
        })
        .collect())
}

pub(super) async fn cover_paths(
    state: State<'_, AppState>,
    app: AppHandle,
    track_ids: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let media_dir = media_paths::media_root(&app, &state.db).await?;
    Ok(media::covers::cover_paths(&state.db, &media_dir, &track_ids).await?)
}
