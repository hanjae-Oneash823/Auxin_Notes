const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'png';
}

/** Shared by anything that hands a pasted/drag-dropped `Blob` to the
 *  `save_image_data` Tauri command (`imageInsert.ts` for the note editor,
 *  `terminalImagePaste.ts` for the terminal) — both need the same
 *  base64-encoded bytes, since a `Blob` has no filesystem path to copy from
 *  directly. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
