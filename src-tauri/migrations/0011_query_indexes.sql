-- Two reads were doing more work than they had to.
--
-- The library list sorts every track by recency, and with nothing to read in
-- that order SQLite scanned the table and built a temp b-tree for the ORDER BY
-- on every load. An index on the same expression the query sorts by lets it
-- walk the rows already ordered.
CREATE INDEX idx_tracks_recency ON tracks(COALESCE(published_at, added_at) DESC);

-- `playlist_tracks` is keyed (playlist_id, track_id), so asking which playlists
-- hold a given track has no leading column to search on and degrades to walking
-- the index. The library asks that for every track it shows.
CREATE INDEX idx_playlist_tracks_track ON playlist_tracks(track_id);

-- Redundant from the start: the unique (channel_id, tg_message_id) index
-- answers everything a channel_id-only index can, and dropping it is one less
-- b-tree to update on every ingested track.
DROP INDEX idx_tracks_channel;
