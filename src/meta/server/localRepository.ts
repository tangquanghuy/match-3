/**
 * 本地后端的存档仓库：localStorage 双槽（SaveStore）+ 内存权威副本。
 * 单标签页内没有并发写，put 的乐观锁只做一致性自检。
 */
import { SaveStore, type StorageLike } from '../state/save';
import type { MetaSave } from '../state/schema';
import type { SaveRepository } from './host';

export class LocalSaveRepository implements SaveRepository {
  private readonly store: SaveStore;
  private cache: MetaSave | null = null;
  private loaded = false;
  private warning: string | null = null;

  constructor(storage: StorageLike, private readonly now: () => number) {
    this.store = new SaveStore(storage);
  }

  async get(): Promise<{ save: MetaSave | null; warning: string | null }> {
    if (!this.loaded) {
      const loaded = this.store.load(this.now());
      this.cache = loaded.save;
      this.warning = loaded.warning;
      this.loaded = true;
    }
    return { save: this.cache, warning: this.warning };
  }

  async put(save: MetaSave, expectedRevision: number | null): Promise<boolean> {
    const currentRevision = this.cache?.revision ?? null;
    if (expectedRevision !== null && currentRevision !== expectedRevision) return false;
    this.store.persist(save);
    this.cache = save;
    this.loaded = true;
    this.warning = null;
    return true;
  }
}
