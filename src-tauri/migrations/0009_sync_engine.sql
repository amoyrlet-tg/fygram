ALTER TABLE playlists ADD COLUMN updated_at     DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00Z';
ALTER TABLE playlists ADD COLUMN rev            INTEGER  NOT NULL DEFAULT 1;
ALTER TABLE playlists ADD COLUMN origin_device  TEXT     NOT NULL DEFAULT '';
ALTER TABLE playlists ADD COLUMN deleted        BOOLEAN  NOT NULL DEFAULT 0;
ALTER TABLE playlists ADD COLUMN deleted_at     DATETIME;

ALTER TABLE channels  ADD COLUMN updated_at     DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00Z';
ALTER TABLE channels  ADD COLUMN rev            INTEGER  NOT NULL DEFAULT 1;
ALTER TABLE channels  ADD COLUMN origin_device  TEXT     NOT NULL DEFAULT '';
ALTER TABLE channels  ADD COLUMN deleted_at     DATETIME;

UPDATE playlists SET updated_at = CURRENT_TIMESTAMP;
UPDATE channels  SET updated_at = CURRENT_TIMESTAMP;

CREATE INDEX idx_playlists_deleted ON playlists(deleted);
CREATE INDEX idx_channels_deleted  ON channels(deleted);

CREATE TABLE sync_outbox (
    entity      TEXT     NOT NULL,
    entity_id   TEXT     NOT NULL,
    queued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts    INTEGER  NOT NULL DEFAULT 0,
    last_error  TEXT,
    PRIMARY KEY (entity, entity_id)
);

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

INSERT OR IGNORE INTO sync_outbox (entity, entity_id) SELECT 'playlist', id FROM playlists;
INSERT OR IGNORE INTO sync_outbox (entity, entity_id) VALUES ('channels', '');
