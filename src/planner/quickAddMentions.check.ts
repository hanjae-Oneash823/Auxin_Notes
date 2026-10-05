// Runnable check for the quick-add @ notation: `node --experimental-strip-types src/planner/quickAddMentions.check.ts`
import { filterMentions, mentionOptions, mentionQueryAt, withoutMention } from './quickAddMentions.ts';
import type { Arc, PlannerGroup, Project } from '../db/queries/planner/types.ts';

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`quickAddMentions check failed: ${message}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
}

// Query: text after the last @ before the cursor, closed by a space.
equal(mentionQueryAt('read @arc', 9), 'arc', 'open mention');
equal(mentionQueryAt('read @', 6), '', 'a bare @ lists everything');
equal(mentionQueryAt('read @arc paper', 15), null, 'a space ends the mention');
equal(mentionQueryAt('read paper', 10), null, 'no @ means no mention');
equal(mentionQueryAt('read @arc paper', 9), 'arc', 'only text before the cursor counts');

// Removal keeps the rest of the title.
equal(withoutMention('read @arc', 9), 'read ', 'trailing mention is dropped');
equal(withoutMention('@arc paper', 4), 'paper', 'leading mention is dropped and the start trimmed');

const arc = (id: string, name: string, status: Arc['status'] = 'active'): Arc => ({ id, name, colorHex: '#f00', description: '', status, createdAt: '' });
const project = (id: string, arcId: string | null, name: string, status: Project['status'] = 'active'): Project =>
  ({ id, arcId, name, description: '', status, startDate: null, endDate: null, createdAt: '' });
const group = (id: string, name: string, isUngrouped = false): PlannerGroup => ({ id, name, colorHex: '#0f0', sortOrder: 0, isUngrouped, createdAt: '' });

const arcs = [arc('a1', 'School'), arc('a2', 'Old', 'archived')];
const projects = [project('p1', 'a1', 'Final Thesis'), project('p2', 'a2', 'Other'), project('p3', 'a1', 'Done', 'done')];
const groups = [group('g1', 'Deep work'), group('g2', 'Ungrouped', true)];

equal(mentionOptions(arcs, projects, groups, null).map((o) => o.label), ['arc-School', 'group-Deep_work'], 'no projects until an arc is picked; archived arcs and Ungrouped hidden');
equal(mentionOptions(arcs, projects, groups, 'a1').map((o) => o.label), ['arc-School', 'project-Final_Thesis', 'group-Deep_work'], "only the picked arc's active projects");
equal(filterMentions(mentionOptions(arcs, projects, groups, 'a1'), 'PROJ').map((o) => o.id), ['p1'], 'filter is case-insensitive on the label');

console.log('quickAddMentions: ok');
