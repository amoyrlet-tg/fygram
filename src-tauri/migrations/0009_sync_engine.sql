-- Change stamps, tombstones and an offline outbox.
--
-- Every replicated row now carries (rev, updated_at, origin_device). `rev` is a
-- Lamport counter: a device bumps it on every local edit and adopts the remote
-- one when it accepts a remote version, so causally later edits always win no
-- matter how wrong a machine's clock is. `updated_at` only breaks ties between
-- genuinely concurrent edits - two devices that both edited offline - and there
-- the later wall clock wins, which is the "last version that got uploaded"
-- rule. `origin_device` breaks the remaining tie so every device picks the same
-- winner.
--
-- Deletes become tombstones instead of vanishing rows: a row that is gone
-- carries no stamp, so the other device would just push it back.

ALTER TABLE playlists ADD COLUMN updated_at     DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00Z';
ALTER TABLE playlists ADD COLUMN rev            INTEGER  NOT NULL DEFAULT 1;
ALTER TABLE playlists ADD COLUMN origin_device  TEXT     NOT NULL DEFAULT '';
ALTER TABLE playlists ADD COLUMN deleted        BOOLEAN  NOT NULL DEFAULT 0;
ALTER TABLE playlists ADD COLUMN deleted_at     DATETIME;

ALTER TABLE channels  ADD COLUMN updated_at     DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00Z';
ALTER TABLE channels  ADD COLUMN rev            INTEGER  NOT NULL DEFAULT 1;
ALTER TABLE channels  ADD COLUMN origin_device  TEXT     NOT NULL DEFAULT '';
ALTER TABLE channels  ADD COLUMN deleted_at     DATETIME;

-- Snapshots written by the old code carry no stamp at all, so they read as
-- rev 0 / epoch. Dating everything local to the upgrade means this device's
-- library survives the first sync intact, and real stamps take over after that.
UPDATE playlists SET updated_at = CURRENT_TIMESTAMP;
UPDATE channels  SET updated_at = CURRENT_TIMESTAMP;

-- `deleted_at` is deliberately left NULL on rows that were already hidden. A
-- deleted-without-a-date row is not replicated at all, which keeps two very
-- different things out of the shared list: deletes made before this version
-- existed (nobody recorded when, and the other device may still legitimately
-- have the channel) and the placeholder rows relink-by-link creates to hang a
-- track off a channel that was never added to the library.

CREATE INDEX idx_playlists_deleted ON playlists(deleted);
CREATE INDEX idx_channels_deleted  ON channels(deleted);

-- What still has to reach Telegram. Rows survive restarts, so a change made
-- with no connection goes out on its own once there is one. The primary key
-- coalesces: editing one playlist ten times offline is still one upload.
CREATE TABLE sync_outbox (
    entity      TEXT     NOT NULL,
    entity_id   TEXT     NOT NULL,
    queued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts    INTEGER  NOT NULL DEFAULT 0,
    last_error  TEXT,
    PRIMARY KEY (entity, entity_id)
);

-- Playlist entries whose track is not indexed on this device yet, because the
-- channel it came from has not been added or synced here.
--
-- Without this they were silently dropped on restore, and the next push from
-- this device wrote the shortened playlist back to Telegram - deleting tracks
-- on the device that actually had them. Held here, they stay in the pushed
-- document and turn into real playlist rows the moment their channel indexes.
CREATE TABLE playlist_pending_tracks (
    playlist_id   TEXT     NOT NULL,
    channel_id    TEXT     NOT NULL,
    tg_message_id INTEGER  NOT NULL,
    title         TEXT,
    artist        TEXT,
    album         TEXT,
    duration_sec  INTEGER,
    position      INTEGER  NOT NULL,
    added_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, channel_id, tg_message_id)
);

CREATE INDEX idx_pending_tracks_source ON playlist_pending_tracks(channel_id, tg_message_id);

-- Nothing has ever been pushed in this format, so everything is queued once.
INSERT OR IGNORE INTO sync_outbox (entity, entity_id) SELECT 'playlist', id FROM playlists;
INSERT OR IGNORE INTO sync_outbox (entity, entity_id) VALUES ('channels', '');
