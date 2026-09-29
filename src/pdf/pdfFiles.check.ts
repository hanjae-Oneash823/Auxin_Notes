// Run: npx tsx src/pdf/pdfFiles.check.ts — asserts the PDF↔note pairing rules.
import type { NoteSummary } from '../db/queries/notes';
import { mergePdfNotes, notePathForPdf, pdfPathForNote } from './pdfFiles';
import { anchorText, findAnchorPage } from './pdfAnchors';
import { countPageMatches, locateMatch } from './pdfSearch';
import { agentTargetFromPath, buildAgentPrompt, isAgentCommand, shellQuote } from '../terminal/terminalAgentPrompt';

function eq(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const summary = (path: string, isPdf = false): NoteSummary => ({
  id: path, path, title: path, modified: '', needsAttention: false, isHub: false, isCanvas: false, isPdf,
});

eq(notePathForPdf('A/Foo.pdf'), 'A/Foo.md');
eq(pdfPathForNote('A/Foo.md'), 'A/Foo.pdf');

const notes = [summary('A/Foo.md'), summary('A/Solo.md')];
const pdfs = [summary('A/Foo.pdf', true), summary('A/Bare.pdf', true)];

// Fused note hidden; its PDF and a note-less PDF shown; standalone note kept.
eq(mergePdfNotes(notes, pdfs, false).map((n) => n.path), ['A/Solo.md', 'A/Foo.pdf', 'A/Bare.pdf']);
// Tag filter: only PDFs whose note survived the filter stay.
eq(mergePdfNotes([notes[0]], pdfs, true).map((n) => n.path), ['A/Foo.pdf']);
// PDF gone (deleted, note kept): the note is an ordinary row again.
eq(mergePdfNotes(notes, [], false).map((n) => n.path), ['A/Foo.md', 'A/Solo.md']);
// Search: case-insensitive, non-overlapping, per page; global index -> (page, ordinal).
const counts = countPageMatches([['Foo bar FOO', 'x'], ['none'], ['foofoo']], 'foo');
eq(counts, [2, 0, 2]);
eq(locateMatch(counts, 1), { page: 1, ordinal: 1 });
eq(locateMatch(counts, 2), { page: 3, ordinal: 0 });
eq(locateMatch(counts, 4), null);
eq(countPageMatches([['abc']], ''), [0]);
// Anchors: nearest preceding `@pN` governs; emails and mid-word text don't count.
const note = 'intro\n@p3 first idea\nmore\n@p12 second idea';
eq(findAnchorPage(note, 0), null);
eq(findAnchorPage(note, note.indexOf('first')), 3);
eq(findAnchorPage(note, note.indexOf('second')), 12);
eq(findAnchorPage(note, note.indexOf('@p12') + 3), 12); // cursor inside the anchor itself
eq(findAnchorPage('mail me@p5.com or x@p7', 999), null);
eq(anchorText(9), '@p9');
// Agent prompts: targets by extension, shell-safe quoting, agent-command detection.
const pdfTarget = agentTargetFromPath('/v/A/Foo.pdf', false);
eq(pdfTarget.kind, 'pdf');
eq(pdfTarget.name, 'Foo.pdf');
eq(agentTargetFromPath('/v/A/b.axcanvas', false).kind, 'canvas');
eq(agentTargetFromPath('/v/A/n.md', false).kind, 'note');
eq(agentTargetFromPath('/v/A', true).kind, 'folder');
eq(buildAgentPrompt(pdfTarget).includes('/v/A/Foo.md, if it exists'), true);
eq(buildAgentPrompt(agentTargetFromPath('/v/A', true)), "Let's talk about this folder: /v/A. Start by looking through it.");
eq(shellQuote("it's /v/a b"), `'it'\\''s /v/a b'`);
eq(['claude', 'claude --x', 'codex -m y', 'claudette', 'vim'].map(isAgentCommand), [true, true, true, false, false]);
console.log('pdf checks ok');
