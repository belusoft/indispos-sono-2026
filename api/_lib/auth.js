const { neon } = require('@neondatabase/serverless');

/**
 * Vérifie le token admin envoyé dans l'en-tête "x-admin-token".
 * Retourne true si valide (et non expiré), false sinon.
 */
async function requireAdmin(req, res) {
  const token = req.headers['x-admin-token'];

  if (!token || typeof token !== 'string') {
    res.status(401).json({ ok: false, error: 'Authentification requise.' });
    return false;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return false;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT token FROM admin_sessions
      WHERE token = ${token} AND expires_at > now()
    `;

    if (rows.length === 0) {
      res.status(401).json({ ok: false, error: 'Session admin invalide ou expirée.' });
      return false;
    }

    return true;
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la vérification de la session.' });
    return false;
  }
}

module.exports = { requireAdmin };
