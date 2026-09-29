import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Broom, CaretDown, CaretUp } from '@phosphor-icons/react';
import { PacketIconButton, SidebarPacket } from './SidebarPacket';

interface WorkspaceScratchpadProps {
  value: string;
  onChange: (text: string) => void;
}

/** A small free-text box under the tab list for jotting what this workspace
 *  is for or what's next. The text belongs to the current workspace (see
 *  `Workspace.scratchpad`), so switching workspaces swaps it. The collapsed
 *  state is just this session's view, shared by every workspace. */
export function WorkspaceScratchpad({ value, onChange }: WorkspaceScratchpadProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <SidebarPacket
      title="Scratchpad"
      actions={
        <>
          <PacketIconButton title="clear scratchpad" onClick={() => onChange('')} isDisabled={value === ''}>
            <Broom size={15} />
          </PacketIconButton>
          <PacketIconButton
            title={isCollapsed ? 'expand scratchpad' : 'collapse scratchpad'}
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          >
            {isCollapsed ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </PacketIconButton>
        </>
      }
    >
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="jot something for this workspace…"
              spellCheck={false}
              className="sidebar-scroll h-24 w-full resize-none rounded-row bg-transparent px-2 py-1 text-fg-prominent outline-none placeholder:text-fg-faint"
              style={{ fontSize: '0.8rem' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarPacket>
  );
}
