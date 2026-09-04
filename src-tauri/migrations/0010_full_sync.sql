ALTER TABLE channels ADD COLUMN last_full_synced_at DATETIME;

UPDATE channels SET last_full_synced_at = last_synced_at;
