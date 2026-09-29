import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { motion, type Easing } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { StickyNoteType } from '../db/queries/sticky';
import { hidePopupPanel, PANEL_VARIANTS } from '../popup/popupPanel';
import { saveCapture } from './saveCapture';

const TYPES: readonly StickyNoteType[] = ['text', 'checklist'];
const TYPE_LABELS: Record<StickyNoteType, string> = { text: 'note', checklist: 'checklist' };
const PLACEHOLDERS: Record<StickyNoteType, string> = {
  text: "what's on your mind…",
  checklist: 'one item per line…',
};

const MAX_INPUT_HEIGHT_PX = 180;

/** The "send mail" outro, played instead of PANEL_VARIANTS' plain `hidden`
 *  when a note is saved. Three beats, straight up the middle:
 *  1. fold — the note flattens into a slim strip (CONTENT_VARIANTS) while an
 *     envelope pops in over it (ENVELOPE_VARIANTS)
 *  2. crouch — the whole panel dips a few px, like winding up
 *  3. launch — it shoots straight up, accelerating, and fades out
 *  Each variant's `times` are fractions of its own duration. */
const SENT_DURATION_S = 0.6;
const FOLD_DURATION_S = 0.26;
const ENVELOPE_POP_DURATION_S = 0.2;
const ENVELOPE_POP_DELAY_S = 0.14;
const SENT_EASES: Easing[] = ['linear', 'easeOut', 'easeIn'];
const CAPTURE_VARIANTS = {
  ...PANEL_VARIANTS,
  sent: {
    y: [0, 0, 7, -280],
    scale: [1, 1, 1, 0.7],
    opacity: [1, 1, 1, 0],
    transition: { duration: SENT_DURATION_S, times: [0, 0.4, 0.55, 1], ease: SENT_EASES },
  },
};
const CONTENT_VARIANTS = {
  sent: {
    scaleX: 0.45,
    scaleY: 0.08,
    opacity: [1, 1, 0],
    transition: { duration: FOLD_DURATION_S, times: [0, 0.7, 1], ease: 'easeInOut' as const },
  },
};
const ENVELOPE_VARIANTS = {
  hidden: { opacity: 0, scale: 0.5 },
  shown: { opacity: 0, scale: 0.5 },
  sent: {
    opacity: 1,
    scale: 1,
    transition: { duration: ENVELOPE_POP_DURATION_S, delay: ENVELOPE_POP_DELAY_S, ease: 'easeOut' as const },
  },
};
const ENVELOPE_WIDTH_PX = 112;
const ENVELOPE_HEIGHT_PX = 76;
const NO_VAULT_NOTICE = 'no vault open';
const SAVE_FAILED_NOTICE = "couldn't save — try again";

/** Every chip sits on opaque black so it stays legible over whatever app the
 *  transparent panel is floating above — same fill as the file searcher's
 *  header (FileSearcherHeader.tsx). */
const CHIP_CLASS = 'border bg-black px-2 py-0.5 leading-4 transition-colors duration-panel ease-panel';

function nextType(current: StickyNoteType): StickyNoteType {
  return TYPES[(TYPES.indexOf(current) + 1) % TYPES.length];
}

/** A flat outlined envelope, drawn in the same white-on-black as the chips. */
function Envelope() {
  const w = ENVELOPE_WIDTH_PX;
  const h = ENVELOPE_HEIGHT_PX;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="black" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
      <rect x={1} y={1} width={w - 2} height={h - 2} />
      <polyline points={`1,1 ${w / 2},${h * 0.58} ${w - 1},1`} fill="none" />
    </svg>
  );
}

/**
 * The entire content of the "capture" window (see
 * src-tauri/src/commands/popup_panel.rs) — the same kind of transparent,
 * non-activating, always-on-top popup as the file searcher, separate from
 * the main Auxin window so it can float above every other app. Built once at
 * startup and only ever shown/hidden (never closed), by the global shortcut
 * handler in the main window and by its own blur/Escape/save handling.
 *
 * Keyboard-only: type, Enter saves, Shift+Enter adds a line, Tab flips
 * between a note and a checklist, Escape dismisses. Saving goes through
 * saveCapture.ts, which talks to the database directly (this window has its
 * own JS runtime).
 */
