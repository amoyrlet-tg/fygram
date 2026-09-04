//! Writing a file so a power cut cannot leave half of one behind.
//!
//! Temp file, fsync, rename, then fsync the directory: a rename is only atomic
//! once its directory entry has reached the disk.

use std::path::{Path, PathBuf};

fn tmp_sibling(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(".tmp");
    PathBuf::from(name)
}

fn sync_parent_dir(path: &Path) {
    if let Some(dir) = path.parent() {
        if let Ok(dir) = std::fs::File::open(dir) {
            let _ = dir.sync_all();
        }
    }
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;

    let tmp_path = tmp_sibling(path);
    {
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    std::fs::rename(&tmp_path, path)?;
    sync_parent_dir(path);
    Ok(())
}

pub(crate) async fn atomic_write_async(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use tokio::io::AsyncWriteExt;

    let tmp_path = tmp_sibling(path);
    {
        let mut file = tokio::fs::File::create(&tmp_path).await?;
        file.write_all(bytes).await?;
        file.sync_all().await?;
    }
    tokio::fs::rename(&tmp_path, path).await?;
    let path = path.to_path_buf();
    let _ = tokio::task::spawn_blocking(move || sync_parent_dir(&path)).await;
    Ok(())
}
