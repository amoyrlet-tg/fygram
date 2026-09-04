# Layouts

Two shells for the same app, picked by `useIsNarrow()` — a `max-width: 640px`
media query, nothing else.

- `wide/` — sidebar, track table, player bar along the bottom.
- `narrow/` — top bar, one pane at a time, tab bar and a mini player.

**This is not the platform split.** A desktop window dragged narrow gets
`narrow/`, and a tablet in landscape gets `wide/`. Code that depends on the
operating system — window chrome, file pickers, safe-area insets, the Android
back button — belongs in `src/platforms/<os>/`, which is a separate question and
a separate folder.

Neither shell owns state. They receive the panes they render and decide only
where those panes go.
