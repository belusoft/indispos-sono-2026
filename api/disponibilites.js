const { neon } = require('@neondatabase/serverless');

const ETATS_VALIDES = ['dispo', 'indispo', 'particip'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (err) {
      res.status(400).json({ ok: false, error: 'Corps de requête JSON invalide.' });
      return;
    }
  }

  if (!body || typeof body !== 'object') {
    res.status(400).json({ ok: false, error: 'Corps de requête manquant.' });
    return;
  }

  const { frereId, items } = body;

  if (!Number.isInteger(frereId) || frereId <= 0) {
    res.status(400).json({ ok: false, error: 'Identifiant de frère invalide.' });
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ ok: false, error: 'La liste des disponibilités est vide.' });
    return;
  }

  for (const item of items) {
    if (!item || !Number.isInteger(item.reunionId) || item.reunionId <= 0) {
      res.status(400).json({ ok: false, error: 'Identifiant de réunion invalide.' });
      return;
    }
    if (!ETATS_VALIDES.includes(item.etat)) {
      res.status(400).json({ ok: false, error: 'État de disponibilité invalide.' });
      return;
    }
    if (item.etat === 'particip' && (!item.nature || !String(item.nature).trim())) {
      res.status(400).json({ ok: false, error: 'La nature de participation est requise.' });
      return;
    }
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const freres = await sql`SELECT id FROM freres WHERE id = ${frereId}`;
    if (freres.length === 0) {
      res.status(400).json({ ok: false, error: 'Frère introuvable.' });
      return;
    }

    for (const item of items) {
      const nature = item.etat === 'particip' ? String(item.nature).trim() : null;
      await sql`
        INSERT INTO disponibilites (frere_id, reunion_id, etat, nature, updated_at)
        VALUES (${frereId}, ${item.reunionId}, ${item.etat}, ${nature}, now())
        ON CONFLICT (frere_id, reunion_id)
        DO UPDATE SET etat = EXCLUDED.etat, nature = EXCLUDED.nature, updated_at = now()
      `;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de l\'enregistrement des disponibilités.' });
  }
};
