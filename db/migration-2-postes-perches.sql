-- Migration : Perches - Partie 1 et Partie 2 = 2 frères chacune.
-- Idempotente : peut être exécutée plusieurs fois sans dégât.
-- Les attributions existantes sont conservées (elles deviennent le poste 1).

ALTER TABLE roles ADD COLUMN IF NOT EXISTS nb_postes INT NOT NULL DEFAULT 1;
UPDATE roles SET nb_postes = 2 WHERE nom IN ('Perches - Partie 1', 'Perches - Partie 2');

ALTER TABLE programme ADD COLUMN IF NOT EXISTS poste INT NOT NULL DEFAULT 1;

-- Remplace UNIQUE (reunion_id, role_id) par UNIQUE (reunion_id, role_id, poste).
ALTER TABLE programme DROP CONSTRAINT IF EXISTS programme_reunion_id_role_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programme_reunion_role_poste_key'
  ) THEN
    ALTER TABLE programme
      ADD CONSTRAINT programme_reunion_role_poste_key UNIQUE (reunion_id, role_id, poste);
  END IF;
END $$;
