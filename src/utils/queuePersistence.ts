import type { BatchMatchItem } from '../types/fortuneActuary';

export const QUEUE_STORAGE_KEY = 'fortune_actuary_batch_queue_v2';

// Keep the exact value this tab loaded. A newer queue must survive an older
// tab closing, running batch analysis, or finishing a delayed save.
export function createQueueWriter(initial: BatchMatchItem[], initialRaw: string | null | undefined) {
  let savedQueue = initial;
  let baseline = initialRaw;
  return {
    isDirty(queue: BatchMatchItem[]) { return queue !== savedQueue; },
    save(storage: Pick<Storage, 'getItem' | 'setItem'>, queue: BatchMatchItem[]) {
      if (queue === savedQueue) return null;
      if (baseline === undefined || storage.getItem(QUEUE_STORAGE_KEY) !== baseline) {
        throw new Error('此页无法确认队列仍是最新版本。请先导出本页备份，再刷新以载入已保存的队列。');
      }
      const json = JSON.stringify(queue);
      storage.setItem(QUEUE_STORAGE_KEY, json);
      baseline = json;
      savedQueue = queue;
      return json;
    },
  };
}
