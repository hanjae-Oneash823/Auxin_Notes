export interface FocusArrow {
  id: string;
  fromCardId: string;
  toCardId: string;
}

export interface SelectionFocus {
  /** The selected cards and the cards one arrow away from them. */
  cardIds: ReadonlySet<string>;
  /** The arrows that touch a selected card. */
  arrowIds: ReadonlySet<string>;
}

/** What stays fully visible when `selectedIds` are selected: the selection,
 *  its arrows, and the cards on the other end of those arrows. Everything else
 *  is dimmed. `null` when nothing is selected (nothing dims). */
export function selectionFocus(selectedIds: ReadonlySet<string>, arrows: readonly FocusArrow[]): SelectionFocus | null {
  if (selectedIds.size === 0) return null;
  const cardIds = new Set(selectedIds);
  const arrowIds = new Set<string>();
  for (const arrow of arrows) {
    if (!selectedIds.has(arrow.fromCardId) && !selectedIds.has(arrow.toCardId)) continue;
    arrowIds.add(arrow.id);
    cardIds.add(arrow.fromCardId);
    cardIds.add(arrow.toCardId);
  }
  return { cardIds, arrowIds };
}
