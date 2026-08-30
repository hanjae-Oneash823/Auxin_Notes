import { open } from '@tauri-apps/plugin-dialog';
import { useVaultStore } from '../../vault/vaultStore';

export function VaultPicker() {
  const { openVault, status, error } = useVaultStore();

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      await openVault(selected);
    }
  }

  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.72rem' }}>
        [auxin]
      </span>

      <p className="text-fg-prominent" style={{ fontSize: '1.1rem' }}>
        choose a folder for your vault
      </p>
      <p className="text-fg-muted max-w-sm" style={{ fontSize: '0.85rem' }}>
        your notes are stored as plain markdown files in this folder — pick an
        existing folder or create a new one.
      </p>

      <button
        type="button"
        onClick={pickFolder}
        disabled={status === 'loading'}
        className="border border-border px-4 py-2 text-fg-prominent tracking-menu uppercase transition-colors duration-panel ease-panel hover:border-border-strong"
        style={{ fontSize: '0.85rem' }}
      >
        {status === 'loading' ? 'opening…' : 'select folder'}
      </button>

      {error && (
        <p className="text-accent-link-broken" style={{ fontSize: '0.78rem' }}>
          {error}
        </p>
      )}
    </main>
  );
}
