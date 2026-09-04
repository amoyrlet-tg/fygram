ALTER TABLE tracks ADD COLUMN tg_document_id INTEGER;

CREATE INDEX idx_tracks_document_id ON tracks(tg_document_id);
