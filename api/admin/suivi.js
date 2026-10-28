const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

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

  const mois = parseInt(req.query.mois, 10);

  if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
    res.status(400).json({ ok: false, error: 'Paramètre "mois" invalide (1 à 12 attendu).' });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const reunionsRows = await sql`
      SELECT id, date_reunion::text AS date, libelle
      FROM reunions
      WHERE EXTRACT(MONTH FROM date_reunion) = ${mois}
      ORDER BY date_reunion ASC
    `;
    const reunions = reunionsRows.map((r) => ({ id: r.id, date: r.date, libelle: r.libelle }));
    const reunionIds = reunions.map((r) => r.id);

    const freres = await sql`SELECT id, nom FROM freres ORDER BY nom ASC`;

    if (reunionIds.length === 0) {
      res.status(200).json({
        ok: true,
        reunions: [],
        repondus: [],
        nonRepondus: freres,
        totalReunions: 0
      });
      return;
    }

    const disposRows = await sql`
      SELECT frere_id, reunion_id, etat, nature
      FROM disponibilites
      WHERE reunion_id = ANY(${reunionIds})
    `;

    const disposParFrere = new Map(); // frere_id -> Map(reunion_id -> {etat, nature})
    for (const d of disposRows) {
      if (!disposParFrere.has(d.frere_id)) disposParFrere.set(d.frere_id, new Map());
      disposParFrere.get(d.frere_id).set(d.reunion_id, { etat: d.etat, nature: d.nature });
    }

    const repondus = [];
    const nonRepondus = [];

    for (const f of freres) {
      const dispos = disposParFrere.get(f.id);
      if (!dispos) {
        nonRepondus.push(f);
        continue;
      }
      repondus.push({
        id: f.id,
        nom: f.nom,
        reponses: reunions.map((r) => {
          const d = dispos.get(r.id);
          return {
            reunionId: r.id,
            etat: d ? d.etat : null,
            nature: d ? d.nature : null
          };
        })
      });
    }

    res.status(200).json({
      ok: true,
      reunions,
      repondus,
      nonRepondus,
      totalReunions: reunionIds.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération du suivi des réponses.' });
  }
};
