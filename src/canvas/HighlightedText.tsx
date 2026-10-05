import { splitByWords } from './cardSearch';

/** `text` with every occurrence of the search `words` marked. */
export function HighlightedText({ text, words }: { text: string; words: readonly string[] }) {
  if (words.length === 0) return <>{text}</>;
  return (
    <>
      {splitByWords(text, words).map((piece, index) =>
        piece.isHit ? (
          <span key={index} className="canvas-search-hit">
            {piece.text}
          </span>
        ) : (
          piece.text
        ),
      )}
    </>
  );
}