export function CaptureWindow() {
  const [type, setType] = useState<StickyNoteType>('text');
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped on every hide — a React `key` on the panel so the next open starts
  // from a clean remount rather than an animated reset (which also snaps the
  // panel back from the "sent" flight pose). See FileSearcherOverlay.tsx.
  const [sessionId, setSessionId] = useState(0);
  // True from a successful save until the "sent" outro settles.
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  // Drives PANEL_VARIANTS. Mirrored into a ref so an outro's completion can
  // tell whether a reopen interrupted it (see handlePanelAnimationComplete).
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const isPanelVisibleRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setPanelVisible = useCallback((isVisible: boolean) => {
    isPanelVisibleRef.current = isVisible;
    setIsPanelVisible(isVisible);
  }, []);

  // Orders the panel out once either outro (`hidden` or `sent`) settles, and
  // resets the session while the content is already fully transparent, so
  // that remount is never seen.
  const handlePanelAnimationComplete = useCallback((definition: unknown) => {
    if ((definition !== 'hidden' && definition !== 'sent') || isPanelVisibleRef.current) return;
    isSendingRef.current = false;
    setIsSending(false);
    setSessionId((id) => id + 1);
    setType('text');
    setText('');
    setNotice(null);
    hidePopupPanel('capture');
  }, []);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        // Losing focus plays the outro — handlePanelAnimationComplete hides.
        // Ignored mid-"sent": that outro is already on its way out.
        if (!isSendingRef.current) setPanelVisible(focused);
      })
      .then((fn) => {
        // StrictMode runs this effect's cleanup before registration resolves;
        // unregister right away rather than leaking a second listener.
        if (isDisposed) fn();
        else unlisten = fn;
      });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [setPanelVisible]);

  // Grows with its content up to a cap, then scrolls. A layout effect, and
  // `overflow` only switched on past the cap, so the measure-then-set never
  // paints a scrollbar in between.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, MAX_INPUT_HEIGHT_PX)}px`;
    textarea.style.overflowY = contentHeight > MAX_INPUT_HEIGHT_PX ? 'auto' : 'hidden';
  }, [text, sessionId]);

  async function handleSubmit() {
    if (isSendingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setPanelVisible(false);
      return;
    }

    try {
      const result = await saveCapture(type, trimmed);
      if (result === 'no-vault') {
        setNotice(NO_VAULT_NOTICE);
        return;
      }
      isSendingRef.current = true;
      setIsSending(true);
      setPanelVisible(false);
    } catch (error: unknown) {
      console.error('Failed to save captured note', error);
      setNotice(SAVE_FAILED_NOTICE);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSendingRef.current) {
      event.preventDefault();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setPanelVisible(false);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setType(nextType(type));
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <motion.div
      key={sessionId}
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden p-6 font-sans"
      variants={CAPTURE_VARIANTS}
      initial={false}
      animate={isSending ? 'sent' : isPanelVisible ? 'shown' : 'hidden'}
      onAnimationComplete={handlePanelAnimationComplete}
    >
      <motion.div variants={CONTENT_VARIANTS} className="flex w-full flex-col items-center gap-3">
        <div className="flex items-center gap-1.5" style={{ fontSize: '0.72rem' }}>
          {TYPES.map((option) => (
            <span
              key={option}
              className={`${CHIP_CLASS} ${
                option === type ? 'border-white/80 text-white' : 'border-white/25 text-white/40'
              }`}
            >
              {TYPE_LABELS[option]}
            </span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          // Focused by mounting, not by a `.focus()` call once the panel is
          // key: the textarea is remounted while the panel is hidden (see
          // `sessionId`), and calling `.focus()` on an editable element of a
          // key non-activating panel made WebKit activate the whole app —
          // which then raised "main" when the panel hid.
          autoFocus
          value={text}
          rows={3}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setNotice(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDERS[type]}
          className="w-full resize-none overflow-hidden border border-white/80 bg-black px-3 py-2 leading-5 text-white outline-none placeholder:text-white/35"
          style={{ fontSize: '0.85rem', maxHeight: MAX_INPUT_HEIGHT_PX }}
        />
        <span
          className={`${CHIP_CLASS} ${notice ? 'border-white/80 text-white' : 'border-transparent text-white/35'}`}
          style={{ fontSize: '0.68rem' }}
        >
          {notice ?? 'enter save · shift+enter new line · tab type · esc dismiss'}
        </span>
      </motion.div>
      <motion.div
        variants={ENVELOPE_VARIANTS}
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <Envelope />
      </motion.div>
    </motion.div>
  );
}
