// Runnable check for note tabs: `node --experimental-strip-types src/editor/noteTabs.check.ts`
import { parseTabs, sanitizeTabName, serializeTabs } from './noteTabs.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`noteTabs check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

// A note with no markers is one default tab, and writes back byte-for-byte.
equal(parseTabs('# hi\nbody\n'), [{ name: 'Main', text: '# hi\nbody\n' }], 'legacy note is one default tab');
equal(serializeTabs(parseTabs('# hi\nbody\n')), '# hi\nbody\n', 'legacy note round-trips unchanged');
equal(parseTabs(''), [{ name: 'Main', text: '' }], 'empty note is one empty tab');

// Text before the first marker stays the default tab.
equal(
  parseTabs('intro\n<!-- tab: Refs -->\nlinks'),
  [{ name: 'Main', text: 'intro' }, { name: 'Refs', text: 'links' }],
  'prefix text becomes the default tab',
);

// A file that opens with a marker has no default tab.
equal(parseTabs('<!-- tab: A -->\nx'), [{ name: 'A', text: 'x' }], 'leading marker means no default tab');

// Round-trips, including empty tabs and trailing newlines.
for (const raw of [
  'intro\n<!-- tab: Refs -->\nlinks',
  '<!-- tab: A -->\nx\n\n<!-- tab: B -->\ny\n',
  '<!-- tab: A -->\n\n<!-- tab: B -->\ny',
]) {
  equal(serializeTabs(parseTabs(raw)), raw, `round-trip ${JSON.stringify(raw)}`);
}

// A hand-written marker with no body line is an empty tab; the layout may be
// normalised on write, but what it parses to must not change.
for (const raw of ['<!-- tab: A -->\n<!-- tab: B -->\n', '<!-- tab: A -->\n']) {
  equal(parseTabs(serializeTabs(parseTabs(raw))), parseTabs(raw), `stable ${JSON.stringify(raw)}`);
}

// A lone renamed default tab keeps its name via a marker.
equal(serializeTabs([{ name: 'Plan', text: 'x' }]), '<!-- tab: Plan -->\nx', 'renamed single tab gets a marker');

// Names can't break out of the marker line.
equal(sanitizeTabName('a --> b\nc'), 'a   b c', 'marker terminators and newlines are stripped');
equal(
  parseTabs(serializeTabs([{ name: 'x -->', text: '' }, { name: 'y', text: 'z' }])).map((tab) => tab.name),
  ['x', 'y'],
  'hostile name survives a round-trip',
);

console.log('noteTabs check passed');
