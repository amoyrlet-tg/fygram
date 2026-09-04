CREATE INDEX idx_tracks_recency ON tracks(COALESCE(published_at, added_at) DESC);

CREATE INDEX idx_playlist_tracks_track ON playlist_tracks(track_id);

DROP INDEX idx_tracks_channel;
