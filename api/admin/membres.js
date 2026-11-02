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
    try {
      const freres = await sql`SELECT id, nom FROM freres ORDER BY nom ASC`;
      const liens = await sql`SELECT frere_id, role_id FROM membre_roles`;

      const rolesParFrere = new Map();
      for (const l of liens) {
        if (!rolesParFrere.has(l.frere_id)) rolesParFrere.set(l.frere_id, []);
        rolesParFrere.get(l.frere_id).push(l.role_id);
      }

      const membres = freres.map((f) => ({
        id: f.id,
        nom: f.nom,
        roleIds: rolesParFrere.get(f.id) || []
      }));

      res.status(200).json({ ok: true, membres });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des membres.' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const { frereId, roleIds } = req.body || {};

    if (!Number.isInteger(frereId) || frereId <= 0) {
      res.status(400).json({ ok: false, error: 'Paramètre "frereId" invalide.' });
      return;
    }

    if (!Array.isArray(roleIds) || !roleIds.every((r) => Number.isInteger(r) && r > 0)) {
      res.status(400).json({ ok: false, error: 'Paramètre "roleIds" invalide.' });
      return;
    }

    try {
      const frere = await sql`SELECT id FROM freres WHERE id = ${frereId}`;
      if (frere.length === 0) {
        res.status(400).json({ ok: false, error: 'Frère introuvable.' });
        return;
      }

      await sql`DELETE FROM membre_roles WHERE frere_id = ${frereId}`;

      for (const roleId of roleIds) {
        await sql`
          INSERT INTO membre_roles (frere_id, role_id)
          VALUES (${frereId}, ${roleId})
          ON CONFLICT DO NOTHING
        `;
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de la mise à jour des rôles.' });
    }
    return;
  }

  if (req.method === 'POST') {
    const brut = req.body || {};
    const prenom = typeof brut.prenom === 'string' ? brut.prenom.trim().replace(/\s+/g, ' ') : '';
    const initiale = typeof brut.initiale === 'string' ? brut.initiale.trim() : '';

    if (!/^[\p{L}][\p{L}' -]{0,39}$/u.test(prenom)) {
      res.status(400).json({ ok: false, error: 'Prénom invalide (lettres, espaces, tirets ou apostrophes, 40 caractères max).' });
      return;
    }
    if (!/^\p{L}$/u.test(initiale)) {
      res.status(400).json({ ok: false, error: 'Indique la première lettre du nom (une seule lettre).' });
      return;
    }

    const nom = prenom.charAt(0).toLocaleUpperCase('fr') + prenom.slice(1) + ' ' + initiale.toLocaleUpperCase('fr') + '.';

    try {
      const existe = await sql`SELECT id FROM freres WHERE lower(nom) = lower(${nom})`;
      if (existe.length > 0) {
        res.status(409).json({ ok: false, error: nom + ' existe déjà.' });
        return;
      }
      const cree = await sql`INSERT INTO freres (nom) VALUES (${nom}) RETURNING id, nom`;
      res.status(201).json({ ok: true, membre: { id: cree[0].id, nom: cree[0].nom, roleIds: [] } });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de l\'ajout du frère.' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { frereId } = req.body || {};

    if (!Number.isInteger(frereId) || frereId <= 0) {
      res.status(400).json({ ok: false, error: 'Paramètre "frereId" invalide.' });
      return;
    }

    try {
      const frere = await sql`SELECT id, nom FROM freres WHERE id = ${frereId}`;
      if (frere.length === 0) {
        res.status(404).json({ ok: false, error: 'Frère introuvable.' });
        return;
      }

      // Efface aussi ses réponses, ses rôles et ses participations VCM (ON DELETE CASCADE) ;
      // ses places dans le programme sont laissées vides (ON DELETE SET NULL).
      const reponses = await sql`SELECT count(*)::int AS n FROM disponibilites WHERE frere_id = ${frereId}`;
      const places = await sql`SELECT count(*)::int AS n FROM programme WHERE frere_id = ${frereId}`;
      await sql`DELETE FROM freres WHERE id = ${frereId}`;

      res.status(200).json({ ok: true, nom: frere[0].nom, reponsesEffacees: reponses[0].n, placesLiberees: places[0].n });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Erreur lors de la suppression du frère.' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
};
