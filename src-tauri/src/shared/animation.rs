use std::path::Path;
use std::sync::Once;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use ffmpeg_next as ff;
use image::codecs::gif::{GifEncoder, Repeat};
use image::{Delay, Frame, RgbaImage};

const MAX_SIDE: u32 = 160;

const MAX_FRAMES: usize = 150;

const DEFAULT_DELAY: Duration = Duration::from_millis(80);

static INIT: Once = Once::new();

fn init() {
    INIT.call_once(|| {
        if let Err(err) = ff::init() {
            crate::log!("animation: ffmpeg failed to initialise: {err}");
        }
        ff::log::set_level(ff::log::Level::Quiet);
    });
}

pub(crate) fn video_to_gif(source: &Path, dest: &Path) -> Result<()> {
    init();

    let mut input = ff::format::input(source).context("opening the video")?;
    let stream = input
        .streams()
        .best(ff::media::Type::Video)
        .ok_or_else(|| anyhow!("no video track"))?;
    let index = stream.index();
    let delay = frame_delay(&stream);

    let mut decoder = ff::codec::context::Context::from_parameters(stream.parameters())
        .context("reading the video's parameters")?
        .decoder()
        .video()
        .context("opening the video decoder")?;

    let (width, height) = fit(decoder.width(), decoder.height());
    let mut scaler = ff::software::scaling::Context::get(
        decoder.format(),
        decoder.width(),
        decoder.height(),
        ff::format::Pixel::RGBA,
        width,
        height,
        ff::software::scaling::Flags::BILINEAR,
    )
    .context("setting up the scaler")?;

    let mut frames: Vec<Frame> = Vec::new();
    let mut decoded = ff::frame::Video::empty();
    let mut rgba = ff::frame::Video::empty();

    let mut take = |decoder: &mut ff::decoder::Video, frames: &mut Vec<Frame>| -> Result<()> {
        while decoder.receive_frame(&mut decoded).is_ok() {
            if frames.len() >= MAX_FRAMES {
                break;
            }
            scaler.run(&decoded, &mut rgba).context("scaling a frame")?;
            let stride = rgba.stride(0);
            let data = rgba.data(0);
            let mut pixels = Vec::with_capacity((width * height * 4) as usize);
            for row in 0..height as usize {
                let start = row * stride;
                pixels.extend_from_slice(&data[start..start + (width as usize) * 4]);
            }
            let image = RgbaImage::from_raw(width, height, pixels)
                .ok_or_else(|| anyhow!("frame did not fill its buffer"))?;
            frames.push(Frame::from_parts(
                image,
                0,
                0,
                Delay::from_saturating_duration(delay),
            ));
        }
        Ok(())
    };

    for (stream, packet) in input.packets() {
        if stream.index() != index {
            continue;
        }
        decoder.send_packet(&packet).context("decoding")?;
        take(&mut decoder, &mut frames)?;
        if frames.len() >= MAX_FRAMES {
            break;
        }
    }
    decoder.send_eof().ok();
    take(&mut decoder, &mut frames)?;

    if frames.is_empty() {
        return Err(anyhow!("the video decoded to no frames"));
    }

    let file = std::fs::File::create(dest).context("creating the gif")?;
    let mut encoder = GifEncoder::new_with_speed(std::io::BufWriter::new(file), 10);
    encoder
        .set_repeat(Repeat::Infinite)
        .context("setting the gif to loop")?;
    encoder
        .encode_frames(frames)
        .context("writing the gif's frames")?;
    Ok(())
}

fn fit(width: u32, height: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest <= MAX_SIDE || longest == 0 {
        return (width.max(1), height.max(1));
    }
    let scale = f64::from(MAX_SIDE) / f64::from(longest);
    (
        ((f64::from(width) * scale).round() as u32).max(1),
        ((f64::from(height) * scale).round() as u32).max(1),
    )
}

fn frame_delay(stream: &ff::format::stream::Stream<'_>) -> Duration {
    let rate = stream.avg_frame_rate();
    if rate.numerator() > 0 && rate.denominator() > 0 {
        let fps = f64::from(rate.numerator()) / f64::from(rate.denominator());
        if fps > 0.0 && fps <= 240.0 {
            return Duration::from_secs_f64(1.0 / fps);
        }
    }
    DEFAULT_DELAY
}
