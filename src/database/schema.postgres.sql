CREATE TABLE IF NOT EXISTS vendeurs (
  id SERIAL PRIMARY KEY,
  identifiant TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendeur' CHECK (role IN ('admin', 'vendeur')),
  grade TEXT DEFAULT 'employe' CHECK (
    grade IS NULL OR grade IN ('patron', 'co-patron', 'manager', 'employe', 'apprenti', 'stagiaire')
  ),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicules (
  id SERIAL PRIMARY KEY,
  vendeur_id INTEGER REFERENCES vendeurs(id) ON DELETE SET NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  mileage INTEGER NOT NULL,
  fuel TEXT NOT NULL,
  transmission TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('neuf', 'occasion')),
  performance TEXT NOT NULL DEFAULT 'pas_perf' CHECK (performance IN ('pas_perf', 'peu_perf', 'full_perf')),
  image TEXT,
  description TEXT,
  is_custom INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
