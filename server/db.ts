import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "transcriptions.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    filename TEXT NOT NULL,
    duration REAL,
    status TEXT NOT NULL,
    model TEXT NOT NULL,
    transcript TEXT,
    markdown TEXT,
    html TEXT,
    error TEXT
  );
`);

export type TranscriptionRecord = {
  id: number;
  created_at: string;
  filename: string;
  duration: number | null;
  status: string;
  model: string;
  transcript: string | null;
  markdown: string | null;
  html: string | null;
  error: string | null;
};

export const insertTranscription = db.prepare(
  `INSERT INTO transcriptions (created_at, filename, duration, status, model, transcript, markdown, html, error)
   VALUES (@created_at, @filename, @duration, @status, @model, @transcript, @markdown, @html, @error)`
);

export const updateTranscription = db.prepare(
  `UPDATE transcriptions
   SET status = @status, duration = @duration, transcript = @transcript, markdown = @markdown, html = @html, error = @error
   WHERE id = @id`
);

export const listTranscriptions = db.prepare(
  `SELECT id, created_at, filename, duration, status, model FROM transcriptions ORDER BY id DESC`
);

export const getTranscription = db.prepare(
  `SELECT * FROM transcriptions WHERE id = ?`
);

export const deleteTranscription = db.prepare(
  `DELETE FROM transcriptions WHERE id = ?`
);

export const clearTranscriptions = db.prepare(
  `DELETE FROM transcriptions`
);

export default db;
