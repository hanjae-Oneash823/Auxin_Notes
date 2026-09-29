import { useLayoutEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight, Plus, Trash } from '@phosphor-icons/react';
import { DEFAULT_WORKSPACE } from './workspaces';
import { PacketIconButton, SidebarPacket } from './SidebarPacket';

const PAN_MS = 340;
/** Same easing family as the tab-content pan (panTransition.ts). */
const PAN_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const PAN_DISTANCE_PX = 36;

interface WorkspaceSwitcherProps {
  names: string[];
  current: string;
  onStep: (step: 1 | -1) => void;
  /** Returns an error message when the name is unusable, else null. */
  onCreate: (name: string) => string | null;
  /** Returns an error message when the new name is unusable, else null. */
  onRename: (name: string, newName: string) => string | null;
  onDelete: (name: string) => void;
}

/** +1 when the new workspace sits to the right of the old one (wrapping
 *  from the last back to the first counts as "right", and vice versa). */
function panDirection(names: string[], from: string, to: string, previousNames: string[]): 1 | -1 {
  const delta = names.indexOf(to) - previousNames.indexOf(from);
  const isSameList = names.length === previousNames.length;
  if (isSameList && names.length > 2 && Math.abs(delta) === names.length - 1) return delta < 0 ? 1 : -1;
  return delta >= 0 ? 1 : -1;
}

/** The current workspace's name, with step arrows, "new" and "delete". A
 *  change of workspace pans the old name out and the new one in sideways. */
export function WorkspaceSwitcher({ names, current, onStep, onCreate, onRename, onDelete }: WorkspaceSwitcherProps) {
  // What the name area is currently an input for, if anything.
  const [editing, setEditing] = useState<'create' | 'rename' | null>(null);
  const isEditing = editing !== null;
  const isDefault = current === DEFAULT_WORKSPACE;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const incomingRef = useRef<HTMLSpanElement>(null);
  const outgoingRef = useRef<HTMLSpanElement>(null);
  const previous = useRef({ name: current, names });

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { name: current, names };
    const incoming = incomingRef.current;
    const outgoing = outgoingRef.current;
    if (before.name === current || !incoming || !outgoing) return;
    // A rename keeps the same slot — it's an edit, not a switch.
    if (names.length === before.names.length && !names.includes(before.name)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const direction = panDirection(names, before.name, current, before.names);
    const options = { duration: PAN_MS, easing: PAN_EASING };
    incoming.getAnimations().forEach((animation) => animation.cancel());
    outgoing.getAnimations().forEach((animation) => animation.cancel());
    outgoing.textContent = before.name;
    outgoing.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        {
          transform: `translateX(${-direction * PAN_DISTANCE_PX}px)`,
          opacity: 0,
        },
      ],
      options,
    );
    incoming.animate(
      [
        {
          transform: `translateX(${direction * PAN_DISTANCE_PX}px)`,
          opacity: 0,
        },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      options,
    );
  }, [current, names]);

  function stopCreating() {
    setEditing(null);
    setDraft('');
    setError(null);
  }

  function commitCreate() {
    const message = editing === 'rename' ? onRename(current, draft) : onCreate(draft);
    if (message) setError(message);
    else stopCreating();
  }

  return (
    <SidebarPacket>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex justify-start">
          {!isEditing && (
            <PacketIconButton
              title={isDefault ? "the default workspace can't be deleted" : 'delete workspace (notes are kept)'}
              isDisabled={isDefault}
              onClick={() => onDelete(current)}
            >
              <Trash size={14} />
            </PacketIconButton>
          )}
        </div>
        <div className="flex gap-1.5" role="presentation">
          {names.map((name) => {
            const isCurrent = name === current;
            const isDefaultDot = name === DEFAULT_WORKSPACE;
            // The default workspace is a hollow ring; the rest are solid.
            const tone = isCurrent
              ? isDefaultDot
                ? 'border-accent-neon-green'
                : 'border-accent-neon-green bg-accent-neon-green'
              : isDefaultDot
                ? 'border-fg-faint'
                : 'border-fg-faint bg-fg-faint';
            return (
              <span
                key={name}
                title={name}
                className={`h-1.5 w-1.5 rounded-full border transition-colors duration-panel ease-panel ${tone}`}
              />
            );
          })}
        </div>
        <div className="flex justify-end">
          {!isEditing && (
            <PacketIconButton
              title="new workspace"
              onClick={() => {
                setDraft('');
                setEditing('create');
              }}
            >
              <Plus size={14} />
            </PacketIconButton>
          )}
        </div>
      </div>
      <div className="flex h-7 items-center gap-0.5">
        {names.length > 1 && !isEditing && (
          <PacketIconButton title="previous workspace (Cmd+Left)" onClick={() => onStep(-1)}>
            <CaretLeft size={14} />
          </PacketIconButton>
        )}
        <div className="relative h-full min-w-0 flex-1 overflow-hidden text-center" style={{ fontSize: '0.85rem' }}>
          {isEditing ? (
            <input
              autoFocus
              onFocus={(event) => event.target.select()}
              value={draft}
              placeholder="workspace name"
              title={error ?? undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitCreate();
                else if (event.key === 'Escape') stopCreating();
              }}
              onBlur={stopCreating}
              className={`h-full w-full bg-transparent px-2 text-center outline-none placeholder:text-fg-faint ${
                error ? 'text-accent-link-broken' : 'text-fg-prominent'
              }`}
            />
          ) : (
            <>
              <span
                ref={incomingRef}
                title={isDefault ? undefined : 'double-click to rename'}
                onDoubleClick={() => {
                  if (isDefault) return;
                  setDraft(current);
                  setEditing('rename');
                }}
                className="absolute inset-0 flex items-center justify-center truncate px-2 font-semibold text-fg-prominent"
              >
                {current}
              </span>
              <span
                ref={outgoingRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center truncate px-2 font-semibold text-fg-prominent opacity-0"
              />
            </>
          )}
        </div>
        {names.length > 1 && !isEditing && (
          <PacketIconButton title="next workspace (Cmd+Right)" onClick={() => onStep(1)}>
            <CaretRight size={14} />
          </PacketIconButton>
        )}
      </div>
    </SidebarPacket>
  );
}
