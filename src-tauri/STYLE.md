# Backend style

The backend is Rust; the conventions below are lifted from Telegram Desktop's
[`Telegram/SourceFiles`](https://github.com/telegramdesktop/tdesktop/tree/dev/Telegram/SourceFiles)
and translated into Rust. tdesktop is C++, so nothing here is a copy — each rule
names the tdesktop habit it comes from and then says what that habit means in a
`src-tauri` file.

The point of every rule is the same one tdesktop optimises for: a reader who
opens a file cold should be able to tell, from the first twenty lines, what the
file is for, what it may touch, and where its knobs are.

---

## 1. Layout

tdesktop groups by subsystem — `api/`, `data/`, `storage/`, `ui/`, `window/` —
and names each file after the one thing it holds, prefixed with its folder:
`api/api_polls.cpp`, `data/data_session.cpp`. There is no `utils.cpp`.

Here the tree is by feature:

```
src/
  main.rs           the executable, and nothing else
  lib.rs            AppState, the plugin wiring, the command table
  bootstrap.rs      the one-time setup that runs before the window exists
  shutdown.rs       the other end of it
  features/
    <feature>/      commands.rs + service.rs + repository.rs + mod.rs
    library/        the features that make a channel into a library
      channels/     adding, syncing and removing a channel
      ingest/       messages -> rows
      media/        the bytes: download, transport, covers, files
      tags/         working out what a track is called
      cache/        what the library costs on disk
      tracks/       reading and editing rows
  shared/           what more than one feature needs
    telegram/       the only place grammers types are allowed
```

**Layer rule.** `commands → service → repository`, never sideways and never
back. Concretely:

| file            | may use                                                | must not use                       |
| --------------- | ------------------------------------------------------ | ---------------------------------- |
| `commands.rs`   | `service`                                              | `sqlx`, `grammers`, business logic |
| `service.rs`    | `repository`, `shared::*`, another feature's `service` | raw SQL                            |
| `repository.rs` | `sqlx`, `shared::models`, `shared::error`              | `tauri`, `grammers`                |

A feature reaches another feature only through its `service`, the way tdesktop
reaches a subsystem only through its public class and never through a `_detail`
header. If a `commands.rs` needs `sqlx`, the query belongs in a repository; if a
`service.rs` needs `grammers`, the call belongs behind a method on
`shared::telegram::TelegramState`.

Four rules about the shape of the tree itself:

- **A feature is a folder; a subsystem is a folder with no `commands.rs`.**
  `library::media` and `cloud` are subsystems: nothing in the frontend can call
  them, and other features reach them by name. Say so in the module header
  rather than leaving an empty `commands.rs` to explain it.
- **A feature with one command and no state is one file.** `features/docs.rs` is
  a window opener; splitting thirty lines across three files would be pure
  ceremony. Anything that owns state, runs SQL, or grows a second command
  becomes a folder.
- **No two modules share a name.** Two things called `sync` (the outbox loop and
  the channel reader) or two called `storage` (the on-disk layout and the
  user-facing setting) cost every reader a second lookup. They are `sync` and
  `ingest`, `storage` and `media_paths`.
- **No `common`, no `util`, no `helpers`.** A file named after what it is not is
  a file nobody can decide where to put things in. What lived in `util.rs` is
  now `shared/atomic_file.rs`, and its one stray one-liner moved to its only
  caller.

`mod.rs` is a table of contents. `pub(crate) mod` lines, and the re-exports that
form the feature's public surface — no functions, no types, and never two names
for the same module.

## 2. The first line of a file

Every tdesktop file opens with the same header block, then `#pragma once` or the
matching `#include`. No file starts with a blank line, and no file makes you read
it to find out what it is.

Rust has no license header per file, so the header is a `//!` doc comment: one or
two lines, present tense, saying what the file is for and — if it is not obvious
— what it deliberately does not do.

```rust
//! Reading and editing the tracks the library already knows about.
//!
//! Fetching new ones is `library::sync`; the bytes on disk are `library::media`.

use sqlx::SqlitePool;
```

Rules:

- The header is the **first byte** of the file. No leading blank line.
- One blank line between the header and the first `use`.
- Say what it is for, not what it contains. "Tracks" is a filename, not a header.
- `mod.rs` gets one too, describing the feature, not the module list.

---

## 3. Imports

tdesktop includes its own header first, then a blank line, then everything else
grouped and sorted by path — and annotates the non-obvious one inline:

```cpp
#include "history/history_item_helpers.h" // ShouldSendSilent
```

Here: four groups, one blank line between them, alphabetical inside each.

```rust
use std::path::Path;                       // 1. std
use std::time::Duration;

use anyhow::Result;                        // 2. external crates
use sqlx::SqlitePool;
use tauri::{AppHandle, State};

use crate::shared::error::AppError;        // 3. crate, absolute
use crate::shared::models::Track;
use crate::shared::storage;
use crate::AppState;

use super::repository;                     // 4. the module's own siblings
use super::retag;
```

- Never a `use` inside a function body. If an extension trait is only needed in
  one place, import it at the top with a trailing comment saying why —
  `use tokio::io::AsyncWriteExt; // for write_all on File`.
- Import the **module**, call through it: `storage::media_root(..)`, not
  `crate::shared::storage::media_root(..)` spelled out at the call site. A
  fully-qualified path in the middle of a function is the Rust equivalent of
  writing out a namespace tdesktop would have `using`-ed once at the top.
- One canonical path per module. `crate::features::library::media::service` and
  `crate::features::library::download` must not both name the same thing.
- Alias only to disambiguate two modules with the same last segment
  (`library::sync::service as library_sync`), never for brevity.

---

## 4. What a file exposes

tdesktop puts everything file-local in an anonymous namespace right after the
includes, so the header is the exact public surface and the `.cpp` is free:

```cpp
namespace {

constexpr auto kVoteRestrictionToastDuration = 5 * crl::time(1000);

[[nodiscard]] PollData::VoteRestriction ParseVoteRestrictionError(...) {
```

Rust has no anonymous namespace; visibility is the same tool:

- **Default to private.** A helper used only inside the file gets no `pub`.
- `pub(super)` — used by the rest of the feature, e.g. a repository function only
  `service.rs` calls. This is the right default for most of `repository.rs`.
- `pub(crate)` — used by another feature.
- `pub` — reserved for the crate's actual public surface, which is `run()` and
  nothing else. `unreachable_pub` is on, so a stray `pub` is a build warning and
  a build warning fails CI.

`repository.rs` marked `pub` from top to bottom tells the reader nothing about
which queries are part of the feature's contract. `tracks/repository.rs` is
`pub(super)` throughout: every one of those queries exists for `tracks/service.rs`
and for nothing else, and the signature now says so.

---

## 5. Constants

tdesktop has no bare numbers. Every tunable is a named `constexpr` in the
anonymous namespace **at the top of the file**, `k`-prefixed, and if the number
was chosen rather than derived, a comment says how.

Here: a `const` block directly after the imports, `SCREAMING_SNAKE_CASE` (Rust's
idiom wins over `k`), each with a unit in the name or the type, and a comment for
any number that came from a measurement or a limit rather than from arithmetic.

```rust
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(120);

// Telegram counts every upload.getFile in flight, not per file, so the workers
// of one download and the four tracks ingesting alongside it share one budget.
// Eight fits comfortably under the flood threshold; going wider only earned
// FLOOD_WAITs, and each of those used to cost a whole file re-download.
const MAX_INFLIGHT_CHUNK_REQUESTS: usize = 8;
```

Constants declared 250 lines into a file, next to their first use, are invisible
to anyone trying to find out what this module can be tuned with. They go at the
top even when that puts them far from the code that reads them.

A `const` inside a function is allowed only when it is genuinely local to one
algorithm and meaningless outside it.

---

## 6. Naming

| tdesktop                                  | here                                       |
| ----------------------------------------- | ------------------------------------------ |
| `session()`, not `getSession()`           | `media_root()`, not `get_media_root()`     |
| `setSession(..)`                          | `set_media_root(..)`                       |
| `kMaxChunkSize`                           | `MAX_CHUNK_SIZE`                           |
| `PascalCase` types, `camelCase` functions | `PascalCase` types, `snake_case` functions |
| `_session` private member                 | plain field name; privacy is the module    |

No `get_` on anything that just returns a value. The exception is the
`#[tauri::command]` layer, where the name is a wire contract the frontend depends
on: an existing `get_*` command keeps its name until the frontend is changed with
it, and new commands are named without the prefix.

Function names say what the caller gets, not how: `ensure_track_downloaded`,
`resolve_channel_peer_for`, `forget_cached_cover`. Boolean-returning functions
read as a claim: `is_dead_session`, `session_invalid`.

---

## 7. Arguments

tdesktop's answer to a long argument list is a struct with designated
initialisers — `SendAction`, `Toast::Config` — never a comment apologising for
the signature.

`#[allow(clippy::too_many_arguments)]` is the apology. Past five arguments,
introduce a `struct`:

```rust
// instead of #[allow(clippy::too_many_arguments)] on a 9-argument fn
pub(super) struct DownloadRequest<'a> {
    pub db: &'a SqlitePool,
    pub telegram: &'a TelegramState,
    pub media_dir: &'a Path,
    pub progress_id: &'a str,
    pub tracks: Vec<Track>,
    pub cancel: Arc<AtomicBool>,
    pub log_label: &'a str,
}
```

The call site then reads as a description of the work instead of a column of
positional values, and adding a field later does not touch every caller.

Three or more `Option<String>` in a row are a struct for the same reason: nobody
can read `update(id, None, None, Some(x), None)` correctly.

---

## 8. Errors

- `AppError` is the backend's error type. Everything below `commands.rs` returns
  `Result<_, AppError>`.
- `commands.rs` is the only place that converts to `String`, and it does it the
  same way every time: `.map_err(String::from)`.
- `AppError::Msg` is for a message that reaches the user. If a failure has a
  cause the code branches on, it gets its own variant — a `Msg` that another
  function matches on by substring is a bug waiting to happen.
- Messages are lowercase, no trailing period, and say what failed from the user's
  side: `"track not found"`, not `"Error: get() returned None"`.
- `.unwrap()` / `.expect()` only where the invariant is local and provable in the
  same function, or in `bootstrap.rs`, where failing to start is the correct
  outcome. Everywhere else, propagate.

---

## 9. Commands and the Android stack

Every `async` command in a `commands.rs` wraps its body:

```rust
#[tauri::command]
pub(crate) async fn update_track(/* ... */) -> Result<Track, String> {
    Box::pin(async move {
        // the real body
    })
    .await
}
```

This is not a style preference, it is what keeps the app from crashing on
Android.

Tauri constructs a command's future on the thread the webview calls in on. On
Android that is `JavaBridge`, whose stack is **1 MB**, and a debug build hands
the future through six by-value frames of `tokio::spawn` before it reaches the
heap - each frame holding its own copy. A measured example from the crash that
prompted this rule: `update_track` produced a 116 KB future, and the chain from
`Java_..._Rust_ipc` down to the allocation used **1011 KB of the 1024 KB
available** before dying with `SIGSEGV / SEGV_ACCERR` on a guard page.

Boxing the body leaves the command's own future holding little more than its
arguments and one pointer, and the body then runs on a tokio worker with a
normal stack. The cost is a single allocation per IPC call.

How to check a suspicion, rather than guess:

```bash
llvm-nm --defined-only -S libfygram_lib.so | grep '<mangled name>'
llvm-objdump -d --start-address=0x... --stop-address=0x... libfygram_lib.so | head
# the prologue's `subq $0xN, %rsp` (or the stack probe's `subq $0xN, %r11`) is
# the frame, and the tombstone under ~/.local/share/waydroid/data/tombstones
# names every frame in the chain
```

---

## 10. Logging

tdesktop logs through one facade (`LOG(("..."))`, `DEBUG_LOG(("..."))`), never
raw stream writes, so every line is greppable and shaped the same.

Here that facade is `crate::log!` with a fixed shape — `module: what happened`,
lowercase, no trailing period, the identifier that ties lines together first:

```rust
crate::log!("telegram: failed to auto-connect: {err:#}");
crate::log!("update_track({track_id}): re-uploading {} to telegram", track.file_path);
```

`log!` compiles to nothing in a release build, format strings included — a
shipped app narrates nothing. `eprintln!` belongs only inside the macro itself;
tests may use `println!` freely.

- Prefix is the module or the operation, always the same string within a file.
- Log the decision and the cost, not the control flow: a retry, a fallback, a
  slow upload finishing. Anything logged on every iteration of a loop is noise.
- Errors that are handled are logged where they are handled, once. An error that
  is returned is not also logged.

---

## 11. Comments

tdesktop comments are sparse and load-bearing: the protocol quirk, the reason for
a magic number, the thing the next reader will otherwise "fix". This codebase
already writes them that way, and it should keep to it.

- Comments say **why**, never what. `// increment the counter` deletes cleanly.
- One or two lines. A paragraph explaining a decision belongs in the commit
  message; what stays in the file is the sentence the next reader needs before
  they "fix" something.
- The ones that earn their place are about the outside world: what Telegram
  does, what a WebView cannot do, what a previous version wrote to disk. A
  comment about our own code is usually a sign the code should read better.
- Lowercase sentence, above the code it explains, wrapped at the same width as
  the code.
- `///` only where the type does not already say it — `None` means the file
  carries no picture, `Ok(0)` means nothing needed retagging. A doc comment that
  restates the signature is noise, and every file still opens with a one-line
  `//!` (§2).

---

## 12. File size

tdesktop splits by responsibility, not by line count, but the result is that a
file usually holds one class and its helpers.

Soft ceiling here: **400 lines**. Past that, a file is holding more than one
thing, and the split is almost always already visible in it — a run of functions
sharing a prefix, or a block of constants only that run reads.

Where the backend stands: 95 files, 14k lines, median **96**, mean 147. Six
files are over the ceiling and each has a seam:

| file                            | lines | the seam                                 |
| ------------------------------- | ----- | ---------------------------------------- |
| `playlists/telegram_sync.rs`    | 884   | the document format vs. the merge        |
| `library/tags/artist_parser.rs` | 573   | building the vocabulary vs. querying it  |
| `cloud/service.rs`              | 504   | the channel list vs. the library owner   |
| `broadcast/service.rs`          | 464   | the config vs. the HTTP client           |
| `library/media/download.rs`     | 436   | the batch vs. the single track           |
| `library/media/covers.rs`       | 421   | one track's artwork vs. a mosaic's tiles |

`library/tracks` is the rule applied most recently: `service.rs` reached 485
lines once editing had to ask what Telegram would allow, and the run of
functions answering that became `permissions.rs`, leaving both under 400.

`library/media` is what the rule looks like applied at a larger scale: it was one 886-line
`service.rs` and is now `download` (the batch and the file), `transport` (the
chunked `upload.getFile` under it), `covers` (artwork and tags), `files` and
`repository` — none over 300.

---

## 13. Mechanics

Three commands, all of which must be clean before a commit:

```sh
cargo fmt --all
cargo clippy --all-targets -- -D warnings
cargo test
```

`.github/workflows/check.yml` runs the same three on every push and pull
request, so this is not a convention anybody has to remember.

`rustfmt.toml` pins the formatting and `[lints]` in `Cargo.toml` pins the lints:

```toml
[lints.rust]
rust_2018_idioms = "warn"
unreachable_pub = "warn"        # §4: nothing public that is not reached
unused_qualifications = "warn"  # §3: import it, do not spell it out

[lints.clippy]
all = "warn"
```

None of it is a matter of taste after that — if `cargo fmt` disagrees with you,
it wins, the same way tdesktop's `.clang-format` wins.

The import grouping in §3 is the one rule stable rustfmt cannot enforce
(`group_imports` is nightly-only), so it is on the author. `cargo +nightly fmt`
will do it if you have nightly installed.

---

## 14. Checklist for a new file

1. `//!` header on line 1, saying what the file is for.
2. Imports in four groups, alphabetical, no fully-qualified paths at call sites.
3. Constants, named and commented, directly after the imports.
4. Nothing `pub` that does not need to be.
5. No function past five arguments without a struct.
6. `Result<_, AppError>` below `commands.rs`; `String` only at the command.
7. Comments explain the outside world.
8. `cargo fmt` and `cargo clippy -- -D warnings` clean.
