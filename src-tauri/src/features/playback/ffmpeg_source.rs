//! Decoding through ffmpeg, the way telegram desktop does it: one path for
//! every container instead of a decoder per format.
//!
//! The build linked here is audio only - see packaging/ffmpeg/build-audio.sh.

use std::collections::VecDeque;
use std::path::Path;
use std::sync::Once;
use std::time::Duration;

use ff::software::resampling::Context as Resampler;
use ffmpeg_next as ff;

static INIT: Once = Once::new();

fn init() {
    INIT.call_once(|| {
        if let Err(err) = ff::init() {
            crate::log!("audio: ffmpeg failed to initialise: {err}");
        }
        // ffmpeg is chatty on stderr about every quirk it forgives
        ff::log::set_level(ff::log::Level::Quiet);
    });
}

/// Interleaved 16-bit samples at the file's own rate; rodio matches the device.
pub(crate) struct FfmpegSource {
    input: ff::format::context::Input,
    decoder: ff::decoder::Audio,
    resampler: Option<Resampler>,
    stream: usize,
    channels: u16,
    rate: u32,
    total: Option<Duration>,
    pending: VecDeque<i16>,
    drained: bool,
}

impl FfmpegSource {
    pub(crate) fn open(path: &Path) -> Result<Self, String> {
        init();

        let input = ff::format::input(path).map_err(|err| format!("{err}"))?;
        let stream = input
            .streams()
            .best(ff::media::Type::Audio)
            .ok_or_else(|| "file has no audio track".to_string())?;
        let index = stream.index();

        let total = {
            let d = stream.duration();
            let tb = stream.time_base();
            if d > 0 && tb.denominator() != 0 {
                Some(Duration::from_secs_f64(
                    d as f64 * f64::from(tb.numerator()) / f64::from(tb.denominator()),
                ))
            } else {
                None
            }
        };

        let decoder = ff::codec::context::Context::from_parameters(stream.parameters())
            .map_err(|err| format!("{err}"))?
            .decoder()
            .audio()
            .map_err(|err| format!("{err}"))?;

        let rate = decoder.rate();
        let channels = decoder.channel_layout().channels().max(1) as u16;

        Ok(Self {
            input,
            decoder,
            resampler: None,
            stream: index,
            channels,
            rate,
            total,
            pending: VecDeque::new(),
            drained: false,
        })
    }

    /// False when the file is exhausted.
    fn fill(&mut self) -> bool {
        let mut decoded = ff::frame::Audio::empty();
        let mut resampled = ff::frame::Audio::empty();

        loop {
            while self.decoder.receive_frame(&mut decoded).is_ok() {
                // pcm hands over frames with no layout, and swresample then
                // refuses them as "input changed"
                if decoded.channel_layout().is_empty() {
                    let channels = decoded.channels().max(1);
                    decoded.set_channel_layout(ff::ChannelLayout::default(channels as i32));
                }

                // pcm reports its sample format only once decoding starts, so
                // a resampler built from the decoder does nothing
                if self.resampler.is_none() {
                    self.channels = decoded.channels().max(1);
                    self.rate = decoded.rate();
                    match Resampler::get(
                        decoded.format(),
                        decoded.channel_layout(),
                        decoded.rate(),
                        ff::format::Sample::I16(ff::format::sample::Type::Packed),
                        decoded.channel_layout(),
                        decoded.rate(),
                    ) {
                        Ok(built) => self.resampler = Some(built),
                        Err(err) => {
                            crate::log!("audio: cannot convert samples: {err}");
                            return false;
                        }
                    }
                }

                let Some(resampler) = self.resampler.as_mut() else {
                    return false;
                };
                if resampler.run(&decoded, &mut resampled).is_err() {
                    // parameters can change mid-file; rebuild for what arrives
                    self.resampler = None;
                    continue;
                }
                // plane() covers half an interleaved stereo frame - every
                // other sample dropped, a click at each boundary. data() is all.
                let wanted = resampled.samples() * self.channels as usize;
                let bytes = resampled.data(0);
                let count = wanted.min(bytes.len() / 2);
                self.pending.extend(
                    bytes[..count * 2]
                        .as_chunks::<2>()
                        .0
                        .iter()
                        .map(|pair| i16::from_ne_bytes(*pair)),
                );
                if !self.pending.is_empty() {
                    return true;
                }
            }

            let Some((stream, packet)) = self.input.packets().next() else {
                // no packets left: flush whatever the decoder still holds
                if !self.drained {
                    self.drained = true;
                    let _ = self.decoder.send_eof();
                    continue;
                }
                return false;
            };
            if stream.index() != self.stream {
                continue;
            }
            let _ = self.decoder.send_packet(&packet);
        }
    }
}

