'use client';
import { useEffect, useRef, useState } from 'react';
import { Autosave, SaveError, type SaveState } from '@/lib/autosave';
import { workspaceSchema, type Workspace } from '@/lib/schema';

function download(workspace: Workspace) {
  const blob = new Blob([JSON.stringify({ format: 'orbit-workspace-backup', backupVersion: 1, createdAt: new Date().toISOString(), workspace }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `orbit-workspace-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Planner() {
  const root = useRef<HTMLDivElement>(null), controller = useRef<Autosave | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const snapshot = useRef<Workspace | null>(null), restore = useRef<((workspace: Workspace) => void) | null>(null);
  const [loaded, setLoaded] = useState<{ workspace: Workspace; revision: number; email: string } | null>(null);
  const [loadError, setLoadError] = useState(''), [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState(''), [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setLoadError('');
    fetch('/api/workspace', { cache: 'no-store', signal: abort.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load your workspace.');
      setLoaded({ ...result, workspace: workspaceSchema.parse(result.workspace) });
    }).catch(error => { if (!abort.signal.aborted) setLoadError(error.message); });
    return () => abort.abort();
  }, [loadAttempt]);
  useEffect(() => {
    if (!loaded || !root.current) return;
    let disposed = false, planner: { destroy(): void } | undefined;
    const target = root.current; snapshot.current = loaded.workspace;
    const autosave = new Autosave(loaded.revision, async (workspace, revision) => {
      const response = await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace, revision }) });
      const result = await response.json();
      if (!response.ok) throw new SaveError(result.error || 'Saving failed.', response.status === 409);
      return result.revision;
    }, (state, message) => { setSaveState(state); setSaveError(message || ''); });
    controller.current = autosave;
    async function logout() {
      await autosave.flush();
      if (autosave.state !== 'saved' && !window.confirm('Some changes are not saved. Export a backup before logging out. Log out anyway?')) return;
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!response.ok) throw new Error('Unable to log out. Please retry.');
        window.location.assign('/');
      } catch (error) { setSaveError(error instanceof Error ? error.message : 'Unable to log out.'); }
    }
    import('@/planner/planner.js').then(({ mountPlanner }) => {
      if (disposed) return;
      const mount = (workspace: Workspace) => {
        planner?.destroy(); target.innerHTML = '<div id="orbit-canvas"></div><div id="toast-root" aria-live="polite"></div>';
        planner = mountPlanner(target, workspace, {
          onChange(next: Workspace) { snapshot.current = next; autosave.update(next); },
          onLogout: logout, onExport() { if (snapshot.current) download(snapshot.current); },
          onImport() { importInput.current?.click(); }, email: loaded!.email,
        });
      };
      restore.current = workspace => { snapshot.current = workspace; autosave.update(workspace); mount(workspace); };
      mount(loaded.workspace);
    });
    const leave = (event: BeforeUnloadEvent) => { if (autosave.state !== 'saved') { event.preventDefault(); event.returnValue = ''; } };
    const hidden = () => { if (document.visibilityState === 'hidden') void autosave.flush(); };
    window.addEventListener('beforeunload', leave); document.addEventListener('visibilitychange', hidden);
    return () => { disposed = true; planner?.destroy(); autosave.destroy(); restore.current = null; window.removeEventListener('beforeunload', leave); document.removeEventListener('visibilitychange', hidden); };
  }, [loaded]);
  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Maximum backup size is 5 MB.');
      const envelope = JSON.parse(await file.text());
      if (envelope.format !== 'orbit-workspace-backup' || envelope.backupVersion !== 1) throw new Error('Unsupported backup format or version.');
      const workspace = workspaceSchema.parse(envelope.workspace);
      if (!window.confirm(`Replace your workspace with ${workspace.projects.length} project(s) from this backup? Export current changes before continuing.`)) return;
      restore.current?.(workspace);
    } catch { setSaveError('Invalid or unsupported backup. Existing data was kept.'); }
  }
  if (loadError) return <main className="load-panel"><h1>Unable to load your workspace</h1><p role="alert">{loadError}</p><button className="btn" onClick={() => setLoadAttempt(v => v+1)}>Retry</button><a className="btn" href="/login">Log in</a></main>;
  if (!loaded) return <main className="load-panel" role="status">Loading your workspace…</main>;
  const failed = saveState === 'error' || saveState === 'conflict';
  return <div className="workspace-shell"><div className={`save-bar ${failed ? 'failed' : ''}`}><span role="status" aria-live="polite">{({ saved: 'Saved to cloud', pending: 'Unsaved changes', saving: 'Saving…', error: 'Not saved', conflict: 'Newer changes exist' })[saveState]}</span>{saveState === 'error' && <button onClick={() => void controller.current?.retry()}>Retry saving</button>}{saveState === 'conflict' && <button onClick={() => { if (confirm('Export your unsaved work before reloading. Reload now?')) window.location.reload(); }}>Reload latest</button>}</div>{saveError && <div className="save-error" role="alert">{saveError}</div>}<input ref={importInput} type="file" accept=".json,application/json" onChange={importBackup} aria-label="Import workspace backup" hidden/><div className="planner-root" ref={root}/></div>;
}
