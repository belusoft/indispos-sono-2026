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
3. Ajoute les frères de l'équipe en remplaçant les noms ci-dessous par la vraie liste
   (utilise le format « Prénom I. » pour distinguer les homonymes) :
   ```sql
   INSERT INTO freres (nom) VALUES ('Prénom N.')
   ON CONFLICT (nom) DO NOTHING;
   ```
   ⚠️ Ne pas exécuter cette requête avec des noms d'exemple littéraux — remplace-les
   d'abord par les vrais noms, sous peine d'insérer des frères fictifs en base.

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
│   ├── admin.html          (espace administrateur)
├── api/
│   ├── freres.js
│   ├── reunions.js
│   ├── disponibilites.js
│   ├── _lib/
│   │   └── auth.js         (vérif. token admin — jamais exposé comme route)
│   └── admin/
│       ├── login.js
│       ├── logout.js
│       ├── roles.js
│       ├── membres.js
│       ├── programme.js
│       └── auto-assign.js
├── db/
│   └── schema.sql
├── package.json
├── vercel.json
└── README.md
```

## Espace Administration (`/admin.html`)

Permet de construire le programme de service (Audio, Vidéo, Perches, Estrade, Accueil…) à partir des disponibilités saisies par les frères.

- **Authentification** : mot de passe partagé, vérifié côté serveur (`ADMIN_PASSWORD`, variable d'environnement — jamais exposée au client). La connexion crée un jeton stocké en base (`admin_sessions`), valable 12h, envoyé ensuite dans l'en-tête `x-admin-token`. Aucune logique de sécurité côté navigateur.
- **Membres & rôles** : coche les rôles que chaque frère peut assurer (table `membre_roles`).
- **Programme** : pour chaque mois, affiche les réunions et les 9 rôles à pourvoir ; attribution manuelle via menu déroulant (avec l'état de disponibilité affiché), ou génération automatique.
- **Auto-attribution** (`api/admin/auto-assign.js`) : algorithme de répartition équitable (pas d'IA/LLM) — pour chaque rôle non pourvu, sélectionne parmi les frères habilités et non indisponibles celui qui a la meilleure priorité (disponible > participation > sans réponse), puis en cas d'égalité celui qui a été affecté le moins souvent récemment (rotation). Deux modes : ne remplir que les cases vides, ou régénérer tout le mois (écrase les affectations manuelles, confirmation demandée).
- Pour configurer/changer le mot de passe : variable d'environnement Vercel `ADMIN_PASSWORD` (Project Settings → Environment Variables), puis redéployer.

## Note sur la sécurité

La saisie des disponibilités (`/index.html`) n'a pas d'authentification : n'importe qui ayant le lien peut soumettre des disponibilités pour n'importe quel frère de la liste — à évaluer selon le niveau de confidentialité souhaité avant une diffusion large. L'espace `/admin.html`, lui, est protégé par mot de passe vérifié côté serveur.
