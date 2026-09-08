//! The player thread and the handle the rest of the app talks to it through.

use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{OutputStream, OutputStreamHandle, Sink};

use super::ffmpeg_source::FfmpegSource;

const STALL_TIMEOUT: Duration = Duration::from_millis(1500);

enum Command {
    Play(PathBuf, u64, mpsc::Sender<Result<(), String>>),
    Pause,
    Resume,

    Stop(u64),
    StopForce,
    SetVolume(f32),
    Seek(f64),
    GetPosition(mpsc::Sender<PlaybackState>),
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub(crate) struct PlaybackState {
    pub(crate) position: f64,

    pub(crate) finished: bool,

    pub(crate) active: bool,
}

struct Output {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    device: Option<String>,
}

fn default_device_name() -> Option<String> {
    rodio::cpal::default_host()
        .default_output_device()
        .and_then(|device| device.name().ok())
}

fn ensure_output(output: &mut Option<Output>) -> Result<OutputStreamHandle, String> {
    let current = default_device_name();
    if let Some(open) = output.as_ref() {
        if open.device == current {
            return Ok(open.handle.clone());
        }
        *output = None;
    }

    let (stream, handle) =
        OutputStream::try_default().map_err(|err| format!("no audio output device: {err}"))?;
    *output = Some(Output {
        _stream: stream,
        handle: handle.clone(),
        device: current,
    });
    Ok(handle)
}

fn start_playback(
    output: &mut Option<Output>,
    path: &PathBuf,
    volume: f32,
) -> Result<Sink, String> {
    let stream_handle = ensure_output(output)?;

    let source =
        FfmpegSource::open(path).map_err(|err| format!("failed to decode {path:?}: {err}"))?;
    let new_sink = match Sink::try_new(&stream_handle) {
        Ok(s) => s,
        Err(err) => {
            *output = None;
            return Err(format!("failed to create sink: {err}"));
        }
    };
    new_sink.set_volume(volume);
    new_sink.append(source);
    Ok(new_sink)
}

#[derive(Clone)]
pub(crate) struct PlayerHandle {
    tx: mpsc::Sender<Command>,
    current_path: Arc<Mutex<Option<PathBuf>>>,
}

// only Android hands the speaker between apps; the desktop ducks instead
#[cfg(target_os = "android")]
mod platform {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, OnceLock};

    use super::Command;

    /// The audio focus callback arrives on a JVM thread holding nothing of ours.
    pub(super) static REMOTE: OnceLock<mpsc::Sender<Command>> = OnceLock::new();

    /// Only a pause we did not ask for is ours to undo.
    static PAUSED_BY_US: AtomicBool = AtomicBool::new(false);

    pub(crate) fn foreign_audio_changed(playing: bool) {
        let Some(tx) = REMOTE.get() else { return };
        if playing {
            if !PAUSED_BY_US.swap(true, Ordering::SeqCst) {
                let _ = tx.send(Command::Pause);
                crate::android::set_playing(false);
            }
        } else if PAUSED_BY_US.swap(false, Ordering::SeqCst) {
            let _ = tx.send(Command::Resume);
            crate::android::set_playing(true);
        }
    }

    /// The user asked for it, so the platform gives up its claim to undo it.
    pub(super) fn forget_our_pause() {
        PAUSED_BY_US.store(false, Ordering::SeqCst);
    }
}

#[cfg(target_os = "android")]
pub(crate) use platform::foreign_audio_changed;

/// Nothing competes for the speaker here, so there is nothing to forget.
fn forget_platform_pause() {
    #[cfg(target_os = "android")]
    platform::forget_our_pause();
}

impl PlayerHandle {
    pub(crate) fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<Command>();
        #[cfg(target_os = "android")]
        let _ = platform::REMOTE.set(tx.clone());
        let current_path: Arc<Mutex<Option<PathBuf>>> = Arc::new(Mutex::new(None));
        let current_path_thread = current_path.clone();

