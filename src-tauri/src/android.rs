//! Handing Android's JavaVM to the crates that ask the platform for it.
//!
//! oboe, under cpal, reads it from `ndk_context`, and nothing else fills that
//! in - not tao, wry or tauri - so audio panics without this.

use std::ffi::c_void;

use std::sync::OnceLock;

use jni::objects::GlobalRef;
use jni::sys::{jint, JavaVM as RawJavaVM, JNI_VERSION_1_6};
use jni::JavaVM;
use tauri::{AppHandle, Emitter};

// Taken in `JNI_OnLoad`: a thread the JVM did not start sees only the system
// class loader, and the app's own classes are invisible to it.
static MEDIA_NOTIFICATION: OnceLock<GlobalRef> = OnceLock::new();

static APP: OnceLock<AppHandle> = OnceLock::new();

static SHOWING: std::sync::Mutex<Option<Showing>> = std::sync::Mutex::new(None);

struct Showing {
    title: String,
    artist: String,
    cover: Option<String>,
    duration_ms: i64,
}

pub(crate) fn remember_app(app: AppHandle) {
    let _ = APP.set(app);
}

/// # Safety
///
/// Called by the Android runtime with a valid `JavaVM`, once, while loading
/// this library.
// `pub` is for the dynamic symbol table: Android looks this name up.
#[allow(unreachable_pub)]
#[no_mangle]
pub unsafe extern "system" fn JNI_OnLoad(vm: *mut RawJavaVM, _reserved: *mut c_void) -> jint {
    if let Err(err) = register(vm) {
        // returning an error version would stop the library loading at all
        crate::log!("android: could not publish the java vm: {err}");
    }
    JNI_VERSION_1_6
}

unsafe fn register(raw: *mut RawJavaVM) -> Result<(), jni::errors::Error> {
    let vm = JavaVM::from_raw(raw)?;
    let mut env = vm.get_env()?;

    // the application, not the activity: it outlives every activity
    let application = env
        .call_static_method(
            "android/app/ActivityThread",
            "currentApplication",
            "()Landroid/app/Application;",
            &[],
        )?
        .l()?;
    let application = env.new_global_ref(application)?;

    let media = env.find_class("com/amoyrlet/fygram/MediaNotification")?;
    let _ = MEDIA_NOTIFICATION.set(env.new_global_ref(media)?);

    ndk_context::initialize_android_context(
        raw.cast::<c_void>(),
        application.as_raw().cast::<c_void>(),
    );
    // dropping it would invalidate the pointer just published
    std::mem::forget(application);
    Ok(())
}

/// Called from `AudioFocus.kt` when something else takes the sound.
///
/// # Safety
///
/// Called by the JVM with its own arguments; nothing is dereferenced here.
#[allow(unreachable_pub)]
#[no_mangle]
pub extern "system" fn Java_com_amoyrlet_fygram_AudioFocus_nativeForeignAudio(
    _env: jni::JNIEnv<'_>,
    _class: jni::objects::JClass<'_>,
    playing: jni::sys::jboolean,
) {
    crate::features::playback::audio::foreign_audio_changed(playing != 0);
}

/// What is playing, for the card in the shade. Does nothing if the pieces are
/// not in place - a missing card is not worth interrupting playback over.
pub(crate) fn now_playing(
    title: &str,
    artist: &str,
    cover: Option<&str>,
    duration_ms: i64,
    position_ms: i64,
    playing: bool,
) {
    if let Ok(mut showing) = SHOWING.lock() {
        *showing = Some(Showing {
            title: title.to_string(),
            artist: artist.to_string(),
            cover: cover.map(str::to_string),
            duration_ms,
        });
    }
    post(title, artist, cover, duration_ms, position_ms, playing);
}

pub(crate) fn set_playing(playing: bool) {
    let Ok(showing) = SHOWING.lock() else { return };
    let Some(showing) = showing.as_ref() else {
        return;
    };
    post(
        &showing.title,
        &showing.artist,
        showing.cover.as_deref(),
        showing.duration_ms,
        0,
        playing,
    );
}

fn post(
    title: &str,
    artist: &str,
    cover: Option<&str>,
    duration_ms: i64,
    position_ms: i64,
    playing: bool,
) {
    let _ = with_media(|env, class| {
        let title = env.new_string(title)?;
        let artist = env.new_string(artist)?;
        let cover = env.new_string(cover.unwrap_or(""))?;
        env.call_static_method(
            class,
            "update",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;JJZ)V",
            &[
                (&title).into(),
                (&artist).into(),
                (&cover).into(),
                duration_ms.into(),
                position_ms.into(),
                playing.into(),
            ],
        )?;
        Ok(())
    });
}

pub(crate) fn stopped() {
    if let Ok(mut showing) = SHOWING.lock() {
        *showing = None;
    }
    let _ = with_media(|env, class| {
        env.call_static_method(class, "dismiss", "()V", &[])?;
        Ok(())
    });
}

fn with_media<F>(work: F) -> Result<(), jni::errors::Error>
where
    F: FnOnce(&mut jni::JNIEnv<'_>, &jni::objects::JClass<'_>) -> Result<(), jni::errors::Error>,
{
    let Some(class) = MEDIA_NOTIFICATION.get() else {
        return Ok(());
    };
    let ctx = ndk_context::android_context();
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }?;
    // the player's threads are unknown to the JVM until they attach
    let mut env = vm.attach_current_thread()?;
    // the global ref holds a class; JClass wraps the same pointer, borrowed
    let class = unsafe { jni::objects::JClass::from_raw(class.as_raw()) };
    work(&mut env, &class)
}

/// A button on the media card. The queue lives in the interface, so the press
/// is passed on rather than acted upon.
///
/// # Safety
///
/// Called by the JVM with its own arguments; nothing is dereferenced here.
#[allow(unreachable_pub)]
#[no_mangle]
pub extern "system" fn Java_com_amoyrlet_fygram_MediaNotification_transport(
    _env: jni::JNIEnv<'_>,
    _class: jni::objects::JClass<'_>,
    action: jint,
) {
    let Some(app) = APP.get() else { return };
    let action = match action {
        0 => "play",
        1 => "pause",
        2 => "next",
        3 => "previous",
        _ => return,
    };
    let _ = app.emit("media-transport", action);
}
