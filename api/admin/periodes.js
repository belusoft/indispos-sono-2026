const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

// Renvoie les couples (année, mois) pour lesquels des réunions existent déjà,
// afin d'alimenter le sélecteur mois/année de l'onglet Programme.
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

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT DISTINCT
        EXTRACT(YEAR FROM date_reunion)::int  AS annee,
        EXTRACT(MONTH FROM date_reunion)::int AS mois
      FROM reunions
      ORDER BY annee ASC, mois ASC
    `;

    const periodes = rows.map((r) => ({ annee: r.annee, mois: r.mois }));
    const annees = [...new Set(periodes.map((p) => p.annee))].sort((a, b) => a - b);

    res.status(200).json({ ok: true, periodes, annees });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des périodes.' });
  }
};
