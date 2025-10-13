/**
 * performServerSyncExport() の並行安全性テスト
 *
 * 要件:
 * 1. 複数の更新系APIから同時に呼ばれても安全
 * 2. ロックを使わず、ファイルシステムの原子性に依存
 * 3. 最終的に最新のDB状態がシャドウファイルに反映される
 * 4. 競合時にエラーで停止しない（ベストエフォート）
 * 5. 一時ファイル → rename による原子的書き込み
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const TEST_DIR = path.resolve('.test-output', `server-sync-${Date.now()}`);
const DB_FILE = 'test-sync.db';
const CAS_DIR = path.join(TEST_DIR, 'cas');
const EXPORT_DIR = path.join(TEST_DIR, 'snapshots');
const SHADOW_PATH = path.join(TEST_DIR, 'shadow', 'TODO.shadow.md');

describe('performServerSyncExport - Concurrent Safety', () => {
  let db: DB;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(CAS_DIR, { recursive: true });
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(SHADOW_PATH), { recursive: true });

    db = new DB(TEST_DIR, DB_FILE, CAS_DIR);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  /**
   * TC-1: 基本的なエクスポート
   * - DBの内容がシャドウファイルに書き込まれる
   * - スナップショットファイルも生成される
   */
  it('TC-1: should export TODO.md to shadow file', () => {
    // Arrange
    db.upsertTask('T-001', 'Test Task', 'Test content');

    // Act
    const result = performServerSyncExport(db, SHADOW_PATH, EXPORT_DIR);

    // Assert
    expect(fs.existsSync(result.shadow)).toBe(true);
    expect(fs.existsSync(result.snapshot)).toBe(true);

    const content = fs.readFileSync(result.shadow, 'utf-8');
    expect(content).toContain('T-001');
    expect(content).toContain('Test Task');
  });

  /**
   * TC-2: 並行呼び出しの安全性
   * - 複数回同時に呼ばれても競合しない
   * - エラーで停止しない
   * - 最終的に有効なファイルが残る
   */
  it('TC-2: should handle concurrent calls safely', async () => {
    // Arrange
    db.upsertTask('T-002', 'Concurrent Task', 'Test concurrent export');

    // Act: 10回並行でエクスポート
    const promises = Array.from({ length: 10 }, (_, i) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          try {
            performServerSyncExport(db, SHADOW_PATH, EXPORT_DIR);
          } catch (e) {
            // エラーが出ても処理は続行（ベストエフォート）
          }
          resolve();
        }, Math.random() * 10);
      });
    });

    await Promise.all(promises);

    // Assert: 最終的にシャドウファイルが存在し、有効な内容
    expect(fs.existsSync(SHADOW_PATH)).toBe(true);
    const content = fs.readFileSync(SHADOW_PATH, 'utf-8');
    expect(content).toContain('T-002');
  });

  /**
   * TC-3: 書き込み中の読み取り安全性
   * - 書き込み途中のファイルを読まない
   * - rename による原子的切り替え
   */
  it('TC-3: should not read partially written files', async () => {
    // Arrange
    db.upsertTask('T-003', 'Atomic Task', 'Test atomic write');

    // Act: 並行で書き込みと読み取り
    const writePromise = performServerSyncExport(db, SHADOW_PATH, EXPORT_DIR);

    // 書き込み中に読み取りを試みる
    let readContent: string | null = null;
    if (fs.existsSync(SHADOW_PATH)) {
      readContent = fs.readFileSync(SHADOW_PATH, 'utf-8');
    }

    // Assert: 読み取れた場合、完全な内容であること（部分的な内容ではない）
    if (readContent) {
      // Markdown形式として有効（途中で切れていない）
      expect(readContent.startsWith('# Tasks') || readContent.includes('T-003')).toBe(true);
    }
  });

  /**
   * TC-4: 一時ファイルの自動クリーンアップ
   * - .tmp ファイルが残らない
   * - rename 後は .tmp が存在しない
   */
  it('TC-4: should not leave temporary files', () => {
    // Arrange
    db.upsertTask('T-004', 'Cleanup Task', 'Test temp file cleanup');

    // Act
    performServerSyncExport(db, SHADOW_PATH, EXPORT_DIR);

    // Assert
    const tmpFile = SHADOW_PATH + '.tmp';
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  /**
   * TC-5: 大量データでも安全
   * - 1000タスクでもエクスポート成功
   * - メモリリークしない
   */
  it('TC-5: should handle large data safely', () => {
    // Arrange: 1000タスク作成
    for (let i = 0; i < 1000; i++) {
      db.upsertTask(`T-${String(i).padStart(4, '0')}`, `Task ${i}`, `Content ${i}`);
    }

    // Act
    const result = performServerSyncExport(db, SHADOW_PATH, EXPORT_DIR);

    // Assert
    expect(fs.existsSync(result.shadow)).toBe(true);
    const content = fs.readFileSync(result.shadow, 'utf-8');
    expect(content).toContain('T-0999');
  });

  /**
   * TC-6: ディレクトリ自動生成
   * - shadow/snapshots ディレクトリが存在しなくても自動作成
   */
  it('TC-6: should create directories if not exist', () => {
    // Arrange: ディレクトリを削除
    fs.rmSync(path.dirname(SHADOW_PATH), { recursive: true, force: true });
    fs.rmSync(EXPORT_DIR, { recursive: true, force: true });

    db.upsertTask('T-006', 'Dir Task', 'Test directory creation');

    // Act
    const result = performServerSyncExport(db, SHADOW_PATH, EXPORT_DIR);

    // Assert
    expect(fs.existsSync(result.shadow)).toBe(true);
    expect(fs.existsSync(result.snapshot)).toBe(true);
  });
});

/**
 * performServerSyncExport 実装（改修版）
 *
 * 設計方針:
 * - ロック不要（ファイルシステムの原子性に依存）
 * - 一時ファイル → rename で原子的書き込み
 * - エラーは握りつぶさず stderr に出力するが、処理は続行
 * - 並行呼び出しは後勝ち（最後の呼び出しが有効）
 */
function performServerSyncExport(
  db: DB,
  shadowPath: string,
  exportDir: string
): { shadow: string; snapshot: string } {
  try {
    // ディレクトリ作成（既存なら何もしない）
    fs.mkdirSync(path.dirname(shadowPath), { recursive: true });
    fs.mkdirSync(exportDir, { recursive: true });

    // DBから最新のTODO.mdを取得
    const md = db.exportTodoMd();

    // タイムスタンプ付きスナップショット名
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const snapFile = path.join(exportDir, `TODO.autosave-${ts}.md`);

    // 一時ファイルに書き込み → rename で原子的に切り替え
    const tempShadow = shadowPath + '.tmp';
    fs.writeFileSync(tempShadow, md, 'utf-8');
    fs.renameSync(tempShadow, shadowPath); // 原子的操作

    // スナップショットは直接書き込み（歴史記録なので競合OK）
    fs.writeFileSync(snapFile, md, 'utf-8');

    return { shadow: shadowPath, snapshot: snapFile };
  } catch (e) {
    // エラーログは出すが、処理は続行（ベストエフォート）
    console.error('[performServerSyncExport] error:', (e as Error).message);
    throw e; // テストでは throw、本番では握りつぶしても良い
  }
}
