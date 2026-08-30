import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  inspector?: ReactNode;
  statusBar: ReactNode;
  children: ReactNode;
}

/** Top-level 3-region layout: left sidebar, main content, optional right
 *  inspector panel, with a status bar pinned along the bottom. Pure layout
 *  — no vault/note logic lives here, that stays in App.tsx. */
export function AppShell({ sidebar, inspector, statusBar, children }: AppShellProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {sidebar}
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
        {inspector}
      </div>
      {statusBar}
    </div>
  );
}
