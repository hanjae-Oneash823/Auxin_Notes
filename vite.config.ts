import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Second page for the sticky-notes capture popup (its own always-on-top
  // Tauri window, see src-tauri/src/lib.rs) — a separate light entry so that
  // window doesn't have to load the whole main app bundle (CodeMirror,
  // three.js, xterm) just to show a tiny capture bar. Dev mode serves any
  // .html file with no config; production (`vite build`, used by
  // `tauri build`) needs both entries listed explicitly or it only emits
  // index.html.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        capture: resolve(__dirname, "capture.html"),
        filesearcher: resolve(__dirname, "filesearcher.html"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 4820,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 4821,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
