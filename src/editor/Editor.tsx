import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { Image, Plus } from '@phosphor-icons/react';
import { markdownSetup } from './extensions/markdownSetup';
import { HEADING_LEFT_OFFSET_PX } from './extensions/theme';
import { pickAndInsertImage } from './extensions/imageInsert';
import { refreshLinkChipsEffect } from './extensions/linkChipWidget';
import { registerEditorView, unregisterEditorView } from './editorRegistry';
import { getScrollPosition, saveScrollPosition } from './editorScrollMemory';
import { NoteTabStrip } from './NoteTabStrip';
import { parseTabs, sanitizeTabName, serializeTabs, type NoteTab } from './noteTabs';
import { TocDots } from './TocDots';
import { extractHeadings } from './tocExtract';
import { useTocStore } from './tocStore';
import { titleFromPath } from '../vault/noteTitle';
import { useVaultStore } from '../vault/vaultStore';
import { toRelativePath } from '../vault/syncEngine';
import { logUsageEvent } from '../db/usageEvents';

const AUTOSAVE_DELAY_MS = 500;

/** Typing this in the title field self-replaces with today's date. */
const DATE_SHORTCUT = '/d';

// Scroll distance (px) over which the title fully demotes from its resting
// size/opacity down to its minimums — an iOS-style "large title" collapse,
// not a hard on/off toggle.
const TITLE_COLLAPSE_DISTANCE_PX = 140;
const TITLE_MIN_SCALE = 0.55;
// Kept high (not the near-transparent fade an opacity-only demotion would
// use) — a low-opacity yellow reads as washed-out/murky against the app's
// black background, undercutting the "striking" accent color below rather
// than just demoting it. Size (TITLE_MIN_SCALE) carries the "less
// prominent" signal instead; opacity only trims it slightly.
const TITLE_MIN_OPACITY = 0.9;
// Near 1 — the collapsed title reads as a bold accent color, not a subtly
// warmed white.
const TITLE_MAX_TINT = 0.92;

/** Maps the body's scroll offset to a title scale/opacity and applies it
 *  directly to the DOM — driven from CodeMirror's own scroll event (already
 *  rAF-coalesced by the caller), so this runs at most once per frame and
 *  skips a React re-render on every scroll tick. `transform: scale` (rather
 *  than animating `fontSize`) keeps the textarea's own layout height at its
 *  natural, unscaled size (still driven by the auto-grow effect below) — so
 *  the multi-line title never re-wraps mid-scroll — while `wrapperEl`, a
 *  plain `overflow: hidden` box around it, gets its *layout* height shrunk
 *  by that same scale factor. Because the wrapper clips in untransformed
 *  coordinates and the textarea always paints at exactly
 *  `naturalHeight * scale` post-transform, the two match at every scale, so
 *  the collapsing title reclaims space as it shrinks instead of leaving a
 *  gap behind.
 *
 *  The `--title-tint` custom property drives a `color-mix()` (in the JSX
 *  style below) between `--fg-full` and the existing `--accent-warning`
 *  token, rather than a hardcoded hex — same warm-yellow tone this app
 *  already uses elsewhere, and it stays theme-correct across light/dark
 *  for free since both halves of the mix are CSS vars, not JS-computed
 *  RGB. A browser without `color-mix()` support just ignores that one
 *  inline declaration and falls back to the `text-fg` class's plain
 *  `--fg-full` color. */
function applyTitleScrollProminence(
  titleEl: HTMLTextAreaElement,
  wrapperEl: HTMLDivElement,
  scrollTop: number,
) {
  const progress = Math.min(1, Math.max(0, scrollTop / TITLE_COLLAPSE_DISTANCE_PX));
  const scale = 1 - progress * (1 - TITLE_MIN_SCALE);
  const opacity = 1 - progress * (1 - TITLE_MIN_OPACITY);
  titleEl.style.transform = `scale(${scale})`;
  titleEl.style.opacity = `${opacity}`;
  titleEl.style.setProperty('--title-tint', `${progress * TITLE_MAX_TINT}`);
  wrapperEl.style.height = `${titleEl.offsetHeight * scale}px`;
}

