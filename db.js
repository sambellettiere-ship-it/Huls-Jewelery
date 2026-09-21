'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Resolve the data directory (SQLite file + uploaded images live here).
// On Railway this should point at a mounted persistent volume (e.g. /data).
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'sqlite.db');

// Ensure the directories exist before opening the database.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pieces (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    description    TEXT    NOT NULL DEFAULT '',
    price          TEXT    NOT NULL DEFAULT '',
    status         TEXT    NOT NULL DEFAULT 'available',
    image_filename TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Prepared statements -------------------------------------------------

const statements = {
  listAll: db.prepare(
    `SELECT * FROM pieces ORDER BY sort_order ASC, datetime(created_at) DESC, id DESC`
  ),
  listAvailable: db.prepare(
    `SELECT * FROM pieces WHERE status = 'available'
     ORDER BY sort_order ASC, datetime(created_at) DESC, id DESC`
  ),
  getById: db.prepare(`SELECT * FROM pieces WHERE id = ?`),
  insert: db.prepare(
    `INSERT INTO pieces (title, description, price, status, image_filename, sort_order)
     VALUES (@title, @description, @price, @status, @image_filename, @sort_order)`
  ),
  update: db.prepare(
    `UPDATE pieces
       SET title = @title,
           description = @description,
           price = @price,
           status = @status,
           image_filename = @image_filename,
           sort_order = @sort_order
     WHERE id = @id`
  ),
  remove: db.prepare(`DELETE FROM pieces WHERE id = ?`),
  maxSortOrder: db.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS max FROM pieces`)
};

// --- Public API ----------------------------------------------------------

function listAll() {
  return statements.listAll.all();
}

function listAvailable() {
  return statements.listAvailable.all();
}

function getById(id) {
  return statements.getById.get(id);
}

function createPiece({ title, description, price, status, image_filename }) {
  const nextOrder = statements.maxSortOrder.get().max + 1;
  const info = statements.insert.run({
    title,
    description: description || '',
    price: price || '',
    status: status === 'sold' ? 'sold' : 'available',
    image_filename: image_filename || null,
    sort_order: nextOrder
  });
  return getById(info.lastInsertRowid);
}

function updatePiece(id, fields) {
  const existing = getById(id);
  if (!existing) return null;
  const merged = {
    id,
    title: fields.title !== undefined ? fields.title : existing.title,
    description:
      fields.description !== undefined ? fields.description : existing.description,
    price: fields.price !== undefined ? fields.price : existing.price,
    status:
      fields.status !== undefined
        ? fields.status === 'sold'
          ? 'sold'
          : 'available'
        : existing.status,
    image_filename:
      fields.image_filename !== undefined
        ? fields.image_filename
        : existing.image_filename,
    sort_order:
      fields.sort_order !== undefined ? fields.sort_order : existing.sort_order
  };
  statements.update.run(merged);
  return getById(id);
}

function deletePiece(id) {
  const existing = getById(id);
  if (!existing) return null;
  statements.remove.run(id);
  return existing;
}

module.exports = {
  db,
  DATA_DIR,
  UPLOADS_DIR,
  DB_PATH,
  listAll,
  listAvailable,
  getById,
  createPiece,
  updatePiece,
  deletePiece
};
