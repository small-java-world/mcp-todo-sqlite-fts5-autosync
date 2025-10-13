import Database from 'better-sqlite3';

export class MetaStore {
  constructor(private db: Database.Database) {}

  saveTimeline(taskId: string, timelineEvents: any[]) {
    const row = this.db.prepare(`SELECT id, meta FROM tasks WHERE id=?`).get(taskId) as any;
    if (!row) return;
    let meta: any = {};
    if (row.meta) { try { meta = JSON.parse(row.meta); } catch {} }
    meta.timeline = timelineEvents || [];
    this.db.prepare(`UPDATE tasks SET meta=? WHERE id=?`).run(JSON.stringify(meta), taskId);
  }

  saveRelated(taskId: string, relatedLinks: any[]) {
    const row = this.db.prepare(`SELECT id, meta FROM tasks WHERE id=?`).get(taskId) as any;
    if (!row) return;
    let meta: any = {};
    if (row.meta) { try { meta = JSON.parse(row.meta); } catch {} }
    meta.related = relatedLinks || [];
    this.db.prepare(`UPDATE tasks SET meta=? WHERE id=?`).run(JSON.stringify(meta), taskId);
  }

  saveNotes(taskId: string, notesLines: string[]) {
    const row = this.db.prepare(`SELECT id, meta FROM tasks WHERE id=?`).get(taskId) as any;
    if (!row) return;
    let meta: any = {};
    if (row.meta) { try { meta = JSON.parse(row.meta); } catch {} }
    meta.notes = (notesLines || []).join('\n').replace(/\n+$/,'');
    this.db.prepare(`UPDATE tasks SET meta=? WHERE id=?`).run(JSON.stringify(meta), taskId);
  }

  saveMeta(taskId: string, metaBlocks: string[]) {
    const row = this.db.prepare(`SELECT id, meta FROM tasks WHERE id=?`).get(taskId) as any;
    if (!row) return;
    let meta: any = {};
    if (row.meta) { try { meta = JSON.parse(row.meta); } catch {} }
    const joined = (metaBlocks || []).join('\n');
    const m = joined.match(/```json\s*([\s\S]*?)\s*```/);
    if (m) {
      try { meta = { ...meta, ...JSON.parse(m[1]) }; } catch {}
    }
    this.db.prepare(`UPDATE tasks SET meta=? WHERE id=?`).run(JSON.stringify(meta), taskId);
  }
}


