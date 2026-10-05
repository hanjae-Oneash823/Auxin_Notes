import { useEffect, useRef, useState } from 'react';

/** The element's current content width, kept up to date as it resizes. */
export function useElementWidth<T extends HTMLElement>(initialWidth: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initialWidth);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
