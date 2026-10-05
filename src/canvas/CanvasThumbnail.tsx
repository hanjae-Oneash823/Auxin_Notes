import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseCanvasDocument } from '../vault/parseCanvas';
import type { CanvasCardContent, CanvasDocument } from '../vault/canvasTypes';
import { groupFrames } from './groupGeometry';
import { layoutMinimap, unionRects } from './minimapGeometry';

const THUMB_W = 240;
const THUMB_H = 150;
const THUMB_PADDING_PX = 8;

/** A card's stand-in color in the miniature: the same hues as the real cards. */
function tint(content: CanvasCardContent): string {
  switch (content.type) {
    case 'sticky':
      return 'var(--accent-warning)';
    case 'warning':
      return 'var(--accent-link-broken)';
    case 'note':
    case 'canvas':
      return 'var(--accent-link)';
    case 'pdf':
      return 'var(--accent-link-broken)';
    default:
      return 'var(--fg-muted)';
  }
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; doc: CanvasDocument };

/** A live miniature of another canvas, read once when the card mounts (so an
 *  edit made elsewhere shows after the card is next opened). */
export function CanvasThumbnail({ vaultRoot, path }: { vaultRoot: string; path: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    invoke<string>('read_note', { path: `${vaultRoot}/${path}` })
      .then((raw) => {
        if (!cancelled) setState({ status: 'ready', doc: parseCanvasDocument(raw) });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, path]);

  const frame = { width: THUMB_W, height: THUMB_H };
  const caption = state.status === 'loading' ? 'loading…' : state.status === 'error' ? 'canvas not found' : state.doc.cards.length === 0 ? 'empty canvas' : null;
  if (state.status !== 'ready' || state.doc.cards.length === 0) {
    return (
      <div className="mx-2.5 mb-2 flex items-center justify-center border text-fg-faint" style={{ ...frame, borderColor: 'var(--border-default)', fontSize: '0.78rem' }}>
        {caption}
      </div>
    );
  }

  const { cards, arrows, groups } = state.doc;
  const map = layoutMinimap(unionRects(cards), { w: THUMB_W, h: THUMB_H }, THUMB_PADDING_PX);
  const centers = new Map(cards.map((c) => [c.id, map.toMapPoint({ x: c.x + c.w / 2, y: c.y + c.h / 2 })]));
  return (
    <svg className="mx-2.5 mb-2 block border" style={{ ...frame, borderColor: 'var(--border-default)' }} viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} aria-hidden>
      {[...groupFrames(cards, groups).values()].map((rect, i) => {
        const r = map.toMapRect(rect);
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="var(--accent-link)" strokeOpacity={0.5} strokeDasharray="3 2" />;
      })}
      {arrows.map((a) => {
        const from = centers.get(a.fromCardId);
        const to = centers.get(a.toCardId);
        return from && to ? <line key={a.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--fg-faint)" strokeWidth={1} /> : null;
      })}
      {cards.map((c) => {
        const r = map.toMapRect(c);
        return <rect key={c.id} x={r.x} y={r.y} width={Math.max(r.w, 3)} height={Math.max(r.h, 3)} fill={tint(c.content)} fillOpacity={0.55} />;
      })}
    </svg>
  );
}
