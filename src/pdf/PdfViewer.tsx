import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  ArrowsOutLineHorizontal,
  CaretDown,
  CaretUp,
  CircleHalf,
  FolderOpen,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  X,
} from '@phosphor-icons/react';
import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { ContextMenu } from '../layout/ContextMenu';
import { PacketIconButton } from '../layout/SidebarPacket';
import { usePanelLayoutStore } from '../layout/panelLayoutStore';
import { hasWindowChrome } from '../layout/WindowChrome';
import { countPageMatches, highlightSpans, locateMatch } from './pdfSearch';

GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOM_STEP = 1.2;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const PAGE_GAP_PX = 12;
const RESIZE_THROTTLE_MS = 90;
/** Height of the macOS floating-controls strip (WindowChrome's `h-9`). */
const CHROME_STRIP_REM = 2.25;
const SIDE_PADDING_PX = 16;
/** Room for the scrollbar so "fit width" never causes a horizontal scroll. */
const SCROLLBAR_ALLOWANCE_PX = 12;
/** Render pages this far outside the viewport so scrolling never shows blanks. */
const RENDER_MARGIN_PX = 800;
// White pages on a black app are glaring — a plain CSS invert reads as "dark mode".
const INVERT_FILTER = 'invert(0.92) hue-rotate(180deg)';

/** Zoom per PDF path, kept for the session so switching tabs (which unmounts
 *  the viewer) doesn't reset it. Deliberately not persisted across launches. */
const zoomByPath = new Map<string, number>();

interface PageSize {
  width: number;
  height: number;
}

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  /** Page size at scale 1 — the first page's, until this page reports its own. */
  baseSize: PageSize;
  scroller: HTMLDivElement | null;
  isInverted: boolean;
  /** Active search text ('' = none) and which of this page's hits is the current one. */
  query: string;
  currentOrdinal: number | null;
  /** Bumped on every search navigation so the current hit scrolls into view once per jump. */
  focusNonce: number;
  onContextMenu: (event: ReactMouseEvent, page: number) => void;
}

/** One page: a fixed-size slot that only holds a rendered canvas while it is
 *  near the viewport, so a long document never keeps hundreds of canvases. */
function PdfPage({ doc, pageNumber, scale, baseSize, scroller, isInverted, query, currentOrdinal, focusNonce, onContextMenu }: PdfPageProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const spansRef = useRef<HTMLElement[]>([]);
  const lastFocusRef = useRef(0);
  const [textVersion, setTextVersion] = useState(0);
  const [isNear, setIsNear] = useState(false);
  const [ownSize, setOwnSize] = useState<PageSize | null>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !scroller) return;
    const observer = new IntersectionObserver(([entry]) => setIsNear(entry.isIntersecting), {
      root: scroller,
      rootMargin: `${RENDER_MARGIN_PX}px 0px`,
    });
    observer.observe(slot);
    return () => observer.disconnect();
  }, [scroller]);

  useEffect(() => {
    if (!isNear) return;
    let isCancelled = false;
    const cancels: (() => void)[] = [];

    async function render() {
      const page = await doc.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (isCancelled || !canvas) return;
      const natural = page.getViewport({ scale: 1 });
      setOwnSize({ width: natural.width, height: natural.height });
      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * pixelRatio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const task = page.render({ canvas, viewport });
      cancels.push(() => task.cancel());
      await Promise.all([task.promise, renderText(page)]);
    }

    /** Invisible, selectable text laid over the canvas (copy + search hits). */
    async function renderText(page: PDFPageProxy) {
      const container = textRef.current;
      if (!container) return;
      container.replaceChildren();
      container.style.setProperty('--total-scale-factor', `${scale}`);
      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: page.getViewport({ scale }),
      });
      cancels.push(() => textLayer.cancel());
      await textLayer.render();
      if (isCancelled) return;
      spansRef.current = textLayer.textDivs;
      setTextVersion((version) => version + 1);
    }

    render().catch((error: unknown) => {
      // A cancelled render (zoom changed / scrolled away) is expected, not a failure.
      if (error instanceof Error && error.name === 'RenderingCancelledException') return;
      console.error(`[pdf] failed to render page ${pageNumber}`, error);
    });
    return () => {
      isCancelled = true;
      spansRef.current = [];
      cancels.forEach((cancel) => cancel());
    };
  }, [doc, pageNumber, scale, isNear]);

  useEffect(() => {
    const mark = highlightSpans(spansRef.current, query, currentOrdinal);
    if (!mark || focusNonce === lastFocusRef.current) return;
    lastFocusRef.current = focusNonce;
    mark.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [query, currentOrdinal, focusNonce, textVersion]);

  const size = ownSize ?? baseSize;
  return (
    <div
      ref={slotRef}
      data-page={pageNumber}
      onContextMenu={(event) => onContextMenu(event, pageNumber)}
      className="relative shrink-0 bg-white shadow-[0_0_0_1px_var(--border-subtle)]"
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      {isNear && (
        <>
          <canvas
            ref={canvasRef}
            className="block h-full w-full"
            style={{ filter: isInverted ? INVERT_FILTER : undefined }}
          />
          <div ref={textRef} className="pdf-text-layer" />
        </>
      )}
    </div>
  );
}

