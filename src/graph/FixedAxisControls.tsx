import { useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera } from 'three';

// True isometric elevation (~35.264° above the horizon) at a 45° azimuth —
// the classic "corner" isometric view. Fixed camera tilt — never changes.
const ISOMETRIC_ELEVATION = Math.atan(1 / Math.sqrt(2));
const POLAR_ANGLE = Math.PI / 2 - ISOMETRIC_ELEVATION;
const ROTATE_SPEED = 0.006;
const ZOOM_WHEEL_SPEED = 0.0015;
const MIN_ZOOM_FACTOR = 0.3;
const MAX_ZOOM_FACTOR = 6;
const FIT_MARGIN = 0.7; // leaves headroom so the graph doesn't touch the canvas edges

/** Fixed viewing distance for a given content extent — shared with
 *  GraphPanel so its fog `near`/`far` line up with where the camera and
 *  content actually sit, rather than guessing at unrelated constants. */
export function computeCameraDistance(fitExtent: number): number {
  return Math.max(fitExtent, 1) * 3 + 50;
}

interface FixedAxisControlsProps {
  /** Half-extent (world units) of the content to frame — the camera starts
   *  zoomed out just enough to see all of it from outside, rather than a
   *  fixed distance that only happens to fit one particular vault size. */
  fitExtent: number;
  initialAzimuth?: number;
}

/** Camera rig for the graph panel with exactly two degrees of freedom:
 *  drag horizontally to rotate around the vertical (time) axis, drag
 *  vertically to pan up/down along it. The camera's tilt relative to that
 *  axis is a fixed constant — nothing here ever touches it, so dragging can
 *  never reorient "up" away from "more recent". Deliberately not
 *  OrbitControls: its rotate gesture always couples azimuth with tilt.
 *
 *  Orthographic, not perspective — a real isometric view has no
 *  foreshortening, and zoom scales the view volume (`camera.zoom`) rather
 *  than moving the camera closer, so the fixed viewing distance below exists
 *  only to clear the near/far clipping planes, never to control scale. */
export function FixedAxisControls({ fitExtent, initialAzimuth = Math.PI / 4 }: FixedAxisControlsProps) {
  const { camera, gl, invalidate, size } = useThree();
  const azimuth = useRef(initialAzimuth);
  const centerY = useRef(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const safeExtent = Math.max(fitExtent, 1);
  const baseZoom = (Math.min(size.width, size.height) / 2 / safeExtent) * FIT_MARGIN;
  const zoom = useRef(baseZoom);
  const minZoom = baseZoom * MIN_ZOOM_FACTOR;
  const maxZoom = baseZoom * MAX_ZOOM_FACTOR;
  const distance = computeCameraDistance(fitExtent);

  useLayoutEffect(() => {
    const sinPolar = Math.sin(POLAR_ANGLE);
    const cosPolar = Math.cos(POLAR_ANGLE);

    function updateCamera() {
      camera.position.set(
        distance * sinPolar * Math.cos(azimuth.current),
        centerY.current + distance * cosPolar,
        distance * sinPolar * Math.sin(azimuth.current),
      );
      camera.lookAt(0, centerY.current, 0);
      if (camera instanceof OrthographicCamera) {
        camera.zoom = zoom.current;
        camera.updateProjectionMatrix();
      }
      invalidate();
    }
    updateCamera();

    const element = gl.domElement;

    function onPointerDown(event: PointerEvent) {
      dragging.current = true;
      last.current = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    }
    function onPointerMove(event: PointerEvent) {
      if (!dragging.current) return;
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      last.current = { x: event.clientX, y: event.clientY };
      azimuth.current += dx * ROTATE_SPEED;
      // 1 screen pixel = 1/zoom world units, so panning tracks the cursor
      // 1:1 regardless of how far zoomed in/out the view currently is.
      centerY.current += dy / zoom.current;
      updateCamera();
    }
    function onPointerUp(event: PointerEvent) {
      dragging.current = false;
      element.releasePointerCapture(event.pointerId);
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const next = zoom.current * Math.exp(-event.deltaY * ZOOM_WHEEL_SPEED);
      zoom.current = Math.min(maxZoom, Math.max(minZoom, next));
      updateCamera();
    }

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl, invalidate, distance, minZoom, maxZoom]);

  return null;
}
