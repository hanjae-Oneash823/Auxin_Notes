import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, keymap } from '@codemirror/view';
import { Autolink, Table } from '@lezer/markdown';
import { createBareUrlPlugin } from './bareUrlPlugin';
import { resolveCodeLanguage } from './codeLanguages';
import { createHeadingFoldPlugin } from './headingFoldPlugin';
import { createHideSyntaxPlugin } from './hideSyntaxPlugin';
import { createImageDropPastePlugin } from './imageDropPastePlugin';
import { createImageWidgetPlugin } from './imageWidget';
import { createLinkChipPlugin } from './linkChipWidget';
import { createListEditingKeymap } from './listEditing';
import { createMarkdownLinkPlugin } from './markdownLinkPlugin';
import { createMathPlugin } from './mathPlugin';
import { createSlashCommandPlugin } from './slashCommandPlugin';
import { createSmoothWheelPlugin } from './smoothWheelPlugin';
import { createTablePlugin } from './tablePlugin';
import { createTagChipPlugin } from './tagChipWidget';
import { auxinEditorTheme, auxinSyntaxHighlighting } from './theme';
import { createWikilinkAutocomplete } from './wikilinkAutocomplete';

/** Image paths are vault-root-relative (all pasted/dropped/picked images
 *  land in a single vault-wide `attachments/` folder), not note-relative —
 *  so this resolves against `vaultRoot` regardless of the note's own
 *  location in the folder tree. */
function resolveImagePath(vaultRoot: string, url: string): string {
  if (url.startsWith('/') || /^[a-z]+:/i.test(url)) return url;
  return `${vaultRoot}/${url}`;
}

/**
 * Baseline extension set for a prose markdown editor — deliberately not
 * CodeMirror's `basicSetup` bundle (that's code-editor-shaped: line numbers,
 * fold gutters, search panel chrome none of which belong in a notes editor).
 */
export function markdownSetup(
  vaultRoot: string,
  onNavigate: (path: string) => void,
  readOnly: boolean,
): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    EditorState.allowMultipleSelections.of(true),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.lineWrapping,
    createSmoothWheelPlugin(),
    createListEditingKeymap(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    // `Autolink` (GFM's bare-URL/email detection, not just the base
    // `<https://...>` angle-bracket form) — bareUrlPlugin.ts styles and
    // makes clickable the `URL` nodes it produces.
    markdown({ codeLanguages: resolveCodeLanguage, extensions: [Autolink, Table] }),
    auxinSyntaxHighlighting,
    createHideSyntaxPlugin(readOnly),
    createHeadingFoldPlugin(),
    createImageWidgetPlugin((url) => resolveImagePath(vaultRoot, url), readOnly),
    createMathPlugin(readOnly),
    createTablePlugin(readOnly),
    createLinkChipPlugin(vaultRoot, onNavigate, readOnly),
    createTagChipPlugin(readOnly),
    createBareUrlPlugin(readOnly),
    createMarkdownLinkPlugin(readOnly),
    // Editing-only affordances — pointless (and inert, since readOnly blocks
    // any change they'd try to make) when the doc can't be edited.
    ...(readOnly
      ? []
      : [createWikilinkAutocomplete(vaultRoot), createSlashCommandPlugin(), createImageDropPastePlugin(vaultRoot)]),
    auxinEditorTheme,
  ];
}
