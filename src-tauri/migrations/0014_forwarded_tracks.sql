ALTER TABLE tracks ADD COLUMN forwarded INTEGER;
ALTER TABLE tracks ADD COLUMN forwarded_from TEXT;
ALTER TABLE tracks ADD COLUMN forwarded_at DATETIME;

ALTER TABLE channels ADD COLUMN can_repost INTEGER;
