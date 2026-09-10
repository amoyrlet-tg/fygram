fn main() {
    mark_release_builds();
    tauri_build::build()
}

fn mark_release_builds() {
    println!("cargo:rustc-check-cfg=cfg(release_build)");
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        println!("cargo:rustc-cfg=release_build");
    }
}
