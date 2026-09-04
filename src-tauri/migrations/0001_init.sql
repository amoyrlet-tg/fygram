CREATE TABLE channels (
    id              TEXT PRIMARY KEY,
    username        TEXT,
    title           TEXT NOT NULL,
    access_hash     INTEGER NOT NULL DEFAULT 0,
    source_type     TEXT NOT NULL,
    avatar_path     TEXT,
    last_synced_at  DATETIME,
    is_active       BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

CREATE TABLE tracks (
    id              TEXT PRIMARY KEY,
    channel_id      TEXT NOT NULL REFERENCES channels(id),
    tg_message_id   INTEGER NOT NULL,
    file_path       TEXT NOT NULL,
    file_hash       TEXT NOT NULL,
    title           TEXT,
    artist          TEXT,
    album           TEXT,
    duration_sec    INTEGER,
    added_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    play_count      INTEGER NOT NULL DEFAULT 0,
    UNIQUE(channel_id, tg_message_id)
);

CREATE TABLE fingerprints (
    track_id        TEXT PRIMARY KEY REFERENCES tracks(id),
    vector          BLOB NOT NULL,
    algo_version    TEXT NOT NULL
);

CREATE TABLE clusters (
    id              TEXT PRIMARY KEY,
    label           TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cluster_tracks (
    cluster_id        TEXT NOT NULL REFERENCES clusters(id),
    track_id          TEXT NOT NULL REFERENCES tracks(id),
    similarity_score  REAL,
    PRIMARY KEY (cluster_id, track_id)
);

CREATE TABLE playlists (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    is_smart        BOOLEAN NOT NULL DEFAULT 0,
    smart_rule      TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE playlist_tracks (
    playlist_id     TEXT NOT NULL REFERENCES playlists(id),
    track_id        TEXT NOT NULL REFERENCES tracks(id),
    position        INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_tracks_channel ON tracks(channel_id);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist, album,
    content='tracks',
    content_rowid='rowid'
);

CREATE TRIGGER tracks_fts_insert AFTER INSERT ON tracks BEGIN
    INSERT INTO tracks_fts(rowid, title, artist, album)
    VALUES (new.rowid, new.title, new.artist, new.album);
END;

CREATE TRIGGER tracks_fts_delete AFTER DELETE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
    VALUES ('delete', old.rowid, old.title, old.artist, old.album);
END;

CREATE TRIGGER tracks_fts_update AFTER UPDATE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
    VALUES ('delete', old.rowid, old.title, old.artist, old.album);
    INSERT INTO tracks_fts(rowid, title, artist, album)
    VALUES (new.rowid, new.title, new.artist, new.album);
END;
