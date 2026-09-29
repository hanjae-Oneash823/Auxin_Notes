import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useHoverTooltip } from '../layout/HoverTooltip';

/** Radius of each button, in on-screen px: constant, so the bundle stays the
 *  same size at every folder level and however much room the view has. */
export const CONTROL_RADIUS_PX = 20;
/** Space between adjacent buttons' edges, as a fraction of a button radius. */
const GAP_RATIO = 0.12;
/** Center-to-center distance in a three-button triangle, in button radii. */
const TRIANGLE_SPACING = (2 * (1 + GAP_RATIO)) / Math.sqrt(3);
/** cos(30°): where the triangle's two lower buttons sit horizontally. */
const TRIANGLE_HALF_WIDTH_RATIO = Math.sqrt(3) / 2;

/** Phosphor bold outlines (256-unit box), drawn as plain paths so they animate
 *  and scale exactly like the circles they sit in. */
const ICON_BOX = 256;
const ICON_PATHS = {
  back: 'M232,200a8,8,0,0,1-16,0,88.1,88.1,0,0,0-88-88H51.31l34.35,34.34a8,8,0,0,1-11.32,11.32l-48-48a8,8,0,0,1,0-11.32l48-48A8,8,0,0,1,85.66,61.66L51.31,96H128A104.11,104.11,0,0,1,232,200Z',
  open: 'M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z',
  plus: 'M128,48V208M48,128H208',
} as const;
const PLUS_STROKE_WIDTH = 18;
/** Translucent, theme-aware fills: a wash of the foreground color over the page. */
const FILL_REST = 'color-mix(in srgb, var(--color-fg) 16%, transparent)';
const FILL_HOVER = 'color-mix(in srgb, var(--color-fg) 26%, transparent)';
const RING = 'color-mix(in srgb, var(--color-fg) 30%, transparent)';
const BUTTON_SHADOW = 'drop-shadow(0 3px 8px rgba(0, 0, 0, 0.35))';

type ControlKind = keyof typeof ICON_PATHS;

interface ControlButton {
  kind: ControlKind;
  label: string;
  dx: number;
  dy: number;
  /** The main action: filled with the accent green instead of a wash. */
  isPrimary: boolean;
  onActivate: (anchor: DOMRect) => void;
}

/** Center of the back button for a bundle centered at (x, y), in the same units
 *  as `radius` — where a dragged bubble has to land to move up a level. */
export function backButtonCenter(x: number, y: number, radius: number): { x: number; y: number } {
  return { x, y: y - radius * TRIANGLE_SPACING };
}

/** Radius of the circle that encloses the bundle, in button radii. The same at
 *  the vault root, where the back slot stays empty, so the layout never shifts. */
export const CONTROLS_SPAN = 1 + TRIANGLE_SPACING;

interface BubbleControlsProps {
  /** Bundle center and button radius, in chart units. */
  x: number;
  y: number;
  radius: number;
  /** Only inside a folder — at the vault root there's nowhere to go back to. */
  hasBack: boolean;
  onBack: () => void;
  /** `anchor` is the New button's on-screen box, for placing its menu. */
  onNew: (anchor: DOMRect) => void;
  onRevealInFinder: () => void;
  /** A bubble is being dragged over the back button. */
  isBackDropTarget: boolean;
}

/** A bundle of round buttons at the chart's center: back (one folder up), new
 *  (opens a menu) and open-in-Finder. Buttons are dark with a white ring, so
 *  they read as controls next to the colored data dots; New is inverted. */
export function BubbleControls({
  x,
  y,
  radius,
  hasBack,
  onBack,
  onNew,
  onRevealInFinder,
  isBackDropTarget,
}: BubbleControlsProps) {
  const spacing = radius * TRIANGLE_SPACING;

  // The back slot is always laid out; at the root it's just left empty.
  const buttons: ControlButton[] = [
    { kind: 'back', label: 'Back one folder', dx: 0, dy: -spacing, isPrimary: false, onActivate: onBack },
    {
      kind: 'plus',
      label: 'New',
      dx: -spacing * TRIANGLE_HALF_WIDTH_RATIO,
      dy: spacing / 2,
      isPrimary: true,
      onActivate: onNew,
    },
    {
      kind: 'open',
      label: 'Open in Finder',
      dx: spacing * TRIANGLE_HALF_WIDTH_RATIO,
      dy: spacing / 2,
      isPrimary: false,
      onActivate: onRevealInFinder,
    },
  ].filter((button) => hasBack || button.kind !== 'back') as ControlButton[];

  return (
    <g>
      {buttons.map((button) => (
        <ControlButtonView
          key={button.kind}
          button={button}
          x={x + button.dx}
          y={y + button.dy}
          radius={radius}
          isDropTarget={button.kind === 'back' && isBackDropTarget}
        />
      ))}
    </g>
  );
}

interface ControlButtonViewProps {
  button: ControlButton;
  /** Button center and radius, in chart units. */
  x: number;
  y: number;
  radius: number;
  isDropTarget: boolean;
}

function ControlButtonView({ button, x, y, radius, isDropTarget }: ControlButtonViewProps) {
  // The tooltip is HTML (fixed-positioned), so it's portaled out of the SVG.
  const { hoverProps, hide, tooltip } = useHoverTooltip(button.label);
  const [isPointerOver, setIsPointerOver] = useState(false);
  const isHovered = isPointerOver || isDropTarget;
  const iconSize = radius * 1.1;
  const iconColor = button.isPrimary ? 'var(--color-bg)' : 'color-mix(in srgb, var(--color-fg) 88%, transparent)';
  const activate = (element: Element) => {
    hide();
    button.onActivate(element.getBoundingClientRect());
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={button.label}
      onMouseEnter={(event) => {
        setIsPointerOver(true);
        hoverProps.onMouseEnter(event);
      }}
      onMouseLeave={() => {
        setIsPointerOver(false);
        hoverProps.onMouseLeave();
      }}
      onClick={(event: MouseEvent<SVGGElement>) => activate(event.currentTarget)}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate(event.currentTarget);
      }}
      style={{
        transformOrigin: `${x}px ${y}px`,
        transform: isHovered ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 150ms ease',
        filter: BUTTON_SHADOW,
        cursor: 'pointer',
      }}
    >
      {createPortal(tooltip, document.body)}
      <circle
        cx={x}
        cy={y}
        r={radius}
        stroke={button.isPrimary ? 'none' : RING}
        strokeWidth={1}
        style={{
          fill: button.isPrimary ? 'var(--bubble-green-3)' : isHovered ? FILL_HOVER : FILL_REST,
          transition: 'fill 150ms ease',
        }}
      />
      <path
        d={ICON_PATHS[button.kind]}
        transform={`translate(${x - iconSize / 2} ${y - iconSize / 2}) scale(${iconSize / ICON_BOX})`}
        fill={button.kind === 'plus' ? 'none' : iconColor}
        stroke={button.kind === 'plus' ? iconColor : 'none'}
        strokeWidth={PLUS_STROKE_WIDTH}
        strokeLinecap="round"
      />
    </g>
  );
}
