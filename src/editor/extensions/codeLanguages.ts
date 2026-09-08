import type { Language } from '@codemirror/language';
import { javascriptLanguage, jsxLanguage, tsxLanguage, typescriptLanguage } from '@codemirror/lang-javascript';
import { pythonLanguage } from '@codemirror/lang-python';
import { cssLanguage } from '@codemirror/lang-css';
import { jsonLanguage } from '@codemirror/lang-json';
import { rustLanguage } from '@codemirror/lang-rust';

const LANGUAGE_BY_ALIAS: Record<string, Language> = {
  js: javascriptLanguage,
  javascript: javascriptLanguage,
  jsx: jsxLanguage,
  ts: typescriptLanguage,
  typescript: typescriptLanguage,
  tsx: tsxLanguage,
  py: pythonLanguage,
  python: pythonLanguage,
  css: cssLanguage,
  json: jsonLanguage,
  rust: rustLanguage,
  rs: rustLanguage,
};

/** Maps a fenced code block's info string (the `js` in ` ```js `) to a
 *  language grammar for nested-parse syntax highlighting. Passed as
 *  `markdown()`'s `codeLanguages` option — an unrecognized or absent info
 *  string returns null, and the block just stays plain, unhighlighted text. */
export function resolveCodeLanguage(info: string): Language | null {
  return LANGUAGE_BY_ALIAS[info.trim().toLowerCase()] ?? null;
}
