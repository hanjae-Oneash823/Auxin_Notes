-- Hand-ranked position of an arc in the Arcs list; lower first. NULL (never ranked) sorts after ranked arcs, in creation order.
ALTER TABLE arcs ADD COLUMN sort_order INTEGER;
