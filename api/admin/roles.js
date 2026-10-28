const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
    return;
  }

  if (!(await requireAdmin(req, res))) return;

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT id, nom, ordre FROM roles ORDER BY ordre ASC`;
    res.status(200).json({ ok: true, roles: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des rôles.' });
  }
};
