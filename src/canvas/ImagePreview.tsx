import { motion } from 'framer-motion';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const ENTER_SECONDS = 0.2;
const EXIT_SECONDS = 0.14;
/** The image settles in from slightly smaller; the backdrop just fades. */
const IMAGE_START_SCALE = 0.96;

interface ImagePreviewProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Full-view look at one image card's file: the original, uncropped file (not
 *  the card's scaled-down copy), contained in the whole canvas area — never
 *  upscaled past its own pixels. Click anywhere or press Space/Esc to close. */
export function ImagePreview({ src, alt, onClose }: ImagePreviewProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: ENTER_SECONDS, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: EXIT_SECONDS, ease: EASE_OUT } }}
      className="absolute inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
      // The board underneath pans/zooms/marquees on these — the overlay owns them while open.
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onClick={onClose}
    >
      <motion.img
        src={src}
        alt={alt}
        draggable={false}
        initial={{ scale: IMAGE_START_SCALE }}
        animate={{ scale: 1, transition: { duration: ENTER_SECONDS, ease: EASE_OUT } }}
        exit={{ scale: IMAGE_START_SCALE, transition: { duration: EXIT_SECONDS, ease: EASE_OUT } }}
        className="max-h-full max-w-full object-contain"
      />
    </motion.div>
  );
}