        thread::spawn(move || {
            let mut output: Option<Output> = None;
            let mut sink: Option<Sink> = None;
            let mut last_seq: u64 = 0;

            let mut volume: f32 = 1.0;
            let mut paused = false;
            let mut last_position = 0.0f64;
            let mut stalled_since: Option<Instant> = None;

            for cmd in rx {
                match cmd {
                    Command::Play(path, seq, reply) => {
                        if seq < last_seq {
                            let _ = reply.send(Ok(()));
                            continue;
                        }
                        last_seq = seq;

                        let result = start_playback(&mut output, &path, volume);
                        match result {
                            Ok(new_sink) => {
                                sink = Some(new_sink);
                                paused = false;
                                last_position = 0.0;
                                stalled_since = None;
                                *current_path_thread.lock().unwrap() = Some(path);
                                let _ = reply.send(Ok(()));
                            }
                            Err(msg) => {
                                crate::log!("audio: {msg}");

                                if let Some(s) = sink.take() {
                                    s.stop();
                                }
                                *current_path_thread.lock().unwrap() = None;
                                let _ = reply.send(Err(msg));
                            }
                        }
                    }
                    Command::Pause => {
                        paused = true;
                        stalled_since = None;
                        if let Some(s) = &sink {
                            s.pause();
                        }
                    }
                    Command::Resume => {
                        paused = false;
                        stalled_since = None;
                        if let Some(s) = &sink {
                            s.play();
                        }
                    }
                    Command::Stop(seq) => {
                        if seq < last_seq {
                            continue;
                        }
                        last_seq = seq;
                        if let Some(s) = sink.take() {
                            s.stop();
                        }
                        stalled_since = None;
                        *current_path_thread.lock().unwrap() = None;
                    }
                    Command::StopForce => {
                        if let Some(s) = sink.take() {
                            s.stop();
                        }
                        stalled_since = None;
                        *current_path_thread.lock().unwrap() = None;
                    }
                    Command::SetVolume(v) => {
                        volume = v;
                        if let Some(s) = &sink {
                            s.set_volume(v);
                        }
                    }
                    Command::Seek(secs) => {
                        stalled_since = None;
                        last_position = secs.max(0.0);
                        if let Some(s) = &sink {
                            let _ = s.try_seek(Duration::from_secs_f64(secs.max(0.0)));
                        }
                    }
                    Command::GetPosition(reply) => {
                        let snapshot = sink
                            .as_ref()
                            .map(|s| (s.get_pos().as_secs_f64(), s.empty()));
                        let state = match snapshot {
                            Some((position, finished)) => {
                                let frozen =
                                    !paused && !finished && (position - last_position).abs() < 1e-9;
                                if frozen {
                                    let since = *stalled_since.get_or_insert_with(Instant::now);
                                    if since.elapsed() > STALL_TIMEOUT {
                                        stalled_since = None;
                                        let path = current_path_thread.lock().unwrap().clone();
                                        if let Some(path) = path {
                                            crate::log!(
                                                "audio: output frozen at {position:.1}s - \
                                                 reopening on the current default device"
                                            );
                                            if let Some(dead) = sink.take() {
                                                dead.stop();
                                            }
                                            output = None;
                                            match start_playback(&mut output, &path, volume) {
                                                Ok(fresh) => {
                                                    let _ = fresh.try_seek(
                                                        Duration::from_secs_f64(position),
                                                    );
                                                    sink = Some(fresh);
                                                }
                                                Err(err) => {
                                                    crate::log!("audio: could not move playback to another device: {err}");
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    stalled_since = None;
                                }
                                last_position = position;
                                PlaybackState {
                                    position,
                                    finished,
                                    active: true,
                                }
                            }
                            None => {
                                stalled_since = None;
                                PlaybackState {
                                    position: 0.0,
                                    finished: false,
                                    active: false,
                                }
                            }
                        };
                        let _ = reply.send(state);
                    }
                }
            }
        });

        Self { tx, current_path }
    }

    pub(crate) fn current_path(&self) -> Option<PathBuf> {
        self.current_path.lock().unwrap().clone()
    }

    pub(crate) fn play(&self, path: PathBuf, seq: u64) -> Result<(), String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.tx
            .send(Command::Play(path, seq, reply_tx))
            .map_err(|_| "audio thread is gone".to_string())?;
        match reply_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(result) => result,
            Err(_) => Err("audio thread did not respond".to_string()),
        }
    }

    pub(crate) fn pause(&self) {
        forget_platform_pause();
        #[cfg(target_os = "android")]
        crate::android::set_playing(false);
        let _ = self.tx.send(Command::Pause);
    }

    pub(crate) fn resume(&self) {
        forget_platform_pause();
        #[cfg(target_os = "android")]
        crate::android::set_playing(true);
        let _ = self.tx.send(Command::Resume);
    }

    pub(crate) fn stop_for_switch(&self, seq: u64) {
        let _ = self.tx.send(Command::Stop(seq));
    }

    pub(crate) fn stop_now(&self) {
        #[cfg(target_os = "android")]
        crate::android::stopped();
        let _ = self.tx.send(Command::StopForce);
    }

    pub(crate) fn set_volume(&self, volume: f32) {
        let _ = self.tx.send(Command::SetVolume(volume));
    }

    pub(crate) fn seek(&self, seconds: f64) {
        let _ = self.tx.send(Command::Seek(seconds));
    }

    pub(crate) fn position(&self) -> PlaybackState {
        let (reply_tx, reply_rx) = mpsc::channel();
        if self.tx.send(Command::GetPosition(reply_tx)).is_err() {
            return PlaybackState {
                position: 0.0,
                finished: false,
                active: false,
            };
        }
        reply_rx
            .recv_timeout(Duration::from_millis(200))
            .unwrap_or(PlaybackState {
                position: 0.0,
                finished: false,
                active: false,
            })
    }
}
