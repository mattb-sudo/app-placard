# VPlacard

Application React/Vite pour gérer un stock de cuisine, des recettes, un planning repas et une liste de courses.

## Lancer en local

```bash
npm install
npm run dev
```

Variables nécessaires dans `.env` ou `.env.local` :

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Scripts

```bash
npm run lint
npm run build
npm run seed:media
```

`seed:media` télécharge les images par défaut et les envoie dans le bucket Supabase `vplacard-media`. Le script est idempotent : les fichiers déjà présents sont ignorés.

## Supabase

Le setup média est documenté dans `supabase/setup-media.sql` :

- bucket public `vplacard-media`
- table `image_assets` pour les photos personnalisées de l'app et des recettes
- table `recipe_overrides` pour modifier les recettes d'exemple
- RLS + policies publiques adaptées à l'app client-only actuelle
- RLS activé sur `week_meals` pour éviter une table publique sans policy

À durcir avant une vraie version multi-utilisateur : ajouter l'authentification, un `user_id` sur les tables métier et remplacer les policies publiques par des policies propriétaires.