impl Iterator for FfmpegSource {
    type Item = i16;

    fn next(&mut self) -> Option<i16> {
        if let Some(sample) = self.pending.pop_front() {
            return Some(sample);
        }
        if !self.fill() {
            return None;
        }
        self.pending.pop_front()
    }
}

impl rodio::Source for FfmpegSource {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.rate
    }

    fn total_duration(&self) -> Option<Duration> {
        self.total
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), rodio::source::SeekError> {
        let target = pos.as_secs_f64();
        let stamp = (target * f64::from(ff::ffi::AV_TIME_BASE)) as i64;
        self.input.seek(stamp, ..stamp).map_err(|err| {
            rodio::source::SeekError::Other(Box::new(SeekFailed(err.to_string())))
        })?;
        self.decoder.flush();
        self.pending.clear();
        self.drained = false;
        Ok(())
    }
}

#[derive(Debug)]
struct SeekFailed(String);

impl std::fmt::Display for SeekFailed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "seek failed: {}", self.0)
    }
}

impl std::error::Error for SeekFailed {}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::Source;

    /// Stereo on purpose: a mono fixture hides the half-frame read that made
    /// every track click.
    const CHANNELS: u16 = 2;

    fn write_tone(path: &Path) {
        const RATE: u32 = 44_100;
        const SAMPLES: u32 = RATE / 2;
        let mut pcm = Vec::with_capacity(SAMPLES as usize * 2 * CHANNELS as usize);
        for n in 0..SAMPLES {
            let t = n as f32 / RATE as f32;
            let left = (t * 440.0 * std::f32::consts::TAU).sin() * 12_000.0;
            let right = (t * 660.0 * std::f32::consts::TAU).sin() * 9_000.0;
            pcm.extend_from_slice(&(left as i16).to_le_bytes());
            pcm.extend_from_slice(&(right as i16).to_le_bytes());
        }

        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes()); // pcm
        wav.extend_from_slice(&CHANNELS.to_le_bytes());
        wav.extend_from_slice(&RATE.to_le_bytes());
        wav.extend_from_slice(&(RATE * 2 * CHANNELS as u32).to_le_bytes());
        wav.extend_from_slice(&(2 * CHANNELS).to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
        wav.extend_from_slice(&pcm);
        std::fs::write(path, wav).expect("writing the fixture");
    }

    fn fixture(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("fygram-audio-tests");
        std::fs::create_dir_all(&dir).expect("creating the fixture directory");
        let path = dir.join(name);
        write_tone(&path);
        path
    }

    #[test]
    fn decodes_every_sample_of_an_interleaved_frame() {
        let path = fixture("tone.wav");
        let source = FfmpegSource::open(&path).expect("opening the fixture");

        assert_eq!(source.channels(), CHANNELS);
        assert_eq!(source.sample_rate(), 44_100);

        let decoded: Vec<i16> = source.collect();

        // reading half of each frame still made sound, so the count is what
        // catches it
        let expected = 44_100 / 2 * CHANNELS as usize;
        assert!(
            decoded.len() >= expected,
            "expected at least {expected} samples, got {}",
            decoded.len()
        );
        assert!(
            decoded.iter().any(|s| *s != 0),
            "decoded nothing but silence"
        );
    }

    #[test]
    fn seeking_lands_somewhere_playable() {
        let path = fixture("seek.wav");
        let mut source = FfmpegSource::open(&path).expect("opening the fixture");

        source
            .try_seek(Duration::from_millis(250))
            .expect("seeking");
        let after: Vec<i16> = source.take(4_000).collect();
        assert!(!after.is_empty(), "nothing decodes after a seek");
    }

    #[test]
    fn a_file_that_is_not_audio_fails_instead_of_panicking() {
        let dir = std::env::temp_dir().join("fygram-audio-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("garbage.bin");
        std::fs::write(&path, b"this is not audio, not even close").unwrap();

        assert!(FfmpegSource::open(&path).is_err());
    }
}
