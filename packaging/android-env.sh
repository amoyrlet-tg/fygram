# Everything the Android build needs to find. Source it from the repo root, do
# not run it:
#
#   source packaging/android-env.sh
#   npx tauri android build --debug --target x86_64
#
# Waydroid on an ordinary machine runs an x86_64 image, so that is the ABI to
# build for; check with `waydroid prop get ro.product.cpu.abi` if unsure.

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk}"
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export NDK_HOME="$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1)"
export ANDROID_NDK_HOME="$NDK_HOME"

_TC="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
export PATH="$_TC:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"

# ffmpeg-next finds the cross-built archives through this. Build them first:
#   packaging/ffmpeg/build-audio.sh "$PWD/ffmpeg-android-x86_64" android-x86_64
export FFMPEG_DIR="$PWD/ffmpeg-android-x86_64"

# The `cc` crate looks for "<triple>-clang", but the NDK only ships the name
# with an api level in it - "x86_64-linux-android24-clang". Without these,
# anything with C in it (aws-lc-sys, behind reqwest's tls) fails to configure.
export CC_x86_64_linux_android="$_TC/x86_64-linux-android24-clang"
export CXX_x86_64_linux_android="$_TC/x86_64-linux-android24-clang++"
export AR_x86_64_linux_android="$_TC/llvm-ar"
export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$_TC/x86_64-linux-android24-clang"

# Stripping and the C++ runtime that oboe needs live in src-tauri/.cargo/config.toml
# instead - RUSTFLAGS in the environment would override that file wholesale.

unset _TC
