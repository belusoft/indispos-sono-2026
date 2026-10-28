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

-- Ajout des frères : import réel, pas d'exemple fictif ici
-- (l'ancien exemple "Jean"/"Paul" a été retiré : il avait été exécuté littéralement
-- en production et a dû être nettoyé).

-- ============================================================
-- Espace Administration : rôles de service, affectations, sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  ordre INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS membre_roles (
  frere_id INT NOT NULL REFERENCES freres(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (frere_id, role_id)
);

CREATE TABLE IF NOT EXISTS programme (
  id SERIAL PRIMARY KEY,
  reunion_id INT NOT NULL REFERENCES reunions(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  frere_id INT REFERENCES freres(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reunion_id, role_id)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);

-- Les 9 rôles de service (identiques à l'ancienne version V7) :
INSERT INTO roles (nom, ordre) VALUES
  ('Audio', 1),
  ('Vidéo', 2),
  ('Perches - Partie 1', 3),
  ('Perches - Partie 2', 4),
  ('Estrade', 5),
  ('Estrade - Tablette', 6),
  ('Accueil - Admission Zoom', 7),
  ('Accueil - Ouverture', 8),
  ('Accueil - Auditorium', 9)
ON CONFLICT (nom) DO NOTHING;
