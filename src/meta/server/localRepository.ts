/**
 * 本地后端的存档仓库：记录表在内存，落盘时拼回整份存档写 localStorage 双槽（SaveStore）。
 * localStorage 仍存「整份存档 JSON」——与导出格式一致，开发/测试直接改 localStorage 也照常生效。
 */
import { SaveStore, type StorageLike } from '../state/save';
import type { MetaSave } from '../state/schema';
import { assembleRaw, saveToRecords, type SaveRecords } from '../state/records';
import type { RecordBatch, SaveRepository } from './host';

export class LocalSaveRepository implements SaveRepository {
  private readonly store: SaveStore;
  private records: SaveRecords | null = null;

  constructor(storage: StorageLike, private readonly now: () => number) {
    this.store = new SaveStore(storage);
  }

  async load(): Promise<{ records: SaveRecords | null; warning: string | null }> {
    const { save, warning } = this.store.load(this.now());
    this.records = save ? saveToRecords(save) : null;
    return { records: this.records ? new Map(this.records) : null, warning };
  }

  async write(batch: RecordBatch): Promise<void> {
    const records = this.records ?? new Map<string, string>();
    for (const key of batch.del) records.delete(key);
    for (const [key, text] of batch.set) records.set(key, text);
    this.records = records;
    this.store.persist(assembleRaw(records) as unknown as MetaSave);
  }
}