/** Grows the title textarea to fit its wrapped text: resets height to 'auto' (so it can shrink back
 *  too) before reading scrollHeight, the standard auto-grow-textarea trick.
 *
 *  `box-sizing: border-box` (global.css) makes `height` include the border, but `scrollHeight` only
 *  ever measures content + padding — so setting height straight to scrollHeight comes up short by
 *  the border's own width, clipping a sliver off the last wrapped line on a multi-line title.
 *  Adding the border back in gets the true total. */
function fitTitleHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  const { borderTopWidth, borderBottomWidth } = window.getComputedStyle(el);
  const borderHeight = parseFloat(borderTopWidth) + parseFloat(borderBottomWidth);
  el.style.height = `${el.scrollHeight + borderHeight}px`;
}

function formatDateShortcut(): string {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

interface EditorProps {
  path: string;
  vaultRoot: string;
  /** Called with a vault-relative path when a resolved/stale link chip is clicked. */
  onNavigate: (path: string) => void;
  /** Renames the note (actually moves the .md file) — backs the title field. */
  onRenameTitle: (newTitle: string) => Promise<void>;
  /** Reading mode: fully rendered, no cursor-based syntax reveal, no edits. */
  readOnly: boolean;
  /** Fired on every selection/cursor change (PdfView follows PDF anchors with it). */
  onCursorMove?: (state: EditorState) => void;
}

export function Editor({ path, vaultRoot, onNavigate, onRenameTitle, readOnly, onCursorMove }: EditorProps) {
  // A ref, so the once-created CodeMirror listener always calls the latest callback.
  const cursorMoveRef = useRef(onCursorMove);
  cursorMoveRef.current = onCursorMove;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Clips the title to its scroll-shrunk height (see
  // applyTitleScrollProminence) — a separate element from titleRef so the
  // textarea's own layout size can stay at its natural, unscaled value.
  const titleWrapperRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks what's actually on disk as far as this editor knows — set on
  // mount and after every successful autosave. Lets the syncVersion effect
  // below tell "the buffer differs from disk because of a pending local
  // edit" apart from "the buffer differs from disk because something else
  // (e.g. `claude` run from the in-app terminal) wrote this file out from
  // under us" — only the latter should ever reload the live buffer.
  const lastSyncedContentRef = useRef<string>('');
  // Set once a real doc change schedules a save this mount — read only in
  // the mount effect's own cleanup, to log at most one usage 'edit' event
  // per editing session rather than one per (debounced) autosave tick.
  const editOccurredRef = useRef(false);
  // The note's tabs (see noteTabs.ts). The one CodeMirror view shows a single
  // tab at a time by swapping in that tab's own EditorState — which keeps each
  // tab's undo history, cursor and selection. The active tab's entry here goes
  // stale while it's being edited; the live text is always `view.state`.
  const tabsRef = useRef<{ name: string; state: EditorState }[]>([]);
  const activeTabRef = useRef(0);
  const makeStateRef = useRef<((text: string) => EditorState) | null>(null);
  const [tabNames, setTabNames] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const currentTitle = titleFromPath(path);
  // Re-initialized fresh on every genuine note switch — App.tsx remounts
  // this whole component (key={activePath}) whenever `path` changes,
  // including right after a successful rename here.
  const [titleValue, setTitleValue] = useState(currentTitle);
  const syncVersion = useVaultStore((state) => state.syncVersion);

  async function commitTitle() {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === currentTitle) {
      setTitleValue(currentTitle);
      return;
    }
    try {
      await onRenameTitle(trimmed);
    } catch {
      // Rejected (empty/"/"/collision/etc.) — the rejection's message is
      // already surfaced by App.tsx's rename status line; just revert.
      setTitleValue(currentTitle);
    }
  }

  /** Typing "/date" anywhere in the title self-replaces with today's date
   *  (YYMMDD) the moment the trigger text is complete — checked against the
   *  text immediately before the cursor, not just the string's end, so it
   *  works mid-title too, not only when typed at the very end. */
  function handleTitleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const raw = event.target.value.replace(/\n/g, ' ');
    const cursor = event.target.selectionStart ?? raw.length;
    const beforeCursor = raw.slice(0, cursor);

    if (!beforeCursor.endsWith(DATE_SHORTCUT)) {
      setTitleValue(raw);
      return;
    }

    const dateStr = formatDateShortcut();
    const insertAt = cursor - DATE_SHORTCUT.length;
    setTitleValue(raw.slice(0, insertAt) + dateStr + raw.slice(cursor));
    // The DOM still holds the pre-replacement value at this point in the
    // event (React hasn't re-rendered yet) — deferring to the next frame
    // lets the cursor land right after the inserted date once it has.
    requestAnimationFrame(() => {
      const pos = insertAt + dateStr.length;
      titleRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter') {
      // The title field wraps long text onto multiple lines (see
      // titleRef below) but is still logically a single-line value —
      // Enter commits it, same as before, rather than inserting a
      // newline the way it would in a plain textarea.
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setTitleValue(currentTitle);
      event.currentTarget.blur();
    }
  }

  // A textarea (not an input) so a long title wraps onto multiple lines
  // instead of scrolling horizontally — grown to fit its content by
  // resetting height to 'auto' (so it can shrink back down too) before
  // reading scrollHeight, the standard auto-grow-textarea trick. Re-runs on
  // every value change, including the initial mount (a note reopened with
  // an already-long title should start out at its wrapped height, not 1
  // line clipped).
  useEffect(() => {
    if (titleRef.current) fitTitleHeight(titleRef.current);
  }, [titleValue]);

  // The title's wrapped line count depends on its width, which changes without
  // the text changing: the content column's max-width animates on layout
  // changes (--transition-content-width), and the pane can be resized. A height
  // measured at the old width then lingers — both the textarea's own and the
  // clipping wrapper's (only otherwise refreshed on a scroll tick) — leaving a
  // tall empty gap between a short title and the body. Re-fit on width change.
  useEffect(() => {
    const wrapper = titleWrapperRef.current;
    if (!wrapper) return;
    let lastWidth = wrapper.clientWidth;
    const observer = new ResizeObserver(() => {
      const title = titleRef.current;
      // Width only: applyTitleScrollProminence resizes the wrapper's height, which must not re-trigger this.
      if (!title || wrapper.clientWidth === lastWidth) return;
      lastWidth = wrapper.clientWidth;
      fitTitleHeight(title);
      applyTitleScrollProminence(title, wrapper, viewRef.current?.scrollDOM.scrollTop ?? 0);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  /** The whole file as it would be written right now — every tab, the active one from the live view. */
  function serializeNote(): string {
    const view = viewRef.current;
    const tabs: NoteTab[] = tabsRef.current.map((tab, index) => ({
      name: tab.name,
      text: (index === activeTabRef.current && view ? view.state : tab.state).doc.toString(),
    }));
    return serializeTabs(tabs);
  }

  function scheduleSave() {
    editOccurredRef.current = true;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      const text = serializeNote();
      void invoke('write_note', { path, content: text }).then(() => {
        lastSyncedContentRef.current = text;
      });
    }, AUTOSAVE_DELAY_MS);
  }

  /** Stashes the live view's state into the active tab's slot, so it survives a swap. */
  function commitActiveTab() {
    const view = viewRef.current;
    if (!view) return;
    tabsRef.current = tabsRef.current.map((tab, index) =>
      index === activeTabRef.current ? { ...tab, state: view.state } : tab,
    );
  }

  function showTab(index: number) {
    const view = viewRef.current;
    if (!view || index === activeTabRef.current || !tabsRef.current[index]) return;
    commitActiveTab();
    activeTabRef.current = index;
    setActiveTab(index);
    view.setState(tabsRef.current[index].state);
    // setState bypasses the update listener, so what it feeds is refreshed by hand.
    useTocStore.getState().setHeadings(extractHeadings(view.state));
    cursorMoveRef.current?.(view.state);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) });
  }

  function addTab() {
    const makeState = makeStateRef.current;
    if (!makeState) return;
    commitActiveTab();
    const name = `Tab ${tabsRef.current.length + 1}`;
    tabsRef.current = [...tabsRef.current, { name, state: makeState('') }];
    setTabNames(tabsRef.current.map((tab) => tab.name));
    showTab(tabsRef.current.length - 1);
    viewRef.current?.focus();
    scheduleSave();
  }

  function renameTab(index: number, name: string) {
    const clean = sanitizeTabName(name);
    if (!clean || !tabsRef.current[index]) return;
    tabsRef.current = tabsRef.current.map((tab, i) => (i === index ? { ...tab, name: clean } : tab));
    setTabNames(tabsRef.current.map((tab) => tab.name));
    scheduleSave();
  }

  function deleteTab(index: number) {
    const view = viewRef.current;
    if (!view || tabsRef.current.length < 2 || !tabsRef.current[index]) return;
    commitActiveTab();
    const remaining = tabsRef.current.filter((_, i) => i !== index);
    const nextActive = index < activeTabRef.current ? activeTabRef.current - 1 : Math.min(activeTabRef.current, remaining.length - 1);
    const deletedActive = index === activeTabRef.current;
    tabsRef.current = remaining;
    activeTabRef.current = nextActive;
    setTabNames(remaining.map((tab) => tab.name));
    setActiveTab(nextActive);
    if (deletedActive) {
      view.setState(remaining[nextActive].state);
      useTocStore.getState().setHeadings(extractHeadings(view.state));
    }
    scheduleSave();
  }

  /** Re-reads tabs from changed-on-disk text. Same tab names → only the active tab's text is replaced through a
   *  transaction (keeping its undo history and cursor, as the pre-tabs reload did); any other shape rebuilds all tabs. */
  function applyExternalContent(raw: string) {
    const view = viewRef.current;
    const makeState = makeStateRef.current;
    if (!view || !makeState) return;
    const incoming = parseTabs(raw);
    const sameShape =
      incoming.length === tabsRef.current.length && incoming.every((tab, i) => tab.name === tabsRef.current[i].name);
    const nextActive = Math.min(activeTabRef.current, incoming.length - 1);
    tabsRef.current = incoming.map((tab) => ({ name: tab.name, state: makeState(tab.text) }));
    activeTabRef.current = nextActive;
    setTabNames(incoming.map((tab) => tab.name));
    setActiveTab(nextActive);
    if (sameShape) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: incoming[nextActive].text },
        effects: refreshLinkChipsEffect.of(null),
      });
    } else {
      view.setState(tabsRef.current[nextActive].state);
      view.dispatch({ effects: refreshLinkChipsEffect.of(null) });
    }
    useTocStore.getState().setHeadings(extractHeadings(view.state));
  }

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      const content = await invoke<string>('read_note', { path });
      if (cancelled || !containerRef.current) return;
      lastSyncedContentRef.current = content;

      // Coalesces a fast scroll gesture's flood of native `scroll` events
      // into at most one update per animation frame, rather than one per
      // event — both the active TOC anchor and the title's scroll-driven
      // prominence ride this same rAF.
      let scrollUpdateScheduled = false;
      function publishActiveAnchor(view: EditorView) {
        if (scrollUpdateScheduled) return;
        scrollUpdateScheduled = true;
        requestAnimationFrame(() => {
          scrollUpdateScheduled = false;
          const scrollTop = view.scrollDOM.scrollTop;
          const viewportMiddle = scrollTop + view.scrollDOM.clientHeight / 2;
          const pos = view.lineBlockAtHeight(viewportMiddle).from;
          useTocStore.getState().setActiveAnchorPos(pos);
          if (titleRef.current && titleWrapperRef.current) {
            applyTitleScrollProminence(titleRef.current, titleWrapperRef.current, scrollTop);
          }
        });
      }

      function makeState(text: string): EditorState {
        return EditorState.create({
          doc: text,
          extensions: [
            ...markdownSetup(vaultRoot, onNavigate, readOnly),
            EditorView.updateListener.of((update) => {
              if (update.selectionSet) cursorMoveRef.current?.(update.state);
              if (update.docChanged) {
                scheduleSave();
                useTocStore.getState().setHeadings(extractHeadings(update.state));
              }
            }),
            EditorView.domEventHandlers({
              scroll: (_event, view) => {
                publishActiveAnchor(view);
                // Remembered position is per note, not per tab: only the first tab (where a note opens) feeds it.
                if (activeTabRef.current === 0) {
                  saveScrollPosition(path, view.lineBlockAtHeight(view.scrollDOM.scrollTop).from);
                }
              },
            }),
          ],
        });
      }

      makeStateRef.current = makeState;
      const parsedTabs = parseTabs(content);
      tabsRef.current = parsedTabs.map((tab) => ({ name: tab.name, state: makeState(tab.text) }));
      activeTabRef.current = 0;
      setTabNames(parsedTabs.map((tab) => tab.name));
      setActiveTab(0);
      const state = tabsRef.current[0].state;

      // App.tsx remounts this whole component on every tab switch
      // (key={activePath}), which tears down and recreates the CodeMirror
      // view from scratch — so returning to a tab always starts at the top
      // unless the last position is restored here. This has to be the
      // documented `scrollTo` constructor option, not a post-construction
      // `view.scrollDOM.scrollTop = x`: a raw DOM write like that sits
      // outside CodeMirror's own transaction/update pipeline, so
      // hideSyntaxPlugin.ts's decorations (what hides `#`/`**`/list markers
      // and renders styled markdown) never reliably rebuild for the jumped-
      // to viewport — even a follow-up `requestMeasure()` call didn't force
      // it, which is why the note kept showing raw markdown source until an
      // unrelated click's real transaction resynced everything. `scrollTo`
      // instead seeds the *initial* view state itself, so the very first
      // render already has the right viewport and every plugin (including
      // hideSyntaxPlugin) builds its decorations for it from the start —
      // nothing to "catch up" after the fact.
      const restorePos = Math.min(getScrollPosition(path), state.doc.length);
      viewRef.current = new EditorView({
        state,
        parent: containerRef.current,
        scrollTo: EditorView.scrollIntoView(restorePos, { y: 'start' }),
      });
      registerEditorView(path, viewRef.current);
      useTocStore.getState().setHeadings(extractHeadings(state));
      publishActiveAnchor(viewRef.current);
    }

    void mount();

    return () => {
      cancelled = true;
      // A pending debounced save must be flushed immediately, not dropped —
      // otherwise switching notes right after typing silently loses the edit.
      // But the file at `path` can have been renamed out from under us (this
      // editor's own title field, or a rename triggered elsewhere, e.g. the
      // sidebar — renameEngine.ts already flushes the live buffer to the old
      // path before renaming) — probe existence first so this can't
      // resurrect a stale duplicate at a filename that's deliberately gone.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        if (viewRef.current) {
          const content = serializeNote();
          void invoke('read_note', { path })
            .then(() => invoke('write_note', { path, content }))
            .catch(() => {});
        }
      }
      unregisterEditorView(path);
      viewRef.current?.destroy();
      viewRef.current = null;
      tabsRef.current = [];
      makeStateRef.current = null;
      useTocStore.getState().setHeadings([]);

      if (editOccurredRef.current) {
        void logUsageEvent(vaultRoot, {
          type: 'edit',
          path: toRelativePath(vaultRoot, path),
          title: titleFromPath(path),
        }).catch((error: unknown) => console.error('[usage] failed to log event', error));
      }
    };
  }, [path, vaultRoot, readOnly]);

  // Separate from the mount effect above on purpose: a vault-wide sync (some
  // other note created/renamed/edited) shouldn't remount this editor and
  // reset cursor/undo history — it just needs link chips to re-check their
  // resolution status, which this cheap effect-only transaction triggers
  // without touching the document itself.
  //
  // But when the sync is *this* note changing on disk without this editor's
  // own doing (e.g. edited via `claude` in the in-app terminal, or any other
  // external tool/process), the live buffer would otherwise sit stale until
  // the tab is closed and reopened — nothing else here ever re-reads the
  // file after the initial mount. So this also reloads from disk, but only
  // when the buffer is still exactly what was last synced (see
  // lastSyncedContentRef) — if the user has typed something that hasn't
  // autosaved yet, an external change is left alone rather than clobbering
  // their in-progress edit; it'll be picked up on the next sync once that
  // pending save flushes and the buffer goes clean again.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const view = viewRef.current;
      if (!view) return;

      const onDisk = await invoke<string>('read_note', { path });
      if (cancelled || !viewRef.current) return;

      const current = serializeNote();
      if (onDisk !== current && current === lastSyncedContentRef.current) {
        applyExternalContent(onDisk);
        lastSyncedContentRef.current = onDisk;
      } else {
        view.dispatch({ effects: refreshLinkChipsEffect.of(null) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, syncVersion]);

  return (
    <div className="relative flex h-full flex-col">
      <TocDots activePath={path} />
      <div
        className="mx-auto flex w-full items-start gap-2"
        style={{
          // Same thin-pane gutter as .cm-content (theme.ts), so the title keeps lining up with the body.
          maxWidth: 'min(var(--width-content-max), calc(100% - 2 * var(--space-toc-gutter)))',
          transition: 'var(--transition-content-width)',
          padding: 'var(--space-content-md) var(--space-content-lg) 0',
        }}
      >
        <div ref={titleWrapperRef} className="w-full flex-1 overflow-hidden">
          <textarea
            ref={titleRef}
            rows={1}
            value={titleValue}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            onBlur={() => void commitTitle()}
            readOnly={readOnly}
            placeholder="untitled"
            className="w-full resize-none overflow-hidden border-0 border-b-2 border-transparent bg-transparent text-fg outline-none transition-colors duration-panel ease-panel focus:border-subtle"
            style={{
              fontFamily: 'var(--font-family)',
              // Full `--fg-full` white, not the dimmer `fg-prominent` (85%
              // opacity) used elsewhere for prominent-but-secondary text —
              // the note's own title should read at least as bright as a
              // heading inside its body (`.cm-md-heading-N` in theme.ts,
              // which has no color override and is full white too), not
              // dimmer than one.
              fontSize: '2.6em',
              fontWeight: 700,
              lineHeight: 1.2,
              // Mixes toward --accent-warning as --title-tint (set per
              // scroll frame by applyTitleScrollProminence) rises from 0.
              color: 'color-mix(in srgb, var(--fg-full), var(--accent-warning) calc(var(--title-tint, 0) * 100%))',
              padding: 'var(--space-chrome-sm) var(--space-chrome-md)',
              // Not a markdown `#` heading — a separate title field — but it
              // reads as this note's first heading, so it shifts left the
              // same amount the real ones do (theme.ts) rather than sitting
              // flush with the body text column beneath it.
              marginLeft: HEADING_LEFT_OFFSET_PX,
              // Scaling (applyTitleScrollProminence) from the top-left corner
              // keeps the title pinned to the same top/left position as it
              // shrinks, rather than drifting inward from a centered origin
              // — matching titleWrapperRef's own top-anchored clipping.
              transformOrigin: 'top left',
            }}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addTab}
            title="Add tab"
            className="mt-2 flex shrink-0 items-center text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
          >
            <Plus size={16} weight="regular" />
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              const view = viewRef.current;
              if (view) void pickAndInsertImage(view, vaultRoot);
            }}
            title="Insert image"
            className="mt-2 flex shrink-0 items-center text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
          >
            <Image size={16} weight="regular" />
          </button>
        )}
      </div>
      {tabNames.length > 1 && (
        <NoteTabStrip
          names={tabNames}
          activeIndex={activeTab}
          readOnly={readOnly}
          onSelect={showTab}
          onRename={renameTab}
          onDelete={deleteTab}
        />
      )}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  );
}
