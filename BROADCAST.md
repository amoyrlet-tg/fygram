<div align="center">

# broadcasting "now playing"

**fygram can push the track you are listening to at a server you run**, so a
site can show it live and let visitors listen along.

`off by default` · `nothing leaves your machine until you switch it on`

</div>

---

## turning it on

profile menu → **broadcast now playing…** (the antenna icon).

| field                   | what it is                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| server url              | base url, no trailing slash. `http://localhost:8787` for a server on this machine, or your own public address |
| token                   | the shared secret your server checks. stored locally, never shown again                                       |
| broadcast while playing | the master switch                                                                                             |

**test connection** first calls `GET /api/health` unauthenticated, then makes
one authorized request, so "server is down" and "token is wrong" come back as
two different messages instead of one vague failure.

## what your server has to implement

five endpoints. everything except health takes `Authorization: Bearer {token}`.

| method | path                                   | who calls it           | why                        |
| ------ | -------------------------------------- | ---------------------- | -------------------------- |
| `GET`  | `/api/health`                          | fygram                 | is anything there at all   |
| `POST` | `/api/music`                           | fygram, every ~3s      | the playhead               |
| `POST` | `/api/music/stop`                      | fygram                 | playback ended             |
| `GET`  | `/api/audio/pending`                   | fygram, every beat     | which files you still want |
| `PUT`  | `/api/audio/{channel_id}/{message_id}` | fygram, once per track | the audio itself           |

your site then reads whatever you expose publicly, typically a `GET /api/music`
that returns the last thing fygram posted.

### 1. the playhead, every ~3s while a track plays

```http
POST {url}/api/music
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "channel_id": -1001234567890,
  "message_id": 42,
  "title": "Song",
  "artist": "Someone",
  "duration": 215.0,
  "position": 12.5,
  "playing": true
}
```

`duration` and `position` are seconds. `artist` is `""` when the file carries no
artist tag. `playing` is `false` while paused, and a server that keeps its own
copy of the playhead should stop advancing it when it sees that.

a track _change_ is reported the moment it happens, at position 0, without
waiting for the next tick: a listener joining right then starts at the top of
the song rather than several seconds in. between beats the server is expected
to extrapolate, which is what keeps a site's counter moving every frame.

### 2. the audio file, once, and only if asked

`channel_id` + `message_id` identify the audio, so your server can tell whether
it already has the file. it asks for one the moment it first hears about it,
rather than waiting for a visitor to press play:

```http
GET {url}/api/audio/pending
Authorization: Bearer {token}
```

```json
[{ "channel_id": -1001234567890, "message_id": 42, "requested_at": 1784717437024 }]
```

everything listed there, and nothing else, is uploaded once:

```http
PUT {url}/api/audio/{channel_id}/{message_id}
Authorization: Bearer {token}

<raw bytes of the audio file>
```

a track that isn't downloaded locally yet is skipped and stays in your pending
list, so it goes out on a later beat. uploads run detached from the heartbeat,
so a large file never delays the next position report.

serving that audio back with HTTP `Range` support is what lets a website seek
through the track instead of only playing it from the start.

### 3. stop, on pause, track end, and quit

```http
POST {url}/api/music/stop
Authorization: Bearer {token}
```

## what is never sent

your library listing, playlists, channel list, account details and session.
only the fields above, for the one track playing right now.

## when things break

every broadcast call swallows its own errors: an unreachable server, a wrong
token or a rejected upload can never interrupt or degrade local playback. the
next beat simply retries. errors that aren't self-healing are printed to stderr.

## a minimal receiver

any language will do. the shape, in pseudo-http:

```
GET  /api/health              -> 200
POST /api/music               -> store the json as "current"
POST /api/music/stop          -> mark "current" as not playing
GET  /api/audio/pending       -> [] once you have every file you want
PUT  /api/audio/{ch}/{msg}    -> write the body to disk
GET  /api/music               -> whatever your site polls (public, no token)
```

reject anything without the right bearer token on the four private routes, and
keep `/api/health` open so **test connection** can tell the two failures apart.
