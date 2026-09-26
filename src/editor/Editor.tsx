import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { Image } from '@phosphor-icons/react';
import { markdownSetup } from './extensions/markdownSetup';
import { HEADING_LEFT_OFFSET_PX } from './extensions/theme';
import { pickAndInsertImage } from './extensions/imageInsert';
import { refreshLinkChipsEffect } from './extensions/linkChipWidget';
import { registerEditorView, unregisterEditorView } from './editorRegistry';
import { getScrollPosition, saveScrollPosition } from './editorScrollMemory';
import { TocDots } from './TocDots';
import { extractHeadings } from './tocExtract';
import { useTocStore } from './tocStore';
import { titleFromPath } from '../vault/noteTitle';
import { useVaultStore } from '../vault/vaultStore';

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
}

export function Editor({ path, vaultRoot, onNavigate, onRenameTitle, readOnly }: EditorProps) {
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
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // `box-sizing: border-box` (global.css) makes `height` include the
    // border, but `scrollHeight` only ever measures content + padding — so
    // setting height straight to scrollHeight comes up short by the
    // border's own width, clipping a sliver off the last wrapped line on a
    // multi-line title. Adding the border back in gets the true total.
    const { borderTopWidth, borderBottomWidth } = window.getComputedStyle(el);
    const borderHeight = parseFloat(borderTopWidth) + parseFloat(borderBottomWidth);
    el.style.height = `${el.scrollHeight + borderHeight}px`;
  }, [titleValue]);

  useEffect(() => {
    let cancelled = false;

    function scheduleSave(view: EditorView) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        const text = view.state.doc.toString();
        void invoke('write_note', { path, content: text }).then(() => {
          lastSyncedContentRef.current = text;
        });
      }, AUTOSAVE_DELAY_MS);
    }

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

      const state = EditorState.create({
        doc: content,
        extensions: [
          ...markdownSetup(vaultRoot, onNavigate, readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              scheduleSave(update.view);
              useTocStore.getState().setHeadings(extractHeadings(update.state));
            }
          }),
          EditorView.domEventHandlers({
            scroll: (_event, view) => {
              publishActiveAnchor(view);
              saveScrollPosition(path, view.lineBlockAtHeight(view.scrollDOM.scrollTop).from);
            },
          }),
        ],
      });

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
        const view = viewRef.current;
        if (view) {
          const content = view.state.doc.toString();
          void invoke('read_note', { path })
            .then(() => invoke('write_note', { path, content }))
            .catch(() => {});
        }
      }
      unregisterEditorView(path);
      viewRef.current?.destroy();
      viewRef.current = null;
      useTocStore.getState().setHeadings([]);
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

      const current = view.state.doc.toString();
      if (onDisk !== current && current === lastSyncedContentRef.current) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: onDisk },
          effects: refreshLinkChipsEffect.of(null),
        });
        lastSyncedContentRef.current = onDisk;
        useTocStore.getState().setHeadings(extractHeadings(view.state));
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
          maxWidth: 'var(--width-content-max)',
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
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  );
}
