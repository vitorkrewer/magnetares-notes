ALTER TABLE notes
  ADD COLUMN body_text TEXT NOT NULL DEFAULT '';

UPDATE notes
SET body_text = body
WHERE body_text = '';