//! Telegram's session as a file.
//!
//! Temp file plus a backup: a session truncated by a power cut costs a fresh
//! login, and the client rewrites it often.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use grammers_session::types::{
    ChannelState, DcOption, PeerId, PeerInfo, UpdateState, UpdatesState,
};
use grammers_session::{BoxFuture, Session, SessionData};
use serde::{Deserialize, Serialize};

const CHURN_FLUSH_INTERVAL: Duration = Duration::from_secs(2);

pub(crate) struct FileSession {
    path: PathBuf,
    inner: Mutex<Inner>,
}

struct Inner {
    state: State,
    dirty: bool,
    last_write: Instant,
}

struct State {
    home_dc: i32,
    dc_options: HashMap<i32, DcOption>,
    peer_infos: HashMap<PeerId, PeerInfo>,
    updates_state: UpdatesState,
}

impl Default for State {
    fn default() -> Self {
        let sd = SessionData::default();
        Self {
            home_dc: sd.home_dc,
            dc_options: sd.dc_options,
            peer_infos: sd.peer_infos,
            updates_state: sd.updates_state,
        }
    }
}

#[derive(Serialize, Deserialize)]
struct PersistedState {
    home_dc: i32,
    dc_options: Vec<DcOption>,
    peer_infos: Vec<PeerInfo>,
    updates_state: UpdatesState,
}

impl From<&State> for PersistedState {
    fn from(state: &State) -> Self {
        Self {
            home_dc: state.home_dc,
            dc_options: state.dc_options.values().cloned().collect(),
            peer_infos: state.peer_infos.values().cloned().collect(),
            updates_state: state.updates_state.clone(),
        }
    }
}

impl From<PersistedState> for State {
    fn from(persisted: PersistedState) -> Self {
        Self {
            home_dc: persisted.home_dc,
            dc_options: persisted
                .dc_options
                .into_iter()
                .map(|dc| (dc.id, dc))
                .collect(),
            peer_infos: persisted
                .peer_infos
                .into_iter()
                .filter_map(|info| peer_info_id(&info).map(|id| (id, info)))
                .collect(),
            updates_state: persisted.updates_state,
        }
    }
}

fn peer_info_id(info: &PeerInfo) -> Option<PeerId> {
    match *info {
        PeerInfo::User { id, .. } => PeerId::user(id),
        PeerInfo::Chat { id } => PeerId::chat(id),
        PeerInfo::Channel { id, .. } => PeerId::channel(id),
    }
}

/// Drops a session and the backup beside it.
///
/// Both: the restore path would otherwise bring the stale auth key back, and
/// telegram answers AUTH_RESTART to every sign-in that uses one.
pub(crate) fn forget(path: &Path) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(backup_path(path));
}

fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(".bak");
    PathBuf::from(name)
}

fn read_session(path: &Path) -> Option<(State, Vec<u8>)> {
    let bytes = std::fs::read(path).ok()?;
    let persisted = serde_json::from_slice::<PersistedState>(&bytes).ok()?;
    Some((State::from(persisted), bytes))
}

fn has_auth_key(state: &State) -> bool {
    state.dc_options.values().any(|dc| dc.auth_key.is_some())
}

impl FileSession {
    pub(crate) fn open(path: PathBuf) -> Self {
        let loaded = read_session(&path).or_else(|| {
            let backup = backup_path(&path);
            let restored = read_session(&backup)?;
            crate::log!("session: {path:?} was unusable - restoring from {backup:?}");
            Some(restored)
        });

        let state = match loaded {
            Some((state, bytes)) => {
                if has_auth_key(&state) {
                    let _ = crate::shared::atomic_file::atomic_write(&backup_path(&path), &bytes);
                }
                state
            }
            None => State::default(),
        };

        Self {
            path,
            inner: Mutex::new(Inner {
                state,
                dirty: false,
                last_write: Instant::now(),
            }),
        }
    }

    fn write(&self, inner: &mut Inner) {
        let persisted = PersistedState::from(&inner.state);
        let Ok(bytes) = serde_json::to_vec(&persisted) else {
            return;
        };
        if let Err(err) = crate::shared::atomic_file::atomic_write(&self.path, &bytes) {
            crate::log!("session: failed to persist to {:?}: {err}", self.path);
            return;
        }
        inner.dirty = false;
        inner.last_write = Instant::now();
    }

    fn save_now(&self, inner: &mut Inner) {
        self.write(inner);
    }

    fn save_soon(&self, inner: &mut Inner) {
        if inner.last_write.elapsed() >= CHURN_FLUSH_INTERVAL {
            self.write(inner);
        } else {
            inner.dirty = true;
        }
    }

    pub(crate) fn flush(&self) {
        let mut inner = self.inner.lock().unwrap();
        if inner.dirty {
            self.write(&mut inner);
        }
    }
}

impl Session for FileSession {
    type Error = std::convert::Infallible;

    fn home_dc_id(&self) -> Result<i32, Self::Error> {
        Ok(self.inner.lock().unwrap().state.home_dc)
    }

