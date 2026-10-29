import { expect, it, vi } from 'vitest';
import { Autosave, SaveError } from '../src/lib/autosave';
import { fullWorkspace } from './fixtures';
it('serializes writes and uses the revision returned by the previous write', async () => {
  let finish!: (revision: number) => void;
  const write = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(6);
  const save = new Autosave(4, write, vi.fn(), 10000);
  save.update(fullWorkspace()); const first = save.flush();
  const next = fullWorkspace(); next.projects[0].name = 'Latest edit'; save.update(next);
  expect(write).toHaveBeenCalledTimes(1); finish(5); await first;
  expect(write).toHaveBeenCalledTimes(2); expect(write.mock.calls[1][1]).toBe(5);
  expect(write.mock.calls[1][0].projects[0].name).toBe('Latest edit'); expect(save.state).toBe('saved'); save.destroy();
});
it('keeps failed changes, reports failure, and retries the latest snapshot', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(1);
  const save = new Autosave(0, write, vi.fn(), 10000); save.update(fullWorkspace()); await save.flush();
  expect(save.state).toBe('error'); const next = fullWorkspace(); next.projects[0].name = 'Edited while offline'; save.update(next);
  await save.retry(); expect(write.mock.calls[1][0].projects[0].name).toBe('Edited while offline'); expect(save.state).toBe('saved'); save.destroy();
});
it('does not overwrite a newer revision after a conflict', async () => {
  const write = vi.fn().mockRejectedValue(new SaveError('Newer data', true));
  const save = new Autosave(0, write, vi.fn(), 10000); save.update(fullWorkspace()); await save.flush(); await save.retry();
  save.update(fullWorkspace()); await save.flush(); expect(write).toHaveBeenCalledTimes(1); expect(save.state).toBe('conflict'); expect(save.snapshot()).not.toBeNull(); save.destroy();
});
it('detects remote publication before a queued local save and retains unsaved work',async()=>{
  const write=vi.fn().mockResolvedValue(5),save=new Autosave(4,write,vi.fn(),10000);
  const workspace=fullWorkspace();workspace.projects[0].name='Unsaved local edit';save.update(workspace);
  save.observeRevision(5);await save.flush();await save.retry();
  expect(save.state).toBe('conflict');expect(write).not.toHaveBeenCalled();expect(save.snapshot()).toEqual(workspace);expect(save.currentRevision()).toBe(4);save.destroy();
});
it('ignores the current revision and in-flight observations of its own save',async()=>{
  let finish!:(revision:number)=>void;const save=new Autosave(4,()=>new Promise(resolve=>{finish=resolve;}),vi.fn(),10000);
  save.observeRevision(4);expect(save.state).toBe('saved');save.update(fullWorkspace());const writing=save.flush();save.observeRevision(5);expect(save.state).toBe('saving');finish(5);await writing;save.observeRevision(5);expect(save.state).toBe('saved');expect(save.currentRevision()).toBe(5);save.destroy();
});
