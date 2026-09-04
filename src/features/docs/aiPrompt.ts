export const AI_SERVER_PROMPT = `You are implementing the server side of a "now playing" broadcast.

## context

fygram is a desktop music player (Tauri + Rust) whose library is the user's
Telegram channels. It can optionally push the track it is playing to a server
the user runs, so a personal website can display it live and let visitors listen
to the same audio. fygram is the only client. You are writing the server.

Write a small HTTP service that accepts what fygram sends, stores it, and
exposes it to a public website. Pick any language or framework unless I say
otherwise. Keep it single-process and file-backed unless I ask for a database.

## authentication

- The user types a base URL and a token into fygram.
- Every request below except GET /api/health arrives with:
  Authorization: Bearer <token>
- Reject a missing or wrong token with 401. Do not accept the token in a query
  string. The token is a shared secret, not per-user: there is exactly one user.

## endpoints fygram calls

### 1) GET /api/health

- No auth.
- Return 200 with any body. Used to distinguish "server unreachable" from
  "token rejected" when the user presses "test connection" in fygram.

### 2) POST /api/music

Sent roughly every 3 seconds while a track is playing, and immediately on a
track change (no waiting for the next tick).

Headers: Authorization: Bearer <token>, Content-Type: application/json

Body:
{
  "channel_id": -1001234567890,   // i64, Telegram channel id, negative
  "message_id": 42,               // i64, message id inside that channel
  "title": "Song",                // string, may be empty
  "artist": "Someone",            // string, "" when the file has no artist tag
  "duration": 215.0,              // f64 seconds, 0 if unknown
  "position": 12.5,               // f64 seconds into the track
  "playing": true                 // false while paused
}

Behaviour to implement:
- Store this as the current track, with the wall-clock time it arrived.
- (channel_id, message_id) together are the identity of the audio. Treat that
  pair as the key everywhere: it is stable, and title/artist can change when the
  user edits tags.
- On a track change you receive position 0 immediately, so a visitor joining at
  that moment starts at the beginning of the song.
- Between beats, extrapolate: current_position = last_position + (now - last_seen)
  while playing is true. Freeze it when playing is false. This is what makes a
  website's counter move smoothly at 60fps off a 3-second heartbeat.
- Keep a short history (the current track plus the last three is a good default)
  so the site can show what was played before.
- Respond 200 quickly. fygram fires these on a timer and ignores the body.

### 3) POST /api/music/stop

Sent on pause, on track end, and when the app quits. Auth, no body.
Mark the current track as not playing and stop advancing its position. Do not
delete the history.

### 4) GET /api/audio/pending

Polled on the same heartbeat. Auth. This is you telling fygram which audio files
you want uploaded. Respond with a JSON array:

[{ "channel_id": -1001234567890, "message_id": 42, "requested_at": 1784717437024 }]

- requested_at is milliseconds since the epoch; it is informational.
- Return [] when you already hold every file you care about.
- The natural implementation: whenever POST /api/music mentions a
  (channel_id, message_id) you have no file for, add it to this list. Do not wait
  for a visitor to press play, or the first listen will stall.
- Drop an entry once the file arrives. Re-adding it later is allowed.

### 5) PUT /api/audio/{channel_id}/{message_id}

Auth. The raw bytes of the audio file as the body: no multipart, no JSON
wrapper, no metadata. Content-Type may be absent or generic.

- Only files you listed in /api/audio/pending are ever uploaded, once each.
- Files can be several tens of megabytes. Stream the body to disk rather than
  buffering it in memory, and set a generous body-size limit.
- Uploads run detached from the heartbeat on the client, so they can arrive
  concurrently with POST /api/music and can take a while.
- A track the user has not downloaded locally yet is skipped, stays in your
  pending list, and arrives on a later beat. Never assume a pending entry will
  be satisfied promptly.

## endpoint your website needs (fygram never calls it)

### GET /api/music

Public, no token. Return the current track for the site to poll, including the
extrapolated position, whether it is playing, and enough of the history to
render a "recently played" list. Include a flag or URL telling the site whether
the audio for the current track is available yet.

### GET /api/audio/{channel_id}/{message_id}

Public, no token. Serve a stored file back to the browser, and implement HTTP
Range requests: partial content, 206 responses, Content-Range and Accept-Ranges
headers. Without Range support a listener cannot seek, and some browsers refuse
to start playback at all.

## what fygram never sends

The library listing, playlists, channel list, account details, the Telegram
session, and any credentials beyond the shared token. Only the fields above, for
the single track playing right now. Do not design around data you will not get.

## failure semantics you can rely on

- fygram swallows its own errors: an unreachable server, a wrong token or a
  rejected upload never interrupt local playback, and the next beat simply
  retries. So it is safe for you to return 5xx while starting up.
- There is no delivery guarantee and no ordering guarantee beyond "later beats
  carry later positions". Be idempotent: the same (channel_id, message_id) may
  be reported many times, and the same file may be uploaded again after a
  restart.
- Requests can stop arriving at any time (the app quit, the machine slept). If
  nothing has arrived for a while, treat the current track as stale rather than
  playing forever.

## deliverables

1. The service, with the seven routes above.
2. A one-line command to run it, taking the shared token from an environment
   variable and the listen port from another (default 8787).
3. A short note on where uploaded audio is stored on disk.
`;
