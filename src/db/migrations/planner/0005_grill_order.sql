-- Manual order inside a pool (used by Grill, which is a ranking). NULL means "never reordered";
-- those tasks sort after the ordered ones.
ALTER TABLE nodes ADD COLUMN sort_order REAL;
