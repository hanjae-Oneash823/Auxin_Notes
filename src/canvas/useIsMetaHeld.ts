import { useEffect, useState } from 'react';

/** True while the Command key is held down. Reset on window blur, since the
 *  keyup never arrives if focus leaves while it's pressed. */
export function useIsMetaHeld(): boolean {
  const [isHeld, setIsHeld] = useState(false);
  useEffect(() => {
    const sync = (event: KeyboardEvent) => setIsHeld(event.metaKey);
    const release = () => setIsHeld(false);
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', release);
    };
  }, []);
  return isHeld;
}
