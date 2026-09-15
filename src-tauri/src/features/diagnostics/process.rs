pub(crate) struct ProcSample {
    pub(crate) name: String,
    pub(crate) pid: u32,
    pub(crate) working_set: u64,
    pub(crate) private: u64,
}

#[cfg(target_os = "windows")]
pub(crate) fn tree() -> Vec<ProcSample> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX};
    use windows::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let ours = unsafe { GetCurrentProcessId() };
    let mut entries: Vec<(u32, u32, String)> = Vec::new();

    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return Vec::new();
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let end = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..end]);
                entries.push((entry.th32ProcessID, entry.th32ParentProcessID, name));
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }

    let mut wanted: Vec<u32> = vec![ours];
    loop {
        let before = wanted.len();
        for (pid, parent, _) in &entries {
            if wanted.contains(parent) && !wanted.contains(pid) {
                wanted.push(*pid);
            }
        }
        if wanted.len() == before {
            break;
        }
    }

    let mut samples = Vec::new();
    for pid in wanted {
        let Some((_, _, name)) = entries.iter().find(|(id, _, _)| *id == pid) else {
            continue;
        };
        unsafe {
            let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
                continue;
            };
            let mut counters = PROCESS_MEMORY_COUNTERS_EX::default();
            let size = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
            let ok = GetProcessMemoryInfo(handle, &mut counters as *mut _ as *mut _, size).is_ok();
            let _ = CloseHandle(handle);
            if ok {
                samples.push(ProcSample {
                    name: name.clone(),
                    pid,
                    working_set: counters.WorkingSetSize as u64,
                    private: counters.PrivateUsage as u64,
                });
            }
        }
    }
    samples
}

#[cfg(target_os = "linux")]
pub(crate) fn tree() -> Vec<ProcSample> {
    fn read(pid: u32) -> Option<(u32, String, u64, u64)> {
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
        let close = stat.rfind(')')?;
        let name = stat.get(stat.find('(')? + 1..close)?.to_string();
        let rest: Vec<&str> = stat.get(close + 2..)?.split_whitespace().collect();
        let parent = rest.get(1)?.parse().ok()?;
        let statm = std::fs::read_to_string(format!("/proc/{pid}/statm")).ok()?;
        let fields: Vec<&str> = statm.split_whitespace().collect();
        let page = 4096u64;
        let size = fields.first()?.parse::<u64>().ok()? * page;
        let resident = fields.get(1)?.parse::<u64>().ok()? * page;
        Some((parent, name, resident, size))
    }

    let ours = std::process::id();
    let mut all: Vec<(u32, u32, String, u64, u64)> = Vec::new();
    let Ok(dir) = std::fs::read_dir("/proc") else {
        return Vec::new();
    };
    for entry in dir.flatten() {
        let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else {
            continue;
        };
        if let Some((parent, name, resident, size)) = read(pid) {
            all.push((pid, parent, name, resident, size));
        }
    }

    let mut wanted: Vec<u32> = vec![ours];
    loop {
        let before = wanted.len();
        for (pid, parent, _, _, _) in &all {
            if wanted.contains(parent) && !wanted.contains(pid) {
                wanted.push(*pid);
            }
        }
        if wanted.len() == before {
            break;
        }
    }

    all.into_iter()
        .filter(|(pid, _, _, _, _)| wanted.contains(pid))
        .map(|(pid, _, name, resident, size)| ProcSample {
            name,
            pid,
            working_set: resident,
            private: size,
        })
        .collect()
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
pub(crate) fn tree() -> Vec<ProcSample> {
    Vec::new()
}
