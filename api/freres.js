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

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT id, nom FROM freres ORDER BY nom ASC`;
    res.status(200).json({ ok: true, freres: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des frères.' });
  }
};
