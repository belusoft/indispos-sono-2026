# Mes Indispos — Sono & Accueil 2026

PWA légère (HTML/CSS/JS vanilla) + Vercel Serverless Functions + Neon Postgres, pour recueillir les disponibilités des frères de l'équipe Sono & Accueil aux réunions du mardi et du samedi, de mai à décembre 2026.

## 1. Créer le projet Neon

1. Va sur [console.neon.tech](https://console.neon.tech) et crée un compte / connecte-toi.
2. Clique sur **New Project**, choisis une région proche (ex. Europe) et nomme-le `mes-indispos`.
3. Une fois le projet créé, Neon affiche une **connection string** du type :
   `postgresql://user:password@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   Copie-la, elle servira de `DATABASE_URL`.

## 2. Exécuter le script SQL

1. Dans la console Neon, ouvre l'onglet **SQL Editor**.
2. Colle le contenu du fichier `db/schema.sql` et exécute-le.
   Cela crée les tables `freres`, `reunions`, `disponibilites`, les index, et génère automatiquement toutes les réunions (mardis/samedis) de mai à décembre 2026.
3. Ajoute les frères de l'équipe, par exemple :
   ```sql
   INSERT INTO freres (nom) VALUES ('Jean'), ('Paul'), ('Pierre')
   ON CONFLICT (nom) DO NOTHING;
   ```

## 3. Connexion à Vercel

1. Pousse ce projet sur un dépôt GitHub (ou GitLab/Bitbucket).
2. Va sur [vercel.com](https://vercel.com), clique sur **Add New → Project**, et importe le dépôt.
3. Vercel détecte automatiquement :
   - `public/` comme dossier statique ;
   - `api/` comme dossier de fonctions serverless.
   Aucune commande de build n'est nécessaire — laisse les champs **Build Command** et **Output Directory** vides/par défaut.

## 4. Configurer `DATABASE_URL`

1. Dans le projet Vercel, va dans **Settings → Environment Variables**.
2. Ajoute :
   - Nom : `DATABASE_URL`
   - Valeur : la connection string copiée à l'étape 1
   - Environnements : Production, Preview et Development
3. Enregistre.

## 5. Déploiement

1. Depuis l'onglet **Deployments**, clique sur **Deploy** (ou pousse un commit sur la branche principale : Vercel déploie automatiquement).
2. Une fois le déploiement terminé, Vercel fournit une URL du type `https://mes-indispos.vercel.app`.
3. Ouvre cette URL sur un smartphone pour tester l'installation en PWA (icône « Ajouter à l'écran d'accueil »).

## 6. Tests à effectuer

- **Chargement des frères** : ouvrir l'app, vérifier que la liste se charge et se filtre bien pendant la saisie.
- **Sélection** : vérifier que le bouton « Suivant » reste désactivé tant qu'aucun frère n'est sélectionné, et que le choix persiste après rechargement de la page (localStorage).
- **Saisie d'un mois** : choisir un mois, cocher Disponible/Indisponible/Participation sur plusieurs dates, vérifier que le champ « Nature participation… » apparaît uniquement pour « Participation » et bloque la validation s'il est vide.
- **Plusieurs mois** : renseigner 2-3 mois différents, vérifier que chaque carte de mois validé apparaît marquée comme terminée (✓).
- **Récapitulatif** : vérifier que toutes les dates et états saisis apparaissent avec le bon badge coloré.
- **Envoi** : cliquer sur « Envoyer mes disponibilités », vérifier le loader, puis l'écran « Merci frère ! ».
- **Vérification en base** : dans Neon SQL Editor, exécuter `SELECT * FROM disponibilites ORDER BY updated_at DESC;` pour confirmer l'enregistrement.
- **Ré-envoi (mise à jour)** : renseigner à nouveau un mois déjà envoyé avec un état différent, renvoyer, et vérifier que la ligne correspondante en base est mise à jour (pas dupliquée) grâce à `ON CONFLICT`.
- **Mode hors-ligne partiel** : couper la connexion après le premier chargement, recharger l'app : la coquille (HTML/CSS/JS/icônes) doit s'afficher via le service worker, même si les données API ne se chargent pas (comportement attendu, volontairement non mis en cache).
- **Effacer les données locales** : vérifier que le bouton correspondant vide bien le `localStorage` (frère sélectionné + disponibilités en cours de saisie).

## Structure du projet

```
/
├── public/
│   ├── index.html          (CSS + JS inclus, page unique)
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── api/
│   ├── freres.js
│   ├── reunions.js
│   └── disponibilites.js
├── db/
│   └── schema.sql
├── package.json
├── vercel.json
└── README.md
```

## Note sur la sécurité

Cette version n'a pas d'authentification : n'importe qui ayant le lien peut soumettre des disponibilités pour n'importe quel frère de la liste. La structure (routes API séparées, validation stricte côté serveur) est prête pour ajouter plus tard un code d'accès ou un lien à jeton sans tout réécrire — mais ce n'est pas encore en place. À évaluer selon le niveau de confidentialité souhaité avant une diffusion large.
