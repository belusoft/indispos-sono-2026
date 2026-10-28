const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

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

  const mois = parseInt(req.body?.mois, 10);
  const reunionId = req.body?.reunionId != null ? parseInt(req.body.reunionId, 10) : null;

  if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
    res.status(400).json({ ok: false, error: 'Paramètre "mois" invalide (1 à 12 attendu).' });
    return;
  }

  if (req.body?.reunionId != null && !Number.isInteger(reunionId)) {
    res.status(400).json({ ok: false, error: 'Paramètre "reunionId" invalide.' });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const reunions = await sql`
      SELECT id FROM reunions WHERE EXTRACT(MONTH FROM date_reunion) = ${mois}
    `;
    const idsDuMois = new Set(reunions.map((r) => r.id));

    if (reunionId !== null) {
      if (!idsDuMois.has(reunionId)) {
        res.status(400).json({ ok: false, error: 'Cette réunion n\'appartient pas au mois indiqué.' });
        return;
      }
      const effaces = await sql`
        DELETE FROM programme WHERE reunion_id = ${reunionId} RETURNING id
      `;
      res.status(200).json({ ok: true, effaces: effaces.length });
      return;
    }

    const reunionIds = Array.from(idsDuMois);
    if (reunionIds.length === 0) {
      res.status(200).json({ ok: true, effaces: 0 });
      return;
    }

    const effaces = await sql`
      DELETE FROM programme WHERE reunion_id = ANY(${reunionIds}) RETURNING id
    `;
    res.status(200).json({ ok: true, effaces: effaces.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de l\'effacement des attributions.' });
  }
};
