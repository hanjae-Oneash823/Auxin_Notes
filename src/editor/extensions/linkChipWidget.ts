import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/** Dispatched by Editor.tsx whenever the vault's syncVersion changes (some
 *  file elsewhere was created/renamed/edited) — tells this plugin to drop
 *  its cached resolutions and re-check every chip, since a target's
 *  resolved/ambiguous/broken status can change without this document's own
 *  text changing at all (e.g. a previously-broken link's target note gets
 *  created elsewhere). */
export const refreshLinkChipsEffect = StateEffect.define<null>();
import { getDb } from '../../db/client';
import {
  type LinkCandidate,
  type LinkResolution,
  pathQualifiedTarget,
  resolveLinkTarget,
} from '../../vault/aliasResolution';

const WIKILINK_PATTERN = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const HOVER_DELAY_MS = 180;

const resolutionCache = new Map<string, LinkResolution>();
let activeOverlay: HTMLDivElement | null = null;

function removeOverlay() {
  activeOverlay?.remove();
  activeOverlay = null;
}

function statusColorVar(status: LinkResolution['status']): string {
  if (status === 'broken') return 'var(--accent-link-broken)';
  if (status === 'ambiguous') return 'var(--accent-tag)';
  return 'var(--accent-link)'; // resolved and stale share a color; border style tells them apart
}

class LinkChipWidget extends WidgetType {
  constructor(
    private readonly view: EditorView,
    private readonly vaultRoot: string,
    private readonly target: string,
    private readonly displayText: string,
    private readonly aliasSuffix: string,
    private readonly from: number,
    private readonly to: number,
    private readonly onNavigate: (path: string) => void,
    private readonly readOnly: boolean,
    private readonly version: number,
  ) {
    super();
  }

  eq(other: LinkChipWidget) {
    return (
      other.target === this.target &&
      other.displayText === this.displayText &&
      other.from === this.from &&
      other.to === this.to &&
      other.version === this.version
    );
  }

  toDOM() {
    const chip = document.createElement('span');
    chip.className = 'auxin-link-chip';
    chip.textContent = this.displayText;
    chip.style.fontFamily = 'var(--font-family)';
    chip.style.borderStyle = 'solid';
    chip.style.borderWidth = '1px';
    chip.style.padding = '0 4px';
    chip.style.cursor = 'pointer';

    const cacheKey = `${this.vaultRoot}::${this.target}`;
    const cached = resolutionCache.get(cacheKey);
    if (cached) {
      setChipStatus(chip, cached);
    }
    if (!cached) {
      void resolveTarget(this.vaultRoot, this.target).then((resolution) => {
        resolutionCache.set(cacheKey, resolution);
        setChipStatus(chip, resolution);
      });
    }

    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    chip.addEventListener('mouseenter', () => {
      hoverTimeout = setTimeout(() => {
        void showPreview(chip, this.vaultRoot, this.target);
      }, HOVER_DELAY_MS);
    });
    chip.addEventListener('mouseleave', () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      removeOverlay();
    });

    chip.addEventListener('click', (event) => {
      event.preventDefault();
      const resolution = resolutionCache.get(cacheKey);
      if (!resolution) return;
      if (resolution.status === 'ambiguous') {
        // Disambiguation writes a path-qualified link into the doc — not
        // meaningful in reading mode, where edits are blocked anyway.
        if (!this.readOnly) this.showDisambiguationPicker(chip, resolution.candidates);
      } else if (resolution.status === 'stale' && resolution.candidates[0]) {
        if (!this.readOnly) this.relinkTo(resolution.candidates[0].title);
        this.onNavigate(resolution.candidates[0].path);
      } else if (resolution.status === 'resolved' && resolution.candidates[0]) {
        this.onNavigate(resolution.candidates[0].path);
      }
    });

