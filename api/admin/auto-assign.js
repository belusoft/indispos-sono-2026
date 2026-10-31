const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../_lib/auth');

// Score de priorité : plus bas = meilleur candidat.
// 0 = disponible, 1 = en participation, 2 = sans réponse. Indisponible = exclu.
function scoreEtat(etat) {
  if (etat === 'dispo') return 0;
  if (etat === 'particip') return 1;
  return 2; // sans réponse (pas de ligne disponibilites)
}

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
  const overwrite = req.body?.overwrite === true;

  if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
    res.status(400).json({ ok: false, error: 'Paramètre "mois" invalide (1 à 12 attendu).' });
    return;
  }

  const annee = req.body?.annee != null ? parseInt(req.body.annee, 10) : null;
  if (annee != null && (!Number.isInteger(annee) || annee < 2026 || annee > 2100)) {
    res.status(400).json({ ok: false, error: 'Paramètre "annee" invalide.' });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

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

    if (reunions.length === 0) {
      res.status(200).json({ ok: true, totalSlots: 0, remplis: 0, details: [] });
      return;
    }

    const reunionIds = reunions.map((r) => r.id);

    const roles = await sql`SELECT id, nom, ordre FROM roles ORDER BY ordre ASC`;

    const membreRoles = await sql`SELECT frere_id, role_id FROM membre_roles`;
    const rolesParMembre = new Map(); // role_id -> Set(frere_id)
    for (const mr of membreRoles) {
      if (!rolesParMembre.has(mr.role_id)) rolesParMembre.set(mr.role_id, new Set());
      rolesParMembre.get(mr.role_id).add(mr.frere_id);
    }

    const freres = await sql`SELECT id, nom FROM freres`;
    const nomParFrere = new Map(freres.map((f) => [f.id, f.nom]));

    const dispos = await sql`
      SELECT reunion_id, frere_id, etat
      FROM disponibilites
      WHERE reunion_id = ANY(${reunionIds})
    `;
    const etatParReunionFrere = new Map(); // "reunionId:frereId" -> etat
    for (const d of dispos) {
      etatParReunionFrere.set(`${d.reunion_id}:${d.frere_id}`, d.etat);
    }

    // Décompte des affectations déjà existantes (toutes réunions confondues) pour l'équité/rotation.
    const toutesAffectations = await sql`SELECT frere_id FROM programme WHERE frere_id IS NOT NULL`;
    const usageCount = new Map(); // frere_id -> compteur
    for (const a of toutesAffectations) {
      usageCount.set(a.frere_id, (usageCount.get(a.frere_id) || 0) + 1);
    }
    const incrUsage = (frereId) => usageCount.set(frereId, (usageCount.get(frereId) || 0) + 1);

    const existantes = await sql`
      SELECT reunion_id, role_id, frere_id
      FROM programme
      WHERE reunion_id = ANY(${reunionIds})
    `;
    const existantParReunion = new Map(); // reunion_id -> Map(role_id -> frere_id|null)
    for (const e of existantes) {
      if (!existantParReunion.has(e.reunion_id)) existantParReunion.set(e.reunion_id, new Map());
      existantParReunion.get(e.reunion_id).set(e.role_id, e.frere_id);
    }

    let totalSlots = 0;
    let remplis = 0;
    const details = [];
    const ecritures = []; // { reunionId, roleId, frereId }

    for (const reunion of reunions) {
      const dejaAffecteCeJour = new Set(); // frere_id déjà pris sur cette réunion (un seul rôle par jour)
      const existantPourReunion = existantParReunion.get(reunion.id) || new Map();
      for (const frereId of existantPourReunion.values()) {
        if (frereId) dejaAffecteCeJour.add(frereId);
      }

      let rolesRemplis = 0;

      for (const role of roles) {
        totalSlots += 1;
        const assignationActuelle = existantPourReunion.get(role.id) || null;

        if (assignationActuelle && !overwrite) {
          rolesRemplis += 1;
          continue;
        }

        const eligibles = Array.from(rolesParMembre.get(role.id) || []).filter((frereId) => {
          if (dejaAffecteCeJour.has(frereId)) return false;
          const etat = etatParReunionFrere.get(`${reunion.id}:${frereId}`);
          return etat !== 'indispo';
        });

        if (eligibles.length === 0) {
          ecritures.push({ reunionId: reunion.id, roleId: role.id, frereId: null });
          continue;
        }

        eligibles.sort((a, b) => {
          const etatA = etatParReunionFrere.get(`${reunion.id}:${a}`);
          const etatB = etatParReunionFrere.get(`${reunion.id}:${b}`);
          const scoreA = scoreEtat(etatA);
          const scoreB = scoreEtat(etatB);
          if (scoreA !== scoreB) return scoreA - scoreB;
          return (usageCount.get(a) || 0) - (usageCount.get(b) || 0);
        });

        const choisi = eligibles[0];
        ecritures.push({ reunionId: reunion.id, roleId: role.id, frereId: choisi });
        dejaAffecteCeJour.add(choisi);
        incrUsage(choisi);
        rolesRemplis += 1;
      }

      remplis += rolesRemplis;
      details.push({
        reunionId: reunion.id,
        date: reunion.date,
        libelle: reunion.libelle,
        rolesRemplis,
        totalRoles: roles.length
      });
    }

    for (const e of ecritures) {
      await sql`
        INSERT INTO programme (reunion_id, role_id, frere_id, updated_at)
        VALUES (${e.reunionId}, ${e.roleId}, ${e.frereId}, now())
        ON CONFLICT (reunion_id, role_id)
        DO UPDATE SET frere_id = EXCLUDED.frere_id, updated_at = now()
      `;
    }

    res.status(200).json({ ok: true, totalSlots, remplis, details });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur lors de la génération automatique du programme.' });
  }
};