interface PdfViewerProps {
  /** Absolute path of the PDF. */
  path: string;
  /** Extra controls at the toolbar's right edge (e.g. "+ add note"). */
  children?: ReactNode;
  /** The viewer spans to the window's right edge (no note pane beside it). */
  reachesRightEdge: boolean;
  /** Scrolls smoothly to `page` each time `nonce` changes (note anchors drive this). */
  scrollTarget?: { page: number; nonce: number } | null;
  /** Adds "create anchor" to the page right-click menu; omit to hide it. */
  onCreateAnchor?: (page: number) => void;
}

/** Dark, app-styled PDF viewer (pdf.js draws the pages; everything around
 *  them is ours). View-only — no annotation, no text layer. Zoom is a
 *  multiplier on the fit-to-width scale, so resizing the pane keeps "fit". */
export function PdfViewer({ path, children, reachesRightEdge, scrollTarget, onCreateAnchor }: PdfViewerProps) {
  // On macOS the window has no header: the [auxin] label + left toggle float
  // over the top-left while the left panel is closed, and the right toggle
  // floats over the top-right while the right panel is closed (WindowChrome.tsx).
  // Drop the toolbar below that strip only when one of them would sit on it.
  const isLeftOpen = usePanelLayoutStore((state) => state.isLeftSidebarOpen);
  const isRightOpen = usePanelLayoutStore((state) => state.isRightSidebarOpen);
  const needsChromeStrip = hasWindowChrome() && (!isLeftOpen || (!isRightOpen && reachesRightEdge));
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [baseSize, setBaseSize] = useState<PageSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(() => zoomByPath.get(path) ?? 1);
  const [isInverted, setIsInverted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const scrollRatioRef = useRef(0);
  const pageTextsRef = useRef<Promise<string[][]> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    setDoc(null);
    setError(null);
    setZoom(zoomByPath.get(path) ?? 1);
    setCurrentPage(1);
    scrollRatioRef.current = 0;
    pageTextsRef.current = null;
    setCounts([]);
    const task = getDocument({ url: convertFileSrc(path) });
    task.promise
      .then(async (loaded) => {
        const first = await loaded.getPage(1);
        if (isCancelled) return;
        const viewport = first.getViewport({ scale: 1 });
        setBaseSize({ width: viewport.width, height: viewport.height });
        setDoc(loaded);
      })
      .catch((cause: unknown) => {
        if (!isCancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      isCancelled = true;
      void task.destroy();
    };
  }, [path]);

  useEffect(() => {
    if (!scroller) return;
    // Throttled: a re-fit re-renders the visible pages, and this fires every
    // frame while the note pane animates or the divider is dragged.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latestWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      latestWidth = entry.contentRect.width;
      timer ??= setTimeout(() => {
        timer = null;
        setContainerWidth(latestWidth);
      }, RESIZE_THROTTLE_MS);
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [scroller]);

  const fitScale =
    baseSize && containerWidth > 0
      ? (containerWidth - SIDE_PADDING_PX * 2 - SCROLLBAR_ALLOWANCE_PX) / baseSize.width
      : 0;
  const scale = fitScale * zoom;

  // Keep the reading position when the scale changes (zoom buttons, pane resize).
  useLayoutEffect(() => {
    if (scroller) scroller.scrollTop = scrollRatioRef.current * scroller.scrollHeight;
  }, [scroller, scale]);

  function handleScroll() {
    if (!scroller) return;
    scrollRatioRef.current = scroller.scrollTop / scroller.scrollHeight;
    const probe = scroller.scrollTop + scroller.clientHeight / 3;
    let page = 1;
    for (const slot of Array.from(scroller.querySelectorAll<HTMLElement>('[data-page]'))) {
      if (slot.offsetTop > probe) break;
      page = Number(slot.dataset.page);
    }
    setCurrentPage(page);
  }

  const activeQuery = query.trim() ? query : '';
  const totalMatches = counts.reduce((sum, count) => sum + count, 0);
  const located = useMemo(() => locateMatch(counts, matchIndex), [counts, matchIndex]);

  /** Every page's text-item strings, extracted once per document on first search. */
  function loadPageTexts(loaded: PDFDocumentProxy): Promise<string[][]> {
    pageTextsRef.current ??= Promise.all(
      Array.from({ length: loaded.numPages }, async (_, index) => {
        const content = await (await loaded.getPage(index + 1)).getTextContent();
        return content.items.flatMap((item) => ('str' in item ? [item.str] : []));
      }),
    );
    return pageTextsRef.current;
  }

  useEffect(() => {
    if (!doc || !activeQuery) {
      setCounts([]);
      return;
    }
    let isCancelled = false;
    loadPageTexts(doc)
      .then((pages) => {
        if (isCancelled) return;
        setCounts(countPageMatches(pages, activeQuery));
        setMatchIndex(0);
        setFocusNonce((nonce) => nonce + 1);
      })
      .catch((cause: unknown) => console.error('[pdf] search failed', cause));
    return () => {
      isCancelled = true;
    };
  }, [doc, activeQuery]);

  function scrollToPage(page: number, isSmooth = false) {
    const slot = scroller?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (scroller && slot) scroller.scrollTo({ top: slot.offsetTop - PAGE_GAP_PX, behavior: isSmooth ? 'smooth' : 'auto' });
  }

  const isLaidOut = scale > 0;
  useEffect(() => {
    if (scrollTarget && isLaidOut) scrollToPage(scrollTarget.page, true);
  }, [scrollTarget, isLaidOut]);

  const [menu, setMenu] = useState<{ x: number; y: number; page: number; selection: string } | null>(null);
  function handlePageContextMenu(event: ReactMouseEvent, page: number) {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, page, selection: window.getSelection()?.toString() ?? '' });
  }
  const menuItems = menu
    ? [
        ...(menu.selection
          ? [{ label: 'copy', onSelect: () => void navigator.clipboard.writeText(menu.selection) }]
          : []),
        ...(onCreateAnchor ? [{ label: `create anchor · p.${menu.page}`, onSelect: () => onCreateAnchor(menu.page) }] : []),
      ]
    : [];

  // Bring the current hit's page into view. An already-rendered page scrolls to
  // the exact mark itself (PdfPage); this covers pages not rendered yet, which
  // then scroll to the mark as soon as their text layer appears.
  useEffect(() => {
    if (!located || scroller?.querySelector('.pdf-hit-current')) return;
    scrollToPage(located.page);
  }, [located, focusNonce]);

  function goToPage(raw: string) {
    const page = Number(raw);
    if (!doc || !Number.isInteger(page)) return;
    scrollToPage(Math.min(doc.numPages, Math.max(1, page)));
  }

  function stepMatch(delta: number) {
    if (totalMatches === 0) return;
    setMatchIndex((index) => (index + delta + totalMatches) % totalMatches);
    setFocusNonce((nonce) => nonce + 1);
  }

  function closeSearch() {
    setIsSearchOpen(false);
    setQuery('');
  }

  function updateZoom(next: number) {
    zoomByPath.set(path, next);
    setZoom(next);
  }

  function zoomBy(factor: number) {
    updateZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor)));
  }

  // Pinch / Cmd+scroll zooms; a plain wheel scrolls. Non-passive so it can preventDefault.
  useEffect(() => {
    if (!scroller) return;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    }
    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', handleWheel);
  }, [scroller, zoom, path]);

  return (
    <div
      tabIndex={-1}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
          event.preventDefault();
          setIsSearchOpen(true);
          searchInputRef.current?.select();
        }
      }}
      className="flex h-full min-w-0 flex-1 flex-col bg-bg outline-none"
    >
      <div
        data-tauri-drag-region
        className="shrink-0 transition-[height] duration-panel ease-panel"
        style={{ height: needsChromeStrip ? `${CHROME_STRIP_REM}rem` : 0 }}
      />
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border-subtle px-2 py-1">
        <PacketIconButton title="zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} isDisabled={!doc}>
          <MagnifyingGlassMinus size={15} />
        </PacketIconButton>
        <span className="w-10 text-center text-fg-muted" style={{ fontSize: '0.72rem' }}>
          {doc ? `${Math.round(scale * 100)}%` : ''}
        </span>
        <PacketIconButton title="zoom in" onClick={() => zoomBy(ZOOM_STEP)} isDisabled={!doc}>
          <MagnifyingGlassPlus size={15} />
        </PacketIconButton>
        <PacketIconButton title="fit width" onClick={() => updateZoom(1)} isDisabled={!doc}>
          <ArrowsOutLineHorizontal size={15} />
        </PacketIconButton>
        <PacketIconButton title={isInverted ? 'normal colors' : 'invert colors'} onClick={() => setIsInverted((value) => !value)}>
          <CircleHalf size={15} weight={isInverted ? 'fill' : 'regular'} />
        </PacketIconButton>
        <PacketIconButton title="find in pdf" onClick={() => setIsSearchOpen((isOpen) => !isOpen)} isDisabled={!doc}>
          <MagnifyingGlass size={15} weight={isSearchOpen ? 'bold' : 'regular'} />
        </PacketIconButton>
        <PacketIconButton title="reveal in finder" onClick={() => void revealItemInDir(path)}>
          <FolderOpen size={15} />
        </PacketIconButton>
        {doc && (
          <span className="ml-2 flex items-center gap-1 text-fg-faint" style={{ fontSize: '0.72rem' }}>
            <input
              aria-label="page number"
              value={pageDraft ?? String(currentPage)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setPageDraft(event.target.value)}
              onBlur={() => setPageDraft(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') goToPage(pageDraft ?? '');
                if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
              }}
              className="w-8 border-b border-transparent bg-transparent text-center text-fg-muted outline-none focus:border-border-strong"
            />
            / {doc.numPages}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">{children}</div>
      </div>
      {isSearchOpen && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-1">
          <input
            ref={searchInputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') stepMatch(event.shiftKey ? -1 : 1);
              if (event.key === 'Escape') closeSearch();
            }}
            placeholder="find in pdf"
            className="min-w-0 flex-1 bg-transparent text-fg-prominent outline-none placeholder:text-fg-faint"
            style={{ fontSize: '0.78rem' }}
          />
          <span className="text-fg-faint" style={{ fontSize: '0.72rem' }}>
            {activeQuery ? `${totalMatches === 0 ? 0 : matchIndex + 1} / ${totalMatches}` : ''}
          </span>
          <PacketIconButton title="previous match" onClick={() => stepMatch(-1)} isDisabled={totalMatches === 0}>
            <CaretUp size={14} />
          </PacketIconButton>
          <PacketIconButton title="next match" onClick={() => stepMatch(1)} isDisabled={totalMatches === 0}>
            <CaretDown size={14} />
          </PacketIconButton>
          <PacketIconButton title="close search" onClick={closeSearch}>
            <X size={14} />
          </PacketIconButton>
        </div>
      )}
      <div
        ref={setScroller}
        onScroll={handleScroll}
        className="pdf-scroll relative flex min-h-0 flex-1 flex-col items-center overflow-auto"
        style={{ gap: PAGE_GAP_PX, padding: `${PAGE_GAP_PX}px ${SIDE_PADDING_PX}px` }}
      >
        {error && (
          <span className="mt-6 text-accent-link-broken" style={{ fontSize: '0.8rem' }}>
            [couldn't open this PDF: {error}]
          </span>
        )}
        {!doc && !error && (
          <span className="mt-6 text-fg-faint" style={{ fontSize: '0.8rem' }}>
            loading…
          </span>
        )}
        {doc &&
          baseSize &&
          scale > 0 &&
          Array.from({ length: doc.numPages }, (_, index) => (
            <PdfPage
              key={index + 1}
              doc={doc}
              pageNumber={index + 1}
              scale={scale}
              baseSize={baseSize}
              scroller={scroller}
              isInverted={isInverted}
              query={activeQuery}
              currentOrdinal={located?.page === index + 1 ? located.ordinal : null}
              focusNonce={focusNonce}
              onContextMenu={handlePageContextMenu}
            />
          ))}
      </div>
      {menu && menuItems.length > 0 && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
