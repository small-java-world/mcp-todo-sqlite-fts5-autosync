import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('Blob Management Tests', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
  });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

afterEach(async () => {
  db.close();
  if (fs.existsSync(tempDir)) {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      await sleep(150);
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
});

  it('should check if blob exists', () => {
    const sha256 = 'test-sha256-hash';
    
    // Initially should not exist
    expect(db.hasBlob(sha256)).toBe(false);
  });

  it('should put and retrieve blob', () => {
    const sha256 = 'test-sha256-hash';
    const content = Buffer.from('test content');
    const size = content.length;

    // Put blob
    db.putBlob(sha256, content, size);

    // Check if blob exists
    expect(db.hasBlob(sha256)).toBe(true);

    // Get blob path
    const blobPath = db.getBlobPath(sha256);
    expect(blobPath).toBeDefined();
    expect(fs.existsSync(blobPath)).toBe(true);

    // Verify content
    const savedContent = fs.readFileSync(blobPath);
    expect(savedContent).toEqual(content);
  });

  it('should handle multiple blobs', () => {
    const sha256_1 = 'test-sha256-hash-1';
    const sha256_2 = 'test-sha256-hash-2';
    const content_1 = Buffer.from('test content 1');
    const content_2 = Buffer.from('test content 2');

    // Put multiple blobs
    db.putBlob(sha256_1, content_1, content_1.length);
    db.putBlob(sha256_2, content_2, content_2.length);

    // Check both exist
    expect(db.hasBlob(sha256_1)).toBe(true);
    expect(db.hasBlob(sha256_2)).toBe(true);

    // Verify paths are different
    const path_1 = db.getBlobPath(sha256_1);
    const path_2 = db.getBlobPath(sha256_2);
    expect(path_1).not.toBe(path_2);
  });

  it('should handle blob with special characters in content', () => {
    const sha256 = 'special-chars-hash';
    const content = Buffer.from('test content with special chars: <>&"\'日本語');
    const size = content.length;

    db.putBlob(sha256, content, size);

    expect(db.hasBlob(sha256)).toBe(true);
    
    const blobPath = db.getBlobPath(sha256);
    const savedContent = fs.readFileSync(blobPath);
    expect(savedContent).toEqual(content);
  });

  it('should handle large blob', () => {
    const sha256 = 'large-blob-hash';
    const content = Buffer.alloc(1024 * 1024, 'A'.charCodeAt(0)); // 1MB
    const size = content.length;

    db.putBlob(sha256, content, size);

    expect(db.hasBlob(sha256)).toBe(true);
    
    const blobPath = db.getBlobPath(sha256);
    const savedContent = fs.readFileSync(blobPath);
    expect(savedContent.length).toBe(size);
  });
});
