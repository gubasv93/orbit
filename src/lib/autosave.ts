import type { Workspace } from './schema';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
export class SaveError extends Error {
  constructor(message: string, public conflict = false) { super(message); }
}

/** One in-flight write; later edits stay queued. Conflicts require an explicit reload. */
export class Autosave {
  private latest: Workspace | null = null;
  private queued: Workspace | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  state: SaveState = 'saved';
  constructor(private revision: number,
    private write: (workspace: Workspace, revision: number) => Promise<number>,
    private notify: (state: SaveState, message?: string) => void,
    private delay = 400) {}

  update(workspace: Workspace) {
    this.latest = structuredClone(workspace); this.queued = this.latest;
    if (this.state === 'conflict' || this.state === 'error') return;
    this.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.delay);
  }
  snapshot() { return this.latest; }
  private set(state: SaveState, message?: string) { this.state = state; if (!this.stopped) this.notify(state, message); }
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.running) { await this.running; return; }
    if (this.stopped || this.state === 'conflict' || this.state === 'error') return;
    this.running = this.drain();
    await this.running;
    this.running = null;
  }
  private async drain() {
    while (this.queued && !this.stopped) {
      const sending = this.queued; this.queued = null; this.set('saving');
      try {
        this.revision = await this.write(sending, this.revision);
      } catch (error) {
        this.queued ||= sending;
        this.set(error instanceof SaveError && error.conflict ? 'conflict' : 'error',
          error instanceof Error ? error.message : 'Saving failed');
        return;
      }
    }
    if (!this.stopped) this.set('saved');
  }
  async retry() { if (this.state !== 'conflict') { this.set('pending'); await this.flush(); } }
  destroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
}
