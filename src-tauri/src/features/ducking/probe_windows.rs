use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use windows::core::Interface;
use windows::Win32::Foundation::{CloseHandle, S_OK};
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2,
    IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};

use super::apps::is_client;
use super::probe::Probe;

/// Hide very short session-state gaps, for example while Telegram switches
/// between audio streams.
const HANGOVER: Duration = Duration::from_millis(500);

static LAST_ACTIVE_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn hangover_active() -> bool {
    let last = LAST_ACTIVE_MS.load(Ordering::Relaxed);

    if last == 0 {
        return false;
    }

    now_ms().saturating_sub(last) < HANGOVER.as_millis() as u64
}

pub(crate) fn telegram_is_playing() -> Probe {
    unsafe {
        let init = CoInitializeEx(None, COINIT_MULTITHREADED);

        if init.is_err() {
            return Probe::Known(hangover_active());
        }

        let active_now = scan().unwrap_or(false);

        CoUninitialize();

        if active_now {
            LAST_ACTIVE_MS.store(now_ms(), Ordering::Relaxed);
        }

        Probe::Known(active_now || hangover_active())
    }
}

/// Returns true when Telegram has an audio session whose stream is currently
/// running. We intentionally use AudioSessionStateActive instead of sampling
/// the instantaneous peak level: silence inside a voice message must not
/// release ducking while the Telegram audio stream is still running.
unsafe fn scan() -> windows::core::Result<bool> {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

    let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
    let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
    let sessions = manager.GetSessionEnumerator()?;

    for i in 0..sessions.GetCount()? {
        let Ok(session) = sessions.GetSession(i) else {
            continue;
        };

        if session.GetState() != Ok(AudioSessionStateActive) {
            continue;
        }

        let Ok(control) = session.cast::<IAudioSessionControl2>() else {
            continue;
        };

        if control.IsSystemSoundsSession() == S_OK {
            continue;
        }

        let Ok(pid) = control.GetProcessId() else {
            continue;
        };

        if pid == 0 {
            continue;
        }

        if process_name(pid).is_some_and(|name| is_client(&name)) {
            return Ok(true);
        }
    }

    Ok(false)
}

unsafe fn process_name(pid: u32) -> Option<String> {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;

    let mut buffer = [0u16; 260];
    let mut len = buffer.len() as u32;

    let ok = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_FORMAT(0),
        windows::core::PWSTR(buffer.as_mut_ptr()),
        &mut len,
    );

    let _ = CloseHandle(handle);

    ok.ok()?;

    let path = String::from_utf16_lossy(&buffer[..len as usize]);
    let file = path.rsplit(['\\', '/']).next()?;

    Some(
        file.rsplit_once('.')
            .map_or(file, |(stem, _)| stem)
            .to_string(),
    )
}
