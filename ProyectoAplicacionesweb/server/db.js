'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

/* Abre la base de datos y aplica, en orden, las migraciones de database/migrations que falten */
function abrir(ruta) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const dir = path.join(__dirname, '..', 'database', 'migrations');
  for (const archivo of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM migraciones WHERE nombre = ?').get(archivo)) continue;
    db.exec('BEGIN');
    try {
      db.exec(fs.readFileSync(path.join(dir, archivo), 'utf8'));
      db.prepare('INSERT INTO migraciones (nombre) VALUES (?)').run(archivo);
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw new Error(`Falló la migración ${archivo}: ${err.message}`); }
  }
  return db;
}
module.exports = { abrir };
