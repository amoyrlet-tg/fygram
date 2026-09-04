# Platforms

What differs because of the operating system, not because of the window.

`host.ts` asks the backend once at startup what it is running on — the answer
comes from `cfg!(desktop)` and `std::env::consts::OS`, so it is decided at
compile time and cannot be wrong. Settings that only mean something on a desktop
are hidden through `useIsDesktopHost()`: autostart, always-fullscreen, ducking
while Telegram plays, and broadcasting what is playing.

**This is not `src/layouts/`.** That folder answers "how wide is the window",
this one answers "what is underneath". A desktop window dragged narrow still
gets the desktop settings; an Android tablet in landscape still does not.

Android is the mobile target; iOS is not planned. When the Android build lands,
code that only it needs goes in `platforms/android/`, and `host.ts` already
tells the rest of the app which host is live.
