const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 heures

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
    return;
  }

  if (!process.env.DATABASE_URL || !process.env.ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return;
  }

  const { password } = req.body || {};

  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ ok: false, error: 'Mot de passe requis.' });
    return;
  }

  // Comparaison en temps constant pour éviter les attaques par timing.
  const expected = Buffer.from(process.env.ADMIN_PASSWORD, 'utf8');
  const given = Buffer.from(password, 'utf8');
  const match =
    expected.length === given.length && crypto.timingSafeEqual(expected, given);

  if (!match) {
    res.status(401).json({ ok: false, error: 'Mot de passe incorrect.' });
    return;
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const sql = neon(process.env.DATABASE_URL);

    await sql`
      INSERT INTO admin_sessions (token, expires_at)
      VALUES (${token}, ${expiresAt.toISOString()})
    `;

    res.status(200).json({ ok: true, token, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la création de la session.' });
  }
};
