import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { clampCropWindow, resizeCropWindow, scaleImageBox, type CropBox, type HandleDir } from './cropMath';

export type ImageAlign = 'left' | 'center' | 'right';

/** Attributes of a `docImage` node. `src` is vault-relative. The visible area is
 *  the frame (`frameW`×`frameH`); the picture is drawn `imgW` wide at (`panX`,`panY`)
 *  inside it — cropping only ever moves the frame and pan, never the file. */
export interface DocImageAttrs extends CropBox {
  src: string;
  ratio: number;
  align: ImageAlign;
}

/** Whether the selected image is in crop mode (toolbar toggles, node view reads). */
export const useCropMode = create<{ isCropping: boolean; setCropping: (value: boolean) => void }>((set) => ({
  isCropping: false,
  setCropping: (isCropping) => set({ isCropping }),
}));

const HANDLES: readonly HandleDir[] = [
  { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
];
const HANDLE_CURSOR: Record<string, string> = {
  '-1,-1': 'nwse-resize', '0,-1': 'ns-resize', '1,-1': 'nesw-resize', '-1,0': 'ew-resize',
  '1,0': 'ew-resize', '-1,1': 'nesw-resize', '0,1': 'ns-resize', '1,1': 'nwse-resize',
};
const JUSTIFY: Record<ImageAlign, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

function DocImageView({ node, updateAttributes, selected, extension }: NodeViewProps) {
  const attrs = node.attrs as DocImageAttrs;
  const vaultRoot = (extension.options as { vaultRoot: string }).vaultRoot;
  const isCropping = useCropMode((state) => state.isCropping) && selected;
  // While a drag is in flight the geometry lives here; it is committed once, on release,
  // so a drag is one undo step and one re-pagination rather than one per pointer move.
  const [draft, setDraft] = useState<CropBox | null>(null);
  const box: CropBox = draft ?? attrs;
  const dragRef = useRef<{ startX: number; startY: number; origin: CropBox; handle: HandleDir | null } | null>(null);

  function begin(event: ReactPointerEvent, handle: HandleDir | null) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: attrs, handle };
  }

  function move(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.handle === null) {
      setDraft(clampCropWindow({ ...drag.origin, panX: drag.origin.panX + dx, panY: drag.origin.panY + dy }));
    } else if (isCropping) {
      setDraft(resizeCropWindow(drag.origin, drag.handle, dx, dy));
    } else {
      setDraft(scaleImageBox(drag.origin, drag.handle, dx));
    }
  }

  function end() {
    if (draft) updateAttributes(draft);
    dragRef.current = null;
    setDraft(null);
  }

  return (
    <NodeViewWrapper className="doc-image" style={{ display: 'flex', justifyContent: JUSTIFY[attrs.align] }}>
      <div
        className={`doc-image-frame${selected ? ' is-selected' : ''}${isCropping ? ' is-cropping' : ''}`}
        style={{ width: box.frameW, height: box.frameH }}
        onPointerDown={isCropping ? (event) => begin(event, null) : undefined}
        onPointerMove={move}
        onPointerUp={end}
      >
        <div className="doc-image-clip">
          <img
            src={convertFileSrc(`${vaultRoot}/${attrs.src}`)}
            alt=""
            draggable={false}
            style={{ width: box.imgW, height: box.imgW * attrs.ratio, left: box.panX, top: box.panY }}
          />
        </div>
        {selected &&
          HANDLES.filter((handle) => isCropping || (handle.dx !== 0 && handle.dy !== 0)).map((handle) => (
            <span
              key={`${handle.dx},${handle.dy}`}
              className="doc-image-handle"
              style={{
                left: `${(handle.dx + 1) * 50}%`,
                top: `${(handle.dy + 1) * 50}%`,
                cursor: HANDLE_CURSOR[`${handle.dx},${handle.dy}`],
              }}
              onPointerDown={(event) => begin(event, handle)}
              onPointerMove={move}
              onPointerUp={end}
            />
          ))}
      </div>
    </NodeViewWrapper>
  );
}

const numberAttr = (name: string, fallback: number) => ({
  default: fallback,
  parseHTML: (element: HTMLElement) => Number(element.getAttribute(`data-${name}`)) || fallback,
  renderHTML: (attributes: Record<string, unknown>) => ({ [`data-${name}`]: String(attributes[name]) }),
});

export const DocImage = Node.create<{ vaultRoot: string }>({
  name: 'docImage',
  group: 'block',
  atom: true,
  draggable: true,
  addOptions: () => ({ vaultRoot: '' }),
  addAttributes: () => ({
    src: { default: '' },
    ratio: numberAttr('ratio', 1),
    imgW: numberAttr('img-w', 320),
    frameW: numberAttr('frame-w', 320),
    frameH: numberAttr('frame-h', 320),
    panX: numberAttr('pan-x', 0),
    panY: numberAttr('pan-y', 0),
    align: { default: 'left' },
  }),
  parseHTML: () => [{ tag: 'img[data-doc-image]' }],
  renderHTML: ({ HTMLAttributes }) => ['img', mergeAttributes(HTMLAttributes, { 'data-doc-image': '' })],
  addNodeView: () => ReactNodeViewRenderer(DocImageView),
});