    return chip;
  }

  /** Rewrites just this one wikilink occurrence to point at `target` — either
   *  a bare title (unambiguous relink) or a path-qualified disambiguator. */
  private relinkTo(target: string) {
    this.view.dispatch({
      changes: { from: this.from, to: this.to, insert: `[[${target}${this.aliasSuffix}]]` },
    });
    removeOverlay();
  }

  private showDisambiguationPicker(anchor: HTMLElement, candidates: LinkCandidate[]) {
    removeOverlay();
    const rect = anchor.getBoundingClientRect();
    const card = document.createElement('div');
    card.style.position = 'fixed';
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.bottom + 6}px`;
    card.style.minWidth = '200px';
    card.style.background = 'var(--color-bg)';
    card.style.border = '1px solid var(--border-default)';
    card.style.padding = 'var(--space-chrome-xs)';
    card.style.fontFamily = 'var(--font-family)';
    card.style.fontSize = '0.82rem';
    card.style.color = 'var(--color-fg)';
    card.style.zIndex = '50';

    const label = document.createElement('div');
    label.textContent = 'ambiguous — pick one:';
    label.style.opacity = 'var(--fg-opacity-faint)';
    label.style.padding = '2px 4px';
    card.appendChild(label);

    for (const candidate of candidates) {
      const option = document.createElement('div');
      option.textContent = candidate.path;
      option.style.padding = '4px';
      option.style.cursor = 'pointer';
      option.style.color = 'var(--accent-link)';
      option.addEventListener('mouseenter', () => {
        option.style.background = 'var(--border-subtle)';
      });
      option.addEventListener('mouseleave', () => {
        option.style.background = 'transparent';
      });
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        this.relinkTo(pathQualifiedTarget(candidate.path));
      });
      card.appendChild(option);
    }

    document.body.appendChild(card);
    activeOverlay = card;
  }
}

function setChipStatus(chip: HTMLElement, resolution: LinkResolution) {
  const color = statusColorVar(resolution.status);
  chip.style.color = color;
  chip.style.borderColor = color;
  chip.style.borderStyle = resolution.status === 'broken' || resolution.status === 'stale' ? 'dashed' : 'solid';
}

async function resolveTarget(vaultRoot: string, target: string): Promise<LinkResolution> {
  const db = await getDb(vaultRoot);
  return resolveLinkTarget(db, target);
}

async function showPreview(anchor: HTMLElement, vaultRoot: string, target: string) {
  removeOverlay();
  const db = await getDb(vaultRoot);
  const rows = await db.select<{ id: string; title: string; body: string }[]>(
    `SELECT n.id, n.title, f.body FROM notes n
     JOIN notes_fts f ON f.id = n.id
     WHERE n.title = ? AND n.is_deleted = 0`,
    [target],
  );

  const rect = anchor.getBoundingClientRect();
  const card = document.createElement('div');
  card.style.position = 'fixed';
  card.style.left = `${rect.left}px`;
  card.style.top = `${rect.bottom + 6}px`;
  card.style.maxWidth = '280px';
  card.style.background = 'var(--color-bg)';
  card.style.border = '1px solid var(--border-default)';
  card.style.padding = 'var(--space-chrome-md)';
  card.style.fontFamily = 'var(--font-family)';
  card.style.fontSize = '0.82rem';
  card.style.color = 'var(--color-fg)';
  card.style.zIndex = '50';

  if (rows.length === 1) {
    const title = document.createElement('div');
    title.textContent = rows[0].title;
    title.style.color = 'var(--accent-link)';
    title.style.marginBottom = '4px';
    const snippet = document.createElement('div');
    snippet.textContent = rows[0].body.slice(0, 160);
    snippet.style.opacity = 'var(--fg-opacity-muted)';
    card.append(title, snippet);
  } else {
    const message = document.createElement('div');
    message.textContent = 'note not found — click to create';
    message.style.opacity = 'var(--fg-opacity-muted)';
    card.append(message);
  }

  document.body.appendChild(card);
  activeOverlay = card;
}

/**
 * Renders `[[Target|alias]]` as a small hoverable chip (sharp corners, thin
 * status-colored border), reverting to raw brackets only for the specific
 * occurrence the cursor/selection actually overlaps — other links on the
 * same line stay chips. Resolution status
 * (resolved/stale/ambiguous/broken) is looked up against the index and
 * cached until a `refreshLinkChipsEffect` dispatch invalidates it (Editor.tsx
 * fires one whenever the vault's syncVersion changes); a hover after a short
 * delay shows a preview card. An ambiguous chip is click-to-disambiguate
 * (pick which note, rewritten as a path-qualified link); a stale one
 * (resolved only via note_aliases) is click-to-relink to the note's current
 * title.
 */
export function createLinkChipPlugin(
  vaultRoot: string,
  onNavigate: (path: string) => void,
  readOnly: boolean,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      version = 0;
      constructor(view: EditorView) {
        this.decorations = build(view, vaultRoot, onNavigate, readOnly, this.version);
      }
      update(update: ViewUpdate) {
        const shouldRefresh = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshLinkChipsEffect)),
        );
        if (shouldRefresh) {
          // Cache is keyed only by vaultRoot::target with no way to know
          // which entries a given sync actually invalidated — clearing all
          // of it is cheap (local SQLite lookups) and always correct.
          resolutionCache.clear();
          this.version++;
        }
        // See hideSyntaxPlugin.ts — rebuilding mid-IME-composition crashes
        // CodeMirror's composition handling, so just remap positions and
        // defer the real rebuild until composition ends.
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes);
          return;
        }
        if (update.docChanged || update.selectionSet || update.viewportChanged || shouldRefresh) {
          this.decorations = build(update.view, vaultRoot, onNavigate, readOnly, this.version);
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  );
}

function build(
  view: EditorView,
  vaultRoot: string,
  onNavigate: (path: string) => void,
  readOnly: boolean,
  version: number,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const selection = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);

      for (const match of line.text.matchAll(WIKILINK_PATTERN)) {
        const start = line.from + (match.index ?? 0);
        const end = start + match[0].length;
        const cursorInLink = !readOnly && selection.from <= end && selection.to >= start;
        if (cursorInLink) continue;

        const target = match[1].trim();
        const alias = match[2]?.trim();
        const displayText = alias ?? target;
        const aliasSuffix = match[2] !== undefined ? `|${match[2]}` : '';
        builder.add(
          start,
          end,
          Decoration.replace({
            widget: new LinkChipWidget(
              view,
              vaultRoot,
              target,
              displayText,
              aliasSuffix,
              start,
              end,
              onNavigate,
              readOnly,
              version,
            ),
          }),
        );
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}
