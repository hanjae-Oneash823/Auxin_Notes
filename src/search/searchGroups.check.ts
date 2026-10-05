// Runnable check: `node --experimental-strip-types src/search/searchGroups.check.ts`
import type { NoteSummary } from '../db/queries/notes.ts';
import { groupSearchResults } from './searchGroups.ts';

function ok(condition: boolean, message: string): void {
  if (!condition) throw new Error(`searchGroups check failed: ${message}`);
}

const file = (path: string): NoteSummary => ({
  id: path, path, title: path.split('/').pop()!.replace(/\.\w+$/, ''), modified: '', needsAttention: false, isHub: false, isCanvas: false, isPdf: false,
});

const files = [file('Math/Algebra.md'), file('Math/Notes.md'), file('Misc/Math tricks.md'), file('Misc/Recipe.md'), file('Trash/Math old.md')];
const contentHits = [
  { id: '1', title: 'Recipe', path: 'Misc/Recipe.md', snippet: 'a bit of math in here' },
  { id: '2', title: 'Algebra', path: 'Math/Algebra.md', snippet: 'math math' },
];

const groups = groupSearchResults(files, contentHits, 'math');
const ids = groups.map((group) => group.id).join(',');
ok(ids === 'title,contents,folder', `group order (got ${ids})`);
ok(groups[0].hits.map((h) => h.file.title).join() === 'Math tricks', 'title hit; Trash excluded');
ok(groups[1].hits.map((h) => h.file.title).join() === 'Recipe,Algebra', 'contents hits keep their order');
ok(groups[1].hits[0].detail === 'a bit of math in here', 'contents hit keeps its snippet');
ok(groups[2].hits.map((h) => h.file.title).join() === 'Notes', 'folder hit skips files already listed');
ok(groupSearchResults(files, [], '  ').length === 0, 'blank query has no groups');
console.log('searchGroups check passed');
