-- Arcs and projects can carry a chosen icon: the name of a Phosphor icon (src/planner/plannerIcons.tsx); '' means the default.
ALTER TABLE arcs ADD COLUMN icon TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT '';
