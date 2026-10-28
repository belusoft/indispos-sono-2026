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

  res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
};
