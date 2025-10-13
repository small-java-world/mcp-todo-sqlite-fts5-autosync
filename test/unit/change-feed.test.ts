import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';

describe('Change Feed Tests', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should insert change and poll changes', () => {
    const entity = 'task';
    const id = 'T-TEST-1';
    const op = 'insert';
    const vclock = 1;

    // Insert change
    db.insertChange(entity, id, op, vclock);

    // Poll changes
    const changes = db.pollChanges(0, 10);
    expect(changes.length).toBe(1);
    expect(changes[0].entity).toBe(entity);
    expect(changes[0].id).toBe(id);
    expect(changes[0].op).toBe(op);
    expect(changes[0].vclock).toBe(vclock);
  });

  it('should poll changes with since parameter', () => {
    const entity = 'task';
    const id = 'T-TEST-1';
    const op = 'insert';

    // Insert first change
    db.insertChange(entity, id, op, 1);

    // Get first change
    const changes1 = db.pollChanges(0, 10);
    expect(changes1.length).toBe(1);

    // Insert second change
    db.insertChange(entity, 'T-TEST-2', 'update', 2);

    // Poll from after first change
    const changes2 = db.pollChanges(changes1[0].seq, 10);
    expect(changes2.length).toBe(1);
    expect(changes2[0].id).toBe('T-TEST-2');
  });

  it('should handle multiple changes with different entities', () => {
    // Insert changes for different entities
    db.insertChange('task', 'T-1', 'insert', 1);
    db.insertChange('issue', 'I-1', 'create', 1);
    db.insertChange('task', 'T-1', 'update', 2);
    db.insertChange('issue', 'I-1', 'resolve', 2);

    const changes = db.pollChanges(0, 10);
    expect(changes.length).toBe(4);

    // Check order (should be by sequence)
    expect(changes[0].entity).toBe('task');
    expect(changes[0].id).toBe('T-1');
    expect(changes[0].op).toBe('insert');

    expect(changes[1].entity).toBe('issue');
    expect(changes[1].id).toBe('I-1');
    expect(changes[1].op).toBe('create');
  });

  it('should respect limit parameter', () => {
    // Insert multiple changes
    for (let i = 0; i < 5; i++) {
      db.insertChange('task', `T-${i}`, 'insert', i + 1);
    }

    // Poll with limit
    const changes = db.pollChanges(0, 3);
    expect(changes.length).toBe(3);
  });

  it('should handle changes without vclock', () => {
    const entity = 'task';
    const id = 'T-TEST-1';
    const op = 'delete';

    // Insert change without vclock
    db.insertChange(entity, id, op);

    const changes = db.pollChanges(0, 10);
    expect(changes.length).toBe(1);
    expect(changes[0].entity).toBe(entity);
    expect(changes[0].id).toBe(id);
    expect(changes[0].op).toBe(op);
    expect(changes[0].vclock).toBeNull();
  });

  it('should return empty array when no changes', () => {
    const changes = db.pollChanges(0, 10);
    expect(changes.length).toBe(0);
  });

  it('should handle large number of changes', () => {
    const changeCount = 100;
    
    // Insert many changes
    for (let i = 0; i < changeCount; i++) {
      db.insertChange('task', `T-${i}`, 'insert', i + 1);
    }

    const changes = db.pollChanges(0, changeCount);
    expect(changes.length).toBe(changeCount);
  });
});
