# VPlacard

VPlacard is a personal pantry and meal-planning web app built with React, TypeScript, Vite and Supabase.

It centralizes what is available at home, helps track expiration dates, prepares shopping lists, suggests recipes from the current stock, and manages a weekly meal plan. The product UI is in French because the app was designed for my own daily use.

Live app: [app-placardb.vercel.app](https://app-placardb.vercel.app)

## Why This Project Exists

I built VPlacard to turn a real household problem into a complete product: knowing what is already in the cupboard, fridge, freezer, cleaning shelf or medicine box before buying more.

The goal was not only to create a CRUD app, but to connect several practical workflows:

- stock management with quantities, units, places and expiration dates;
- barcode scanning with Open Food Facts autofill;
- shopping list generation from missing or low-stock products;
- recipe matching based on available ingredients;
- weekly meal planning with stock decrement after a meal is consumed;
- editable recipe and app images stored in Supabase Storage.

## Main Features

- Multi-zone stock: cupboard, fridge, freezer, household products and medicines.
- Product records: brand, barcode, category, subcategory, nutrition fields and default unit.
- Expiration tracking: DLC/DDM status, soon-expiring alerts and opened-product priority.
- Barcode scanner: camera-based scanner using `html5-qrcode`, with Open Food Facts enrichment.
- Shopping list: products are grouped by reason, with quick add-back into stock.
- Recipes: built-in sample recipes, custom recipes, editable ingredients and images.
- Meal planning: weekly calendar, custom meals, recipe scaling and calorie override.
- Stock decrement: when a meal is marked as consumed, matching ingredients are deducted from stock.
- Media customization: default and user-provided images are uploaded to Supabase Storage.

## Tech Stack

- Frontend: React 19, TypeScript, Vite
- Backend services: Supabase Database and Storage
- Scanner: `html5-qrcode`
- Data enrichment: Open Food Facts API
- Tooling: ESLint, Prettier, TypeScript build checks
- Deployment: Vercel

## Project Structure

```text
src/
  App.tsx                  Main application state and screens
  App.css                  Application styling
  BarcodeScanner.tsx       Camera barcode scanner modal
  main.tsx                 React entry point
  supabaseClient.ts        Supabase browser client

scripts/
  seed-vplacard-media.mjs  Uploads default images to Supabase Storage

supabase/
  setup-media.sql          Storage, media tables and RLS policies
```

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the Supabase project values:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Vite exposes variables prefixed with `VITE_` to the browser bundle. Do not put service-role keys or private secrets in these variables.

## Supabase Setup

The app expects the main product tables to exist in Supabase:

- `products`
- `stocks`
- `recipes`
- `recipe_ingredients`
- `week_meals`

Additional media and recipe-override setup is stored in [`supabase/setup-media.sql`](supabase/setup-media.sql):

- public bucket `vplacard-media`;
- `image_assets` for app and recipe image overrides;
- `recipe_overrides` for editing bundled sample recipes;
- RLS policies for the current client-only demo.

Before turning this into a multi-user product, the public policies should be replaced by authenticated ownership policies using a `user_id` on each business table.

## Seed Default Images

After the Supabase bucket and policies are configured:

```bash
npm run seed:media
```

The script is idempotent: existing files are skipped.

## Quality Checks

```bash
npm run lint
npm run format:check
npm run build
```

Use this before sharing or deploying changes.

## Deployment

The production version is deployed on Vercel from the GitHub repository:

[https://app-placardb.vercel.app](https://app-placardb.vercel.app)

## Notes For Reviewers

This is a portfolio project showing product thinking and implementation across UI, database-backed state, file storage and real-world household workflows. The current codebase is intentionally simple to run as a client-only application. The next engineering steps would be:

- split the large `App.tsx` into smaller feature modules;
- generate typed Supabase table definitions;
- add authentication and per-user data ownership;
- add component and end-to-end tests for scanner, stock updates and meal planning;
- add analytics around waste reduction and shopping frequency.
