CREATE TABLE IF NOT EXISTS settings (
    key                 TEXT PRIMARY KEY,
    value               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
    id                  TEXT PRIMARY KEY,
    username            TEXT,
    title               TEXT NOT NULL,
    access_hash         INTEGER NOT NULL DEFAULT 0,
    source_type         TEXT NOT NULL,
    avatar_path         TEXT,
    last_synced_at      DATETIME,
    last_full_synced_at DATETIME,
    is_active           BOOLEAN NOT NULL DEFAULT 1,

    can_edit            INTEGER,
    can_repost          INTEGER,
    rights_checked_at   DATETIME,

    updated_at          DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00Z',
    rev                 INTEGER  NOT NULL DEFAULT 1,
    origin_device       TEXT     NOT NULL DEFAULT '',
    deleted             BOOLEAN  NOT NULL DEFAULT 0,
    deleted_at          DATETIME
);

CREATE TABLE IF NOT EXISTS tracks (
    id                  TEXT PRIMARY KEY,
    channel_id          TEXT NOT NULL REFERENCES channels(id),
    tg_message_id       INTEGER NOT NULL,
    tg_document_id      INTEGER,
    file_path           TEXT NOT NULL,
    file_hash           TEXT NOT NULL,
    title               TEXT,
    artist              TEXT,
    album               TEXT,
    duration_sec        INTEGER,

    published_at        DATETIME,
    added_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    play_count          INTEGER NOT NULL DEFAULT 0,

    forwarded           INTEGER,
    forwarded_from      TEXT,
    forwarded_at        DATETIME,
    UNIQUE(channel_id, tg_message_id)
);

CREATE TABLE IF NOT EXISTS playlists (
    id                       TEXT PRIMARY KEY,
    name                     TEXT NOT NULL,
    is_smart                 BOOLEAN NOT NULL DEFAULT 0,
    smart_rule               TEXT,
    cover_path               TEXT,
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    telegram_sync_message_id INTEGER,

    updated_at               DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00Z',
    rev                      INTEGER  NOT NULL DEFAULT 1,
    origin_device            TEXT     NOT NULL DEFAULT '',
    deleted                  BOOLEAN  NOT NULL DEFAULT 0,
    deleted_at               DATETIME
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id         TEXT NOT NULL REFERENCES playlists(id),
    track_id            TEXT NOT NULL REFERENCES tracks(id),
    position            INTEGER NOT NULL,
    added_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS playlist_pending_tracks (
    playlist_id         TEXT     NOT NULL,
    channel_id          TEXT     NOT NULL,
    tg_message_id       INTEGER  NOT NULL,
    title               TEXT,
    artist              TEXT,
    album               TEXT,
    duration_sec        INTEGER,
    position            INTEGER  NOT NULL,
    added_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, channel_id, tg_message_id)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
    entity              TEXT     NOT NULL,
    entity_id           TEXT     NOT NULL,
    queued_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts            INTEGER  NOT NULL DEFAULT 0,
    last_error          TEXT,
    PRIMARY KEY (entity, entity_id)
);

CREATE TABLE IF NOT EXISTS fingerprints (
    track_id            TEXT PRIMARY KEY REFERENCES tracks(id),
    vector              BLOB NOT NULL,
    algo_version        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clusters (
    id                  TEXT PRIMARY KEY,
    label               TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cluster_tracks (
    cluster_id          TEXT NOT NULL REFERENCES clusters(id),
    track_id            TEXT NOT NULL REFERENCES tracks(id),
    similarity_score    REAL,
    PRIMARY KEY (cluster_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_document_id ON tracks(tg_document_id);

CREATE INDEX IF NOT EXISTS idx_tracks_recency ON tracks(COALESCE(published_at, added_at) DESC);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);

CREATE INDEX IF NOT EXISTS idx_playlists_deleted ON playlists(deleted);
CREATE INDEX IF NOT EXISTS idx_channels_deleted ON channels(deleted);
CREATE INDEX IF NOT EXISTS idx_pending_tracks_source
    ON playlist_pending_tracks(channel_id, tg_message_id);
