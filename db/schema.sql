-- Schéma Neon Postgres — Mes Indispos / Sono & Accueil 2026
-- À exécuter une seule fois sur la base Neon du projet.

CREATE TABLE IF NOT EXISTS freres (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS reunions (
  id SERIAL PRIMARY KEY,
  date_reunion DATE NOT NULL UNIQUE,
  libelle TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disponibilites (
  id SERIAL PRIMARY KEY,
  frere_id INT NOT NULL REFERENCES freres(id) ON DELETE CASCADE,
  reunion_id INT NOT NULL REFERENCES reunions(id) ON DELETE CASCADE,
  etat TEXT NOT NULL CHECK (etat IN ('dispo', 'indispo', 'particip')),
  nature TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (frere_id, reunion_id)
);

CREATE INDEX IF NOT EXISTS idx_dispo_frere ON disponibilites(frere_id);
CREATE INDEX IF NOT EXISTS idx_dispo_reunion ON disponibilites(reunion_id);

-- Génération automatique des réunions (mardi + samedi) de mai à décembre 2026.
-- À exécuter juste après la création des tables.
INSERT INTO reunions (date_reunion, libelle)
SELECT
  d::date,
  CASE EXTRACT(DOW FROM d)
    WHEN 2 THEN 'mardi '
    WHEN 6 THEN 'samedi '
  END ||
  EXTRACT(DAY FROM d)::int || ' ' ||
  CASE EXTRACT(MONTH FROM d)
    WHEN 5 THEN 'mai'
    WHEN 6 THEN 'juin'
    WHEN 7 THEN 'juillet'
    WHEN 8 THEN 'août'
    WHEN 9 THEN 'septembre'
    WHEN 10 THEN 'octobre'
    WHEN 11 THEN 'novembre'
    WHEN 12 THEN 'décembre'
  END
FROM generate_series('2026-05-01'::date, '2026-12-31'::date, '1 day'::interval) AS d
WHERE EXTRACT(DOW FROM d) IN (2, 6)
ON CONFLICT (date_reunion) DO NOTHING;

-- Exemple d'ajout de frères (à adapter / compléter manuellement) :
-- INSERT INTO freres (nom) VALUES ('Jean'), ('Paul') ON CONFLICT (nom) DO NOTHING;
