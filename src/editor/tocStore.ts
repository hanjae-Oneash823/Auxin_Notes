import { create } from 'zustand';

export interface TocHeading {
  level: number;
  text: string;
  /** Document position of the heading's content — where the TOC panel moves
   *  the cursor to when this entry is clicked. */
  pos: number;
}

interface TocState {
  headings: TocHeading[];
  setHeadings: (headings: TocHeading[]) => void;
  /** Document position of whatever's at the vertical middle of the editor's
   *  current scroll viewport — TocDots uses this (not the text cursor) to
   *  highlight the heading currently on screen, scrollspy-style. */
  activeAnchorPos: number;
  setActiveAnchorPos: (pos: number) => void;
}

/** Holds the heading outline of whichever note is currently open in the
 *  editor. Only one Editor is ever mounted at a time (App.tsx keys it by
 *  `activePath`, so switching tabs remounts rather than layering hidden
 *  instances) — Editor.tsx is this store's sole writer, publishing a fresh
 *  list on mount and on every doc change, and clearing it on unmount. */
export const useTocStore = create<TocState>((set) => ({
  headings: [],
  setHeadings: (headings) => set({ headings }),
  activeAnchorPos: 0,
  setActiveAnchorPos: (pos) => set({ activeAnchorPos: pos }),
}));
