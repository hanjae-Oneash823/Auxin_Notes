import { motion } from 'framer-motion';
import { CalendarCheck, LinkSimple, MagnifyingGlass, Terminal, Tree, type Icon } from '@phosphor-icons/react';
import { useHoverTooltip } from './HoverTooltip';
import { RIGHT_PANEL_LAYERS, usePanelLayoutStore, type RightPanelLayer } from './panelLayoutStore';
import { SidebarSideIcon } from './WindowChrome';

interface LayerMeta {
  label: string;
  /** What the active tab's pill reads. */
  shortLabel: string;
  Icon: Icon;
}

const LAYER_META: Record<RightPanelLayer, LayerMeta> = {
  files: { label: 'Files', shortLabel: 'Files', Icon: Tree },
  search: { label: 'Search', shortLabel: 'Search', Icon: MagnifyingGlass },
  links: { label: 'Contents, Links & Tags', shortLabel: 'Links', Icon: LinkSimple },
  terminal: { label: 'Terminal', shortLabel: 'Terminal', Icon: Terminal },
  planner: { label: 'Planner', shortLabel: 'Planner', Icon: CalendarCheck },
};

interface LayerButtonProps {
  layer: RightPanelLayer;
  isActive: boolean;
  onSelect: (layer: RightPanelLayer) => void;
}

function LayerButton({ layer, isActive, onSelect }: LayerButtonProps) {
  const { label, shortLabel, Icon: LayerIcon } = LAYER_META[layer];
  const { hoverProps, hide, tooltip } = useHoverTooltip(label);

  return (
    <>
      <motion.button
        layout
        type="button"
        aria-label={label}
        aria-pressed={isActive}
        onClick={() => {
          hide();
          onSelect(layer);
        }}
        {...hoverProps}
        className={`group/layer relative flex h-9 items-center justify-center ${isActive ? 'shrink-0 px-1' : 'flex-1'}`}
      >
        {/* The selected layer is a pill with its icon and name. The pill is one
            shared element (layoutId) that glides from tab to tab. */}
        {isActive && (
          <motion.span
            layoutId="right-layer-indicator"
            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            className="absolute inset-x-0 h-[26px] rounded-row border border-border-strong bg-bg-packet-active"
          />
        )}
        <span
          className={`relative flex h-[26px] items-center gap-1.5 px-2 transition-colors duration-panel ease-panel ${
            isActive ? 'text-fg-prominent' : 'text-fg-faint group-hover/layer:text-fg-prominent'
          }`}
        >
          <LayerIcon size={16} weight={isActive ? 'bold' : 'regular'} />
          {isActive && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="font-medium"
              style={{ fontSize: '0.78rem' }}
            >
              {shortLabel}
            </motion.span>
          )}
        </span>
      </motion.button>
      {tooltip}
    </>
  );
}

/** Hides the right panel. Lives at the end of the icon bar; once the panel is
 *  hidden the floating toggle in `WindowChrome` brings it back. */
function CollapseButton() {
  const toggleSidebar = usePanelLayoutStore((state) => state.toggleSidebar);
  const { hoverProps, hide, tooltip } = useHoverTooltip('Hide right panel');

  return (
    <>
      <button
        type="button"
        aria-label="Hide right panel"
        onClick={() => {
          hide();
          toggleSidebar('right');
        }}
        {...hoverProps}
        className="flex h-9 w-8 shrink-0 items-center justify-center text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent"
      >
        <SidebarSideIcon side="right" size={15} />
      </button>
      {tooltip}
    </>
  );
}

/** Icon strip at the top of the right panel — picks which layer (files,
 *  search, contents, links & tags, terminal) the panel body shows, with the panel's
 *  collapse button at the right end. Selection lives in `panelLayoutStore` so
 *  it persists across launches. */
export function RightPanelHeader() {
  const activeLayer = usePanelLayoutStore((state) => state.activeRightLayer);
  const setRightLayer = usePanelLayoutStore((state) => state.setRightLayer);

  return (
    <nav aria-label="Panel layers" className="flex shrink-0 items-stretch border-b border-b-border-subtle">
      {RIGHT_PANEL_LAYERS.map((layer) => (
        <LayerButton key={layer} layer={layer} isActive={layer === activeLayer} onSelect={setRightLayer} />
      ))}
      <CollapseButton />
    </nav>
  );
}
