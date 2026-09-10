#!/usr/bin/env bash
#
# Builds the ffmpeg fygram links against: the audio decoders, plus H.264.
#
# Telegram desktop decodes every file through ffmpeg rather than picking a
# decoder per format, and fygram now does the same - it is the only way a music
# app plays what people actually post. A full ffmpeg would be twenty megabytes
# of video code we never call, so this build keeps the audio decoders, the
# containers they arrive in, and nothing else. The result is ~3 MB linked in.
#
# No GPL parts are enabled: every audio decoder here is LGPL, which keeps the
# app's own licence intact.
#
# Usage: tools/ffmpeg/build-audio.sh <install-prefix> [arch]
#
# On macOS the app ships one universal binary, and cargo builds both halves in a
# single invocation with one FFMPEG_DIR - so pass "universal" to build for arm64
# and x86_64 and lipo the archives together into a single prefix that satisfies
# both.
set -euo pipefail

VERSION="7.1.1"
PREFIX="${1:?usage: build-audio.sh <install-prefix> [arch]}"
ARCH="${2:-native}"
WORK="${FFMPEG_WORK_DIR:-$(mktemp -d)}"

if [ "$ARCH" = "universal" ]; then
  "$0" "$PREFIX/arm64" arm64
  "$0" "$PREFIX/x86_64" x86_64
  mkdir -p "$PREFIX/lib" "$PREFIX/include"
  cp -R "$PREFIX/arm64/include/." "$PREFIX/include/"
  for lib in "$PREFIX/arm64/lib"/*.a; do
    name="$(basename "$lib")"
    lipo -create "$lib" "$PREFIX/x86_64/lib/$name" -output "$PREFIX/lib/$name"
  done
  mkdir -p "$PREFIX/lib/pkgconfig"
  cp -R "$PREFIX/arm64/lib/pkgconfig/." "$PREFIX/lib/pkgconfig/" 2>/dev/null || true
  echo "universal (arm64 + x86_64) ffmpeg assembled in $PREFIX"
  exit 0
fi

mkdir -p "$WORK"
cd "$WORK"

if [ ! -d "ffmpeg-$VERSION" ]; then
  curl -fsSL "https://ffmpeg.org/releases/ffmpeg-$VERSION.tar.xz" -o ffmpeg.tar.xz
  tar -xf ffmpeg.tar.xz
fi
if [ "$ARCH" != "native" ]; then
  rm -rf "ffmpeg-$VERSION-$ARCH"
  cp -R "ffmpeg-$VERSION" "ffmpeg-$VERSION-$ARCH"
  cd "ffmpeg-$VERSION-$ARCH"
else
  cd "ffmpeg-$VERSION"
fi

# nasm gives the hand-written assembly; without it everything still works, just
# slower, so a missing assembler is a warning rather than a failure
ASM_FLAG=""
if ! command -v nasm >/dev/null 2>&1 && ! command -v yasm >/dev/null 2>&1; then
  echo "warning: no nasm or yasm, building without assembly optimisations" >&2
  ASM_FLAG="--disable-x86asm"
fi

# Cross flags. An array, not a string: "-arch arm64" carries a space, and an
# unquoted string would split it into two arguments configure cannot make sense
# of.
CROSS_FLAGS=()
case "$ARCH" in
  arm64)
    CROSS_FLAGS=(--enable-cross-compile --arch=arm64 --cc=clang
                 "--extra-cflags=-arch arm64" "--extra-ldflags=-arch arm64")
    ;;
  x86_64)
    CROSS_FLAGS=(--enable-cross-compile --arch=x86_64 --cc=clang
                 "--extra-cflags=-arch x86_64" "--extra-ldflags=-arch x86_64")
    ;;
  msvc)
    # rustc on windows links against .lib, and ffmpeg's msvc build calls the
    # same archives lib*.a - they are renamed after install below
    CROSS_FLAGS=(--toolchain=msvc)
    ;;
  msvc-x86)
    CROSS_FLAGS=(--toolchain=msvc --arch=x86 --cpu=i686)
    ;;
esac

./configure \
  --prefix="$PREFIX" \
  --enable-static --disable-shared --enable-pic \
  --disable-everything --disable-programs --disable-doc --disable-autodetect \
  --disable-avdevice --disable-postproc --disable-avfilter \
  --disable-network --disable-iconv --disable-xlib --disable-sdl2 \
  --disable-vaapi --disable-vdpau --disable-videotoolbox --disable-audiotoolbox \
  --enable-decoder=h264,mp3,mp3float,aac,aac_fixed,aac_latm,alac,flac,vorbis,opus,wavpack,wmav1,wmav2,ape,mpc7,mpc8,tta,shorten,als,atrac3,atrac3p,cook,eac3,ac3,dts,mp1,mp1float,mp2,mp2float,amrnb,amrwb,gsm,gsm_ms,adpcm_ima_wav,adpcm_ms,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s24be,pcm_s32le,pcm_f32le,pcm_f64le,pcm_u8,pcm_alaw,pcm_mulaw \
  --enable-demuxer=mp3,mov,ogg,flac,wav,aac,matroska,ape,asf,wv,aiff,au,caf,dsf,mpc,mpc8,tta,ac3,eac3,dts,amr,w64,rm,tak,voc,gsm,pcm_s16le,pcm_s16be,pcm_u8,pcm_f32le,pcm_alaw,pcm_mulaw \
  --enable-parser=h264,hevc,mpegaudio,aac,aac_latm,flac,vorbis,opus,ac3,dca,tak,cook \
  --enable-protocol=file \
  $ASM_FLAG "${CROSS_FLAGS[@]}"

make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"
make install

case "$ARCH" in
  msvc|msvc-x86)
    for lib in "$PREFIX/lib"/lib*.a; do
      [ -e "$lib" ] || continue
      name="$(basename "$lib")"
      cp "$lib" "$PREFIX/lib/${name#lib}"
      mv "$PREFIX/lib/${name#lib}" "$PREFIX/lib/$(basename "${name#lib}" .a).lib"
    done
    ;;
esac

echo "ffmpeg $VERSION (audio only) installed into $PREFIX"
