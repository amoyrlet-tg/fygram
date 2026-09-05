//! The Linux probe: which audio streams are live, and whether a Telegram client owns one.

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;

use tokio::sync::Notify;

use super::apps::is_client;
use super::probe::Probe;

pub(crate) fn telegram_is_playing() -> Probe {
    let output = match Command::new("pactl")
        .arg("list")
        .arg("sink-inputs")
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return Probe::Unsupported,
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let scan = parse(&text);
    if scan.found {
        return Probe::Known(true);
    }
    if scan.unnamed_clients.is_empty() {
        return Probe::Known(false);
    }
    Probe::Known(client_is_a_telegram(&scan.unnamed_clients))
}

fn client_is_a_telegram(wanted: &[u32]) -> bool {
    let Ok(output) = Command::new("pactl").arg("list").arg("clients").output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let text = String::from_utf8_lossy(&output.stdout);

    let mut current: Option<u32> = None;
    for line in text.lines() {
        let line = line.trim();
        if let Some(id) = line.strip_prefix("Client #") {
            current = id.trim().parse().ok();
            continue;
        }
        if !current.is_some_and(|id| wanted.contains(&id)) {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if NAME_KEYS.contains(&key.trim()) && is_client(value.trim().trim_matches('"')) {
            return true;
        }
    }
    false
}

#[derive(Default)]
pub(crate) struct Watcher {
    child: Option<Child>,
}

impl Drop for Watcher {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub(crate) fn watch(notify: Arc<Notify>) -> Watcher {
    let mut child = match Command::new("pactl")
        .arg("subscribe")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            crate::log!(
                "ducking: `pactl subscribe` did not start ({err}); falling back to polling"
            );
            return Watcher::default();
        }
    };

    let Some(stdout) = child.stdout.take() else {
        return Watcher::default();
    };
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if line.contains("sink-input") {
                notify.notify_one();
            }
        }
    });
    Watcher { child: Some(child) }
}

const NAME_KEYS: &[&str] = &[
    "application.process.binary",
    "application.name",
    "application.id",
    "application.icon_name",
    "node.name",
    "device.description",
];

const NOTIFICATION_ROLE: &str = "event";

#[derive(Default, Debug, PartialEq)]
struct Scan {
    found: bool,
    unnamed_clients: Vec<u32>,
}

fn parse(text: &str) -> Scan {
    let mut scan = Scan::default();
    let mut stream = Stream::default();

    fn finish(stream: &Stream, scan: &mut Scan) {
        if stream.corked || stream.notification {
            return;
        }
        if stream.named_client {
            scan.found = true;
        } else if let Some(client) = stream.client {
            scan.unnamed_clients.push(client);
        }
    }

    for line in text.lines() {
        let line = line.trim();

        if line.starts_with("Sink Input #") {
            finish(&stream, &mut scan);
            stream = Stream::default();
            continue;
        }

        if let Some(value) = line.strip_prefix("Corked:") {
            stream.corked = value.trim() != "no";
            continue;
        }
        if let Some(value) = line.strip_prefix("Client:") {
            stream.client = value.trim().parse().ok();
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim().trim_matches('"');

        if key == "media.role" {
            stream.notification = value.eq_ignore_ascii_case(NOTIFICATION_ROLE);
            continue;
        }
        if NAME_KEYS.contains(&key) && is_client(value) {
            stream.named_client = true;
        }
    }
    finish(&stream, &mut scan);
    scan
}

struct Stream {
    corked: bool,
    named_client: bool,
    notification: bool,
    client: Option<u32>,
}

impl Default for Stream {
    fn default() -> Self {
        Self {
            corked: true,
            named_client: false,
            notification: false,
            client: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plays(text: &str) -> bool {
        parse(text).found
    }

    const REAL_TELEGRAM_AND_AYUGRAM: &str = r#"Sink Input #2681
	Client: 2680
	Corked: no
	Properties:
		node.name = "AyuGram"
		device.description = "AyuGram"
		media.role = "game"
Sink Input #2696
	Client: 2695
	Corked: no
	Properties:
		node.name = "Telegram"
		device.description = "Telegram"
		media.role = "game""#;

    #[test]
    fn finds_the_real_clients() {
        assert!(plays(REAL_TELEGRAM_AND_AYUGRAM));
    }

    #[test]
    fn finds_each_real_client_on_its_own() {
        for block in REAL_TELEGRAM_AND_AYUGRAM.split_inclusive("media.role = \"game\"") {
            if block.trim().is_empty() {
                continue;
            }
            assert!(plays(block), "should have recognised:\n{block}");
        }
    }

    #[test]
    fn ignores_our_own_stream() {
        let ours = "Sink Input #1416\n\tCorked: no\n\tProperties:\n\t\tapplication.name = \"PipeWire ALSA [fygram]\"\n\t\tnode.name = \"alsa_playback.fygram\"\n";
        assert!(!plays(ours));
    }

    #[test]
    fn ignores_a_corked_client() {
        let corked = REAL_TELEGRAM_AND_AYUGRAM.replace("Corked: no", "Corked: yes");
        assert!(!plays(&corked));
    }

    #[test]
    fn ignores_a_notification_sound() {
        let ding =
            REAL_TELEGRAM_AND_AYUGRAM.replace("media.role = \"game\"", "media.role = \"event\"");
        assert!(!plays(&ding));
    }

    #[test]
    fn reads_a_client_that_names_itself_in_the_stream() {
        let direct = "Sink Input #7\n\tCorked: no\n\tProperties:\n\t\tapplication.name = \"Telegram Desktop\"\n\t\tapplication.process.binary = \"telegram-desktop\"\n";
        assert!(plays(direct));
    }

    #[test]
    fn does_not_carry_a_name_across_blocks() {
        let split = "Sink Input #1\n\tCorked: yes\n\tProperties:\n\t\tnode.name = \"Telegram\"\n\nSink Input #2\n\tCorked: no\n\tProperties:\n\t\tapplication.name = \"Firefox\"\n";
        assert!(!plays(split));
    }

    #[test]
    fn remembers_unnamed_clients_to_ask_about_later() {
        let anonymous = "Sink Input #9\n\tClient: 42\n\tCorked: no\n\tProperties:\n\t\tmedia.name = \"Playback\"\n";
        let scan = parse(anonymous);
        assert!(!scan.found);
        assert_eq!(scan.unnamed_clients, vec![42]);
    }

    #[test]
    fn does_not_ask_about_clients_behind_silent_streams() {
        let corked = "Sink Input #9\n\tClient: 42\n\tCorked: yes\n\tProperties:\n\t\tmedia.name = \"Playback\"\n";
        assert_eq!(parse(corked).unnamed_clients, Vec::<u32>::new());
    }

    #[test]
    #[ignore]
    fn asks_the_live_sound_server() {
        match telegram_is_playing() {
            Probe::Known(heard) => println!("live probe: telegram playing = {heard}"),
            Probe::Unsupported => println!("live probe: no pactl here"),
        }
    }
}
