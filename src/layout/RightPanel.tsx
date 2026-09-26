import { Files, LinkSimple, ListBullets, MagnifyingGlass, Tag, type Icon } from '@phosphor-icons/react';
import { useHoverTooltip } from './HoverTooltip';
import { RIGHT_PANEL_LAYERS, usePanelLayoutStore, type RightPanelLayer } from './panelLayoutStore';

interface LayerMeta {
  label: string;
  Icon: Icon;
}

const LAYER_META: Record<RightPanelLayer, LayerMeta> = {
  files: { label: 'Files', Icon: Files },
  search: { label: 'Search', Icon: MagnifyingGlass },
  tags: { label: 'Tags', Icon: Tag },
  contents: { label: 'Contents', Icon: ListBullets },
  links: { label: 'Links', Icon: LinkSimple },
};

interface LayerButtonProps {
  layer: RightPanelLayer;
  isActive: boolean;
  onSelect: (layer: RightPanelLayer) => void;
}

function LayerButton({ layer, isActive, onSelect }: LayerButtonProps) {
  const { label, Icon: LayerIcon } = LAYER_META[layer];
  const { hoverProps, hide, tooltip } = useHoverTooltip(label);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-pressed={isActive}
        onClick={() => {
          hide();
          onSelect(layer);
        }}
        {...hoverProps}
        className={`relative flex h-9 flex-1 items-center justify-center transition-colors duration-panel ease-panel ${
          isActive ? 'text-fg' : 'text-fg-faint hover:text-fg-prominent'
        }`}
      >
        <LayerIcon size={18} />
        <span
          aria-hidden
          className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-fg transition-opacity duration-panel ease-panel ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </button>
      {tooltip}
    </>
  );
}

/** Icon strip at the top of the right panel — picks which layer (files,
 *  search, tags, contents, links) the panel body shows. Selection lives in
 *  `panelLayoutStore` so it persists across launches. */
export function RightPanelHeader() {
  const activeLayer = usePanelLayoutStore((state) => state.activeRightLayer);
  const setRightLayer = usePanelLayoutStore((state) => state.setRightLayer);

  return (
    <nav aria-label="Panel layers" className="mr-2 flex shrink-0 items-stretch border-b border-b-border-subtle">
      {RIGHT_PANEL_LAYERS.map((layer) => (
        <LayerButton key={layer} layer={layer} isActive={layer === activeLayer} onSelect={setRightLayer} />
      ))}
    </nav>
  );
}
