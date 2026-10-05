import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ArcVisibilityState {
  /** Arc ids the field view dims; the key '__none__' stands for nodes with no arc. Kept across launches. */
  hiddenArcIds: string[];
  toggleArc: (id: string) => void;
}

export const useArcVisibilityStore = create<ArcVisibilityState>()(
  persist(
    (set) => ({
      hiddenArcIds: [],
      toggleArc: (id) => set((state) => ({ hiddenArcIds: state.hiddenArcIds.includes(id) ? state.hiddenArcIds.filter((other) => other !== id) : [...state.hiddenArcIds, id] })),
    }),
    { name: 'arc-visibility' },
  ),
);
