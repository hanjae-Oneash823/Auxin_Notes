/** Strips the markdown syntax an excerpt otherwise shows literally (a
 *  substring of raw note body — see getRecentNotesRich) — fence markers,
 *  heading hashes, list markers, emphasis markers, image embeds and links
 *  (down to their alt/link text), and wikilinks (down to their target) —
 *  so a preview reads as prose, not source. Not a full markdown parser:
 *  good enough for a truncated preview, not for rendering. Image embeds are
 *  handled before plain links — `![alt](url)` also matches the link pattern
 *  once its leading `!` is ignored, which would leave a stray `!` behind if
 *  links ran first. */
export function cleanExcerpt(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) => alt.split('|')[0])
    .replace(/\[([^\]]+)\]\([^)]*\)/g, (_match, text: string) => text)
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_match, target: string) => target)
    .replace(/`+/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