    fn set_home_dc_id(&self, dc_id: i32) -> BoxFuture<'_, Result<(), Self::Error>> {
        Box::pin(async move {
            let mut inner = self.inner.lock().unwrap();
            inner.state.home_dc = dc_id;
            self.save_now(&mut inner);
            Ok(())
        })
    }

    fn dc_option(&self, dc_id: i32) -> Result<Option<DcOption>, Self::Error> {
        Ok(self
            .inner
            .lock()
            .unwrap()
            .state
            .dc_options
            .get(&dc_id)
            .cloned())
    }

    fn set_dc_option(&self, dc_option: &DcOption) -> BoxFuture<'_, Result<(), Self::Error>> {
        let dc_option = dc_option.clone();
        Box::pin(async move {
            let mut inner = self.inner.lock().unwrap();
            inner.state.dc_options.insert(dc_option.id, dc_option);
            self.save_now(&mut inner);
            Ok(())
        })
    }

    fn peer(&self, peer: PeerId) -> BoxFuture<'_, Result<Option<PeerInfo>, Self::Error>> {
        let info = self
            .inner
            .lock()
            .unwrap()
            .state
            .peer_infos
            .get(&peer)
            .cloned();
        Box::pin(async move { Ok(info) })
    }

    fn cache_peer(&self, peer: &PeerInfo) -> BoxFuture<'_, Result<(), Self::Error>> {
        let peer = peer.clone();
        Box::pin(async move {
            let mut inner = self.inner.lock().unwrap();
            if let Some(id) = peer_info_id(&peer) {
                inner.state.peer_infos.insert(id, peer);
            }
            self.save_soon(&mut inner);
            Ok(())
        })
    }

    fn updates_state(&self) -> BoxFuture<'_, Result<UpdatesState, Self::Error>> {
        let updates = self.inner.lock().unwrap().state.updates_state.clone();
        Box::pin(async move { Ok(updates) })
    }

    fn set_update_state(&self, update: UpdateState) -> BoxFuture<'_, Result<(), Self::Error>> {
        Box::pin(async move {
            let mut inner = self.inner.lock().unwrap();
            let state = &mut inner.state;
            match update {
                UpdateState::All(new_state) => state.updates_state = new_state,
                UpdateState::Primary { pts, date, seq } => {
                    state.updates_state.pts = pts;
                    state.updates_state.date = date;
                    state.updates_state.seq = seq;
                }
                UpdateState::Secondary { qts } => {
                    state.updates_state.qts = qts;
                }
                UpdateState::Channel { id, pts } => {
                    if let Some(channel) =
                        state.updates_state.channels.iter_mut().find(|c| c.id == id)
                    {
                        channel.pts = pts;
                    } else {
                        state.updates_state.channels.push(ChannelState { id, pts });
                    }
                }
            }
            self.save_soon(&mut inner);
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{SocketAddrV4, SocketAddrV6};

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("fygram-session-test-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn dc_with_key(id: i32) -> DcOption {
        DcOption {
            id,
            ipv4: "149.154.167.51:443".parse::<SocketAddrV4>().unwrap(),
            ipv6: "[2001:67c:4e8:f002::a]:443"
                .parse::<SocketAddrV6>()
                .unwrap(),
            auth_key: Some([7u8; 256]),
        }
    }

    #[tokio::test]
    async fn auth_key_is_written_immediately() {
        let path = scratch_dir("immediate").join("telegram.session");
        let session = FileSession::open(path.clone());

        session.set_dc_option(&dc_with_key(2)).await.unwrap();

        let reopened = FileSession::open(path);
        assert!(has_auth_key(&reopened.inner.lock().unwrap().state));
    }

    #[tokio::test]
    async fn a_ruined_session_falls_back_to_the_backup() {
        let path = scratch_dir("ruined").join("telegram.session");

        let session = FileSession::open(path.clone());
        session.set_dc_option(&dc_with_key(2)).await.unwrap();
        drop(session);

        drop(FileSession::open(path.clone()));

        std::fs::write(&path, vec![0u8; 1024]).unwrap();

        let restored = FileSession::open(path);
        let inner = restored.inner.lock().unwrap();
        assert!(
            has_auth_key(&inner.state),
            "should have come back from the backup"
        );
        assert_eq!(inner.state.home_dc, 2);
    }

    #[tokio::test]
    async fn deferred_peer_writes_survive_a_flush() {
        let path = scratch_dir("flush").join("telegram.session");
        let session = FileSession::open(path.clone());
        session.set_dc_option(&dc_with_key(2)).await.unwrap();

        session
            .cache_peer(&PeerInfo::User {
                id: 42,
                auth: None,
                bot: Some(false),
                is_self: Some(false),
            })
            .await
            .unwrap();
        session.flush();

        let reopened = FileSession::open(path);
        let inner = reopened.inner.lock().unwrap();
        assert_eq!(inner.state.peer_infos.len(), 1);
    }
}
