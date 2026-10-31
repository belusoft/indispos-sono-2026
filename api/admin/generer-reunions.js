const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

// Génère les réunions (mardis + samedis) d'une année civile complète.
// Idempotent : ON CONFLICT DO NOTHING, donc relançable sans doublon.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
    return;
  }

  if (!(await requireAdmin(req, res))) return;

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return;
  }

  const annee = parseInt(req.body?.annee, 10);
  if (!Number.isInteger(annee) || annee < 2026 || annee > 2100) {
    res.status(400).json({ ok: false, error: 'Paramètre "annee" invalide (2026 à 2100 attendu).' });
    return;
  }

  const debut = `${annee}-01-01`;
  const fin = `${annee}-12-31`;

  try {
    const sql = neon(process.env.DATABASE_URL);
    const inseres = await sql`
      INSERT INTO reunions (date_reunion, libelle)
      SELECT
        d::date,
        CASE EXTRACT(DOW FROM d) WHEN 2 THEN 'mardi ' WHEN 6 THEN 'samedi ' END ||
        EXTRACT(DAY FROM d)::int || ' ' ||
        CASE EXTRACT(MONTH FROM d)
          WHEN 1 THEN 'janvier'   WHEN 2 THEN 'février'  WHEN 3 THEN 'mars'
          WHEN 4 THEN 'avril'     WHEN 5 THEN 'mai'      WHEN 6 THEN 'juin'
          WHEN 7 THEN 'juillet'   WHEN 8 THEN 'août'     WHEN 9 THEN 'septembre'
          WHEN 10 THEN 'octobre'  WHEN 11 THEN 'novembre' WHEN 12 THEN 'décembre'
        END
      FROM generate_series(${debut}::date, ${fin}::date, '1 day'::interval) AS d
      WHERE EXTRACT(DOW FROM d) IN (2, 6)
      ON CONFLICT (date_reunion) DO NOTHING
      RETURNING id
    `;

    res.status(200).json({ ok: true, annee, inseres: inseres.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la génération des réunions.' });
  }
};
