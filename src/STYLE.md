# Frontend style

The counterpart to `src-tauri/STYLE.md`. Same goal: a reader who opens a file
cold should be able to tell what it is for and what it may touch.

---

## 1. Layers

Four of them, and imports only ever point downwards:

```
app/        the shell: screens, providers, the composition of everything below
layouts/    two window shapes - wide and narrow - and nothing else
features/   one folder per subject: api.ts, hooks, components/
shared/     what more than one feature needs: api types, ui primitives, lib
```

`app` may import anything. `layouts` may import `features` and `shared`.
`features` may import `shared` and, sparingly, another feature. `shared` imports
nothing above it. A `shared/` module that knows what a playlist is belongs in
`features/playlists`.

**`layouts/` is not `platforms/`.** The layout is chosen by
`useIsNarrow()` — a `max-width: 640px` media query. A desktop window dragged
narrow gets the narrow layout; a tablet in landscape gets the wide one. Code that
depends on the operating system goes in `src/platforms/<os>/`, which is a
different question and a different folder. See `src/layouts/README.md`.

## 2. A component is a folder

```
Component/
  Component.tsx    the component and nothing else
  Component.css    its styles
  index.ts         export { Component } from "./Component";
```

No exceptions, including inside `layouts/`. A component small enough not to
deserve a folder is small enough to live inside the one component that uses it.

## 3. Props are for what the parent decides

If a component passes a value down without looking at it, that value should not
be a prop.

- **Composition first.** A shell takes the panes it renders as `ReactNode` and
  knows nothing about what is in them. `WideLayout` has two props: `trackTable`
  and `modals`.
- **Context for what is genuinely shared.** `app/providers/` holds it. A provider
  owns the hook, so the hook runs exactly once — `useTheme` writes to the
  document and `useProfile` polls Telegram, and two copies would fight. Today
  there are two: `SettingsProvider` and `PlayerProvider`. The library data
  (channels, playlists, artists, sync progress) is still passed by hand and is
  the next one to move.
- **Nothing else.** A hook used by one component is called _in_ that component.
  `useLogout` lives in `ProfileMenu`, next to the button that starts a logout.

A component that opens a dialog owns that dialog. `ProfileMenu` renders its own
`CacheCleanup`, `BroadcastSettings` and logout confirmations rather than asking a
parent five levels up to do it.

**Never spread a props bag.** `<Child {...props} />` means the parent has stopped
knowing what it passes, and the child's type ends up naming its own grandparent.

## 4. Context that ticks

State that changes many times a second gets its own context. `position` is
polled four times a second; if it travelled with the rest of the player, the
sidebar and the track table would re-render on every tick to redraw a bar three
components care about. Hence `usePlayerApi()` and `usePlayerProgress()`, and
`usePlayerWithProgress()` only for the three.

The same rule decides whether `memo` is worth anything: `memo` on a component
that receives a freshly-built arrow function or element is a no-op. Either give
it stable props (`useCallback`, a hoisted element) or drop the `memo`.

## 5. Talking to the backend

Every command goes through a feature's `api.ts`. No `invoke("…")` anywhere else,
and no command name spelled out twice.

Backend events are how the app learns that something changed. If a command
mutates the library, the backend emits `library-changed` and the frontend
reloads — it is not the caller's job to remember to refresh. A dialog that needs
an `onDone` callback to keep the UI honest is usually a missing event.

## 6. Text

Every user-visible string goes through `useT()`. No Russian in the source, no
English fallback typed twice. Console messages are English, lowercase, and say
what failed.

## 7. Styles

One `.css` next to the component, class names prefixed with the component.
Global class names are the current state and the reason the prefix matters; new
components should prefer `*.module.css`, which Vite supports with no config.

Colours, radii and spacing come from the custom properties in
`app/styles/base.css`. A hex literal in a component file is a bug unless it is
part of a palette the user picks from.

## 8. File size

Soft ceiling: **300 lines** for a component, **200** for a hook. Past that the
file is doing more than one thing, and the split is usually already visible —
a group of handlers that share a prefix, or a block of markup that never changes
with the rest.

## 9. Mechanics

```sh
npm run format      # prettier, writes
npm run lint        # eslint, errors gate
npm run typecheck   # tsc --noEmit
```

All three run in `.github/workflows/check.yml` on every push and pull request.

`eslint.config.js` keeps the React Compiler rules (`react-hooks/refs`,
`set-state-in-effect`, `purity`, `immutability`) as **warnings** on purpose:
each hit is real, but they sit in playback and overlay code that has to be
exercised by hand to change safely. The count is a backlog and should only go
down — do not add new ones, and do not silence the rules.
