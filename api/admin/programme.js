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
    // Sous-route : liste des périodes (année/mois) présentes en base,
    // pour alimenter le sélecteur mois/année sans ajouter de fonction serverless.
    if (req.query.periodes != null) {
      try {
        const rows = await sql`
          SELECT DISTINCT
            EXTRACT(YEAR FROM date_reunion)::int  AS annee,
            EXTRACT(MONTH FROM date_reunion)::int AS mois
          FROM reunions
          ORDER BY annee ASC, mois ASC
        `;
        const periodes = rows.map((r) => ({ annee: r.annee, mois: r.mois }));
        const annees = [...new Set(periodes.map((p) => p.annee))].sort((a, b) => a - b);
        res.status(200).json({ ok: true, periodes, annees });
      } catch (err) {
        res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des périodes.' });
      }
      return;
    }

    const mois = parseInt(req.query.mois, 10);

    if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
      res.status(400).json({ ok: false, error: 'Paramètre "mois" invalide (1 à 12 attendu).' });
      return;
    }

    const annee = req.query.annee != null ? parseInt(req.query.annee, 10) : null;
    if (annee != null && (!Number.isInteger(annee) || annee < 2026 || annee > 2100)) {
      res.status(400).json({ ok: false, error: 'Paramètre "annee" invalide.' });
      return;
    }

    try {
      const reunions = annee != null
        ? await sql`
            SELECT id, date_reunion::text AS date, libelle
            FROM reunions
            WHERE EXTRACT(MONTH FROM date_reunion) = ${mois}
              AND EXTRACT(YEAR FROM date_reunion) = ${annee}
            ORDER BY date_reunion ASC
          `
        : await sql`
            SELECT id, date_reunion::text AS date, libelle
            FROM reunions
            WHERE EXTRACT(MONTH FROM date_reunion) = ${mois}
            ORDER BY date_reunion ASC
          `;

      const roles = await sql`SELECT id, nom, ordre FROM roles ORDER BY ordre ASC`;

      const reunionIds = reunions.map((r) => r.id);
      if (reunionIds.length === 0) {
        res.status(200).json({ ok: true, reunions: [], roles });
        return;
      }

      const assignations = await sql`
        SELECT p.reunion_id, p.role_id, p.frere_id, f.nom AS frere_nom
        FROM programme p
        LEFT JOIN freres f ON f.id = p.frere_id
        WHERE p.reunion_id = ANY(${reunionIds})
      `;

      const dispos = await sql`
        SELECT d.reunion_id, d.frere_id, d.etat, d.nature, f.nom AS frere_nom
        FROM disponibilites d
        JOIN freres f ON f.id = d.frere_id
        WHERE d.reunion_id = ANY(${reunionIds})
      `;

      const assignParReunion = new Map();
      for (const a of assignations) {
        if (!assignParReunion.has(a.reunion_id)) assignParReunion.set(a.reunion_id, new Map());
        assignParReunion.get(a.reunion_id).set(a.role_id, {
          frereId: a.frere_id,
          frereNom: a.frere_nom
        });
      }

      const disposParReunion = new Map();
      for (const d of dispos) {
        if (!disposParReunion.has(d.reunion_id)) disposParReunion.set(d.reunion_id, []);
        disposParReunion.get(d.reunion_id).push({
          frereId: d.frere_id,
          frereNom: d.frere_nom,
          etat: d.etat,
          nature: d.nature
        });
      }

      const result = reunions.map((r) => ({
        id: r.id,
        date: r.date,
        libelle: r.libelle,
        slots: roles.map((role) => {
          const a = assignParReunion.get(r.id)?.get(role.id);
          return {
            roleId: role.id,
            roleNom: role.nom,
            frereId: a ? a.frereId : null,
            frereNom: a ? a.frereNom : null
          };
        }),
        disponibilites: disposParReunion.get(r.id) || []
      }));

      res.status(200).json({ ok: true, reunions: result, roles });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de la récupération du programme.' });
    }
    return;
  }

  if (req.method === 'POST') {
    // Sous-route : génération des réunions (mardis + samedis) d'une année complète.
    // Idempotent (ON CONFLICT DO NOTHING). Évite une fonction serverless dédiée.
    if (req.body && req.body.action === 'generer-reunions') {
      const annee = parseInt(req.body.annee, 10);
      if (!Number.isInteger(annee) || annee < 2026 || annee > 2100) {
        res.status(400).json({ ok: false, error: 'Paramètre "annee" invalide (2026 à 2100 attendu).' });
        return;
      }
      const debut = `${annee}-01-01`;
      const fin = `${annee}-12-31`;
      try {
        const inseres = await sql`
          INSERT INTO reunions (date_reunion, libelle)
          SELECT
            d::date,
            CASE EXTRACT(DOW FROM d) WHEN 2 THEN 'mardi ' WHEN 6 THEN 'samedi ' END ||
            EXTRACT(DAY FROM d)::int || ' ' ||
            CASE EXTRACT(MONTH FROM d)
              WHEN 1 THEN 'janvier'  WHEN 2 THEN 'février'   WHEN 3 THEN 'mars'
              WHEN 4 THEN 'avril'    WHEN 5 THEN 'mai'       WHEN 6 THEN 'juin'
              WHEN 7 THEN 'juillet'  WHEN 8 THEN 'août'      WHEN 9 THEN 'septembre'
              WHEN 10 THEN 'octobre' WHEN 11 THEN 'novembre' WHEN 12 THEN 'décembre'
            END
          FROM generate_series(${debut}::date, ${fin}::date, '1 day'::interval) AS d
          WHERE EXTRACT(DOW FROM d) IN (2, 6)
          ON CONFLICT (date_reunion) DO NOTHING
          RETURNING id
        `;
        res.status(200).json({ ok: true, annee, inseres: inseres.length });
      } catch (err) {
        res.status(500).json({ ok: false, error: 'Erreur lors de la génération des réunions.' });
      }
      return;
    }

    const { reunionId, roleId, frereId } = req.body || {};

    if (!Number.isInteger(reunionId) || reunionId <= 0) {
      res.status(400).json({ ok: false, error: 'Paramètre "reunionId" invalide.' });
      return;
    }
    if (!Number.isInteger(roleId) || roleId <= 0) {
      res.status(400).json({ ok: false, error: 'Paramètre "roleId" invalide.' });
      return;
    }
    if (frereId !== null && (!Number.isInteger(frereId) || frereId <= 0)) {
      res.status(400).json({ ok: false, error: 'Paramètre "frereId" invalide.' });
      return;
    }

    try {
      await sql`
        INSERT INTO programme (reunion_id, role_id, frere_id, updated_at)
        VALUES (${reunionId}, ${roleId}, ${frereId}, now())
        ON CONFLICT (reunion_id, role_id)
        DO UPDATE SET frere_id = EXCLUDED.frere_id, updated_at = now()
      `;
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de l\'enregistrement du programme.' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
};
