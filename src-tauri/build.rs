fn main() {
    mark_release_builds();
    link_cxx_runtime_on_android();
    tauri_build::build()
}

/// Tells the code which profile it is being built with, so `log!` can vanish
/// from a shipped binary.
///
/// `debug_assertions` cannot answer this: the dev profile turns them off (see
/// Cargo.toml), so it is false in both builds.
fn mark_release_builds() {
    println!("cargo:rustc-check-cfg=cfg(release_build)");
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        println!("cargo:rustc-cfg=release_build");
    }
}

/// Pulls in the C++ runtime and drops debug symbols on Android.
///
/// `oboe-sys` is what gives cpal its Android audio backend, and it is written in
/// C++ - but the lines in its build script that would link libc++ are commented
/// out (oboe-sys 0.6.1, build.rs:38). Nothing else asks for the runtime, so the
/// library ends up referring to `__cxa_pure_virtual` with nowhere to find it and
/// the app dies in `System.loadLibrary` before any of our code runs:
///
///   java.lang.UnsatisfiedLinkError: dlopen failed: cannot locate symbol
///   "__cxa_pure_virtual" referenced by "libfygram_lib.so"
///
/// The static runtime rather than the shared one: the app ships exactly one
/// native library, so there is nothing to share it with and nothing extra to
/// package beside it.
///
/// This belongs in the build script rather than in `.cargo/config.toml` because
/// the Android build runs cargo with `RUSTFLAGS` in the environment, and that
/// replaces the config file's flags wholesale instead of adding to them.
fn link_cxx_runtime_on_android() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("android") {
        return;
    }
    println!("cargo:rustc-link-arg=-lc++_static");
    println!("cargo:rustc-link-arg=-lc++abi");
    // half a gigabyte of symbols the phone has no use for; the host keeps its
    // own unstripped copy under target/
    println!("cargo:rustc-link-arg=-Wl,--strip-debug");
}
