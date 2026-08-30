import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { getDb } from '../../db/client';
import { pathQualifiedTarget } from '../../vault/aliasResolution';

const TRIGGER_PATTERN = /\[\[([^\]]*)$/;

/**
 * Typing `[[` opens a fuzzy note-title matcher sourced from the index (a
 * direct indexed SQLite query per keystroke, not a separately-maintained
 * warm cache — simple and fast enough at note-list scale; revisit only if
 * profiling on a large vault says otherwise). A title with no match offers
 * "Create note", matching Obsidian's link-creates-the-note expectation.
 *
 * When multiple notes share a title, each candidate is shown with its
 * folder path and inserted as a path-qualified link (`[[Folder/Title]]`) —
 * the same disambiguator `resolveLinkTarget` understands — instead of
 * silently picking one (see plan §Risks: duplicate titles).
 */
export function createWikilinkAutocomplete(vaultRoot: string) {
  return autocompletion({
    override: [
      async (context: CompletionContext): Promise<CompletionResult | null> => {
        const textBefore = context.state.sliceDoc(0, context.pos);
        const match = textBefore.match(TRIGGER_PATTERN);
        if (!match) return null;

        const query = match[1];
        const from = context.pos - query.length;

        const db = await getDb(vaultRoot);
        const rows = await db.select<{ title: string; path: string }[]>(
          'SELECT title, path FROM notes WHERE is_deleted = 0 AND title LIKE ? ORDER BY title LIMIT 20',
          [`%${query}%`],
        );

        const titleCounts = new Map<string, number>();
        for (const row of rows) {
          titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
        }

        const options = rows.map((row) => {
          const isDuplicate = (titleCounts.get(row.title) ?? 0) > 1;
          const insertTarget = isDuplicate ? pathQualifiedTarget(row.path) : row.title;
          return {
            label: isDuplicate ? `${row.title}  (${row.path})` : row.title,
            apply: `${insertTarget}]]`,
          };
        });

        if (query.trim().length > 0 && !rows.some((row) => row.title === query)) {
          options.push({ label: `Create note: "${query}"`, apply: `${query}]]` });
        }

        return { from, options, validFor: /^[^\]]*$/ };
      },
    ],
  });
}
