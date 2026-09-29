import { AvoidLib, type Avoid } from 'libavoid-js';
import wasmUrl from '../../node_modules/libavoid-js/dist/libavoid.wasm?url';

let loading: Promise<Avoid | null> | null = null;

/** Loads libavoid's WebAssembly once and resolves to the library, or to null
 *  if it can't load — callers fall back to the built-in router (`arrowRouting.ts`),
 *  so a failure here costs route quality, never a working canvas. */
export function loadLibavoid(): Promise<Avoid | null> {
  loading ??= AvoidLib.load(wasmUrl)
    .then(() => AvoidLib.getInstance())
    .catch((error: unknown) => {
      console.error('libavoid failed to load; using the built-in arrow router', error);
      return null;
    });
  return loading;
}
