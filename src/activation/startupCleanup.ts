/**
 * Startup cleanup（Task 20）。
 *
 * Storage.bootstrap() already handles meta.json.tmp and banks/*.tmp cleanup.
 * This module triggers the async Trash.purge(7d) at activation time.
 *
 * Validates: Requirements 11.4, 11.5
 */

import type { Storage } from '../storage/storage.js';

/**
 * 启动期清理。Storage.bootstrap() 已完成 tmp 残留清理，
 * 这里仅触发 trash 过期数据清理。
 */
export async function startupCleanup(storage: Storage): Promise<void> {
  // Trash purge: delete items older than 7 days. Async, non-blocking.
  const sevenDays = 7 * 24 * 3600 * 1000;
  try {
    await storage.trash.purge({ olderThanMs: sevenDays });
  } catch {
    // Non-fatal: purge failure should not block activation.
  }
}
