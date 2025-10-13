import Database from 'better-sqlite3';

export class SearchIndex {
  constructor(private db: Database.Database) {}

  upsert(rowid: number, id: string, title: string, text: string) {
    this.db.prepare(`INSERT INTO tasks_fts(rowid,id,title,text) VALUES (?,?,?,?)`).run(rowid, id, title, text);
  }

  remove(rowid: number) {
    this.db.prepare(`DELETE FROM tasks_fts WHERE rowid=?`).run(rowid);
  }
}


