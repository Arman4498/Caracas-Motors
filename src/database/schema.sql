-- Schéma SQLite — Caracas Motors

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vendeurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifiant TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendeur' CHECK(role IN ('admin', 'vendeur')),
  grade TEXT DEFAULT 'employe' CHECK(
    grade IS NULL OR grade IN ('patron', 'co-patron', 'manager', 'employe', 'apprenti', 'stagiaire')
  ),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendeur_id INTEGER,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  price REAL NOT NULL,
  mileage INTEGER NOT NULL,
  fuel TEXT NOT NULL,
  transmission TEXT NOT NULL,
  condition TEXT NOT NULL CHECK(condition IN ('neuf', 'occasion')),
  image TEXT,
  description TEXT,
  is_custom INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (vendeur_id) REFERENCES vendeurs(id) ON DELETE SET NULL
);
