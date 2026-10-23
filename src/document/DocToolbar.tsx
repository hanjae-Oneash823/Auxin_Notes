import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import {
  ArrowCounterClockwise, ArrowUUpLeft, ArrowUUpRight, Crop, FilePdf, Highlighter, Image as ImageIcon, LinkSimple, ListBullets,
  ListNumbers, Minus, Plus, Table as TableIcon, TextAlignCenter, TextAlignJustify, TextAlignLeft, TextAlignRight, TextB,
  TextItalic, TextStrikethrough, TextSubscript, TextSuperscript, TextUnderline,
} from '@phosphor-icons/react';
import { MARGIN_PX, PAPER_SIZES, type DocPageSettings, type MarginId, type PaperSizeId } from '../vault/docTypes';
import { useCropMode, type DocImageAttrs, type ImageAlign } from './DocImage';
import { resetCrop } from './cropMath';

const DEFAULT_FONT_PT = 11;
const MIN_FONT_PT = 6;
const MAX_FONT_PT = 200;
const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Inter'];
const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5'];
const IMAGE_WIDTH_PRESETS = [25, 50, 75, 100];
const ICON = 16;

interface ToolButtonProps {
  title: string;
  onClick: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  children: ReactNode;
}

function ToolButton({ title, onClick, isActive = false, isDisabled = false, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      disabled={isDisabled}
      // Keep the editor's selection: a toolbar click must not steal focus.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-6 min-w-6 items-center justify-center rounded-row px-1 transition-colors enabled:hover:bg-border-subtle disabled:opacity-30 ${
        isActive ? 'bg-border-subtle text-accent-link' : 'text-fg-muted enabled:hover:text-fg-prominent'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-4 w-px shrink-0" style={{ backgroundColor: 'var(--border-strong)' }} />;

const selectClass = 'h-6 rounded-row border bg-transparent px-1 text-fg-prominent outline-none';
const selectStyle = { borderColor: 'var(--border-default)', fontSize: '0.75rem' } as const;

interface ToolbarState {
  canUndo: boolean; canRedo: boolean;
  isBold: boolean; isItalic: boolean; isUnderline: boolean; isStrike: boolean; isSub: boolean; isSuper: boolean;
  isBullet: boolean; isOrdered: boolean; isLink: boolean; isHighlight: boolean;
  align: string; fontSize: number; fontFamily: string; heading: number; lineHeight: string;
  color: string; isTable: boolean; image: DocImageAttrs | null;
}

function readState(editor: Editor): ToolbarState {
  const text = editor.getAttributes('textStyle') as { fontSize?: string; fontFamily?: string; color?: string; lineHeight?: string };
  const selected = editor.state.selection as { node?: { type: { name: string }; attrs: unknown } };
  const isImage = selected.node?.type.name === 'docImage';
  return {
    canUndo: editor.can().undo(), canRedo: editor.can().redo(),
    isBold: editor.isActive('bold'), isItalic: editor.isActive('italic'), isUnderline: editor.isActive('underline'),
    isStrike: editor.isActive('strike'), isSub: editor.isActive('subscript'), isSuper: editor.isActive('superscript'),
    isBullet: editor.isActive('bulletList'), isOrdered: editor.isActive('orderedList'), isLink: editor.isActive('link'),
    isHighlight: editor.isActive('highlight'),
    align: (['center', 'right', 'justify'].find((value) => editor.isActive({ textAlign: value })) ?? 'left'),
    fontSize: parseFloat(text.fontSize ?? '') || DEFAULT_FONT_PT,
    fontFamily: text.fontFamily ?? '',
    heading: [1, 2, 3].find((level) => editor.isActive('heading', { level })) ?? 0,
    lineHeight: text.lineHeight ?? '',
    color: text.color ?? '#202124',
    isTable: editor.isActive('table'),
    image: isImage ? ((selected.node as { attrs: unknown }).attrs as DocImageAttrs) : null,
  };
}

interface DocToolbarProps {
  editor: Editor;
  page: DocPageSettings;
  onPageChange: (page: DocPageSettings) => void;
  onInsertImage: () => void;
  onExportPdf: () => void;
}

export function DocToolbar({ editor, page, onPageChange, onInsertImage, onExportPdf }: DocToolbarProps) {
  const state = useEditorState({ editor, selector: ({ editor: current }) => readState(current) });
  const isCropping = useCropMode((store) => store.isCropping);
  const setCropping = useCropMode((store) => store.setCropping);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const run = () => editor.chain().focus();
  const setFontSize = (pt: number) => run().setFontSize(`${Math.min(MAX_FONT_PT, Math.max(MIN_FONT_PT, Math.round(pt)))}pt`).run();

  function applyLink() {
    const href = (linkDraft ?? '').trim();
    if (href) run().extendMarkRange('link').setLink({ href }).run();
    else run().extendMarkRange('link').unsetLink().run();
    setLinkDraft(null);
  }

  function updateImage(patch: Partial<DocImageAttrs>) {
    editor.chain().focus().updateAttributes('docImage', patch).run();
  }

  /** Scales picture, frame and pan together so the frame ends up `percent`% of the text column. */
  function setImageWidth(image: DocImageAttrs, percent: number) {
    const style = getComputedStyle(editor.view.dom);
    const column = editor.view.dom.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const scale = (column * percent) / 100 / image.frameW;
    updateImage({
      imgW: image.imgW * scale, frameW: image.frameW * scale, frameH: image.frameH * scale,
      panX: image.panX * scale, panY: image.panY * scale,
    });
  }

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-b-border-subtle bg-bg-packet-card px-2 py-1" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-0.5">
        <ToolButton title="Undo (⌘Z)" onClick={() => run().undo().run()} isDisabled={!state.canUndo}><ArrowUUpLeft size={ICON} /></ToolButton>
        <ToolButton title="Redo (⇧⌘Z)" onClick={() => run().redo().run()} isDisabled={!state.canRedo}><ArrowUUpRight size={ICON} /></ToolButton>
        <Divider />
        <select
          title="Paragraph style" className={selectClass} style={selectStyle} value={state.heading}
          onChange={(event) => {
            const level = Number(event.target.value) as 0 | 1 | 2 | 3;
            if (level === 0) run().setParagraph().run(); else run().setHeading({ level }).run();
          }}
        >
          <option value={0}>Normal text</option>
          <option value={1}>Heading 1</option>
          <option value={2}>Heading 2</option>
          <option value={3}>Heading 3</option>
        </select>
        <select
          title="Font" className={selectClass} style={{ ...selectStyle, width: '7.5rem' }} value={state.fontFamily}
          onChange={(event) => (event.target.value ? run().setFontFamily(event.target.value).run() : run().unsetFontFamily().run())}
        >
          <option value="">Arial</option>
          {FONTS.filter((font) => font !== 'Arial').map((font) => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}
        </select>
        <ToolButton title="Smaller text" onClick={() => setFontSize(state.fontSize - 1)}><Minus size={12} /></ToolButton>
        <input
          key={state.fontSize} title="Font size (pt)" aria-label="Font size in points" defaultValue={state.fontSize}
          className={`${selectClass} w-9 text-center`} style={selectStyle} inputMode="numeric"
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const pt = Number(event.currentTarget.value); if (pt > 0) setFontSize(pt); } }}
          onBlur={(event) => { const pt = Number(event.currentTarget.value); if (pt > 0 && pt !== state.fontSize) setFontSize(pt); }}
        />
        <ToolButton title="Larger text" onClick={() => setFontSize(state.fontSize + 1)}><Plus size={12} /></ToolButton>
        <Divider />
        <ToolButton title="Bold (⌘B)" isActive={state.isBold} onClick={() => run().toggleBold().run()}><TextB size={ICON} /></ToolButton>
        <ToolButton title="Italic (⌘I)" isActive={state.isItalic} onClick={() => run().toggleItalic().run()}><TextItalic size={ICON} /></ToolButton>
        <ToolButton title="Underline (⌘U)" isActive={state.isUnderline} onClick={() => run().toggleUnderline().run()}><TextUnderline size={ICON} /></ToolButton>
        <ToolButton title="Strikethrough" isActive={state.isStrike} onClick={() => run().toggleStrike().run()}><TextStrikethrough size={ICON} /></ToolButton>
        <ToolButton title="Subscript" isActive={state.isSub} onClick={() => run().toggleSubscript().run()}><TextSubscript size={ICON} /></ToolButton>
        <ToolButton title="Superscript" isActive={state.isSuper} onClick={() => run().toggleSuperscript().run()}><TextSuperscript size={ICON} /></ToolButton>
        <label title="Text color" className="flex h-6 w-6 cursor-pointer items-center justify-center">
          <input type="color" value={state.color} className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0" onChange={(event) => run().setColor(event.target.value).run()} />
        </label>
        <label title="Highlight color" className="relative flex h-6 w-6 cursor-pointer items-center justify-center text-fg-muted">
          <Highlighter size={ICON} />
          <input type="color" defaultValue="#fff2a8" className="absolute h-0 w-0 opacity-0" onChange={(event) => run().setHighlight({ color: event.target.value }).run()} />
        </label>
        {state.isHighlight && <ToolButton title="Remove highlight" onClick={() => run().unsetHighlight().run()}><ArrowCounterClockwise size={12} /></ToolButton>}
        <Divider />
        {([['left', TextAlignLeft], ['center', TextAlignCenter], ['right', TextAlignRight], ['justify', TextAlignJustify]] as const).map(([value, Icon]) => (
          <ToolButton key={value} title={`Align ${value}`} isActive={state.align === value} onClick={() => run().setTextAlign(value).run()}><Icon size={ICON} /></ToolButton>
        ))}
        <select
          title="Line spacing" className={selectClass} style={selectStyle} value={state.lineHeight}
          onChange={(event) => (event.target.value ? run().setLineHeight(event.target.value).run() : run().unsetLineHeight().run())}
        >
          <option value="">Spacing</option>
          {LINE_HEIGHTS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <ToolButton title="Bulleted list" isActive={state.isBullet} onClick={() => run().toggleBulletList().run()}><ListBullets size={ICON} /></ToolButton>
        <ToolButton title="Numbered list" isActive={state.isOrdered} onClick={() => run().toggleOrderedList().run()}><ListNumbers size={ICON} /></ToolButton>
        <Divider />
        <ToolButton title="Link" isActive={state.isLink} onClick={() => setLinkDraft(linkDraft === null ? (editor.getAttributes('link') as { href?: string }).href ?? '' : null)}><LinkSimple size={ICON} /></ToolButton>
        <ToolButton title="Insert image" onClick={onInsertImage}><ImageIcon size={ICON} /></ToolButton>
        <ToolButton title="Insert table" onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={ICON} /></ToolButton>
        <div className="ml-auto flex items-center gap-1">
          <select title="Paper size" className={selectClass} style={selectStyle} value={page.size} onChange={(event) => onPageChange({ ...page, size: event.target.value as PaperSizeId })}>
            {Object.entries(PAPER_SIZES).map(([id, size]) => <option key={id} value={id}>{size.label}</option>)}
          </select>
          <select title="Orientation" className={selectClass} style={selectStyle} value={page.orientation} onChange={(event) => onPageChange({ ...page, orientation: event.target.value as DocPageSettings['orientation'] })}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
          <select title="Margins" className={selectClass} style={selectStyle} value={page.margin} onChange={(event) => onPageChange({ ...page, margin: event.target.value as MarginId })}>
            {(Object.keys(MARGIN_PX) as MarginId[]).map((id) => <option key={id} value={id}>{id[0].toUpperCase() + id.slice(1)} margins</option>)}
          </select>
          <ToolButton title="Export PDF — choose “Save as PDF” in the print dialog" onClick={onExportPdf}><FilePdf size={ICON} /></ToolButton>
        </div>
      </div>

      {linkDraft !== null && (
        <div className="flex items-center gap-1">
          <input
            autoFocus value={linkDraft} placeholder="https://… (empty removes the link)" className={`${selectClass} w-72`} style={selectStyle}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') applyLink(); if (event.key === 'Escape') setLinkDraft(null); }}
          />
          <ToolButton title="Apply link" onClick={applyLink}><span style={{ fontSize: '0.75rem' }}>Apply</span></ToolButton>
        </div>
      )}

      {state.isTable && (
        <div className="flex flex-wrap items-center gap-0.5 text-fg-muted" style={{ fontSize: '0.72rem' }}>
          <span className="mr-1 uppercase tracking-label">table</span>
          {([
            ['+ col left', () => run().addColumnBefore().run()], ['+ col right', () => run().addColumnAfter().run()],
            ['− col', () => run().deleteColumn().run()], ['+ row above', () => run().addRowBefore().run()],
            ['+ row below', () => run().addRowAfter().run()], ['− row', () => run().deleteRow().run()],
            ['merge', () => run().mergeCells().run()], ['split', () => run().splitCell().run()],
            ['header row', () => run().toggleHeaderRow().run()], ['delete table', () => run().deleteTable().run()],
          ] as const).map(([label, action]) => <ToolButton key={label} title={label} onClick={action}><span className="px-1">{label}</span></ToolButton>)}
        </div>
      )}

      {state.image && (
        <div className="flex flex-wrap items-center gap-0.5 text-fg-muted" style={{ fontSize: '0.72rem' }}>
          <span className="mr-1 uppercase tracking-label">image</span>
          {([['left', TextAlignLeft], ['center', TextAlignCenter], ['right', TextAlignRight]] as const).map(([value, Icon]) => (
            <ToolButton key={value} title={`Align ${value}`} isActive={state.image?.align === value} onClick={() => updateImage({ align: value as ImageAlign })}><Icon size={ICON} /></ToolButton>
          ))}
          <Divider />
          {IMAGE_WIDTH_PRESETS.map((percent) => (
            <ToolButton key={percent} title={`${percent}% of the text width`} onClick={() => state.image && setImageWidth(state.image, percent)}><span className="px-1">{percent}%</span></ToolButton>
          ))}
          <Divider />
          <ToolButton title="Crop — drag to pan, drag edges to trim" isActive={isCropping} onClick={() => setCropping(!isCropping)}><Crop size={ICON} /></ToolButton>
          <ToolButton title="Reset crop" onClick={() => state.image && updateImage(resetCrop(state.image))}><ArrowCounterClockwise size={ICON} /></ToolButton>
        </div>
      )}
    </div>
  );
}
