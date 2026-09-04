#!/usr/bin/env bash
#
# Builds the ffmpeg fygram links against: audio only.
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
#
# Android is one prefix per ABI - "android-x86_64" for an emulator or Waydroid
# on a normal machine, "android-arm64" for a phone - and needs ANDROID_NDK_HOME
# pointing at the ndk.
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
  android-x86_64|android-arm64)
    # Android builds go through the NDK's own clang. The API level has to match
    # the minSdk in gen/android/app/build.gradle.kts, or the linker will happily
    # bind symbols the device does not have.
    NDK="${ANDROID_NDK_HOME:-${NDK_HOME:-}}"
    [ -n "$NDK" ] || { echo "set ANDROID_NDK_HOME to the ndk directory" >&2; exit 1; }
    TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/linux-x86_64"
    [ -d "$TOOLCHAIN" ] || { echo "no toolchain at $TOOLCHAIN" >&2; exit 1; }
    API=26
    if [ "$ARCH" = "android-x86_64" ]; then
      TRIPLE=x86_64-linux-android
      FF_ARCH=x86_64
    else
      TRIPLE=aarch64-linux-android
      FF_ARCH=aarch64
      # the hand-written x86 assembly means nothing here
      ASM_FLAG="--disable-x86asm"
    fi
    CROSS_FLAGS=(--enable-cross-compile --target-os=android --arch="$FF_ARCH"
                 --sysroot="$TOOLCHAIN/sysroot"
                 --cc="$TOOLCHAIN/bin/${TRIPLE}${API}-clang"
                 --cxx="$TOOLCHAIN/bin/${TRIPLE}${API}-clang++"
                 --ar="$TOOLCHAIN/bin/llvm-ar"
                 --nm="$TOOLCHAIN/bin/llvm-nm"
                 --ranlib="$TOOLCHAIN/bin/llvm-ranlib"
                 --strip="$TOOLCHAIN/bin/llvm-strip"
                 --cross-prefix="$TOOLCHAIN/bin/llvm-")
    ;;
esac

./configure \
  --prefix="$PREFIX" \
  --enable-static --disable-shared --enable-pic \
  --disable-everything --disable-programs --disable-doc --disable-autodetect \
  --disable-avdevice --disable-swscale --disable-postproc --disable-avfilter \
  --disable-network --disable-iconv --disable-xlib --disable-sdl2 \
  --disable-vaapi --disable-vdpau --disable-videotoolbox --disable-audiotoolbox \
  --enable-decoder=mp3,mp3float,aac,aac_fixed,aac_latm,alac,flac,vorbis,opus,wavpack,wmav1,wmav2,ape,mpc7,mpc8,tta,shorten,als,atrac3,atrac3p,cook,eac3,ac3,dts,mp1,mp1float,mp2,mp2float,amrnb,amrwb,gsm,gsm_ms,adpcm_ima_wav,adpcm_ms,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s24be,pcm_s32le,pcm_f32le,pcm_f64le,pcm_u8,pcm_alaw,pcm_mulaw \
  --enable-demuxer=mp3,mov,ogg,flac,wav,aac,matroska,ape,asf,wv,aiff,au,caf,dsf,mpc,mpc8,tta,ac3,eac3,dts,amr,w64,rm,tak,voc,gsm,pcm_s16le,pcm_s16be,pcm_u8,pcm_f32le,pcm_alaw,pcm_mulaw \
  --enable-parser=mpegaudio,aac,aac_latm,flac,vorbis,opus,ac3,dca,tak,cook \
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
