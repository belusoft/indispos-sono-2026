const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
    return;
  }

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
    const rows = await sql`
      SELECT id, date_reunion, libelle
      FROM reunions
      WHERE EXTRACT(MONTH FROM date_reunion) = ${mois}
      ORDER BY date_reunion ASC
    `;

    const reunions = rows.map((r) => ({
      id: r.id,
      date: r.date_reunion,
      libelle: r.libelle
    }));

    res.status(200).json({ ok: true, reunions });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des réunions.' });
  }
};
