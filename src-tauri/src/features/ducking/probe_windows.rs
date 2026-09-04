//! The Windows probe: the same question, asked of the system audio sessions.

use windows::core::Interface;
use windows::Win32::Foundation::{CloseHandle, S_OK};
use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
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

const PEAK_FLOOR: f32 = 0.0005;

pub(crate) fn telegram_is_playing() -> Probe {
    unsafe {
        let init = CoInitializeEx(None, COINIT_MULTITHREADED);
        if init.is_err() {
            return Probe::Known(false);
        }
        let heard = scan().unwrap_or(false);
        CoUninitialize();
        Probe::Known(heard)
    }
}

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

        let Ok(meter) = session.cast::<IAudioMeterInformation>() else {
            continue;
        };
        if meter.GetPeakValue().unwrap_or(0.0) < PEAK_FLOOR {
            continue;
        }

        let Ok(control) = session.cast::<IAudioSessionControl2>() else {
            continue;
        };
        // S_OK means this *is* the system sounds session, S_FALSE that it is not.
        // Both are success codes, so is_ok() here would skip every session there is.
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
