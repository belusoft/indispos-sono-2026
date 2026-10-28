const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
    return;
  }

  if (!(await requireAdmin(req, res))) return;

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return;
  }

  const mois = parseInt(req.query.mois, 10);

  if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
    res.status(400).json({ ok: false, error: 'Paramètre "mois" invalide (1 à 12 attendu).' });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const reunions = await sql`
      SELECT id FROM reunions WHERE EXTRACT(MONTH FROM date_reunion) = ${mois}
    `;
    const reunionIds = reunions.map((r) => r.id);

    const freres = await sql`SELECT id, nom FROM freres ORDER BY nom ASC`;

    if (reunionIds.length === 0) {
      res.status(200).json({ ok: true, repondus: [], nonRepondus: freres, totalReunions: 0 });
      return;
    }

    // "A répondu" = a saisi au moins une disponibilité pour une réunion de ce mois.
    const repondusRows = await sql`
      SELECT DISTINCT frere_id FROM disponibilites WHERE reunion_id = ANY(${reunionIds})
    `;
    const idsRepondus = new Set(repondusRows.map((r) => r.frere_id));

    const repondus = freres.filter((f) => idsRepondus.has(f.id));
    const nonRepondus = freres.filter((f) => !idsRepondus.has(f.id));

    res.status(200).json({
      ok: true,
      repondus,
      nonRepondus,
      totalReunions: reunionIds.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération du suivi des réponses.' });
  }
};
