-- Archived routines keep their history but generate no new occurrences and drop off the calendar.
ALTER TABLE routines ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
