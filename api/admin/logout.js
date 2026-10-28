const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
    return;
  }

  const token = req.headers['x-admin-token'];

  if (!token || typeof token !== 'string') {
    res.status(400).json({ ok: false, error: 'Token manquant.' });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`DELETE FROM admin_sessions WHERE token = ${token}`;
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la déconnexion.' });
  }
};
