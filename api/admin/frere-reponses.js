const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: 'Configuration serveur incomplète.' });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    const frereId = parseInt(req.query.frereId, 10);
    if (!Number.isInteger(frereId) || frereId <= 0) {
      res.status(400).json({ ok: false, error: 'Paramètre "frereId" invalide.' });
      return;
    }

    try {
      const frere = await sql`SELECT id, nom FROM freres WHERE id = ${frereId}`;
      if (frere.length === 0) {
        res.status(400).json({ ok: false, error: 'Frère introuvable.' });
        return;
      }

      const reponses = await sql`
        SELECT d.reunion_id, r.date_reunion::text AS date, r.libelle, d.etat, d.nature, d.updated_at
        FROM disponibilites d
        JOIN reunions r ON r.id = d.reunion_id
        WHERE d.frere_id = ${frereId}
        ORDER BY r.date_reunion ASC
      `;

      res.status(200).json({ ok: true, nom: frere[0].nom, reponses });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des réponses.' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { frereId, mois, reunionId } = req.body || {};

    if (!Number.isInteger(frereId) || frereId <= 0) {
      res.status(400).json({ ok: false, error: 'Paramètre "frereId" invalide.' });
      return;
    }

    try {
      if (reunionId != null) {
        if (!Number.isInteger(reunionId) || reunionId <= 0) {
          res.status(400).json({ ok: false, error: 'Paramètre "reunionId" invalide.' });
          return;
        }
        const effaces = await sql`
          DELETE FROM disponibilites WHERE frere_id = ${frereId} AND reunion_id = ${reunionId} RETURNING id
        `;
        res.status(200).json({ ok: true, effaces: effaces.length });
        return;
      }

      if (mois != null) {
        const moisNum = parseInt(mois, 10);
        if (!Number.isInteger(moisNum) || moisNum < 1 || moisNum > 12) {
          res.status(400).json({ ok: false, error: 'Paramètre "mois" invalide.' });
          return;
        }
        const reunionsDuMois = await sql`
          SELECT id FROM reunions WHERE EXTRACT(MONTH FROM date_reunion) = ${moisNum}
        `;
        const ids = reunionsDuMois.map((r) => r.id);
        if (ids.length === 0) {
          res.status(200).json({ ok: true, effaces: 0 });
          return;
        }
        const effaces = await sql`
          DELETE FROM disponibilites WHERE frere_id = ${frereId} AND reunion_id = ANY(${ids}) RETURNING id
        `;
        res.status(200).json({ ok: true, effaces: effaces.length });
        return;
      }

      const effaces = await sql`
        DELETE FROM disponibilites WHERE frere_id = ${frereId} RETURNING id
      `;
      res.status(200).json({ ok: true, effaces: effaces.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de l\'effacement des réponses.' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
};
