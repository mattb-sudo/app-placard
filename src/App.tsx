import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, FormEvent, ReactNode } from 'react';
import { supabase } from './supabaseClient';
import { BarcodeScanner } from './BarcodeScanner';
import './App.css';

type Tab = 'dashboard' | 'stock' | 'history' | 'weekmenu' | 'shopping' | 'recipes' | 'settings';
type StockFilter = 'all' | 'soon' | 'expired' | 'expired-dlc' | 'expired-ddm' | 'open' | 'low';
type ShoppingFilter = 'all' | 'low' | 'planned' | 'absent';
type StockSort = 'expiration' | 'name' | 'quantity' | 'place';
type StockSortDirection = 'asc' | 'desc';
type StockShelfKind = 'pantry' | 'fridge' | 'freezer' | 'household' | 'medicine';
type RecipeFilter = 'all' | 'ready' | 'urgent' | 'missing';
type ExpirationStatus = 'ok' | 'soon' | 'expired';
type ExpirationType = 'dlc' | 'ddm' | 'unknown';

const MAIN_CATEGORIES = [
  'Produit de santé',
  'Produit sucré',
  'Produit salé',
  'Produit ménager',
  'Épices',
] as const;

type MainCategory = (typeof MAIN_CATEGORIES)[number];

const SUBCATS = {
  'Produit sucré': ['Thé', 'Déjeuner', 'Pâtisserie', 'Chocolat', 'Fruits sec', 'Boisson'],
  'Produit salé': ['Conserve', 'Poisson', 'Condiment', 'Asiatique', 'Soupe', 'Vrac', 'Apéro'],
  'Produit de santé': ['Pansement', 'Médicament', 'Matériel', 'Complément'],
  'Produit ménager': ['Toilettes', 'Surface', 'Sol', 'Vitre', 'Vaisselle', 'Lessive', 'Bricolage', 'Sacs'],
} as const;

// Type = union de toutes les sous-catégories possibles
type SubCategory =
  (typeof SUBCATS)[keyof typeof SUBCATS][number];

// helper
function getSubcatsFor(cat: MainCategory | ''): readonly string[] {
  if (!cat || !(cat in SUBCATS)) return [];
  return SUBCATS[cat as keyof typeof SUBCATS];
}

type IngredientUnit = 'g' | 'ml' | 'unité';

type RecipeIngredient = {
  name: string;
  amount: number | null;
  unit: IngredientUnit | null;
};

type Product = {
  id: string;
  name: string;
  generic_name?: string | null;
  brand: string | null;
  category: string | null;
  sub_category: string | null; 
  default_unit: string | null;
  barcode: string | null;
  shopping_hidden: boolean;
  is_main: boolean;

  // ✅ nutrition
  kcal_100g: number | null;
  kcal_serving: number | null;
  serving_size_g: number | null;
  grams_per_unit_g: number | null; // si unité
  density_g_ml: number | null;     // si ml/l
};

type StockItem = {
  id: string;
  place: string | null;
  quantity: number | null;
  unit: string | null;
  expiration_date: string | null;
  expiration_type: ExpirationType;
  is_open: boolean;
  product: Product | null;
};

type RecipeKind = 'savory' | 'sweet';

type Recipe = {
  id: string;
  name: string;
  kind: RecipeKind;
  ingredients: RecipeIngredient[]; // ✅ corrigé
  servings: number | null;
  tags?: string[];
};

type EnrichedRecipe = Recipe & {
  missing: string[];
  missingCount: number;
  urgentIngredients: string[];
  urgentCount: number;
  feasible: boolean;
};

type Settings = {
  soonDays: number;
  recipesMaxMissing: number;
  defaultPlace: string;
  dailyCalorieGoal: number;
};

const DEFAULT_SETTINGS: Settings = {
  soonDays: 7,
  recipesMaxMissing: 2,
  defaultPlace: 'Placard',
  dailyCalorieGoal: 2200,
};

const DEFAULT_STOCK_PLACES = [
  'Placard',
  'Frigo',
  'Congélateur',
  'Produits ménagers',
  'Médicaments',
] as const;

const STOCK_PLACE_PLACEHOLDER = DEFAULT_STOCK_PLACES.join(', ');

type MealSlot = 'breakfast' | 'lunch' | 'dinner';

const MEAL_SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Petit-déj' },
  { key: 'lunch', label: 'Déjeuner' },
  { key: 'dinner', label: 'Dîner' },
];

type WeekMeal = {
  id: string;
  meal_date: string; // 'YYYY-MM-DD'
  meal_slot: MealSlot;
  recipe_id: string | null;
  recipe_name: string;
  recipe_kind: RecipeKind | null;
  ingredients: string[] | null;
  kcal_override: number | null;
  servings: number | null;
  notes: string | null;
  consumed_at: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  generic_name: string | null;
  brand: string | null;
  category: string | null;
  sub_category: string | null;
  default_unit: string | null;
  barcode: string | null;
  shopping_hidden: boolean | null;
  is_main: boolean | null;
  kcal_100g: number | null;
  kcal_serving: number | null;
  serving_size_g: number | null;
  grams_per_unit_g: number | null;
  density_g_ml: number | null;
};

type StockRow = {
  id: string;
  place: string | null;
  quantity: number | null;
  unit: string | null;
  expiration_date: string | null;
  expiration_type: string | null;
  is_open: boolean | null;
  product?: ProductRow | ProductRow[] | null;
};

type WeekMealRow = {
  id: string;
  meal_date: string;
  meal_slot: string;
  recipe_id: string | null;
  recipe_name: string | null;
  recipe_kind: string | null;
  ingredients: string[] | null;
  kcal_override: number | null;
  servings: number | null;
  notes: string | null;
  consumed_at: string | null;
};

type RecipeIngredientRow = {
  ingredient: string | null;
  position: number | null;
  amount: number | null;
  unit: string | null;
};

type RecipeRow = {
  id: string;
  name: string;
  kind: string;
  servings: number | null;
  recipe_ingredients: RecipeIngredientRow[] | null;
};

type ImageAssetKind = 'app' | 'recipe';

type ImageAssetRow = {
  kind: string;
  image_key: string;
  path: string | null;
  public_url: string | null;
};

type RecipeOverrideRow = {
  recipe_id: string;
  name: string | null;
  kind: string | null;
  ingredients: unknown;
  servings: number | string | null;
};

function toExpirationType(value: string | null | undefined): ExpirationType {
  if (value === 'dlc' || value === 'ddm' || value === 'unknown') return value;
  return 'dlc';
}

function toRecipeKind(value: string | null | undefined): RecipeKind | null {
  if (value === 'savory' || value === 'sweet') return value;
  return null;
}

function toIngredientUnit(value: string | null | undefined): IngredientUnit | null {
  if (value === 'g' || value === 'ml' || value === 'unité') return value;
  return null;
}

function normalizeProductRow(product: ProductRow): Product {
  return {
    id: product.id,
    name: product.name,
    generic_name: product.generic_name ?? null,
    brand: product.brand,
    category: product.category,
    sub_category: product.sub_category ?? null,
    default_unit: product.default_unit,
    barcode: product.barcode ?? null,
    shopping_hidden: !!product.shopping_hidden,
    is_main: !!product.is_main,
    kcal_100g: product.kcal_100g ?? null,
    kcal_serving: product.kcal_serving ?? null,
    serving_size_g: product.serving_size_g ?? null,
    grams_per_unit_g: product.grams_per_unit_g ?? null,
    density_g_ml: product.density_g_ml ?? null,
  };
}

function normalizeProductRelation(product: ProductRow | ProductRow[] | null | undefined): Product | null {
  const row = Array.isArray(product) ? product[0] : product;
  return row ? normalizeProductRow(row) : null;
}

function normalizeStockRow(row: StockRow): StockItem {
  return {
    id: row.id,
    place: row.place,
    quantity: row.quantity,
    unit: row.unit,
    expiration_date: row.expiration_date,
    expiration_type: toExpirationType(row.expiration_type),
    is_open: !!row.is_open,
    product: normalizeProductRelation(row.product),
  };
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

const SETTINGS_STORAGE_KEY = 'pantrypilot_settings_v1';
const SHOPPING_CHECKED_STORAGE_KEY = 'pantrypilot_checked_shopping_v1';
const MEDIA_BUCKET = 'vplacard-media';
const IMAGE_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const SUPABASE_PUBLIC_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');

function mediaPublicUrl(path: string): string {
  return `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

type RecipeOverride = {
  name: string;
  kind: RecipeKind;
  ingredients: RecipeIngredient[];
  servings: number | null;
};

type AppImageKey =
  | 'dashboardHero'
  | 'stockHero'
  | 'stockEmpty'
  | 'shoppingHero'
  | 'shoppingEmpty'
  | 'planningHero'
  | 'historyHero'
  | 'historyEmpty';

type AppImages = Record<AppImageKey, string>;

const DEFAULT_APP_IMAGE_PATHS: Record<AppImageKey, string> = {
  dashboardHero: 'app/default-dashboard-hero.jpg',
  stockHero: 'app/default-stock-hero.jpg',
  stockEmpty: 'app/default-stock-empty.jpg',
  shoppingHero: 'app/default-shopping-hero.jpg',
  shoppingEmpty: 'app/default-shopping-empty.jpg',
  planningHero: 'app/default-planning-hero.jpg',
  historyHero: 'app/default-history-hero.jpg',
  historyEmpty: 'app/default-history-empty.jpg',
};

const DEFAULT_APP_IMAGES: AppImages = {
  dashboardHero: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.dashboardHero),
  stockHero: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.stockHero),
  stockEmpty: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.stockEmpty),
  shoppingHero: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.shoppingHero),
  shoppingEmpty: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.shoppingEmpty),
  planningHero: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.planningHero),
  historyHero: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.historyHero),
  historyEmpty: mediaPublicUrl(DEFAULT_APP_IMAGE_PATHS.historyEmpty),
};

const APP_IMAGE_FIELDS: { key: AppImageKey; label: string; description: string }[] = [
  { key: 'dashboardHero', label: "Aujourd'hui", description: 'Bandeau principal' },
  { key: 'stockHero', label: 'Stock', description: 'Inventaire' },
  { key: 'stockEmpty', label: 'Stock vide', description: 'Aucun produit' },
  { key: 'shoppingHero', label: 'Courses', description: 'Préparation achats' },
  { key: 'shoppingEmpty', label: 'Courses vides', description: 'Liste terminée' },
  { key: 'planningHero', label: 'Planning', description: 'Menu de semaine' },
  { key: 'historyHero', label: 'Historique', description: 'Anciens achats' },
  { key: 'historyEmpty', label: 'Historique vide', description: 'Aucun ancien achat' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeImageUrl(value: string): string {
  return value.trim();
}

function cssImageUrl(value: string): string {
  const safeValue = sanitizeImageUrl(value);
  return safeValue ? `url("${safeValue.replace(/"/g, '%22')}")` : 'none';
}

function normalizeStoredIngredients(value: unknown): RecipeIngredient[] | null {
  if (!Array.isArray(value)) return null;

  const ingredients = value
    .filter(isRecord)
    .map((ingredient) => ({
      name: typeof ingredient.name === 'string' ? ingredient.name : '',
      amount: typeof ingredient.amount === 'number' && Number.isFinite(ingredient.amount) ? ingredient.amount : null,
      unit: typeof ingredient.unit === 'string' ? toIngredientUnit(ingredient.unit) : null,
    }))
    .filter((ingredient) => ingredient.name.trim());

  return ingredients.length > 0 ? ingredients : null;
}

function isAppImageKey(value: string): value is AppImageKey {
  return APP_IMAGE_FIELDS.some((field) => field.key === value);
}

function normalizeRecipeOverrideRow(row: RecipeOverrideRow): [string, RecipeOverride] | null {
  const recipeId = row.recipe_id.trim();
  const name = row.name?.trim() ?? '';
  const kind = toRecipeKind(row.kind);
  const ingredients = normalizeStoredIngredients(row.ingredients);
  const servings = row.servings != null && Number.isFinite(Number(row.servings))
    ? Number(row.servings)
    : null;

  if (!recipeId || !name || !kind || !ingredients) return null;
  return [recipeId, { name, kind, ingredients, servings }];
}

function getImageExtension(file: File): string {
  const extensionFromName = file.name.split('.').pop()?.toLowerCase();
  if (extensionFromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensionFromName)) {
    return extensionFromName === 'jpeg' ? 'jpg' : extensionFromName;
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

function slugifyPathPart(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return slug || 'image';
}

const si = (...names: string[]): RecipeIngredient[] =>
  names.map((n) => ({ name: n, amount: null, unit: null }));

const qi = (name: string, amount: number, unit: IngredientUnit): RecipeIngredient => ({
  name,
  amount,
  unit,
});

const SAMPLE_RECIPES: Recipe[] = [
  // SALÉ
    {
    id: 'omelette-fromage',
    name: 'Omelette au fromage',
    kind: 'savory',
    ingredients: [
      qi('oeuf', 3, 'unité'),
      qi('fromage', 40, 'g'),
      qi('huile', 15, 'ml'),
      si('sel', 'poivre')[0],
    ],
    servings: 1,
    tags: ['rapide'],
  },
  {
    id: 'pates-tomate',
    name: 'Pâtes sauce tomate',
    kind: 'savory',
    ingredients: [
      qi('pates', 200, 'g'),
      qi('tomate', 200, 'g'),
      qi('ail', 1, 'unité'),
      qi('huile', 15, 'ml'),
      si('sel')[0],
    ],
    servings: 2,
    tags: ['classique'],
  },
  {
    id: 'riz-legumes-saute',
    name: 'Riz aux légumes sautés',
    kind: 'savory',
    ingredients: [
      qi('riz', 160, 'g'),
      qi('legume', 300, 'g'),
      qi('huile', 20, 'ml'),
      qi('ail', 1, 'unité'),
      qi('sauce soja', 20, 'ml'),
    ],
    servings: 2,
    tags: ['wok'],
  },
  {
    id: 'salade-thon-mais',
    name: 'Salade thon & maïs',
    kind: 'savory',
    ingredients: [
      qi('salade', 100, 'g'),
      qi('thon', 140, 'g'),
      qi('mais', 150, 'g'),
      qi('huile', 15, 'ml'),
      qi('vinaigre', 10, 'ml'),
    ],
    servings: 2,
    tags: ['frais'],
  },
  {
    id: 'soupe-lentilles',
    name: 'Soupe de lentilles',
    kind: 'savory',
    ingredients: [
      qi('lentille', 200, 'g'),
      qi('carotte', 2, 'unité'),
      qi('oignon', 1, 'unité'),
      qi('bouillon', 500, 'ml'),
      qi('ail', 1, 'unité'),
    ],
    servings: 3,
    tags: ['batch cooking'],
  },

  // SUCRÉ
  {
    id: 'pancakes',
    name: 'Pancakes',
    kind: 'sweet',
    ingredients: [
      qi('farine', 150, 'g'),
      qi('oeuf', 1, 'unité'),
      qi('lait', 200, 'ml'),
      qi('sucre', 25, 'g'),
      qi('levure', 8, 'g'),
    ],
    servings: 2,
    tags: ['petit dej'],
  },
  {
    id: 'bol-yaourt-fruits',
    name: 'Bol yaourt, fruits & granola',
    kind: 'sweet',
    ingredients: [
      qi('yaourt', 150, 'g'),
      qi('fruit', 120, 'g'),
      qi('granola', 40, 'g'),
      qi('miel', 15, 'g'),
    ],
    servings: 1,
    tags: ['frais'],
  },
  {
    id: 'mug-cake-choco',
    name: 'Mug cake chocolat',
    kind: 'sweet',
    ingredients: [
      qi('farine', 30, 'g'),
      qi('oeuf', 1, 'unité'),
      qi('lait', 30, 'ml'),
      qi('sucre', 20, 'g'),
      qi('chocolat', 30, 'g'),
    ],
    servings: 1,
    tags: ['rapide'],
  },
  {
    id: 'compote-pomme-cannelle',
    name: 'Compote pomme cannelle',
    kind: 'sweet',
    ingredients: [
      qi('pomme', 4, 'unité'),
      qi('sucre', 20, 'g'),
      si('cannelle')[0],
      qi('citron', 15, 'ml'),
    ],
    servings: 4,
    tags: ['léger'],
  },
  {
    id: 'cookies-choco',
    name: 'Cookies chocolat',
    kind: 'sweet',
    ingredients: [
      qi('farine', 180, 'g'),
      qi('sucre', 90, 'g'),
      qi('beurre', 100, 'g'),
      qi('oeuf', 1, 'unité'),
      qi('chocolat', 100, 'g'),
    ],
    servings: 8,
    tags: ['gourmand'],
  },
  { id: 'quiche-lorraine', name: 'Quiche lorraine', kind: 'savory', ingredients: [qi('pate brisee', 1, 'unité'), qi('oeuf', 3, 'unité'), qi('creme', 200, 'ml'), qi('lardon', 150, 'g'), qi('fromage', 80, 'g')], servings: 4, tags: ['four'] },
  { id: 'gratin-dauphinois', name: 'Gratin dauphinois', kind: 'savory', ingredients: [qi('pomme de terre', 800, 'g'), qi('creme', 250, 'ml'), qi('lait', 250, 'ml'), qi('ail', 1, 'unité'), qi('fromage', 80, 'g')], servings: 4, tags: ['four'] },
  { id: 'curry-poulet-riz', name: 'Curry de poulet au riz', kind: 'savory', ingredients: [qi('poulet', 300, 'g'), qi('riz', 200, 'g'), qi('curry', 10, 'g'), qi('lait coco', 200, 'ml'), qi('oignon', 1, 'unité')], servings: 3, tags: ['plat complet'] },
  { id: 'chili-con-carne', name: 'Chili con carne', kind: 'savory', ingredients: [qi('boeuf', 300, 'g'), qi('haricot rouge', 250, 'g'), qi('tomate', 300, 'g'), qi('mais', 150, 'g'), qi('oignon', 1, 'unité')], servings: 4, tags: ['batch cooking'] },
  { id: 'ratatouille', name: 'Ratatouille', kind: 'savory', ingredients: [qi('courgette', 2, 'unité'), qi('aubergine', 1, 'unité'), qi('tomate', 400, 'g'), qi('poivron', 2, 'unité'), qi('oignon', 1, 'unité')], servings: 4, tags: ['legumes'] },
  { id: 'tartiflette', name: 'Tartiflette', kind: 'savory', ingredients: [qi('pomme de terre', 800, 'g'), qi('lardon', 200, 'g'), qi('oignon', 1, 'unité'), qi('fromage', 250, 'g'), qi('creme', 100, 'ml')], servings: 4, tags: ['hiver'] },
  { id: 'croque-monsieur', name: 'Croque-monsieur', kind: 'savory', ingredients: [qi('pain', 4, 'unité'), qi('jambon', 2, 'unité'), qi('fromage', 80, 'g'), qi('beurre', 20, 'g')], servings: 2, tags: ['rapide'] },
  { id: 'wrap-poulet', name: 'Wrap poulet crudites', kind: 'savory', ingredients: [qi('tortilla', 2, 'unité'), qi('poulet', 160, 'g'), qi('salade', 60, 'g'), qi('tomate', 1, 'unité'), qi('sauce', 30, 'g')], servings: 2, tags: ['rapide'] },
  { id: 'taboule', name: 'Taboule', kind: 'savory', ingredients: [qi('semoule', 200, 'g'), qi('tomate', 2, 'unité'), qi('concombre', 1, 'unité'), qi('citron', 30, 'ml'), qi('huile', 30, 'ml')], servings: 4, tags: ['frais'] },
  { id: 'risotto-champignon', name: 'Risotto aux champignons', kind: 'savory', ingredients: [qi('riz', 220, 'g'), qi('champignon', 250, 'g'), qi('oignon', 1, 'unité'), qi('bouillon', 700, 'ml'), qi('fromage', 60, 'g')], servings: 3, tags: ['cremeux'] },
  { id: 'lasagnes', name: 'Lasagnes', kind: 'savory', ingredients: [qi('pates', 250, 'g'), qi('boeuf', 400, 'g'), qi('tomate', 500, 'g'), qi('fromage', 120, 'g'), qi('lait', 500, 'ml')], servings: 5, tags: ['four'] },
  { id: 'hache-parmentier', name: 'Hachis parmentier', kind: 'savory', ingredients: [qi('pomme de terre', 800, 'g'), qi('boeuf', 400, 'g'), qi('lait', 150, 'ml'), qi('beurre', 40, 'g'), qi('fromage', 80, 'g')], servings: 4, tags: ['four'] },
  { id: 'salade-cesar', name: 'Salade Cesar', kind: 'savory', ingredients: [qi('salade', 120, 'g'), qi('poulet', 200, 'g'), qi('pain', 2, 'unité'), qi('fromage', 50, 'g'), qi('sauce', 40, 'g')], servings: 2, tags: ['frais'] },
  { id: 'poelee-riz-oeuf', name: 'Poelee riz oeuf', kind: 'savory', ingredients: [qi('riz', 180, 'g'), qi('oeuf', 2, 'unité'), qi('legume', 250, 'g'), qi('sauce soja', 20, 'ml'), qi('huile', 15, 'ml')], servings: 2, tags: ['anti gaspi'] },
  { id: 'tarte-thon-tomate', name: 'Tarte thon tomate', kind: 'savory', ingredients: [qi('pate brisee', 1, 'unité'), qi('thon', 160, 'g'), qi('tomate', 300, 'g'), qi('moutarde', 20, 'g'), qi('fromage', 80, 'g')], servings: 4, tags: ['four'] },
  { id: 'fajitas', name: 'Fajitas', kind: 'savory', ingredients: [qi('tortilla', 4, 'unité'), qi('poulet', 300, 'g'), qi('poivron', 2, 'unité'), qi('oignon', 1, 'unité'), qi('epice', 10, 'g')], servings: 4, tags: ['convivial'] },
  { id: 'dahl-lentilles', name: 'Dahl de lentilles', kind: 'savory', ingredients: [qi('lentille', 250, 'g'), qi('lait coco', 250, 'ml'), qi('curry', 10, 'g'), qi('tomate', 300, 'g'), qi('riz', 180, 'g')], servings: 4, tags: ['vegetarien'] },
  { id: 'pizza-maison', name: 'Pizza maison', kind: 'savory', ingredients: [qi('pate pizza', 1, 'unité'), qi('tomate', 200, 'g'), qi('fromage', 150, 'g'), qi('jambon', 2, 'unité'), qi('champignon', 120, 'g')], servings: 3, tags: ['four'] },

    { id: 'crepes', name: 'Crepes', kind: 'sweet', ingredients: [qi('farine', 250, 'g'), qi('oeuf', 3, 'unité'), qi('lait', 500, 'ml'), qi('sucre', 30, 'g'), qi('beurre', 30, 'g')], servings: 6, tags: ['classique'] },
  { id: 'gateau-yaourt', name: 'Gateau au yaourt', kind: 'sweet', ingredients: [qi('yaourt', 1, 'unité'), qi('farine', 180, 'g'), qi('sucre', 120, 'g'), qi('oeuf', 3, 'unité'), qi('huile', 80, 'ml')], servings: 8, tags: ['four'] },
  { id: 'brownie', name: 'Brownie chocolat', kind: 'sweet', ingredients: [qi('chocolat', 200, 'g'), qi('beurre', 120, 'g'), qi('sucre', 120, 'g'), qi('oeuf', 3, 'unité'), qi('farine', 80, 'g')], servings: 8, tags: ['gourmand'] },
  { id: 'tarte-pomme', name: 'Tarte aux pommes', kind: 'sweet', ingredients: [qi('pate brisee', 1, 'unité'), qi('pomme', 4, 'unité'), qi('sucre', 50, 'g'), qi('beurre', 30, 'g'), qi('cannelle', 5, 'g')], servings: 6, tags: ['four'] },
  { id: 'riz-au-lait', name: 'Riz au lait', kind: 'sweet', ingredients: [qi('riz', 150, 'g'), qi('lait', 800, 'ml'), qi('sucre', 80, 'g'), qi('vanille', 5, 'g')], servings: 4, tags: ['dessert'] },
  { id: 'pain-perdu', name: 'Pain perdu', kind: 'sweet', ingredients: [qi('pain', 4, 'unité'), qi('lait', 250, 'ml'), qi('oeuf', 2, 'unité'), qi('sucre', 30, 'g'), qi('beurre', 30, 'g')], servings: 2, tags: ['anti gaspi'] },
  { id: 'mousse-chocolat', name: 'Mousse au chocolat', kind: 'sweet', ingredients: [qi('chocolat', 200, 'g'), qi('oeuf', 6, 'unité'), qi('sucre', 30, 'g')], servings: 6, tags: ['dessert'] },
  { id: 'crumble-pomme', name: 'Crumble aux pommes', kind: 'sweet', ingredients: [qi('pomme', 5, 'unité'), qi('farine', 120, 'g'), qi('beurre', 90, 'g'), qi('sucre', 90, 'g'), qi('cannelle', 5, 'g')], servings: 6, tags: ['four'] },
  { id: 'smoothie-banane', name: 'Smoothie banane', kind: 'sweet', ingredients: [qi('banane', 2, 'unité'), qi('lait', 250, 'ml'), qi('yaourt', 125, 'g'), qi('miel', 15, 'g')], servings: 2, tags: ['rapide'] },
  { id: 'porridge', name: 'Porridge', kind: 'sweet', ingredients: [qi('flocon avoine', 60, 'g'), qi('lait', 250, 'ml'), qi('banane', 1, 'unité'), qi('miel', 15, 'g')], servings: 1, tags: ['petit dej'] },
];

const RECIPE_IMAGE_POOL: Record<RecipeKind, string[]> = {
  savory: [
    mediaPublicUrl('recipes/default-savory-1.jpg'),
    mediaPublicUrl('recipes/default-savory-2.jpg'),
    mediaPublicUrl('recipes/default-savory-3.jpg'),
    mediaPublicUrl('recipes/default-savory-4.jpg'),
  ],
  sweet: [
    mediaPublicUrl('recipes/default-sweet-1.jpg'),
    mediaPublicUrl('recipes/default-sweet-2.jpg'),
    mediaPublicUrl('recipes/default-sweet-3.jpg'),
    mediaPublicUrl('recipes/default-sweet-4.jpg'),
  ],
};

function recipeImageFor(recipe: Recipe, recipeImages: Record<string, string> = {}): string {
  const customImage = sanitizeImageUrl(recipeImages[recipe.id] ?? '');
  if (customImage) return customImage;

  const pool = RECIPE_IMAGE_POOL[recipe.kind];
  const index = recipe.id
    .split('')
    .reduce((total, char) => total + char.charCodeAt(0), 0) % pool.length;

  return pool[index];
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getProductMatchName(product: Product): string {
  return product.generic_name?.trim() || product.name;
}

function cleanBarcode(raw: string): string {
  return String(raw).replace(/[^\d]/g, '').trim();
}

function getExpirationStatus(
  expirationDate: string | null,
  soonThresholdDays: number = 7,
): ExpirationStatus {
  if (!expirationDate) return 'ok';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);

  const diffMs = exp.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return 'expired';
  if (diffDays <= soonThresholdDays) return 'soon';
  return 'ok';
}

function getExpirationLabel(status: ExpirationStatus, type: ExpirationType): string {
  if (type === 'ddm') {
    if (status === 'expired') return 'DDM dépassée';
    if (status === 'soon') return 'DDM bientôt dépassée';
    return 'DDM OK';
  }

  if (type === 'unknown') return 'Date inconnue';

  if (status === 'expired') return 'DLC dépassée';
  if (status === 'soon') return 'DLC proche';
  return 'DLC OK';
}

function getExpirationClass(status: ExpirationStatus, type: ExpirationType): string {
  if (type === 'ddm') return `status-ddm-${status}`;
  if (type === 'unknown') return 'status-unknown';
  return `status-dlc-${status}`;
}

function mapOffCategoryToMainCategory(offCat: string): MainCategory {
  const c = offCat.toLowerCase();
  if (c.includes('épice') || c.includes('herbes') || c.includes('spice')) return 'Épices';
  if (c.includes('ménager') || c.includes('entretien') || c.includes('nettoy') || c.includes('lessive'))
    return 'Produit ménager';
  if (c.includes('sucr') || c.includes('dessert') || c.includes('chocolat') || c.includes('biscuit') || c.includes('gâteau'))
    return 'Produit sucré';
  if (c.includes('complément') || c.includes('vitamine') || c.includes('santé') || c.includes('médicament'))
    return 'Produit de santé';
  return 'Produit salé';
}

const UNIT_OPTIONS = [
  { value: 'unité', label: 'unité' },
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'l' },
] as const;

function stepForUnit(unit: string | null): number {
  const u = (unit ?? 'unité').toLowerCase();
  if (u === 'g') return 50;
  if (u === 'ml') return 50;
  if (u === 'l') return 0.05;
  return 1;                     // +1 unité
}

function roundQty(value: number, unit: string | null): number {
  const u = (unit ?? 'unité').toLowerCase();
  if (u === 'l') return Math.round(value * 100) / 100;
  if (u === 'ml') return Math.round(value);
  return Math.round(value * 10) / 10;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function gramsFromStock(item: StockItem): { grams: number | null; approx: boolean } {
  const p = item.product;
  if (!p) return { grams: null, approx: false };

  const qty = item.quantity ?? 0;
  const unit = (item.unit ?? 'unité').toLowerCase();

  if (unit === 'g') return { grams: qty, approx: false };

  if (unit === 'ml') {
    const density = p.density_g_ml ?? 1;
    return { grams: qty * density, approx: p.density_g_ml == null };
  }

  // litre -> ml -> g (via densité)
  if (unit === 'l') {
    const density = p.density_g_ml ?? 1; // si non renseigné, on approx eau
    const grams = qty * 1000 * density;
    return { grams, approx: p.density_g_ml == null }; // approx si densité manquante
  }

  // unité -> grammes via grams_per_unit_g
  if (unit === 'unité') {
    if (!p.grams_per_unit_g) return { grams: null, approx: false };
    return { grams: qty * p.grams_per_unit_g, approx: false };
  }

  return { grams: null, approx: false };
}

function kcalForStock(item: StockItem): { kcal: number | null; approx: boolean } {
  const p = item.product;
  if (!p?.kcal_100g) return { kcal: null, approx: false };

  const { grams, approx } = gramsFromStock(item);
  if (grams == null) return { kcal: null, approx: false };

  const kcal = (p.kcal_100g / 100) * grams;
  return { kcal: Math.round(kcal), approx };
}

function findProductForIngredient(products: Product[], name: string): Product | null {
  const key = normalizeText(name);
  // match simple sur le nom
  return (
    products.find((p) => {
      const pn = normalizeText(getProductMatchName(p));
      return pn === key || pn.includes(key) || key.includes(pn);
    }) ?? null
  );
}

function kcalForIngredients(
  ingredients: RecipeIngredient[],
  products: Product[],
): { kcal: number; missingCount: number; approx: boolean } {
  let total = 0;
  let missing = 0;
  let approx = false;

  for (const ing of ingredients) {
    if (ing.amount == null || !ing.unit) {
      missing += 1;
      continue;
    }

    const p = findProductForIngredient(products, ing.name);
    if (!p?.kcal_100g) {
      missing += 1;
      continue;
    }

    let grams: number | null = null;

    if (ing.unit === 'g') grams = ing.amount;

    if (ing.unit === 'ml') {
      const density = p.density_g_ml ?? 1;
      grams = ing.amount * density;
      if (p.density_g_ml == null) approx = true;
    }

    if (ing.unit === 'unité') {
      if (!p.grams_per_unit_g) {
        missing += 1;
        continue;
      }
      grams = ing.amount * p.grams_per_unit_g;
    }

    if (grams == null) {
      missing += 1;
      continue;
    }

    total += (p.kcal_100g / 100) * grams;
  }

  return { kcal: Math.round(total), missingCount: missing, approx };
}

function kcalForRecipe(recipe: Recipe, products: Product[]): { kcal: number; missingCount: number; approx: boolean } {
  return kcalForIngredients(recipe.ingredients, products);
}

function mealCaloriesInfo(
  meal: WeekMeal,
  recipes: Recipe[],
  products: Product[],
): { kcal: number | null; approx: boolean } {
  if (meal.kcal_override != null) {
    return { kcal: Math.round(meal.kcal_override), approx: false };
  }

  if (meal.recipe_id) {
    const r = recipes.find((x) => x.id === meal.recipe_id);

    if (r) {
      const recipeCalories = kcalForRecipe(r, products);

      if (recipeCalories.kcal <= 0 && recipeCalories.missingCount > 0) {
        return { kcal: null, approx: recipeCalories.approx };
      }

      const recipeServ = r.servings ?? 1;
      const mealServ = meal.servings ?? 1;

      return {
        kcal: Math.round((recipeCalories.kcal / recipeServ) * mealServ),
        approx: recipeCalories.approx,
      };
    }
  }

  const mealIngredients = meal.ingredients?.map(parseSingleMealIngredient) ?? [];
  if (mealIngredients.length === 0) return { kcal: null, approx: false };

  const ingredientCalories = kcalForIngredients(mealIngredients, products);

  if (ingredientCalories.kcal <= 0 && ingredientCalories.missingCount > 0) {
    return { kcal: null, approx: ingredientCalories.approx };
  }

  return {
    kcal: ingredientCalories.kcal,
    approx: ingredientCalories.approx,
  };
}

function mealCalories(meal: WeekMeal, recipes: Recipe[], products: Product[]): number | null {
  return mealCaloriesInfo(meal, recipes, products).kcal;
}

function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=dim,1=lun...
  const diff = (day === 0 ? -6 : 1 - day);
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(d: Date, months: number): Date {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31);
}

function parseRecipeIngredients(text: string): RecipeIngredient[] {
  return text
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((part) => {
      // ex: "farine 200 g"
      const m = part.match(/^(.+?)(?:\s+(\d+(?:[.,]\d+)?))?\s*(g|ml|unité)?$/i);
      const name = (m?.[1] ?? part).trim();
      const parsedAmount = m?.[2] ? Number(String(m[2]).replace(',', '.')) : null;
      const amount = parsedAmount != null && Number.isFinite(parsedAmount) ? parsedAmount : null;
      const unit = toIngredientUnit(m?.[3]?.toLowerCase());
      return { name, amount, unit };
    });
}

function formatRecipeIngredient(ingredient: RecipeIngredient): string {
  if (ingredient.amount != null && ingredient.unit) {
    return `${ingredient.name} ${ingredient.amount} ${ingredient.unit}`;
  }

  return ingredient.name;
}

function scaleRecipeIngredients(
  ingredients: RecipeIngredient[],
  recipeServings: number | null | undefined,
  mealServings: number | null | undefined,
): RecipeIngredient[] {
  const baseServings = recipeServings && recipeServings > 0 ? recipeServings : 1;
  const targetServings = mealServings && mealServings > 0 ? mealServings : baseServings;
  const factor = targetServings / baseServings;

  return ingredients.map((ingredient) => {
    if (ingredient.amount == null || !ingredient.unit) return ingredient;

    return {
      ...ingredient,
      amount: roundQty(ingredient.amount * factor, ingredient.unit),
    };
  });
}

function parseSingleMealIngredient(raw: string): RecipeIngredient {
  return parseRecipeIngredients(raw)[0] ?? { name: raw.trim(), amount: null, unit: null };
}

function quantityToSubtract(ingredient: RecipeIngredient, stockUnit: string | null): number {
  if (ingredient.amount == null || !ingredient.unit) {
    return stepForUnit(stockUnit);
  }

  const unit = (stockUnit ?? 'unité').toLowerCase();

  if (ingredient.unit === 'g' && unit === 'g') return ingredient.amount;
  if (ingredient.unit === 'ml' && unit === 'l') return ingredient.amount / 1000;
  if (ingredient.unit === 'ml' && unit === 'ml') return ingredient.amount;
  if (ingredient.unit === 'unité' && unit === 'unité') return ingredient.amount;

  return stepForUnit(stockUnit);
}

const navItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: "Aujourd'hui", icon: 'today' },
  { key: 'stock', label: 'Stock', icon: 'stock' },
  { key: 'recipes', label: 'Cuisiner', icon: 'cook' },
  { key: 'weekmenu', label: 'Planning', icon: 'plan' },
  { key: 'shopping', label: 'Courses', icon: 'cart' },
  { key: 'settings', label: 'Réglages', icon: 'settings' },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const addProductSectionRef = useRef<HTMLElement | null>(null);
  const [scrollToAddForm, setScrollToAddForm] = useState(false);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shoppingSubTab, setShoppingSubTab] = useState<'main' | 'others'>('main');
  const [shoppingSearch, setShoppingSearch] = useState('');
  const [shoppingFilter, setShoppingFilter] = useState<ShoppingFilter>('all');
  const [checkedShoppingIds, setCheckedShoppingIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SHOPPING_CHECKED_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];

      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  const [hideCheckedShopping, setHideCheckedShopping] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [stockPlaceFilter, setStockPlaceFilter] = useState('');
  const [stockSort, setStockSort] = useState<StockSort>('expiration');
  const [stockSortDirection, setStockSortDirection] = useState<StockSortDirection>('asc');
  const [recipesSubTab, setRecipesSubTab] = useState<'feasible' | 'all'>('feasible');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>('all');
  

  const [loading, setLoading] = useState(true);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [appImages, setAppImages] = useState<AppImages>(DEFAULT_APP_IMAGES);
  const [recipeImages, setRecipeImages] = useState<Record<string, string>>({});
  const [recipeOverrides, setRecipeOverrides] = useState<Record<string, RecipeOverride>>({});
  const [imageUploadingKey, setImageUploadingKey] = useState<string | null>(null);

  // Form stock
  const [name, setName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<MainCategory | ''>('');
  const [place, setPlace] = useState(DEFAULT_SETTINGS.defaultPlace);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('unité');
  const [expiration, setExpiration] = useState('');
  const [expirationType, setExpirationType] = useState<ExpirationType>('dlc');
  const [isOpen, setIsOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [addExistingProductId, setAddExistingProductId] = useState<string | null>(null);
  const [showBackToShoppingAfterAdd, setShowBackToShoppingAfterAdd] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [subCategory, setSubCategory] = useState<SubCategory | ''>(''); // ✅ à la place d'utiliser editSubCategory

  const [kcal100g, setKcal100g] = useState('');
  const [gramsPerUnit, setGramsPerUnit] = useState('');
  const [densityGml, setDensityGml] = useState('');

  // Recettes DB
  const [dbRecipes, setDbRecipes] = useState<Recipe[]>([]);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeKind, setNewRecipeKind] = useState<RecipeKind>('savory');
  const [newRecipeServings, setNewRecipeServings] = useState('1');
  const [newRecipeIngredients, setNewRecipeIngredients] = useState('');
  const [newRecipeImageFile, setNewRecipeImageFile] = useState<File | null>(null);
  const [newRecipeImagePreview, setNewRecipeImagePreview] = useState('');
  const [newRecipeOpen, setNewRecipeOpen] = useState(false);
  const [editRecipeOpen, setEditRecipeOpen] = useState(false);
  const [editRecipeTarget, setEditRecipeTarget] = useState<Recipe | null>(null);
  const [editRecipeName, setEditRecipeName] = useState('');
  const [editRecipeKind, setEditRecipeKind] = useState<RecipeKind>('savory');
  const [editRecipeServings, setEditRecipeServings] = useState('1');
  const [editRecipeIngredients, setEditRecipeIngredients] = useState('');
  const [editRecipeImageFile, setEditRecipeImageFile] = useState<File | null>(null);
  const [editRecipeImagePreview, setEditRecipeImagePreview] = useState('');
  const newRecipeImagePreviewRef = useRef<string | null>(null);
  const editRecipeImagePreviewRef = useRef<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);

  const [editName, setEditName] = useState('');
  const [editGenericName, setEditGenericName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editCategory, setEditCategory] = useState<MainCategory | ''>('');
  const [editPlace, setEditPlace] = useState('');
  const [editQty, setEditQty] = useState('0');
  const [editUnit, setEditUnit] = useState('unité');
  const [editExpiration, setEditExpiration] = useState(''); // '' => null
  const [editExpirationType, setEditExpirationType] = useState<ExpirationType>('dlc');
  const [editIsOpen, setEditIsOpen] = useState(false);
  const [editBarcode, setEditBarcode] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [editSubCategory, setEditSubCategory] = useState<SubCategory | ''>('');

  const [editKcal100g, setEditKcal100g] = useState('');
  const [editGramsPerUnit, setEditGramsPerUnit] = useState('');
  const [editDensityGml, setEditDensityGml] = useState('');

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [weekMeals, setWeekMeals] = useState<WeekMeal[]>([]);
  const [weekMealsLoading, setWeekMealsLoading] = useState(false);
  const [planKcalOverride, setPlanKcalOverride] = useState<string>('');

  // modal planning
  const [planOpen, setPlanOpen] = useState(false);
  const [planDate, setPlanDate] = useState<string>(''); // YYYY-MM-DD
  const [planSlot, setPlanSlot] = useState<MealSlot>('lunch');
  const [planRecipeValue, setPlanRecipeValue] = useState<string>(''); // db:<id> | sample:<id> | custom
  const [planCustomName, setPlanCustomName] = useState('');
  const [planCustomIngredients, setPlanCustomIngredients] = useState('');
  const [planServings, setPlanServings] = useState<string>('1');
  const [planNotes, setPlanNotes] = useState('');

  // ---------- Settings localStorage ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      setSettings((prev) => ({
        soonDays: typeof parsed.soonDays === 'number' ? parsed.soonDays : prev.soonDays,
        recipesMaxMissing:
          typeof parsed.recipesMaxMissing === 'number' ? parsed.recipesMaxMissing : prev.recipesMaxMissing,
        defaultPlace:
          typeof parsed.defaultPlace === 'string' && parsed.defaultPlace.trim()
            ? parsed.defaultPlace
            : prev.defaultPlace,
        dailyCalorieGoal:
          typeof parsed.dailyCalorieGoal === 'number'
            ? parsed.dailyCalorieGoal
            : prev.dailyCalorieGoal,
      }));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SHOPPING_CHECKED_STORAGE_KEY, JSON.stringify(checkedShoppingIds));
    } catch (e) {
      console.error(e);
    }
  }, [checkedShoppingIds]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error(e);
    }
  }, [settings]);

  useEffect(() => {
    return () => {
      if (newRecipeImagePreviewRef.current) URL.revokeObjectURL(newRecipeImagePreviewRef.current);
      if (editRecipeImagePreviewRef.current) URL.revokeObjectURL(editRecipeImagePreviewRef.current);
    };
  }, []);

  const setNewRecipeImageSelection = (file: File | null) => {
    if (newRecipeImagePreviewRef.current) URL.revokeObjectURL(newRecipeImagePreviewRef.current);

    const previewUrl = file ? URL.createObjectURL(file) : '';
    newRecipeImagePreviewRef.current = previewUrl || null;
    setNewRecipeImageFile(file);
    setNewRecipeImagePreview(previewUrl);
  };

  const setEditRecipeImageSelection = (file: File | null) => {
    if (editRecipeImagePreviewRef.current) URL.revokeObjectURL(editRecipeImagePreviewRef.current);

    const previewUrl = file ? URL.createObjectURL(file) : '';
    editRecipeImagePreviewRef.current = previewUrl || null;
    setEditRecipeImageFile(file);
    setEditRecipeImagePreview(previewUrl);
  };

  const buildMediaPath = (kind: ImageAssetKind, imageKey: string, file: File): string => {
    const folder = kind === 'app' ? 'app' : 'recipes';
    const extension = getImageExtension(file);
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

    return `${folder}/${slugifyPathPart(imageKey)}-${Date.now()}-${randomPart}.${extension}`;
  };

  const uploadImageAsset = async (kind: ImageAssetKind, imageKey: string, file: File): Promise<string> => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      throw new Error('Choisis une image JPG, PNG, WebP ou GIF.');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error('La photo doit faire moins de 5 Mo.');
    }

    const path = buildMediaPath(kind, imageKey, file);
    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, {
        cacheControl: '31536000',
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const publicUrl = data.publicUrl;
    const { error: assetError } = await supabase
      .from('image_assets')
      .upsert(
        {
          kind,
          image_key: imageKey,
          path,
          public_url: publicUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'kind,image_key' },
      );

    if (assetError) throw assetError;

    if (kind === 'app' && isAppImageKey(imageKey)) {
      setAppImages((prev) => ({ ...prev, [imageKey]: publicUrl }));
    } else if (kind === 'recipe') {
      setRecipeImages((prev) => ({ ...prev, [imageKey]: publicUrl }));
    }

    return publicUrl;
  };

  const resetImageAsset = async (kind: ImageAssetKind, imageKey: string) => {
    const { error: deleteError } = await supabase
      .from('image_assets')
      .delete()
      .eq('kind', kind)
      .eq('image_key', imageKey);

    if (deleteError) throw deleteError;

    if (kind === 'app' && isAppImageKey(imageKey)) {
      setAppImages((prev) => ({ ...prev, [imageKey]: DEFAULT_APP_IMAGES[imageKey] }));
    } else if (kind === 'recipe') {
      setRecipeImages((prev) => {
        const next = { ...prev };
        delete next[imageKey];
        return next;
      });
    }
  };

  useEffect(() => {
    if (activeTab !== 'dashboard' || !scrollToAddForm) return;

    window.requestAnimationFrame(() => {
      addProductSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToAddForm(false);
    });
  }, [activeTab, scrollToAddForm]);

  useEffect(() => {
    setPlace(settings.defaultPlace);
  }, [settings.defaultPlace]);

      const openEdit = (item: StockItem) => {
        setEditTarget(item);

        setEditName(item.product?.name ?? '');
        setEditGenericName(item.product?.generic_name ?? '');
        setEditBrand(item.product?.brand ?? '');
        setEditCategory((item.product?.category as MainCategory) ?? '');
        setEditSubCategory((item.product?.sub_category as SubCategory) ?? '');
        setEditPlace(item.place ?? '');
        setEditQty(String(item.quantity ?? 0));
        setEditUnit(item.unit ?? 'unité');
        setEditExpiration(item.expiration_date ?? ''); // '' si null
        setEditExpirationType(item.expiration_type ?? 'dlc');
        setEditIsOpen(!!item.is_open);
        setEditBarcode(item.product?.barcode ?? '');
        setEditKcal100g(item.product?.kcal_100g != null ? String(item.product.kcal_100g) : '');
        setEditGramsPerUnit(item.product?.grams_per_unit_g != null ? String(item.product.grams_per_unit_g) : '');
        setEditDensityGml(item.product?.density_g_ml != null ? String(item.product.density_g_ml) : '');

        setEditOpen(true);
      };
  const saveEdit = async () => {
  if (!editTarget?.product?.id) {
    setError("Impossible d'éditer : produit manquant.");
    return;
  }

  setEditSaving(true);
  setError(null);

  const productId = editTarget.product.id;
  const stockId = editTarget.id;

  try {
    // 1) update product
    const { error: prodErr } = await supabase
      .from('products')
      .update({
        name: editName.trim(),
        generic_name: editGenericName.trim() || null,       
        brand: editBrand.trim() || null,
        category: editCategory ? editCategory : null,
        sub_category: getSubcatsFor(editCategory).length > 0 ? (editSubCategory || null) : null,
        barcode: editBarcode.trim() || null,
        kcal_100g: editKcal100g ? Number(editKcal100g) : null,
        grams_per_unit_g: editGramsPerUnit ? Number(editGramsPerUnit) : null,
        density_g_ml: editDensityGml ? Number(editDensityGml) : null,
      })
      .eq('id', productId);

    if (prodErr) throw prodErr;

    // 2) update stock
    const qtyNum = Number(editQty);
    const qtyFinal = Number.isFinite(qtyNum) ? qtyNum : 0;

    const { data: stockRow, error: stockErr } = await supabase
      .from('stocks')
      .update({
        place: editPlace.trim() || null,
        quantity: qtyFinal,
        unit: editUnit || 'unité',
        expiration_date: editExpiration ? editExpiration : null, // ✅ supprimable
        expiration_type: editExpiration ? editExpirationType : 'unknown',
        is_open: editIsOpen,
      })
      .eq('id', stockId)
      .select('id, place, quantity, unit, expiration_date, expiration_type, is_open')
      .single();

    if (stockErr || !stockRow) throw stockErr;

    // 3) update local states
    setStocks((prev) =>
      prev.map((s) =>
        s.id === stockId
          ? {
              ...s,
              ...stockRow,
              product: s.product
                ? {
                    ...s.product,
                    name: editName.trim(),
                    generic_name: editGenericName.trim() || null,
                    brand: editBrand.trim() || null,
                    category: editCategory ? editCategory : null,
                    sub_category:
                      editCategory === 'Produit sucré' || editCategory === 'Produit salé'
                        ? (editSubCategory || null)
                        : null,
                    barcode: editBarcode.trim() || null,
                    kcal_100g: editKcal100g ? Number(editKcal100g) : null,
                    grams_per_unit_g: editGramsPerUnit ? Number(editGramsPerUnit) : null,
                    density_g_ml: editDensityGml ? Number(editDensityGml) : null,
                  }
                : null,
            }
          : s,
      ),
    );

    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              name: editName.trim(),
              generic_name: editGenericName.trim() || null,
              brand: editBrand.trim() || null,
              category: editCategory ? editCategory : null,
              barcode: editBarcode.trim() || null,
              kcal_100g: editKcal100g ? Number(editKcal100g) : null,
              grams_per_unit_g: editGramsPerUnit ? Number(editGramsPerUnit) : null,
              density_g_ml: editDensityGml ? Number(editDensityGml) : null,
            }
          : p,
      ),
    );

    setEditOpen(false);
    setEditTarget(null);
  } catch (e: unknown) {
    console.error(e);
    const message = getErrorMessage(e);
    setError(message ? `Erreur: ${message}` : "Erreur lors de l'enregistrement.");
  } finally {
    setEditSaving(false);
  }
};

const fetchWeekMeals = async (start: Date) => {
  setWeekMealsLoading(true);
  setError(null);

  const from = toDateKey(start);
  const to = toDateKey(addDays(start, 6));

  const { data, error } = await supabase
    .from('week_meals')
    .select('id, meal_date, meal_slot, recipe_id, recipe_name, recipe_kind, ingredients, kcal_override, servings, notes, consumed_at')    .gte('meal_date', from)
    .lte('meal_date', to)
    .order('meal_date', { ascending: true });

	  if (error) {
	    console.error(error);
	    setWeekMeals([]);
	    setWeekMealsLoading(false);
	    return;
	  }

  const normalized: WeekMeal[] = ((data ?? []) as WeekMealRow[]).map((r) => ({
  id: r.id,
  meal_date: r.meal_date,
  meal_slot: (r.meal_slot as MealSlot) ?? 'lunch',
  recipe_id: r.recipe_id ?? null,
  recipe_name: String(r.recipe_name ?? ''),
  recipe_kind: toRecipeKind(r.recipe_kind),
  ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(String) : null,
  kcal_override: r.kcal_override ?? null,     // ✅ AJOUT
  servings: r.servings ?? null,
  notes: r.notes ?? null,
  consumed_at: r.consumed_at ?? null,
}));

  setWeekMeals(normalized);
  setWeekMealsLoading(false);
};

useEffect(() => {
  if (category !== 'Produit sucré' && category !== 'Produit salé') {
    setSubCategory('');
  }
}, [category]);

useEffect(() => {
  if (editCategory !== 'Produit sucré' && editCategory !== 'Produit salé') {
    setEditSubCategory('');
  }
}, [editCategory]);

useEffect(() => {
  void fetchWeekMeals(weekStart);
}, [weekStart]);

useEffect(() => {
  if (category !== 'Produit sucré' && category !== 'Produit salé') {
    setEditSubCategory('');
  }
}, [category]);

useEffect(() => {
  // si la catégorie ne supporte pas de sous-cat, on vide
  if (getSubcatsFor(category).length === 0) setSubCategory('');
  else if (subCategory && !getSubcatsFor(category).includes(subCategory)) setSubCategory('');
}, [category, subCategory]);

useEffect(() => {
  if (getSubcatsFor(editCategory).length === 0) setEditSubCategory('');
  else if (editSubCategory && !getSubcatsFor(editCategory).includes(editSubCategory)) setEditSubCategory('');
}, [editCategory, editSubCategory]);

  // ---------- OFF autofill ----------
  const autofillFromBarcode = async (code: string) => {
    if (!code) return;
    setAutoFillLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
      );
      const json = await res.json();

      if (json.status !== 1) {
        setError("Produit introuvable dans Open Food Facts, tu peux remplir les infos à la main.");
        return;
      }

      const p = json.product;
      const kcal100 = toNum(p?.nutriments?.['energy-kcal_100g'] ?? p?.nutriments?.energy_kcal_100g);
        if (kcal100 != null) setKcal100g(String(kcal100));

        // portion (optionnel)
        const kcalServing = toNum(p?.nutriments?.['energy-kcal_serving']);
        const servingQty = toNum(p?.serving_quantity); // souvent en g/ml
        if (kcalServing != null) {
          // tu peux garder pour plus tard si tu veux (colonne kcal_serving)
        }
        if (servingQty != null) {
          // tu peux stocker serving_size_g plus tard
        }
      if (!name && p.product_name) setName(p.product_name);
      if (!brand && p.brands) setBrand(String(p.brands).split(',')[0].trim());

      if (!category && p.categories) {
        const firstCategory = String(p.categories).split(',')[0].trim();
        setCategory(mapOffCategoryToMainCategory(firstCategory));
      }
    } catch (e) {
      console.error(e);
      setError("Erreur lors de la récupération des informations produit.");
    } finally {
      setAutoFillLoading(false);
    }
  };

  const upsertWeekMeal = async (payload: Omit<WeekMeal, 'id' | 'consumed_at'>) => {
  setError(null);

  const { data, error } = await supabase
    .from('week_meals')
    .upsert(
      {
        meal_date: payload.meal_date,
        meal_slot: payload.meal_slot,
        recipe_id: payload.recipe_id,
        recipe_name: payload.recipe_name,
        recipe_kind: payload.recipe_kind,
        ingredients: payload.ingredients,
        servings: payload.servings,
        notes: payload.notes,
        kcal_override: payload.kcal_override,
      },
      { onConflict: 'meal_date,meal_slot' },
    )
    .select('id, meal_date, meal_slot, recipe_id, recipe_name, recipe_kind, ingredients, kcal_override, servings, notes, consumed_at')    
    .single();

  if (error || !data) {
    console.error(error);
    setError("Erreur lors de l'enregistrement du repas.");
    return;
  }

  const row: WeekMeal = {
    id: data.id,
    meal_date: data.meal_date,
    meal_slot: data.meal_slot as MealSlot,
    recipe_id: data.recipe_id ?? null,
    recipe_name: String(data.recipe_name ?? ''),
    recipe_kind: (data.recipe_kind as RecipeKind) ?? null,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.map(String) : null,
    kcal_override: data.kcal_override ?? null,  // ✅ AJOUT
    servings: data.servings ?? null,
    notes: data.notes ?? null,
    consumed_at: data.consumed_at ?? null,
  };

  setWeekMeals((prev) => {
    const idx = prev.findIndex((m) => m.meal_date === row.meal_date && m.meal_slot === row.meal_slot);
    if (idx === -1) return [...prev, row];
    const copy = [...prev];
    copy[idx] = row;
    return copy;
  });
};

const deleteWeekMeal = async (meal_date: string, meal_slot: MealSlot) => {
  setError(null);

  const { error } = await supabase
    .from('week_meals')
    .delete()
    .eq('meal_date', meal_date)
    .eq('meal_slot', meal_slot);

  if (error) {
    console.error(error);
    setError("Impossible de supprimer ce repas.");
    return;
  }

  setWeekMeals((prev) => prev.filter((m) => !(m.meal_date === meal_date && m.meal_slot === meal_slot)));
};

const markWeekMealConsumed = async (meal: WeekMeal) => {
    if (meal.consumed_at) return;

    setError(null);

    const consumedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('week_meals')
      .update({ consumed_at: consumedAt })
      .eq('id', meal.id)
      .is('consumed_at', null)
      .select('id, consumed_at')
      .maybeSingle();

    if (error) {
      console.error(error);
      setError("Impossible de valider ce repas.");
      return;
    }

    if (!data) {
      setInfo('Repas déjà validé.');
      return;
    }

    setWeekMeals((prev) =>
      prev.map((m) =>
        m.id === meal.id ? { ...m, consumed_at: data.consumed_at ?? consumedAt } : m,
      ),
    );
    const stockResult = await decrementStockForMeal(meal);

    const stockMessage =
      stockResult.decremented.length > 0
        ? `Stock décrémenté : ${stockResult.decremented.join(', ')}.`
        : 'Aucun stock correspondant trouvé.';

    const missingMessage =
      stockResult.missing.length > 0
        ? ` Manquant : ${stockResult.missing.join(', ')}.`
        : '';


    let shoppingMessage = '';

    if (stockResult.missing.length > 0) {
      try {
        const createdCount = await addMissingProductsSilently(stockResult.missing, meal.recipe_kind ?? 'savory');

        shoppingMessage =
          createdCount > 0
            ? ` ${pluralize(createdCount, 'ingrédient')} ajouté${createdCount > 1 ? 's' : ''} à la liste de courses.`
            : ' Ingrédients manquants déjà présents dans la liste de courses.';
      } catch (e) {
        console.error(e);
        shoppingMessage = " Impossible d'ajouter les ingrédients manquants à la liste de courses.";
      }
    }    
    setInfo(`Repas validé. ${stockMessage}${missingMessage}${shoppingMessage}`);
  };

  const handleBarcodeDetected = (raw: string) => {
    const cleaned = cleanBarcode(raw);
    if (!cleaned) {
      setError('Scan illisible : aucun chiffre détecté. Réessaie en visant mieux le code-barres.');
      return;
    }
    setBarcode(cleaned);
    setShowScanner(false);
    void autofillFromBarcode(cleaned);
  };

  // ---------- Fetch Stocks & Products ----------
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const { data: stockData, error: stockError } = await supabase
        .from('stocks')
        .select(
          `
          id,
          place,
          quantity,
          unit,
          expiration_date,
          expiration_type,
          is_open,
          product:products (
            id,
            name,
            generic_name,
            brand,
            category,
            sub_category,
            default_unit,
            barcode,
            shopping_hidden,
            is_main,
            kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml
          )
        `,
        )
        .order('expiration_date', { ascending: true });

	      if (stockError) {
	        console.error(stockError);
          setStocks([]);
	      } else {
        const normalized: StockItem[] = ((stockData ?? []) as StockRow[]).map(normalizeStockRow);

        setStocks(normalized);
      }

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`id,name,generic_name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`);

	      if (productsError) {
	        console.error(productsError);
          setProducts([]);
	      } else {
        const normalizedProducts: Product[] = ((productsData ?? []) as ProductRow[]).map(normalizeProductRow);
        setProducts(normalizedProducts);
      }

      setLoading(false);
    };

    void fetchData();
  }, []);

  // ---------- Recipes DB ----------
  const fetchRecipes = async () => {
    setRecipesLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('recipes')
      .select(`
        id,
        name,
        kind,
        servings,
        created_at,
        recipe_ingredients ( ingredient, position, amount, unit )
      `)
      .order('created_at', { ascending: false });

	    if (error) {
	      console.error(error);
        setDbRecipes([]);
	      setRecipesLoading(false);
	      return;
	    }

    const normalized: Recipe[] = ((data ?? []) as RecipeRow[]).map((r) => {
      const ingredients: RecipeIngredient[] = [...(r.recipe_ingredients ?? [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((x) => ({
          name: String(x.ingredient ?? ''),
          amount: x.amount ?? null,
          unit: toIngredientUnit(x.unit),
        }));

      return {
        id: r.id,
        name: r.name,
        kind: toRecipeKind(r.kind) ?? 'savory',
        ingredients,
        servings: r.servings ?? null,
      };
    });

    setDbRecipes(normalized);
    setRecipesLoading(false);
  };

  useEffect(() => {
    void fetchRecipes();
  }, []);

  const fetchImageAssets = async () => {
    const { data, error: imageAssetsError } = await supabase
      .from('image_assets')
      .select('kind, image_key, path, public_url');

    if (imageAssetsError) {
      console.error(imageAssetsError);
      return;
    }

    const nextAppImages: AppImages = { ...DEFAULT_APP_IMAGES };
    const nextRecipeImages: Record<string, string> = {};

    ((data ?? []) as ImageAssetRow[]).forEach((asset) => {
      const publicUrl = asset.path
        ? mediaPublicUrl(asset.path)
        : sanitizeImageUrl(asset.public_url ?? '');
      if (!publicUrl) return;

      if (asset.kind === 'app' && isAppImageKey(asset.image_key)) {
        nextAppImages[asset.image_key] = publicUrl;
      }

      if (asset.kind === 'recipe' && asset.image_key) {
        nextRecipeImages[asset.image_key] = publicUrl;
      }
    });

    setAppImages(nextAppImages);
    setRecipeImages(nextRecipeImages);
  };

  const fetchRecipeOverrides = async () => {
    const { data, error: overridesError } = await supabase
      .from('recipe_overrides')
      .select('recipe_id, name, kind, ingredients, servings');

    if (overridesError) {
      console.error(overridesError);
      return;
    }

    const overrides = ((data ?? []) as RecipeOverrideRow[])
      .map(normalizeRecipeOverrideRow)
      .filter((entry): entry is [string, RecipeOverride] => entry !== null);

    setRecipeOverrides(Object.fromEntries(overrides));
  };

  useEffect(() => {
    void fetchImageAssets();
    void fetchRecipeOverrides();
  }, []);

  const applyRecipeOverrides = (recipe: Recipe): Recipe => {
    const override = recipeOverrides[recipe.id];
    if (!override) return recipe;

    return {
      ...recipe,
      name: override.name,
      kind: override.kind,
      ingredients: override.ingredients,
      servings: override.servings,
    };
  };

  const saveRecipeOverride = async (recipeId: string, override: RecipeOverride) => {
    const { error: overrideError } = await supabase
      .from('recipe_overrides')
      .upsert(
        {
          recipe_id: recipeId,
          name: override.name,
          kind: override.kind,
          ingredients: override.ingredients,
          servings: override.servings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'recipe_id' },
      );

    if (overrideError) throw overrideError;

    setRecipeOverrides((prev) => ({
      ...prev,
      [recipeId]: override,
    }));
  };

  const createRecipeInDb = async () => {
    const recipeName = newRecipeName.trim();
    if (!recipeName) {
      setError('Donne un nom à la recette.');
      return;
    }

    const ingredients = parseRecipeIngredients(newRecipeIngredients);
    if (ingredients.length === 0) {
      setError('Ajoute au moins un ingrédient.');
      return;
    }

    setError(null);

    const servingsNum = Number(newRecipeServings);
    const servings = Number.isFinite(servingsNum) && servingsNum > 0 ? servingsNum : null;

    // 1) create recipe
    const { data: recipeRow, error: recipeErr } = await supabase
      .from('recipes')
      .insert({ name: recipeName, kind: newRecipeKind, servings })
      .select('id, name, kind, servings')
      .single();

    if (recipeErr || !recipeRow) {
      console.error(recipeErr);
      setError("Erreur lors de la création de la recette.");
      return;
    }

    // 2) create ingredients
    const toInsert = ingredients.map((ing, i) => ({
      recipe_id: recipeRow.id,
      ingredient: ing.name,
      position: i,
      amount: ing.amount,
      unit: ing.unit,
    }));

    const { error: ingErr } = await supabase.from('recipe_ingredients').insert(toInsert);

    if (ingErr) {
      console.error(ingErr);
      setError("Recette créée mais erreur sur les ingrédients.");
      return;
    }

    // 3) refresh list
    setDbRecipes((prev) => [{
	      id: recipeRow.id,
	      name: recipeRow.name,
	      kind: toRecipeKind(recipeRow.kind) ?? newRecipeKind,
	      ingredients,
	      servings: recipeRow.servings ?? null,
	    }, ...prev]);

    if (newRecipeImageFile) {
      try {
        await uploadImageAsset('recipe', recipeRow.id, newRecipeImageFile);
      } catch (imageError) {
        console.error(imageError);
        setError('Recette créée, mais la photo n’a pas pu être envoyée.');
        return;
      }
    }

    setNewRecipeName('');
    setNewRecipeServings('1');
    setNewRecipeIngredients('');
    setNewRecipeImageSelection(null);
    setNewRecipeOpen(false);
  };

  const openEditRecipe = (recipe: Recipe) => {
    setEditRecipeTarget(recipe);
    setEditRecipeName(recipe.name);
    setEditRecipeKind(recipe.kind);
    setEditRecipeServings(String(recipe.servings ?? 1));
    setEditRecipeIngredients(recipe.ingredients.map(formatRecipeIngredient).join(', '));
    setEditRecipeImageSelection(null);
    setEditRecipeOpen(true);
  };

  const saveEditRecipe = async () => {
    if (!editRecipeTarget) return;

    const recipeName = editRecipeName.trim();
    const ingredients = parseRecipeIngredients(editRecipeIngredients);
    const servingsNum = Number(editRecipeServings);
    const servings = Number.isFinite(servingsNum) && servingsNum > 0 ? servingsNum : null;

    if (!recipeName) {
      setError('Le nom de la recette est obligatoire.');
      return;
    }

    if (ingredients.length === 0) {
      setError('Ajoute au moins un ingrédient.');
      return;
    }

    setError(null);

    const isDbRecipe = dbRecipes.some((recipe) => recipe.id === editRecipeTarget.id);
    const localOverride: RecipeOverride = {
      name: recipeName,
      kind: editRecipeKind,
      servings,
      ingredients,
    };

    if (!isDbRecipe) {
      try {
        await saveRecipeOverride(editRecipeTarget.id, localOverride);
        if (editRecipeImageFile) await uploadImageAsset('recipe', editRecipeTarget.id, editRecipeImageFile);
      } catch (saveError) {
        console.error(saveError);
        setError("Impossible d'enregistrer cette recette dans Supabase.");
        return;
      }

      setInfo('Recette personnalisée dans Supabase.');
      setEditRecipeImageSelection(null);
      setEditRecipeOpen(false);
      setEditRecipeTarget(null);
      return;
    }

    const { error: recipeError } = await supabase
      .from('recipes')
      .update({
        name: recipeName,
        kind: editRecipeKind,
        servings,
      })
      .eq('id', editRecipeTarget.id);

    if (recipeError) {
      console.error(recipeError);
      setError('Erreur lors de la mise à jour de la recette.');
      return;
    }

    const { error: deleteIngredientsError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('recipe_id', editRecipeTarget.id);

    if (deleteIngredientsError) {
      console.error(deleteIngredientsError);
      setError('Recette mise à jour, mais erreur sur les anciens ingrédients.');
      return;
    }

    const toInsert = ingredients.map((ing, i) => ({
      recipe_id: editRecipeTarget.id,
      ingredient: ing.name,
      position: i,
      amount: ing.amount,
      unit: ing.unit,
    }));

    const { error: insertIngredientsError } = await supabase
      .from('recipe_ingredients')
      .insert(toInsert);

    if (insertIngredientsError) {
      console.error(insertIngredientsError);
      setError('Recette mise à jour, mais erreur sur les nouveaux ingrédients.');
      return;
    }

    setDbRecipes((prev) =>
      prev.map((recipe) =>
        recipe.id === editRecipeTarget.id
          ? {
              ...recipe,
              ...localOverride,
            }
          : recipe,
      ),
    );

    if (editRecipeImageFile) {
      try {
        await uploadImageAsset('recipe', editRecipeTarget.id, editRecipeImageFile);
      } catch (imageError) {
        console.error(imageError);
        setError('Recette mise à jour, mais la photo n’a pas pu être envoyée.');
        return;
      }
    }

    setInfo('Recette mise à jour.');
    setEditRecipeImageSelection(null);

    setEditRecipeOpen(false);
    setEditRecipeTarget(null);
  };

  const deleteRecipeInDb = async (recipeId: string) => {
    setError(null);

    const { error } = await supabase.from('recipes').delete().eq('id', recipeId);

    if (error) {
      console.error(error);
      setError("Impossible de supprimer la recette.");
      return;
    }

    setDbRecipes((prev) => prev.filter((r) => r.id !== recipeId));
    try {
      await resetImageAsset('recipe', recipeId);
    } catch (imageError) {
      console.error(imageError);
    }
    setRecipeOverrides((prev) => {
      const next = { ...prev };
      delete next[recipeId];
      return next;
    });
  };

  // ---------- Toggle main ----------
  const handleToggleMain = async (productId: string, currentValue: boolean) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ is_main: !currentValue })
        .eq('id', productId)
        .select(`id,name,generic_name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`)
        .single();

      if (error || !data) throw error || new Error('Erreur mise à jour produit');

      const updated: Product = {
        id: data.id,
        name: data.name,
        generic_name: data.generic_name ?? null,
        brand: data.brand,
        category: data.category,
        sub_category: data.sub_category ?? null,
        default_unit: data.default_unit,
        barcode: data.barcode ?? null,
        shopping_hidden: !!data.shopping_hidden,
        is_main: !!data.is_main,

        kcal_100g: data.kcal_100g ?? null,
        kcal_serving: data.kcal_serving ?? null,
        serving_size_g: data.serving_size_g ?? null,
        grams_per_unit_g: data.grams_per_unit_g ?? null,
        density_g_ml: data.density_g_ml ?? null,
      };

      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === updated.id);
        if (idx === -1) return [...prev, updated];
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });

      setStocks((prev) =>
        prev.map((s) =>
          s.product?.id === updated.id
            ? { ...s, product: { ...(s.product as Product), is_main: updated.is_main } }
            : s,
        ),
      );
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la mise à jour de l'aliment principal");
    }
  };

const unhideFromShopping = async (productId: string) => {
  const { error } = await supabase
    .from('products')
    .update({ shopping_hidden: false })
    .eq('id', productId);

  if (error) {
    console.error(error);
    return;
  }

  // sync state local products
  setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, shopping_hidden: false } : p)));

  // sync state local stocks.product
  setStocks((prev) =>
    prev.map((s) =>
      s.product?.id === productId ? { ...s, product: { ...s.product, shopping_hidden: false } } : s,
    ),
  );
};

const resetAddForm = () => {
  setName('');
  setGenericName('');
  setBrand('');
  setCategory('');
  setEditSubCategory('');
  setQuantity('1');
  setUnit('unité');
  setExpiration('');
  setExpirationType('dlc');
  setIsOpen(false);
  setBarcode('');
  setSubCategory('');
  setKcal100g('');
  setGramsPerUnit('');
  setDensityGml('');
  setAddExistingProductId(null);
  setShowBackToShoppingAfterAdd(false);
};


  // ---------- Add stock ----------
  const handleAdd = async (e: FormEvent) => {
  e.preventDefault();
  setError(null);

  if (!name.trim()) {
    setError('Le nom du produit est obligatoire');
    return;
  }

  try {
    // 1) find/create product by selected product or barcode
      let productRow: ProductRow | null = null;
      const trimmedBarcode = barcode.trim();

      if (addExistingProductId) {
        const { data: existingProductById, error: existingProductByIdError } = await supabase
          .from('products')
          .select(`id,name,generic_name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`)
          .eq('id', addExistingProductId)
          .maybeSingle();

        if (existingProductByIdError) throw existingProductByIdError;
        if (existingProductById) productRow = existingProductById as ProductRow;
      }

      if (!productRow && trimmedBarcode) {
      const { data: existingProducts, error: existingProductError } = await supabase
        .from('products')
        .select(`id,name,generic_name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`)
        .eq('barcode', trimmedBarcode)
        .limit(1);

      if (existingProductError) throw existingProductError;
      if (existingProducts && existingProducts.length > 0) productRow = existingProducts[0] as ProductRow;
    }

    if (!productRow) {
      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert({
          name: name.trim(),
          generic_name: genericName.trim() || null,
          brand: brand.trim() || null,
          category: category ? category : null,
          sub_category: getSubcatsFor(category).length > 0 ? (subCategory || null) : null,
          default_unit: unit.trim() || null,
          barcode: trimmedBarcode || null,
          shopping_hidden: false,
          is_main: false,

          // ✅ nutrition
          kcal_100g: kcal100g ? Number(kcal100g) : null,
          grams_per_unit_g: gramsPerUnit ? Number(gramsPerUnit) : null,
          density_g_ml: densityGml ? Number(densityGml) : null,
        })
        .select(`id,name,generic_name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`)
        .single();

      if (productError || !productData) throw productError || new Error('Erreur création produit');
      productRow = productData as ProductRow;
    }

    const normalizedProduct = normalizeProductRow(productRow);

    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === normalizedProduct.id);
      if (idx === -1) return [...prev, normalizedProduct];
      const copy = [...prev];
      copy[idx] = normalizedProduct;
      return copy;
    });

    const productId = normalizedProduct.id;
    const qtyToAdd = quantity ? Number(quantity) : 0;
    const trimmedPlace = place.trim();
    const trimmedUnit = unit.trim();

    // 2) merge same stock line
    let stockQuery = supabase
      .from('stocks')
      .select(`id,place,quantity,unit,expiration_date,expiration_type,is_open`)
      .eq('product_id', productId)
      .eq('place', trimmedPlace)
      .eq('unit', trimmedUnit)
      .eq('is_open', isOpen);

    if (expiration) {
      stockQuery = stockQuery
        .eq('expiration_date', expiration)
        .eq('expiration_type', expirationType);
    } else {
      stockQuery = stockQuery
        .is('expiration_date', null)
        .eq('expiration_type', 'unknown');
    }

    const { data: existingStocks, error: existingStocksError } = await stockQuery.limit(1);
    if (existingStocksError) throw existingStocksError;

    const existing = existingStocks && existingStocks[0];

    let finalStockRow: StockRow;

    if (existing) {
      const newQuantity = (existing.quantity ?? 0) + qtyToAdd;

      const { data: updatedStock, error: updateError } = await supabase
        .from('stocks')
        .update({ quantity: newQuantity })
        .eq('id', existing.id)
        .select(
          `
          id, place, quantity, unit, expiration_date, expiration_type,is_open,
          product:products (
            id, name,generic_name, brand, category, sub_category, default_unit, barcode,shopping_hidden, is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml
          )
        `,
        )
        .single();

      if (updateError || !updatedStock) throw updateError || new Error('Erreur mise à jour stock');
      finalStockRow = updatedStock as StockRow;
    } else {
      const { data: stockData, error: stockError } = await supabase
        .from('stocks')
        .insert({
          product_id: productId,
          place: trimmedPlace || null,
          quantity: qtyToAdd,
          unit: trimmedUnit || null,
          expiration_date: expiration || null,
          expiration_type: expiration ? expirationType : 'unknown',
          is_open: isOpen,
        })
        .select(
          `
          id, place, quantity, unit, expiration_date, expiration_type,is_open,
          product:products (
            id, name,generic_name, brand, category, sub_category, default_unit, barcode,shopping_hidden, is_main, kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml
          )
        `,
        )
        .single();

      if (stockError || !stockData) throw stockError || new Error('Erreur création stock');
      finalStockRow = stockData as StockRow;
    }

    const newItem: StockItem = normalizeStockRow(finalStockRow);

    setStocks((prev) => {
      const index = prev.findIndex((s) => s.id === newItem.id);
      if (index === -1) return [...prev, newItem];
      const copy = [...prev];
      copy[index] = newItem;
      return copy;
    });


    const addedFromShoppingProductId = addExistingProductId ? normalizedProduct.id : null;

    resetAddForm();

    if (addedFromShoppingProductId) {
      setCheckedShoppingIds((prev) => prev.filter((id) => id !== addedFromShoppingProductId));
    }

    setInfo(
      addedFromShoppingProductId
        ? 'Produit ajouté au stock. La liste de courses se mettra à jour selon la quantité restante.'
        : 'Produit ajouté au stock.',
    );

    setShowBackToShoppingAfterAdd(!!addedFromShoppingProductId);
    setError(null);
  } catch (err) {
    console.error(err);
    setError("Erreur lors de l'ajout du produit");
  }
};

  // ---------- Shopping helpers ----------
  const recipeKindToCategory = (kind: RecipeKind) => (kind === 'sweet' ? 'Produit sucré' : 'Produit salé');

const getShoppingKeywordFromIngredient = (ingredient: string) => {
  const parsed = parseSingleMealIngredient(ingredient);
  return parsed.name.trim() || ingredient.trim();
};

  const findExistingProductForKeyword = (keyword: string) => {
    const key = normalizeText(getShoppingKeywordFromIngredient(keyword));
    return products.find((p) => {
      const pn = normalizeText(getProductMatchName(p));
      return pn === key || pn.includes(key) || key.includes(pn);
    });
  };

  const ensureProductExistsForShopping = async (keyword: string, kind: RecipeKind) => {
    const cleanKeyword = getShoppingKeywordFromIngredient(keyword);
    const local = findExistingProductForKeyword(cleanKeyword);
    if (local) return { product: local, created: false };

    const category = recipeKindToCategory(kind);

    const { data: created, error: createError } = await supabase
      .from('products')
      .insert({
        name: cleanKeyword,
        generic_name: cleanKeyword,
        brand: null,
        category,
        sub_category: null,
        default_unit: null,
        barcode: null,
        shopping_hidden: false,
        is_main: false,

        // nutrition inconnue
        kcal_100g: null,
        kcal_serving: null,
        serving_size_g: null,
        grams_per_unit_g: null,
        density_g_ml: null,
      })
      .select('id, name, generic_name,brand, category, sub_category, default_unit, barcode, shopping_hidden, is_main, kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml')
      .single();

    if (createError || !created) throw createError || new Error('Erreur création produit');

    const normalized: Product = {
      id: created.id,
      name: created.name,
      generic_name: created.generic_name ?? null,
      brand: created.brand,
      category: created.category,
      sub_category: created.sub_category ?? null,
      default_unit: created.default_unit,
      barcode: created.barcode ?? null,
      shopping_hidden: !!created.shopping_hidden,
      is_main: !!created.is_main,
      kcal_100g: created.kcal_100g ?? null,
      kcal_serving: created.kcal_serving ?? null,
      serving_size_g: created.serving_size_g ?? null,
      grams_per_unit_g: created.grams_per_unit_g ?? null,
      density_g_ml: created.density_g_ml ?? null,
    };

    setProducts((prev) => [...prev, normalized]);
    return { product: normalized, created: true };
  };

  const addMissingProductsSilently = async (missing: string[], kind: RecipeKind): Promise<number> => {
    let createdCount = 0;

    for (const ing of missing) {
      const trimmed = ing.trim();
      if (!trimmed) continue;

      const { created } = await ensureProductExistsForShopping(trimmed, kind);
      if (created) createdCount += 1;
    }

    return createdCount;
  };

  const addMissingIngredientsToShopping = async (missing: string[], kind: RecipeKind) => {
    if (!missing || missing.length === 0) return;

    setError(null);
    setInfo(null);

    try {
      const createdCount = await addMissingProductsSilently(missing, kind);

      setActiveTab('shopping');
      setShoppingSubTab('others');

      setInfo(
        createdCount === 0
          ? 'Ingrédients déjà présents dans tes produits connus. Va voir ta liste de courses.'
          : `Ajouté ${pluralize(createdCount, 'ingrédient')} à ta liste de courses.`,
      );
    } catch (e) {
      console.error(e);
      setError("Erreur lors de l'ajout des ingrédients à la liste de courses.");
    }
  };

const inStock = stocks.filter((s) => (s.quantity ?? 0) > 0);
const outOfStock = stocks.filter((s) => (s.quantity ?? 0) === 0);

  // ---------- Derived dashboard ----------
const totalItems = inStock.length;
const soonItems = inStock.filter((i) => getExpirationStatus(i.expiration_date, settings.soonDays) === 'soon').length;
const expiredItems = inStock.filter((i) => getExpirationStatus(i.expiration_date, settings.soonDays) === 'expired').length;

const soonList = inStock
  .filter((i) => getExpirationStatus(i.expiration_date, settings.soonDays) === 'soon')
  .sort((a, b) => (a.expiration_date ?? '').localeCompare(b.expiration_date ?? ''));

const expiredList = inStock
  .filter((i) => i.expiration_type === 'dlc')
  .filter((i) => getExpirationStatus(i.expiration_date, settings.soonDays) === 'expired')
  .sort((a, b) => (a.expiration_date ?? '').localeCompare(b.expiration_date ?? ''));

const ddmExceededList = inStock
  .filter((i) => i.expiration_type === 'ddm')
  .filter((i) => getExpirationStatus(i.expiration_date, settings.soonDays) === 'expired')
  .sort((a, b) => (a.expiration_date ?? '').localeCompare(b.expiration_date ?? ''));

  const updateStock = async (stockId: string, patch: Partial<Pick<StockItem, 'quantity' | 'unit' | 'place' | 'expiration_date' | 'expiration_type' | 'is_open'>>) => {

  const { data, error } = await supabase
    .from('stocks')
    .update(patch)
    .eq('id', stockId)
    .select(`id,place,quantity,unit,expiration_date,expiration_type,is_open`)
    .single();

  if (error || !data) {
    console.error(error);
    setError("Erreur lors de la mise à jour du stock.");
    return null;
  }

  // update state local
  setStocks((prev) =>
    prev.map((s) => (s.id === stockId ? { ...s, ...data } : s)),
  );

  return data;
};

const getMealIngredientsForStock = (meal: WeekMeal): string[] => {
  if (meal.recipe_id) {
    const recipe = dbRecipes.find((r) => r.id === meal.recipe_id);

    if (recipe && recipe.ingredients.length > 0) {
      return scaleRecipeIngredients(recipe.ingredients, recipe.servings, meal.servings).map(formatRecipeIngredient);
    }
  }

  return meal.ingredients ?? [];
};

async function decrementStockForMeal(meal: WeekMeal): Promise<{ decremented: string[]; missing: string[] }> {
  const mealIngredients = getMealIngredientsForStock(meal);

  if (mealIngredients.length === 0) {
    return { decremented: [], missing: [] };
  }

  const decrementedProducts: string[] = [];
  const missingIngredients: string[] = [];
  const usedStockIds = new Set<string>();

  for (const ingredient of mealIngredients) {
    const parsedIngredient = parseSingleMealIngredient(ingredient);
    const key = normalizeText(parsedIngredient.name);
    if (!key) continue;

    const candidates = stocks
      .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name && !usedStockIds.has(s.id))
      .filter((s) => {
        const productName = normalizeText(getProductMatchName(s.product!));
        return productName.includes(key) || key.includes(productName);
      })
      .sort((a, b) => {
        const score = (stock: StockItem) => {
          const status = getExpirationStatus(stock.expiration_date, settings.soonDays);

          if (status === 'expired' && stock.expiration_type === 'dlc') return 0;
          if (status === 'expired') return 1;
          if (status === 'soon') return 2;
          if (stock.is_open) return 3;

          return 4;
        };

        const scoreDiff = score(a) - score(b);
        if (scoreDiff !== 0) return scoreDiff;

        return (a.expiration_date ?? '9999-12-31').localeCompare(b.expiration_date ?? '9999-12-31');
      });

    if (candidates.length === 0) {
      missingIngredients.push(ingredient);
      continue;
    }

    let remainingToSubtract = quantityToSubtract(parsedIngredient, candidates[0].unit);
    let removedSomething = false;
    let lastUnitLabel = candidates[0].unit ?? 'unité';

    for (const stock of candidates) {
      if (remainingToSubtract <= 0) break;

      const current = stock.quantity ?? 0;
      const unitLabel = stock.unit ?? 'unité';
      const amountForThisStock = Math.min(current, remainingToSubtract);
      const actualRemoved = roundQty(amountForThisStock, stock.unit);
      const next = Math.max(0, roundQty(current - amountForThisStock, stock.unit));

      const updated = await updateStock(stock.id, { quantity: next });
      if (!updated) continue;

      usedStockIds.add(stock.id);
      removedSomething = true;
      lastUnitLabel = unitLabel;

      const removedLabel = `${stock.product?.name ?? ingredient} (-${actualRemoved} ${unitLabel})`;
      decrementedProducts.push(removedLabel);

      remainingToSubtract = roundQty(remainingToSubtract - amountForThisStock, stock.unit);
    }

    if (!removedSomething) {
      missingIngredients.push(ingredient);
      continue;
    }

    if (remainingToSubtract > 0) {
      missingIngredients.push(`${parsedIngredient.name} ${remainingToSubtract} ${lastUnitLabel}`);
    }
  }
  return { decremented: decrementedProducts, missing: missingIngredients };
}
const todayKey = toDateKey(new Date());

const todayMeals = MEAL_SLOTS.map((slot) => ({
  slot,
  meal: weekMeals.find((meal) => meal.meal_date === todayKey && meal.meal_slot === slot.key) ?? null,
}));

const consumedTodayMeals = todayMeals.filter(({ meal }) => meal?.consumed_at);

const todayCalories = consumedTodayMeals.reduce((total, item) => {
  if (!item.meal) return total;
  const kcal = mealCalories(item.meal, dbRecipes, products);
  return total + (kcal ?? 0);
}, 0);

const plannedTodayMeals = todayMeals.filter(({ meal }) => meal && !meal.consumed_at);

const plannedTodayCalories = plannedTodayMeals.reduce((total, item) => {
  if (!item.meal) return total;
  const kcal = mealCalories(item.meal, dbRecipes, products);
  return total + (kcal ?? 0);
}, 0);

const projectedTodayCalories = todayCalories + plannedTodayCalories;

const todayCaloriesPercent =
  settings.dailyCalorieGoal > 0
    ? Math.min(100, Math.round((todayCalories / settings.dailyCalorieGoal) * 100))
    : 0;


const remainingCalories = settings.dailyCalorieGoal - todayCalories;

const todayCaloriesStatus =
  settings.dailyCalorieGoal <= 0
    ? 'Objectif désactivé'
    : remainingCalories >= 0
      ? `${remainingCalories} kcal restantes`
      : `${Math.abs(remainingCalories)} kcal au-dessus`;

const lowStockList = inStock
  .filter((item) => (item.quantity ?? 0) <= stepForUnit(item.unit))
  .sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''));


const getPriorityScore = (item: StockItem) => {
  const status = getExpirationStatus(item.expiration_date, settings.soonDays);

  if (status === 'expired' && item.expiration_type === 'dlc') return 0;
  if (status === 'expired') return 1;
  if (status === 'soon') return 2;
  if (item.is_open) return 3;

  return 4;
};

const priorityList = inStock
  .filter((item) => {
    const status = getExpirationStatus(item.expiration_date, settings.soonDays);
    return status === 'expired' || status === 'soon' || item.is_open;
  })
  .sort((a, b) => {
    const scoreDiff = getPriorityScore(a) - getPriorityScore(b);
    if (scoreDiff !== 0) return scoreDiff;

    return (a.expiration_date ?? '9999-12-31').localeCompare(b.expiration_date ?? '9999-12-31');
  })
  .slice(0, 6);


const changeQuantity = async (item: StockItem, direction: 1 | -1) => {
  const current = item.quantity ?? 0;
  const step = stepForUnit(item.unit);
  const next = Math.max(0, roundQty(current + direction * step, item.unit));

  await updateStock(item.id, { quantity: next });

  // ✅ si on atteint 0 : l’article doit aller dans "Anciens achats" ET réapparaitre dans shopping
  if (next === 0 && item.product?.id) {
    await unhideFromShopping(item.product.id);
  }
};


const changeUnit = async (item: StockItem, newUnit: string) => {
  await updateStock(item.id, { unit: newUnit });
};

const renderHistoryTab = () => {
  const categorizedHistoryIds = new Set<string>();
  const historyPlaces = new Set(outOfStock.map((item) => item.place).filter(Boolean));
  const historyCategories = new Set(outOfStock.map((item) => item.product?.category).filter(Boolean));
  const lastKnownProduct = outOfStock[0]?.product?.name ?? 'Aucun produit';
  const historyStats = [
    { value: outOfStock.length, label: 'produits connus' },
    { value: historyPlaces.size, label: 'lieux' },
    { value: historyCategories.size, label: 'catégories' },
    { value: lastKnownProduct, label: 'dernier achat' },
  ];

  const groupedByCategory: { label: string; items: StockItem[] }[] = MAIN_CATEGORIES.map((cat) => {
    const items = outOfStock.filter((s) => s.product?.category === cat);
    items.forEach((item) => categorizedHistoryIds.add(item.id));

    return {
      label: cat,
      items,
    };
  });

  const uncategorizedItems = outOfStock.filter((item) => !categorizedHistoryIds.has(item.id));

  if (uncategorizedItems.length > 0) {
    groupedByCategory.push({
      label: 'Sans catégorie',
      items: uncategorizedItems,
    });
  }

  const renderHistoryItem = (item: StockItem) => (
    <article key={item.id} className="history-product-card">
      <div className="history-product-main">
        <span className="history-product-category">{item.product?.category ?? 'Sans catégorie'}</span>
        <h3>{item.product?.name ?? 'Produit'}</h3>
        <p>{item.product?.brand || item.product?.generic_name || 'Ancien achat enregistré'}</p>
      </div>

      <div className="history-product-meta">
        <span>{item.place || settings.defaultPlace}</span>
        <span>{item.product?.barcode ? `Code ${item.product.barcode}` : 'Sans code-barres'}</span>
      </div>

      <div className="history-product-controls">
        <div className="qty-controls">
          <button type="button" className="qty-btn" onClick={() => void changeQuantity(item, -1)}>−</button>
          <span className="qty-value">{item.quantity ?? 0}</span>
          <button type="button" className="qty-btn" onClick={() => void changeQuantity(item, +1)}>+</button>
        </div>
        <select
          className="unit-select"
          value={item.unit ?? 'unité'}
          onChange={(e) => void changeUnit(item, e.target.value)}
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
        <button type="button" className="btn-tertiary btn-with-icon" onClick={() => openEdit(item)}>
          <span className="btn-symbol btn-symbol--edit" aria-hidden="true" />
          Modifier
        </button>
      </div>
    </article>
  );

  return (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Historique</h1>
          <p className="main-subtitle">
            Les produits déjà connus que tu peux remettre au stock rapidement.
          </p>
        </div>
        <div className="main-header-right">
          <button type="button" className="btn-tertiary" onClick={() => setActiveTab('stock')}>
            Retour au stock
          </button>
          <span className="tag">Achats passés</span>
        </div>
      </div>

      <section className="history-hero">
        <div className="history-hero-media" aria-hidden="true" />
        <div className="history-hero-content">
          <span className="hero-eyebrow">Mémoire du placard</span>
          <h2>{pluralize(outOfStock.length, 'produit à remettre', 'produits à remettre')}</h2>
          <p>
            Reprends un ancien achat sans recréer sa fiche, puis ajuste simplement quantité, unité et lieu.
          </p>
        </div>
        <div className="history-hero-stats">
          {historyStats.map((stat) => (
            <span key={stat.label}>
              <strong>{stat.value}</strong>
              {stat.label}
            </span>
          ))}
        </div>
      </section>

      {outOfStock.length === 0 ? (
        <section className="history-empty-state">
          <div className="history-empty-visual" aria-hidden="true" />
          <div>
            <span className="hero-eyebrow">Historique calme</span>
            <h2>Aucun ancien achat</h2>
            <p>Les produits qui tombent à zéro apparaîtront ici pour être remis au stock plus vite.</p>
            <button type="button" className="btn-primary" onClick={() => setActiveTab('stock')}>
              Voir le stock
            </button>
          </div>
        </section>
      ) : (
        <section className="history-board">
          {groupedByCategory.map(({ label, items }) => (
            <section key={label} className="history-category-section">
              <div className="category-head">
                <h2 className="section-title" style={{ margin: 0 }}>{label}</h2>
                <span className="category-count">{items.length}</span>
              </div>

              {items.length === 0 ? (
                <p className="muted" style={{ marginTop: '0.5rem' }}>Aucun élément.</p>
              ) : (
                <div className="history-card-grid">
                  {items.map(renderHistoryItem)}
                </div>
              )}
            </section>
          ))}
        </section>
      )}
    </>
      );
	    };

const getRecipePlanValue = (recipe: Recipe) => {
  const isDbRecipe = dbRecipes.some((r) => r.id === recipe.id);
  return isDbRecipe ? `db:${recipe.id}` : `sample:${recipe.id}`;
};

const openPlanFromRecipe = (recipe: Recipe) => {
  const today = new Date();

  setWeekStart(startOfWeekMonday(today));
  setPlanDate(toDateKey(today));
  setPlanSlot('lunch');
  setPlanRecipeValue(getRecipePlanValue(recipe));
  setPlanCustomName('');
  setPlanCustomIngredients('');
  setPlanServings('1');
  setPlanNotes('');
  setPlanKcalOverride('');
  setActiveTab('weekmenu');
  setPlanOpen(true);
};

const renderWeekMenuTab = () => {
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const dayKeys = days.map(toDateKey);

  // recettes disponibles : DB + exemples
  const dbRecipeOptions = dbRecipes.map(applyRecipeOverrides);
  const sampleRecipeOptions = SAMPLE_RECIPES.map(applyRecipeOverrides);
  const allRecipes: Recipe[] = [...dbRecipeOptions, ...sampleRecipeOptions];

  const getCell = (dateKey: string, slot: MealSlot) =>
    weekMeals.find((m) => m.meal_date === dateKey && m.meal_slot === slot) ?? null;

  const openPlan = (dateKey: string, slot: MealSlot) => {
    const existing = getCell(dateKey, slot);

    setPlanDate(dateKey);
    setPlanSlot(slot);
    setPlanKcalOverride(existing?.kcal_override != null ? String(existing.kcal_override) : '');

    if (existing) {
      // pré-remplir
      setPlanRecipeValue(existing.recipe_id ? `db:${existing.recipe_id}` : 'custom');
      setPlanCustomName(existing.recipe_id ? '' : existing.recipe_name);
      setPlanCustomIngredients(existing.ingredients?.join(', ') ?? '');
      setPlanServings(String(existing.servings ?? 1));
      setPlanNotes(existing.notes ?? '');
    } else {
      setPlanRecipeValue('');
      setPlanCustomName('');
      setPlanCustomIngredients('');
      setPlanServings('1');
      setPlanNotes('');
    }

    setPlanOpen(true);
  };

  const savePlan = async () => {
    // 1) déterminer recette sélectionnée
    let recipe_id: string | null = null;
    let recipe_name = '';
    let recipe_kind: RecipeKind | null = null;
    let ingredients: string[] | null = null;

    const servingsNum = Number(planServings);
    const servings = Number.isFinite(servingsNum) && servingsNum > 0 ? servingsNum : null;
    const v = planRecipeValue;

    if (!v || v === 'custom') {
      recipe_name = planCustomName.trim();
      if (!recipe_name) {
        setError("Donne un nom au repas (ou choisis une recette).");
        return;
      }

      const customIngredients = parseRecipeIngredients(planCustomIngredients);
      ingredients = customIngredients.length > 0
        ? customIngredients.map(formatRecipeIngredient)
        : null;
    } else if (v.startsWith('db:')) {
      recipe_id = v.slice(3);
      const r = allRecipes.find((x) => x.id === recipe_id);
      recipe_name = r?.name ?? 'Recette';
      recipe_kind = r?.kind ?? null;
      ingredients = r?.ingredients
        ? scaleRecipeIngredients(r.ingredients, r.servings, servings).map(formatRecipeIngredient)
        : null;
    } else if (v.startsWith('sample:')) {
      const rid = v.slice(7);
      const r = allRecipes.find((x) => x.id === rid);
      recipe_name = r?.name ?? 'Recette';
      recipe_kind = r?.kind ?? null;
      ingredients = r?.ingredients
        ? scaleRecipeIngredients(r.ingredients, r.servings, servings).map(formatRecipeIngredient)
        : null;
      // pas de recipe_id en DB pour les samples => on stocke un snapshot
      recipe_id = null;
    }

    const kcalOverrideNum = Number(planKcalOverride);
    const kcal_override = Number.isFinite(kcalOverrideNum) ? kcalOverrideNum : null;

    await upsertWeekMeal({
      meal_date: planDate,
      meal_slot: planSlot,
      recipe_id,
      recipe_name,
      recipe_kind,
      ingredients,
      servings,
      notes: planNotes.trim() || null,
      kcal_override,
    });

    setPlanOpen(false);
  };

	  // bonus : ajouter ingrédients manquants de la semaine à la liste
	  const addWeekMissingToShopping = async () => {
    // stock dispo (noms)
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const stockNames = stocks
      .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name)
      .map((s) => normalize(getProductMatchName(s.product!)));

    const hasIngredient = (ingredient: string) => {
      const key = normalize(getShoppingKeywordFromIngredient(ingredient));
      return stockNames.some((n) => n.includes(key) || key.includes(n));
    };
    
    // collect missing
    const missingSavory = new Set<string>();
    const missingSweet = new Set<string>();

    for (const m of weekMeals) {
      if (!m.ingredients || m.ingredients.length === 0) continue;
      for (const ing of m.ingredients) {
        if (hasIngredient(ing)) continue;
        if (m.recipe_kind === 'sweet') missingSweet.add(ing);
        else missingSavory.add(ing); // défaut: salé
      }
    }

    const a = Array.from(missingSavory);
    const b = Array.from(missingSweet);

    if (a.length === 0 && b.length === 0) {
      setInfo("Aucun ingrédient manquant détecté pour la semaine.");
      setActiveTab('shopping');
      return;
    }

    // on réutilise ta logique existante
	    if (a.length > 0) await addMissingIngredientsToShopping(a, 'savory');
	    if (b.length > 0) await addMissingIngredientsToShopping(b, 'sweet');
	  };

  const mealsThisWeek = weekMeals.filter((meal) => dayKeys.includes(meal.meal_date));
  const consumedWeekMeals = mealsThisWeek.filter((meal) => meal.consumed_at).length;
  const estimatedWeekCalories = mealsThisWeek.reduce((total, meal) => {
    const kcal = mealCalories(meal, dbRecipes, products);
    return total + (kcal ?? 0);
  }, 0);
  const freeWeekSlots = Math.max(0, (dayKeys.length * MEAL_SLOTS.length) - mealsThisWeek.length);
  const completedWeekPercent = mealsThisWeek.length > 0
    ? Math.round((consumedWeekMeals / mealsThisWeek.length) * 100)
    : 0;
  const averageMealCalories = mealsThisWeek.length > 0 && estimatedWeekCalories > 0
    ? Math.round(estimatedWeekCalories / mealsThisWeek.length)
    : 0;
  const weekRangeLabel = `${days[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} - ${days[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`;
  const planningHeroStats = [
    { value: mealsThisWeek.length, label: 'repas' },
    { value: consumedWeekMeals, label: 'validés' },
    { value: freeWeekSlots, label: 'créneaux libres' },
    { value: averageMealCalories || '-', label: 'kcal moy.' },
  ];
  const getDayMealEntries = (dateKey: string) =>
    MEAL_SLOTS.map((slot) => ({ slot, meal: getCell(dateKey, slot.key) }));
  const nextPlannedEntry = days
    .flatMap((day) => {
      const dateKey = toDateKey(day);
      return getDayMealEntries(dateKey).map(({ slot, meal }) => ({ day, dateKey, slot, meal }));
    })
    .find(({ dateKey, meal }) => meal && !meal.consumed_at && dateKey >= todayKey);
  const nextPlannedText = nextPlannedEntry?.meal
    ? `${nextPlannedEntry.slot.label} · ${nextPlannedEntry.meal.recipe_name}`
    : 'Aucun repas à venir';

	  return (
	    <>
	      <div className="main-header">
	        <div>
	          <h1 className="main-title">Planning</h1>
	          <p className="main-subtitle">
	            Ta semaine de repas, prête à devenir une liste de courses.
	          </p>
	        </div>
	        <div className="main-header-right">
	          <span className="tag">Semaine</span>
	        </div>
	      </div>

      <section
        className="planner-band"
        style={{ '--planner-progress': `${completedWeekPercent}%` } as CSSProperties}
      >
        <div className="planner-band-media" aria-hidden="true" />
        <div className="planner-band-content">
          <span className="hero-eyebrow">Menu de la semaine</span>
          <h2>{pluralize(mealsThisWeek.length, 'repas planifié', 'repas planifiés')}</h2>
          <p>
            {weekRangeLabel} · {pluralize(consumedWeekMeals, 'repas validé', 'repas validés')} · {pluralize(freeWeekSlots, 'créneau libre', 'créneaux libres')}
          </p>
          <div className="planner-next-meal">
            <span>Prochain repas</span>
            <strong>{nextPlannedText}</strong>
          </div>
          <div className="planner-progress" aria-hidden="true">
            <span />
          </div>
        </div>
        <div className="planner-band-side">
          <div className="planner-band-stats">
            {planningHeroStats.map((stat) => (
              <span key={stat.label}>
                <strong>{stat.value}</strong>
                {stat.label}
              </span>
            ))}
          </div>
	          <button type="button" className="btn-primary btn-with-icon" onClick={() => openPlan(dayKeys[0], 'lunch')}>
	            <span className="btn-symbol btn-symbol--calendar" aria-hidden="true" />
	            Composer un repas
	          </button>
	        </div>
      </section>

      <section className="planning-board">
        <div className="planning-toolbar">
          <div>
            <span className="planning-toolbar-label">Semaine affichée</span>
            <strong>{weekRangeLabel}</strong>
          </div>
          <div className="planning-toolbar-actions">
            <button type="button" className="btn-tertiary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              Précédente
            </button>
            <button type="button" className="btn-tertiary" onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>
              Aujourd'hui
            </button>
            <button type="button" className="btn-tertiary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Suivante
            </button>
            <button type="button" className="btn-secondary" onClick={() => void addWeekMissingToShopping()}>
              Manquants aux courses
            </button>
          </div>
        </div>

        {weekMealsLoading ? (
          <div className="planning-loading-state">
            <span className="hero-eyebrow">Chargement</span>
            <h3>Préparation de ta semaine</h3>
            <p>Les repas enregistrés arrivent dans le planning.</p>
          </div>
        ) : (
          <div className="planning-week-grid">
            {days.map((day) => {
              const dateKey = toDateKey(day);
              const dayEntries = getDayMealEntries(dateKey);
              const plannedDayMeals = dayEntries.filter(({ meal }) => meal).length;
              const consumedDayMeals = dayEntries.filter(({ meal }) => meal?.consumed_at).length;
              const isToday = dateKey === todayKey;

              return (
                <article
                  key={dateKey}
                  className={`planning-day-card${isToday ? ' planning-day-card--today' : ''}`}
                >
                  <div className="planning-day-head">
                    <div>
                      <span>{day.toLocaleDateString('fr-FR', { weekday: 'long' })}</span>
                      <strong>{day.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}</strong>
                    </div>
                    <small>{isToday ? "Aujourd'hui" : `${plannedDayMeals}/3`}</small>
                  </div>

                  <div className="planning-day-summary">
                    <span>{pluralize(plannedDayMeals, 'repas prévu', 'repas prévus')}</span>
                    <span>{pluralize(consumedDayMeals, 'validé', 'validés')}</span>
                  </div>

                  <div className="planning-meal-stack">
                    {dayEntries.map(({ slot, meal }) => {
                      const calories = meal ? mealCaloriesInfo(meal, dbRecipes, products) : null;
                      const recipeKindLabel = meal?.recipe_kind === 'sweet' ? 'Sucré' : meal?.recipe_kind === 'savory' ? 'Salé' : 'Libre';

                      return (
                        <article
                          key={`${dateKey}-${slot.key}`}
                          className={`planning-meal-card${meal ? '' : ' planning-meal-card--empty'}${meal?.consumed_at ? ' planning-meal-card--consumed' : ''}`}
                        >
                          <div className="planning-meal-slot">
                            <span>{slot.label}</span>
                            {meal && <small>{recipeKindLabel}</small>}
                          </div>

                          {!meal ? (
                            <button
                              type="button"
                              className="planning-add-meal"
                              onClick={() => openPlan(dateKey, slot.key)}
                            >
                              Planifier
                            </button>
                          ) : (
                            <>
                              <div className="planning-meal-body">
                                <h3>{meal.recipe_name}</h3>
                                <div className="planning-meal-meta">
                                  <span>
                                    {calories?.kcal != null
                                      ? `${calories.approx ? '≈ ' : ''}${calories.kcal} kcal`
                                      : 'Kcal à compléter'}
                                  </span>
                                  {meal.servings && <span>{meal.servings} pers.</span>}
                                </div>
                                {meal.notes && <p>{meal.notes}</p>}
                              </div>
                              <div className="planning-meal-actions">
                                {meal.consumed_at ? (
                                  <span className="meal-consumed">Validé</span>
                                ) : (
                                  <button type="button" className="btn-tertiary" onClick={() => void markWeekMealConsumed(meal)}>
                                    Valider
                                  </button>
                                )}
                                <button type="button" className="btn-tertiary" onClick={() => openPlan(dateKey, slot.key)}>
                                  Modifier
                                </button>
                                <button type="button" className="btn-tertiary" onClick={() => void deleteWeekMeal(dateKey, slot.key)}>
                                  Supprimer
                                </button>
                              </div>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </section>

      {/* Modal plan */}
      {planOpen && (
        <div className="modal-backdrop">
          <div className="modal-card planner-modal-card">
            <div className="modal-head">
              <div>
                <p className="modal-eyebrow">Planning</p>
                <h3 className="modal-title">Planifier un repas</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Fermer la fenêtre"
                onClick={() => setPlanOpen(false)}
              >
                ✕
              </button>
            </div>

	            <p className="modal-subtitle">
	              Choisis une recette, ajuste les portions, ou note un repas libre avec ses ingrédients.
	            </p>

            <div className="modal-context-row">
              <span>{planDate}</span>
              <span>{MEAL_SLOTS.find((s) => s.key === planSlot)?.label}</span>
              <span>{planRecipeValue ? 'Recette sélectionnée' : 'À compléter'}</span>
            </div>

            <div className="form-grid modal-form-grid">
              <div className="field-group">
              <label className="field-label">Calories (optionnel)</label>
              <input
                className="field-input"
                value={planKcalOverride}
                onChange={(e) => setPlanKcalOverride(e.target.value)}
                placeholder="ex: 650"
              />
            </div>

              <div className="field-group full">
                <label className="field-label">Choisir une recette</label>
                <select
                  className="field-input"
                  value={planRecipeValue}
                  onChange={(e) => setPlanRecipeValue(e.target.value)}
                >
                  <option value="">(Choisir…)</option>
                  <option value="custom">Repas libre (texte)</option>

                  <optgroup label="Recettes enregistrées">
                    {dbRecipeOptions.map((r) => (
                      <option key={r.id} value={`db:${r.id}`}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="Recettes exemples">
                    {sampleRecipeOptions.map((r) => (
                      <option key={r.id} value={`sample:${r.id}`}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Date</label>
                <input
                  type="date"
                  className="field-input"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Repas</label>
                <select
                  className="field-input"
                  value={planSlot}
                  onChange={(e) => setPlanSlot(e.target.value as MealSlot)}
                >
                  {MEAL_SLOTS.map((slot) => (
                    <option key={slot.key} value={slot.key}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
              {(planRecipeValue === 'custom' || planRecipeValue === '') && (
                <>
                  <div className="field-group full">
                    <label className="field-label">Nom du repas</label>
                    <input
                      className="field-input"
                      value={planCustomName}
                      onChange={(e) => setPlanCustomName(e.target.value)}
                      placeholder="Ex : Restes / Sandwich / Pizza..."
                    />
                  </div>

                  <div className="field-group full">
                    <label className="field-label">Ingrédients du repas libre</label>
                    <textarea
                      className="field-input"
                      value={planCustomIngredients}
                      onChange={(e) => setPlanCustomIngredients(e.target.value)}
                      placeholder="Ex : pain 2 unité, jambon 2 unité, fromage 50 g"
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="field-group">
                <label className="field-label">Portions</label>
                <input
                  className="field-input"
                  value={planServings}
                  onChange={(e) => setPlanServings(e.target.value)}
                  type="number"
                  min={1}
                />
              </div>

              <div className="field-group full">
                <label className="field-label">Notes</label>
                <input
                  className="field-input"
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  placeholder="Ex : avec salade / sans lactose / à préparer la veille…"
                />
              </div>
            </div>

            <div className="modal-actions">
	              <button type="button" className="btn-secondary" onClick={() => setPlanOpen(false)}>
	                Annuler
	              </button>
	              <button type="button" className="btn-primary" onClick={() => void savePlan()}>
	                Enregistrer le repas
	              </button>
	            </div>
          </div>
        </div>
      )}
    </>
      );
	    };

const hideFromShopping = async (productId: string) => {
  const { error } = await supabase
    .from('products')
    .update({ shopping_hidden: true })
    .eq('id', productId);

  if (error) {
    console.error(error);
    setError("Impossible de retirer l'aliment de la liste.");
    return;
  }

  setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, shopping_hidden: true } : p)));
  setInfo("Aliment retiré de la liste de courses.");
};

  // ---------- Tabs ----------
const renderStockTab = () => {
  const stockSearchKey = normalizeText(stockSearch);

  const getShelfKind = (placeName: string): StockShelfKind => {
    const key = normalizeText(placeName);

    if (key.includes('frigo') || key.includes('refrigerateur')) return 'fridge';
    if (key.includes('congel')) return 'freezer';
    if (key.includes('menager') || key.includes('entretien') || key.includes('maison')) return 'household';
    if (key.includes('medicament') || key.includes('sante') || key.includes('pharmacie')) return 'medicine';

    return 'pantry';
  };

  const shelfKindLabels: Record<StockShelfKind, string> = {
    pantry: 'Réserve',
    fridge: 'Frais',
    freezer: 'Surgelé',
    household: 'Maison',
    medicine: 'Santé',
  };

  const openAddProductFlow = () => {
    setActiveTab('dashboard');
    setScrollToAddForm(true);
  };

  const searchFilteredInStock = stockSearchKey
    ? inStock.filter((item) => {
        const searchableText = [
          item.product?.name,
          item.product?.generic_name,
          item.product?.brand,
          item.product?.category,
          item.product?.sub_category,
          item.product?.barcode,
          item.place,
          item.unit,
        ]
          .filter(Boolean)
          .map(String)
          .map(normalizeText)
          .join(' ');

        return searchableText.includes(stockSearchKey);
      })
    : inStock;

  const stockPlaces = Array.from(
    new Set(
      inStock
        .map((item) => item.place?.trim())
        .filter((place): place is string => !!place),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const extraStockPlaces = stockPlaces.filter(
    (placeName) => !DEFAULT_STOCK_PLACES.some((defaultPlace) => defaultPlace === placeName),
  );
  const stockShelfPlaces = [...DEFAULT_STOCK_PLACES, ...extraStockPlaces];

  const stockShelfCards = stockShelfPlaces.map((placeName) => {
    const items = inStock.filter((item) => item.place?.trim() === placeName);
    const urgentCount = items.filter((item) => {
      const status = getExpirationStatus(item.expiration_date, settings.soonDays);
      return status === 'soon' || status === 'expired' || item.is_open;
    }).length;
    const lowCount = items.filter((item) => (item.quantity ?? 0) <= stepForUnit(item.unit)).length;

    return {
      placeName,
      count: items.length,
      urgentCount,
      lowCount,
      kind: getShelfKind(placeName),
    };
  });

  const filteredInStock = searchFilteredInStock.filter((item) => {
    const status = getExpirationStatus(item.expiration_date, settings.soonDays);
    if (stockPlaceFilter && item.place?.trim() !== stockPlaceFilter) return false;
    if (stockFilter === 'soon') return status === 'soon';
    if (stockFilter === 'expired') return status === 'expired';
    if (stockFilter === 'expired-dlc') return status === 'expired' && item.expiration_type === 'dlc';
    if (stockFilter === 'expired-ddm') return status === 'expired' && item.expiration_type === 'ddm';
    if (stockFilter === 'open') return item.is_open;
    if (stockFilter === 'low') return (item.quantity ?? 0) <= stepForUnit(item.unit);

    return true;
  });

  const sortedInStock = [...filteredInStock].sort((a, b) => {
    let result = 0;

    if (stockSort === 'name') {
      result = (a.product?.name ?? '').localeCompare(b.product?.name ?? '');
    } else if (stockSort === 'quantity') {
      result = (a.quantity ?? 0) - (b.quantity ?? 0);
    } else if (stockSort === 'place') {
      result = (a.place ?? '').localeCompare(b.place ?? '');
    } else {
      result = (a.expiration_date ?? '9999-12-31').localeCompare(b.expiration_date ?? '9999-12-31');
    }

    return stockSortDirection === 'asc' ? result : -result;
  });

  const stockFilterOptions: { value: StockFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'soon', label: 'Bientôt périmés' },
    { value: 'expired-dlc', label: 'DLC périmées' },
    { value: 'expired-ddm', label: 'DDM dépassées' },
    { value: 'expired', label: 'Tous périmés' },
    { value: 'open', label: 'Ouverts' },
    { value: 'low', label: 'Stock faible' },
  ];

  const stockOverviewStats = [
    { value: inStock.length, label: 'produits suivis' },
    { value: priorityList.length, label: 'à surveiller' },
    { value: lowStockList.length, label: 'stocks faibles' },
    { value: stockShelfCards.length, label: 'zones' },
  ];

  const stockHeroItem = priorityList[0];
  const stockHeroTitle = stockHeroItem
    ? `${stockHeroItem.product?.name ?? 'Un produit'} mérite ton attention`
    : inStock.length > 0
      ? 'Tes rayons sont sous contrôle'
      : 'Construis ton stock en quelques scans';
  const stockHeroText = stockHeroItem
    ? `${stockHeroItem.place || 'Lieu non précisé'} · ${stockHeroItem.quantity ?? 0} ${stockHeroItem.unit ?? 'unité'} à prioriser avant le prochain menu.`
    : inStock.length > 0
      ? 'Recherche, trie et ajuste les quantités sans passer par une grille froide.'
      : 'Scanne un code-barres ou ajoute un produit à la main pour remplir tes rayons.';

  const hasActiveStockControls =
    stockSearch.trim() ||
    stockFilter !== 'all' ||
    stockPlaceFilter ||
    stockSort !== 'expiration' ||
    stockSortDirection !== 'asc';

  const resetStockControls = () => {
    setStockSearch('');
    setStockFilter('all');
    setStockPlaceFilter('');
    setStockSort('expiration');
    setStockSortDirection('asc');
  };

  const categorizedStockIds = new Set<string>();

  const groupedByCategory: { label: string; items: StockItem[] }[] = MAIN_CATEGORIES.map((cat) => {
    const items = sortedInStock.filter((s) => s.product?.category === cat);
    items.forEach((item) => categorizedStockIds.add(item.id));

    return {
      label: cat,
      items,
    };
  });

  const uncategorizedItems = sortedInStock.filter((item) => !categorizedStockIds.has(item.id));

  if (uncategorizedItems.length > 0) {
    groupedByCategory.push({
      label: 'Sans catégorie',
      items: uncategorizedItems,
    });
  }

  const renderStockCard = (item: StockItem) => {
    const expDate = item.expiration_date;
    const exp = expDate ? new Date(expDate).toLocaleDateString() : 'Pas de date';
    const status = getExpirationStatus(expDate, settings.soonDays);
    const labelStatus = getExpirationLabel(status, item.expiration_type);
    const expirationTypeLabel =
      item.expiration_type === 'dlc'
        ? 'DLC'
        : item.expiration_type === 'ddm'
          ? 'DDM'
          : 'Date inconnue';
    const kcalInfo = kcalForStock(item);
    const isLow = (item.quantity ?? 0) <= stepForUnit(item.unit);
    const cardTone =
      status === 'expired'
        ? ' stock-product-card--expired'
        : status === 'soon' || item.is_open
          ? ' stock-product-card--watch'
          : isLow
            ? ' stock-product-card--low'
            : '';

    return (
      <article key={item.id} className={`stock-product-card${cardTone}`}>
        <div className="stock-product-top">
          <div className="stock-product-identity">
            <span className="stock-product-category">
              {item.product?.sub_category || item.product?.category || 'Sans catégorie'}
            </span>
            <h3>{item.product?.name ?? 'Produit'}</h3>
            <p>
              {item.product?.brand || 'Marque non renseignée'}
              {item.product?.barcode ? ` · ${item.product.barcode}` : ''}
            </p>
          </div>

          <span className={`status-pill ${getExpirationClass(status, item.expiration_type)}`}>
            <span className="status-dot" />
            {labelStatus}
          </span>
        </div>

        <div className="stock-product-meta-grid">
          <div>
            <span>Lieu</span>
            <strong>{item.place || 'Non rangé'}</strong>
          </div>
          <div>
            <span>Date</span>
            <strong>{exp}</strong>
            <small>{expirationTypeLabel}</small>
          </div>
          <div>
            <span>Énergie</span>
            <strong>
              {kcalInfo.kcal != null
                ? `${kcalInfo.approx ? '≈ ' : ''}${kcalInfo.kcal} kcal`
                : 'À compléter'}
            </strong>
          </div>
        </div>

        <div className="stock-product-controls">
          <div className="stock-quantity-card">
            <span>Quantité</span>
            <div className="stock-quantity-line">
              <div className="qty-controls">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => void changeQuantity(item, -1)}
                  title="Diminuer"
                >
                  −
                </button>

                <span className="qty-value">{item.quantity ?? 0}</span>

                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => void changeQuantity(item, +1)}
                  title="Augmenter"
                >
                  +
                </button>
              </div>

              <select
                className="unit-select stock-unit-select"
                value={item.unit ?? 'unité'}
                onChange={(e) => void changeUnit(item, e.target.value)}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="stock-product-footer">
          {item.product ? (
            <label className="stock-product-toggle">
              <input
                type="checkbox"
                checked={item.product.is_main}
                onChange={() => handleToggleMain(item.product!.id, item.product!.is_main)}
              />
              <span>Essentiel</span>
            </label>
          ) : (
            <span className="stock-product-toggle stock-product-toggle--muted">Produit lié manquant</span>
          )}

          <button
            type="button"
            className={`status-pill status-pill-button ${item.is_open ? 'status-soon' : 'status-ok'}`}
            onClick={() => void updateStock(item.id, { is_open: !item.is_open })}
            title={item.is_open ? 'Marquer comme non ouvert' : 'Marquer comme ouvert'}
          >
            <span className="status-dot" />
            {item.is_open ? 'Ouvert' : 'Fermé'}
          </button>

          <button
            type="button"
            className="btn-tertiary stock-edit-btn"
            onClick={() => openEdit(item)}
            title="Modifier"
          >
            Modifier
          </button>
        </div>
      </article>
    );
  };

  const renderStockCardGrid = (rows: StockItem[]) => (
    <div className="stock-product-grid">
      {rows.map(renderStockCard)}
    </div>
  );

  const renderCategoryContent = (label: string, items: StockItem[]) => {
    if (items.length === 0) {
      return (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Aucun élément dans cette catégorie.
        </p>
      );
    }

    const subcats = MAIN_CATEGORIES.includes(label as MainCategory)
      ? getSubcatsFor(label as MainCategory)
      : [];

    if (subcats.length === 0) return renderStockCardGrid(items);

    // sous-catégories => on n'affiche que celles qui ont au moins 1 produit
    const blocks = subcats
      .map((sc) => {
        const rows = items.filter((it) => (it.product?.sub_category ?? '') === sc);
        if (rows.length === 0) return null;

        return (
          <div key={sc} className="subcat-block">
            <h3 className="subcat-title">{sc}</h3>
            {renderStockCardGrid(rows)}
          </div>
        );
      })
      .filter(Boolean);

    // "Autres" = sans sous-catégorie
    const others = items.filter((it) => !it.product?.sub_category);
    if (others.length > 0) {
      blocks.push(
        <div key="Autres" className="subcat-block">
          <h3 className="subcat-title">Autres</h3>
          {renderStockCardGrid(others)}
        </div>,
      );
    }

    return <>{blocks}</>;
  };

  return (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Stock</h1>
          <p className="main-subtitle">
            Tout ce que tu as sous la main, par lieu et par urgence.
          </p>
        </div>
        <div className="main-header-right">
          <button type="button" className="btn-tertiary" onClick={() => setActiveTab('history')}>
            Anciens achats
          </button>
          <span className="tag">Inventaire vivant</span>
        </div>
      </div>

      <section className="stock-hero">
        <div className="stock-hero-media" aria-hidden="true" />
        <div className="stock-hero-content">
          <span className="hero-eyebrow">Inventaire</span>
          <h2>{stockHeroTitle}</h2>
          <p>{stockHeroText}</p>
          <div className="hero-actions">
	            <button type="button" className="btn-primary btn-with-icon" onClick={() => setShowScanner(true)}>
	              <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
	              Scanner un produit
	            </button>
            <button type="button" className="btn-secondary btn-with-icon" onClick={openAddProductFlow}>
              <span className="btn-symbol btn-symbol--plus" aria-hidden="true" />
              Ajouter au stock
            </button>
          </div>
        </div>

        <div className="stock-hero-stats">
          {stockOverviewStats.map((stat) => (
            <div key={stat.label} className="stock-hero-stat">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="stock-shelf-grid" aria-label="Lieux de stockage">
        {stockShelfCards.map((card) => (
          <button
            key={card.placeName}
            type="button"
            className={`shelf-card shelf-card--${card.kind}${stockPlaceFilter === card.placeName ? ' shelf-card--active' : ''}${card.count === 0 ? ' shelf-card--empty' : ''}`}
            onClick={() => setStockPlaceFilter(stockPlaceFilter === card.placeName ? '' : card.placeName)}
          >
            <span className="shelf-card-visual" aria-hidden="true" />
            <span className="shelf-card-kicker">{shelfKindLabels[card.kind]}</span>
            <strong>{card.placeName}</strong>
            <span>{card.count > 0 ? pluralize(card.count, 'produit') : 'Vide pour l’instant'}</span>
            <span>
              {card.count > 0
                ? `${pluralize(card.urgentCount, 'alerte')} · ${pluralize(card.lowCount, 'stock faible', 'stocks faibles')}`
                : 'Prêt à remplir'}
            </span>
          </button>
        ))}
      </section>

      <section className="card stock-command-card">
        <div className="stock-command-layout">
          <div className="field-group stock-command-search">
            <label className="field-label">Recherche</label>
            <div className="field-row">
              <input
                className="field-input"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Produit, marque, lieu, catégorie..."
              />
              {stockSearch && (
                <button type="button" className="btn-tertiary" onClick={() => setStockSearch('')}>
                  Effacer
                </button>
              )}
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Trier par</label>
            <select
              className="field-input"
              value={stockSort}
              onChange={(e) => setStockSort(e.target.value as StockSort)}
            >
              <option value="expiration">Date de péremption</option>
              <option value="name">Nom</option>
              <option value="quantity">Quantité</option>
              <option value="place">Lieu</option>
            </select>
          </div>

          <div className="field-group">
            <label className="field-label">Sens du tri</label>
            <select
              className="field-input"
              value={stockSortDirection}
              onChange={(e) => setStockSortDirection(e.target.value as StockSortDirection)}
            >
              <option value="asc">
                {stockSort === 'expiration'
                  ? 'Plus urgent d’abord'
                  : stockSort === 'quantity'
                    ? 'Plus faible d’abord'
                    : 'A-Z'}
              </option>
              <option value="desc">
                {stockSort === 'expiration'
                  ? 'Plus loin d’abord'
                  : stockSort === 'quantity'
                    ? 'Plus élevé d’abord'
                    : 'Z-A'}
              </option>
            </select>
          </div>

          {stockShelfPlaces.length > 0 && (
            <div className="field-group">
              <label className="field-label">Filtrer par zone</label>
              <select
                className="field-input"
                value={stockPlaceFilter}
                onChange={(e) => setStockPlaceFilter(e.target.value)}
              >
                <option value="">Toutes les zones</option>
                {stockShelfPlaces.map((placeName) => (
                  <option key={placeName} value={placeName}>
                    {placeName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="subtabs stock-filter-tabs">
          {stockFilterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={'subtab-btn' + (stockFilter === option.value ? ' subtab-btn--active' : '')}
              onClick={() => setStockFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="stock-command-footer">
          <p className="muted">
            {pluralize(sortedInStock.length, 'résultat')} sur {pluralize(inStock.length, 'produit')} en stock.
          </p>
          {hasActiveStockControls && (
            <button type="button" className="btn-tertiary" onClick={resetStockControls}>
              Réinitialiser
            </button>
          )}
        </div>
      </section>

      {loading ? (
        <section className="card">
          <p>Chargement...</p>
        </section>
      ) : inStock.length === 0 ? (
        <section className="stock-empty-state">
          <div className="stock-empty-visual" aria-hidden="true" />
          <div>
            <span className="hero-eyebrow">Premier rayon</span>
            <h2>Ton stock va prendre forme ici</h2>
            <p>
              Commence par scanner un produit ou ajoute-le à la main. Ensuite VPlacard pourra remplir les rayons,
              repérer les dates et préparer les courses.
            </p>
            <div className="hero-actions">
	              <button type="button" className="btn-primary btn-with-icon" onClick={() => setShowScanner(true)}>
	                <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
	                Scanner un produit
	              </button>
              <button type="button" className="btn-secondary btn-with-icon" onClick={openAddProductFlow}>
                <span className="btn-symbol btn-symbol--plus" aria-hidden="true" />
                Ajouter manuellement
              </button>
            </div>
          </div>
        </section>
      ) : filteredInStock.length === 0 ? (
        <section className="card stock-empty-filter">
          <h2 className="section-title">Aucun produit trouvé</h2>
          <p className="section-subtitle">Essaie d’élargir la recherche ou de retirer un filtre.</p>
          <button type="button" className="btn-tertiary" onClick={resetStockControls}>
            Réinitialiser les filtres
          </button>
        </section>
      ) : (
        <section className="category-grid">
          {groupedByCategory.filter(({ items }) => items.length > 0).map(({ label, items }) => (
            <section key={label} className="stock-category-section">
              <div className="category-head">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {label}
                </h2>
                <span className="category-count">{items.length}</span>
              </div>

              {renderCategoryContent(label, items)}
            </section>
          ))}
        </section>
      )}
    </>
  );
}; 

    const openStockFromDashboard = (filter: StockFilter = 'all') => {
      setActiveTab('stock');
      setStockSearch('');
      setStockFilter(filter);
      setStockPlaceFilter('');
      setStockSort('expiration');
      setStockSortDirection('asc');
    };

    const openRecipesFromDashboard = () => {
      setActiveTab('recipes');
      setRecipesSubTab('feasible');
      setRecipeSearch('');
      setRecipeFilter('urgent');
    };

    const openTodayMealsFromDashboard = () => {
      setActiveTab('weekmenu');
      setWeekStart(startOfWeekMonday(new Date()));
    };

    const openPlanTodayFromDashboard = () => {
      const today = new Date();

      setWeekStart(startOfWeekMonday(today));
      setPlanDate(toDateKey(today));
      setPlanSlot('lunch');
      setPlanRecipeValue('');
      setPlanCustomName('');
      setPlanCustomIngredients('');
      setPlanServings('1');
      setPlanNotes('');
      setPlanKcalOverride('');
      setActiveTab('weekmenu');
      setPlanOpen(true);
    };

    const openShoppingFromDashboard = () => {
      setActiveTab('shopping');
      setShoppingSubTab('main');
      setShoppingSearch('');
    };

    const renderDashboard = () => {
      const heroItem = priorityList[0];
      const plannedMealCount = todayMeals.filter(({ meal }) => meal).length;
      const nextMeal = todayMeals.find(({ meal }) => meal && !meal.consumed_at)?.meal;
      const heroTitle = heroItem
        ? `${heroItem.product?.name ?? 'Un produit'} à sauver en priorité`
        : nextMeal
          ? `${nextMeal.recipe_name} est prévu aujourd'hui`
          : 'Ta cuisine est prête pour la journée';
      const heroText = heroItem
        ? `${heroItem.place || 'Lieu non précisé'} · ${heroItem.quantity ?? 0} ${heroItem.unit ?? 'unité'} à utiliser avant de refaire les courses.`
        : nextMeal
          ? 'Ton planning a déjà une piste. Tu peux valider le repas après cuisson pour ajuster stock et calories.'
          : "Ajoute un produit, planifie un repas ou trouve une recette avec ce que tu as déjà.";

      return (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Aujourd'hui</h1>
          <p className="main-subtitle">
            Ce que ta cuisine te conseille maintenant.
          </p>
        </div>
        <div className="main-header-right">
          <span className="tag">Cuisine du jour</span>
        </div>
      </div>

      <section className="today-hero">
        <div className="today-hero-media" aria-hidden="true" />
        <div className="today-hero-content">
          <span className="hero-eyebrow">Priorité</span>
          <h2>{heroTitle}</h2>
          <p>{heroText}</p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn-primary btn-with-icon"
              onClick={heroItem ? openRecipesFromDashboard : openPlanTodayFromDashboard}
            >
	              <span className={`btn-symbol ${heroItem ? 'btn-symbol--cook' : 'btn-symbol--calendar'}`} aria-hidden="true" />
	              {heroItem ? 'Trouver une recette' : 'Composer un repas'}
	            </button>
	            <button type="button" className="btn-secondary btn-with-icon" onClick={() => setShowScanner(true)}>
	              <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
	              Scanner un produit
	            </button>
          </div>
        </div>

        <aside className="today-hero-panel">
          <div className="hero-panel-row">
            <span>Repas prévus</span>
            <strong>{plannedMealCount}/3</strong>
          </div>
          <div className="hero-panel-row">
            <span>Stock suivi</span>
            <strong>{totalItems}</strong>
          </div>
          <div className="hero-panel-row">
            <span>Calories</span>
            <strong>{todayCalories}</strong>
          </div>
          <div className="stat-progress">
            <div
              className={remainingCalories >= 0 ? 'stat-progress-fill' : 'stat-progress-fill stat-progress-fill-danger'}
              style={{ width: `${todayCaloriesPercent}%` }}
            />
          </div>
          <p>{todayCaloriesStatus}</p>
        </aside>
      </section>

      {/* Recap */}
      <section className="stats-row">
        <div className="stat-card">
          <div className="stat-label">En cuisine</div>
          <div className="stat-value">{totalItems}</div>
          <div className="stat-foot">5 zones de stock prêtes</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">À sauver bientôt</div>
          <div className="stat-value accent">{soonItems}</div>
          <div className="stat-foot">Sur les {settings.soonDays} prochains jours</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">À vérifier</div>
          <div className="stat-value danger">{expiredItems}</div>
          <div className="stat-foot">DLC et DDM à contrôler</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Énergie du jour</div>
          <div className="stat-value">{todayCalories}</div>
          <div className="stat-foot">
            Objectif {settings.dailyCalorieGoal} kcal · {todayCaloriesPercent}%
          </div>
          <div className={remainingCalories >= 0 ? 'stat-foot' : 'stat-foot stat-foot-danger'}>
            {todayCaloriesStatus}
          </div>
          <div className="stat-progress">
            <div
              className={remainingCalories >= 0 ? 'stat-progress-fill' : 'stat-progress-fill stat-progress-fill-danger'}
              style={{ width: `${todayCaloriesPercent}%` }}
            />
          </div>
          {plannedTodayCalories > 0 && (
            <div className="stat-foot">
              Prévu : +{plannedTodayCalories} kcal · total {projectedTodayCalories} kcal
            </div>
          )}

        </div>
      </section>

      <section className="card card-soft">
        <h2 className="section-title">À cuisiner en premier</h2>
        <p className="section-subtitle">Les produits qui méritent de passer dans l'assiette.</p>

        <div className="field-row" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="btn-tertiary" onClick={() => openStockFromDashboard('soon')}>
            Voir le stock urgent
          </button>
          <button type="button" className="btn-tertiary" onClick={openRecipesFromDashboard}>
            Trouver une idée
          </button>
        </div>

        {priorityList.length === 0 ? (
          <p className="muted">Aucune urgence pour le moment.</p>
        ) : (
          <ul className="priority-list">
            {priorityList.map((item) => {
              const status = getExpirationStatus(item.expiration_date, settings.soonDays);
              const labelStatus = getExpirationLabel(status, item.expiration_type);
              const displayStatusLabel = status === 'ok' && item.is_open ? 'Ouvert' : labelStatus;
              const displayStatusClass = status === 'ok' && item.is_open ? 'status-soon' : getExpirationClass(status, item.expiration_type);

              return (
                <li key={item.id} className="priority-item">
                  <div className="priority-product">
                    <span className="priority-title">{item.product?.name ?? 'Produit'}</span>
                    <span className="priority-meta">
                      {item.place || 'Lieu non précisé'} · {item.quantity ?? 0} {item.unit ?? 'unité'}
                      {item.is_open ? ' · Ouvert' : ''}
                    </span>
                  </div>

                  <span className={`status-pill ${displayStatusClass}`}>
                    <span className="status-dot" />
                    {displayStatusLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>


      {/* Détails péremption */}
      <section className="dashboard-grid">
        <section className="card card-soft">
          <h2 className="section-title">À consommer bientôt</h2>
          <p className="section-subtitle">
            Produits à utiliser dans les {settings.soonDays} prochains jours.
          </p>

          {soonList.length === 0 ? (
            <p className="muted">Rien à signaler.</p>
          ) : (
            <div className="chips-row">
              {soonList.map((item) => (
                <div key={item.id} className="chip">
                  <span className="chip-title">{item.product?.name ?? 'Produit'}</span>
                  {item.expiration_date && (
                    <span className="chip-meta">
                      {new Date(item.expiration_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Périmés</h2>
          <p className="section-subtitle">À jeter / vérifier.</p>

          <div className="field-row" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="btn-tertiary" onClick={() => openStockFromDashboard('expired-dlc')}>
              Voir les DLC périmées
            </button>
          </div>

          {expiredList.length === 0 ? (
            <p className="muted">Aucun produit périmé.</p>
          ) : (
            <div className="chips-row">
              {expiredList.map((item) => (
                <div key={item.id} className="chip">
                  <span className="chip-title">{item.product?.name ?? 'Produit'}</span>
                  {item.expiration_date && (
                    <span className="chip-meta">
                      {new Date(item.expiration_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card card-soft">
          <h2 className="section-title">DDM dépassées</h2>
          <p className="section-subtitle">À vérifier, souvent encore consommable.</p>

          <div className="field-row" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="btn-tertiary" onClick={() => openStockFromDashboard('expired-ddm')}>
              Voir les DDM dépassées
            </button>
          </div>

          {ddmExceededList.length === 0 ? (
            <p className="muted">Aucune DDM dépassée.</p>
          ) : (
            <div className="chips-row">
              {ddmExceededList.map((item) => (
                <div key={item.id} className="chip">
                  <span className="chip-title">{item.product?.name ?? 'Produit'}</span>
                  {item.expiration_date && (
                    <span className="chip-meta">
                      {new Date(item.expiration_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="card">
        <h2 className="section-title">Repas du jour</h2>
        <p className="section-subtitle">Ce qui est prévu aujourd'hui.</p>
        
        <div className="field-row" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="btn-tertiary" onClick={openTodayMealsFromDashboard}>
            Ouvrir le menu
          </button>
          <button type="button" className="btn-tertiary btn-with-icon" onClick={openPlanTodayFromDashboard}>
            <span className="btn-symbol btn-symbol--calendar" aria-hidden="true" />
            Planifier le jour
          </button>
        </div>

        {todayMeals.every(({ meal }) => !meal) ? (
          <p className="muted">Aucun repas planifié aujourd'hui.</p>
        ) : (
          <ul className="dashboard-meal-list">
            {todayMeals.map(({ slot, meal }) => (
              <li key={slot.key} className="dashboard-meal-item">
                <span className="dashboard-meal-slot">{slot.label}</span>
                <span className="dashboard-meal-name">{meal?.recipe_name ?? '-'}</span>
                {meal && (
                  <span className={meal.consumed_at ? 'dashboard-meal-status' : 'dashboard-meal-status dashboard-meal-status--planned'}>
                    {meal.consumed_at ? 'Validé' : 'Prévu'}
                  </span>
                )}
                {meal && (() => {
                  const calories = mealCaloriesInfo(meal, dbRecipes, products);
                  return (
                    <span className="dashboard-meal-kcal">
                      {calories.kcal != null
                        ? `${calories.approx ? '≈ ' : ''}${calories.kcal} kcal`
                        : 'kcal à compléter'}
                    </span>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </section>
      
      <section className="card">
        <h2 className="section-title">Stock faible</h2>
        <p className="section-subtitle">Produits à racheter ou surveiller.</p>

        <div className="field-row" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="btn-tertiary" onClick={() => openStockFromDashboard('low')}>
            Voir les stocks faibles
          </button>
          <button type="button" className="btn-tertiary" onClick={openShoppingFromDashboard}>
            Ouvrir la liste de courses
          </button>
        </div>

        {lowStockList.length === 0 ? (
          <p className="muted">Aucun stock faible détecté.</p>
        ) : (
          <div className="chips-row">
            {lowStockList.map((item) => (
              <div key={item.id} className="chip">
                <span className="chip-title">{item.product?.name ?? 'Produit'}</span>
                <span className="chip-meta">
                  {item.quantity ?? 0} {item.unit ?? 'unité'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ajout produit */}
      <section className="card add-product-panel" ref={addProductSectionRef}>
        <div className="form-panel-head">
          <div>
            <span className="hero-eyebrow">Entrée stock</span>
            <h2 className="section-title">Ajouter un produit</h2>
            <p className="section-subtitle">
              Ajout rapide depuis le tableau de bord avec scanner et auto-remplissage OpenFoodFacts.
            </p>
          </div>
	          <button type="button" className="btn-secondary btn-with-icon" onClick={() => setShowScanner(true)}>
	            <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
	            Scanner un produit
	          </button>
        </div>

        {addExistingProductId && (
          <div className="info-text" style={{ marginBottom: '0.75rem' }}>
            Produit existant sélectionné depuis la liste de courses. Tu ajoutes un nouveau lot à ce produit.
            <button
              type="button"
              className="btn-tertiary"
              style={{ marginLeft: '0.6rem' }}
              onClick={() => {
                resetAddForm();
                setInfo(null);
              }}
            >
              Annuler
            </button>
          </div>
        )}

        <form className="form-grid product-form-grid" onSubmit={handleAdd}>
          <div className="field-group full">
            <label className="field-label">Nom du produit *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field-input"
              placeholder="Pâtes, lait, riz..."
            />
          </div>

          <div className="field-group full">
            <label className="field-label">Nom pour recettes/courses</label>
            <input
              value={genericName}
              onChange={(e) => setGenericName(e.target.value)}
              className="field-input"
              placeholder="Ex : moutarde, pâtes, lait..."
            />
          </div>

          <div className="field-group">
            <label className="field-label">
              Code-barres <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>(optionnel)</span>
            </label>
            <div className="field-row">
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="field-input"
                placeholder="Ex : 3017624010701"
              />
	              <button type="button" className="btn-secondary btn-with-icon" onClick={() => setShowScanner(true)}>
	                <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
	                Scanner
	              </button>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">kcal / 100g</label>
            <input
              className="field-input"
              value={kcal100g}
              onChange={(e) => setKcal100g(e.target.value)}
              placeholder="ex: 250"
            />
          </div>

          <div className="field-group">
            <label className="field-label">Grammes par unité (si unité)</label>
            <input
              className="field-input"
              value={gramsPerUnit}
              onChange={(e) => setGramsPerUnit(e.target.value)}
              placeholder="ex: 125"
            />
          </div>

          <div className="field-group">
            <label className="field-label">Densité g/ml (si liquide)</label>
            <input
              className="field-input"
              value={densityGml}
              onChange={(e) => setDensityGml(e.target.value)}
              placeholder="ex: 1.00"
            />
          </div>
          <div className="field-group">
            <label className="field-label">Marque</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="field-input"
              placeholder="Barilla, Président..."
            />
          </div>

          <div className="field-group">
            <label className="field-label">Catégorie principale</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MainCategory | '')}
              className="field-input"
            >
              <option value="">Choisir une catégorie...</option>
              {MAIN_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          {getSubcatsFor(category).length > 0 && (
            <div className="field-group">
              <label className="field-label">Sous-catégorie</label>
              <select
                className="field-input"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value as SubCategory | '')}
              >
                <option value="">(Aucune)</option>
                {getSubcatsFor(category).map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field-group">
            <label className="field-label">Lieu</label>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              className="field-input"
              placeholder={STOCK_PLACE_PLACEHOLDER}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Quantité</label>
            <div className="field-row">
              <input
                type="number"
                min="0"
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="field-input"
              />
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="field-input"
                placeholder="unité, g, ml..."
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Date de péremption</label>
            <input
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className="field-input"
            />

            <div className="date-shortcuts">
              <button type="button" className="btn-tertiary" onClick={() => setExpiration(toDateKey(addMonths(new Date(), 1)))}>
                +1 mois
              </button>
              <button type="button" className="btn-tertiary" onClick={() => setExpiration(toDateKey(addMonths(new Date(), 3)))}>
                +3 mois
              </button>
              <button type="button" className="btn-tertiary" onClick={() => setExpiration(toDateKey(addMonths(new Date(), 6)))}>
                +6 mois
              </button>
              <button type="button" className="btn-tertiary" onClick={() => setExpiration(toDateKey(endOfYear(new Date())))}>
                Fin d'année
              </button>
              <button type="button" className="btn-tertiary" onClick={() => setExpiration('')}>
                Inconnu
              </button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Type de date</label>
            <select
              className="field-input"
              value={expirationType}
              onChange={(e) => setExpirationType(e.target.value as ExpirationType)}
              disabled={!expiration}
            >
              <option value="dlc">DLC - à consommer jusqu'au</option>
              <option value="ddm">DDM - à consommer de préférence avant</option>
              <option value="unknown">Inconnu</option>
            </select>
          </div>

          <div className="field-group">
            <label className="field-label">État</label>
            <select
              className="field-input"
              value={isOpen ? 'open' : 'closed'}
              onChange={(e) => setIsOpen(e.target.value === 'open')}
            >
              <option value="closed">Non ouvert</option>
              <option value="open">Ouvert</option>
            </select>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {addExistingProductId ? 'Ajouter ce lot au stock' : 'Ajouter au stock'}
            </button>
          </div>

          {autoFillLoading && (
            <p className="error-text" style={{ color: '#4b5563' }}>
              Recherche des informations du produit…
            </p>
          )}
          {info && <p className="info-text">{info}</p>}
          {showBackToShoppingAfterAdd && (
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => {
                setActiveTab('shopping');
                setShowBackToShoppingAfterAdd(false);
              }}
            >
              Retour à la liste de courses
            </button>
          )}
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>
    </>
      );
    };


  const renderShoppingTab = () => {
    const openAddProductFlow = () => {
      setActiveTab('dashboard');
      setScrollToAddForm(true);
    };

    const lowStockProductIds = new Set(
      lowStockList.filter((s) => s.product?.id).map((s) => s.product!.id),
    );

    const plannedMissingNames = new Set<string>();
    const plannedMissingIngredientsByName = new Map<string, RecipeIngredient[]>();

    const stockQuantityForShoppingIngredient = (stock: StockItem, ingredient: RecipeIngredient): number | null => {
      const qty = stock.quantity ?? 0;
      const stockUnit = (stock.unit ?? 'unité').toLowerCase();

      if (ingredient.unit === 'g') {
        if (stockUnit === 'g') return qty;
        if (stockUnit === 'unité' && stock.product?.grams_per_unit_g) {
          return qty * stock.product.grams_per_unit_g;
        }
      }

      if (ingredient.unit === 'ml') {
        if (stockUnit === 'ml') return qty;
        if (stockUnit === 'l') return qty * 1000;
      }

      if (ingredient.unit === 'unité' && stockUnit === 'unité') return qty;

      return null;
    };

    const matchingStocksForShoppingIngredient = (ingredient: RecipeIngredient) => {
      const key = normalizeText(ingredient.name);
      if (!key) return [];

      return stocks.filter((stock) => {
        if ((stock.quantity ?? 0) <= 0 || !stock.product?.name) return false;
        const productName = normalizeText(getProductMatchName(stock.product));
        return productName.includes(key) || key.includes(productName);
      });
    };

    const getMissingShoppingIngredient = (ingredient: RecipeIngredient): RecipeIngredient | null => {
      const matchingStocks = matchingStocksForShoppingIngredient(ingredient);

      if (matchingStocks.length === 0) return ingredient;
      if (ingredient.amount == null || !ingredient.unit) return null;

      const available = matchingStocks.reduce((total, stock) => {
        const converted = stockQuantityForShoppingIngredient(stock, ingredient);
        return converted == null ? total : total + converted;
      }, 0);

      const missingAmount = roundQty(ingredient.amount - available, ingredient.unit);
      if (missingAmount <= 0) return null;

      return { ...ingredient, amount: missingAmount };
    };

    const addPlannedMissingIngredient = (ingredient: RecipeIngredient) => {
      const key = normalizeText(ingredient.name);
      if (!key) return;

      plannedMissingNames.add(key);

      const current = plannedMissingIngredientsByName.get(key) ?? [];

      if (ingredient.amount != null && ingredient.unit) {
        const sameUnitIndex = current.findIndex(
          (item) => item.amount != null && item.unit === ingredient.unit,
        );

        if (sameUnitIndex >= 0) {
          const copy = [...current];
          const existing = copy[sameUnitIndex];

          copy[sameUnitIndex] = {
            ...existing,
            amount: roundQty((existing.amount ?? 0) + ingredient.amount, ingredient.unit),
          };

          plannedMissingIngredientsByName.set(key, copy);
          return;
        }
      }

      const label = formatRecipeIngredient(ingredient);
      if (current.some((item) => formatRecipeIngredient(item) === label)) return;

      plannedMissingIngredientsByName.set(key, [...current, ingredient]);
    };

    for (const meal of weekMeals) {
      if (meal.consumed_at) continue;

      const mealIngredients = getMealIngredientsForStock(meal);
      if (mealIngredients.length === 0) continue;

      for (const ingredient of mealIngredients) {
        const parsed = parseSingleMealIngredient(ingredient);
        const missingIngredient = getMissingShoppingIngredient(parsed);

        if (missingIngredient) {
          addPlannedMissingIngredient(missingIngredient);
        }
      }
    }

    const lowStockByProductId = new Map(
      lowStockList
        .filter((s) => s.product?.id)
        .map((s) => [s.product!.id, s]),
    );

    const plannedMissingProductIds = new Set(
      products
        .filter((product) => plannedMissingNames.has(normalizeText(getProductMatchName(product))))
        .map((product) => product.id),
    );

    const presentProductIds = new Set(
      inStock
        .filter(
          (s) =>
            s.product?.id &&
            !lowStockProductIds.has(s.product.id) &&
            !plannedMissingProductIds.has(s.product.id),
        )
        .map((s) => s.product!.id),
    );

    const missingMain = products.filter((p) => p.is_main && !p.shopping_hidden && !presentProductIds.has(p.id));
    const missingOthers = products.filter((p) => !p.is_main && !p.shopping_hidden && !presentProductIds.has(p.id));
    const currentList = shoppingSubTab === 'main' ? missingMain : missingOthers;
    const shoppingFilterOptions: { value: ShoppingFilter; label: string }[] = [
      { value: 'all', label: 'Tous' },
      { value: 'low', label: 'Stock faible' },
      { value: 'planned', label: 'Repas planifiés' },
      { value: 'absent', label: 'Absents' },
    ];

    const getShoppingReason = (product: Product) => {
      const isLowStock = lowStockByProductId.has(product.id);
      const isPlannedMissing = plannedMissingProductIds.has(product.id);

      if (isLowStock && isPlannedMissing) return 'Stock faible + repas';
      if (isLowStock) return 'Stock faible';
      if (isPlannedMissing) return 'Repas planifié';
      return 'Absent';
    };

    const getShoppingReasonPriority = (product: Product) => {
      const reason = getShoppingReason(product);

      if (reason === 'Stock faible + repas') return 0;
      if (reason === 'Stock faible') return 1;
      if (reason === 'Repas planifié') return 2;
      return 3;
    };

    const getShoppingReasonClass = (product: Product) => {
      const reason = getShoppingReason(product);

      if (reason === 'Stock faible + repas') return 'shopping-product-reason--combo';
      if (reason === 'Stock faible') return 'shopping-product-reason--low';
      if (reason === 'Repas planifié') return 'shopping-product-reason--planned';
      return 'shopping-product-reason--absent';
    };

    const getLowStockLabel = (product: Product) => {
      const stock = lowStockByProductId.get(product.id);
      if (!stock) return null;

      return `Stock restant : ${stock.quantity ?? 0} ${stock.unit ?? 'unité'}`;
    };

    const getPlannedMissingLabel = (product: Product) => {
      const key = normalizeText(getProductMatchName(product));
      const planned = plannedMissingIngredientsByName.get(key);

      if (!planned || planned.length === 0) return null;

      return planned.map(formatRecipeIngredient).join(', ');
    };

    const reasonFilteredShoppingList = currentList.filter((product) => {
      const isLowStock = lowStockByProductId.has(product.id);
      const isPlannedMissing = plannedMissingProductIds.has(product.id);

      if (shoppingFilter === 'low') return isLowStock;
      if (shoppingFilter === 'planned') return isPlannedMissing;
      if (shoppingFilter === 'absent') return !isLowStock && !isPlannedMissing;

      return true;
    });

    const shoppingSearchKey = normalizeText(shoppingSearch);

    const visibleShoppingList = shoppingSearchKey
      ? reasonFilteredShoppingList.filter((product) => {
          const plannedLabel = getPlannedMissingLabel(product);
          const searchableText = [
            product.name,
            product.generic_name,
            product.brand,
            product.category,
            product.sub_category,
            product.barcode,
            getShoppingReason(product),
            getLowStockLabel(product),
            plannedLabel,
          ]
            .filter(Boolean)
            .map(String)
            .map(normalizeText)
            .join(' ');

          return searchableText.includes(shoppingSearchKey);
        })
      : reasonFilteredShoppingList;

    
    const displayedShoppingList = hideCheckedShopping
      ? visibleShoppingList.filter((product) => !checkedShoppingIds.includes(product.id))
      : visibleShoppingList;

    const visibleCheckedCount = visibleShoppingList.filter((product) =>
      checkedShoppingIds.includes(product.id),
    ).length;

    const hasActiveShoppingControls =
      shoppingSubTab !== 'main' ||
      shoppingFilter !== 'all' ||
      shoppingSearch.trim() ||
      hideCheckedShopping;

    const resetShoppingControls = () => {
      setShoppingSubTab('main');
      setShoppingFilter('all');
      setShoppingSearch('');
      setHideCheckedShopping(false);
    };

    const toggleShoppingChecked = (productId: string) => {
      setCheckedShoppingIds((prev) =>
        prev.includes(productId)
          ? prev.filter((id) => id !== productId)
          : [...prev, productId],
      );
    };

    const startAddFromShopping = (product: Product) => {
      const categoryValue = MAIN_CATEGORIES.includes(product.category as MainCategory)
        ? (product.category as MainCategory)
        : '';

      const subcats = getSubcatsFor(categoryValue);
      const subCategoryValue =
        product.sub_category && subcats.includes(product.sub_category)
          ? (product.sub_category as SubCategory)
          : '';

      const plannedLabel = getPlannedMissingLabel(product);
      const plannedIngredient = plannedLabel
        ? parseSingleMealIngredient(plannedLabel.split(',')[0])
        : null;

      setAddExistingProductId(product.id);
      setName(product.name);
      setGenericName(product.generic_name ?? getProductMatchName(product));
      setBrand(product.brand ?? '');
      setCategory(categoryValue);
      setSubCategory(subCategoryValue);
      setBarcode(product.barcode ?? '');
      setQuantity(plannedIngredient?.amount != null ? String(plannedIngredient.amount) : '1');
      setUnit(plannedIngredient?.unit ?? product.default_unit ?? 'unité');
      setPlace(settings.defaultPlace);
      setExpiration('');
      setExpirationType('dlc');
      setIsOpen(false);
      setKcal100g(product.kcal_100g != null ? String(product.kcal_100g) : '');
      setGramsPerUnit(product.grams_per_unit_g != null ? String(product.grams_per_unit_g) : '');
      setDensityGml(product.density_g_ml != null ? String(product.density_g_ml) : '');
      setError(null);
      setActiveTab('dashboard');
      setScrollToAddForm(true);
      setInfo('Formulaire prérempli depuis la liste de courses. Complète la quantité, le lieu et la date.');
    };

    const sortedCurrentList = [...displayedShoppingList].sort(
      (a, b) =>
        getShoppingReasonPriority(a) - getShoppingReasonPriority(b) ||
        a.name.localeCompare(b.name),
    );

    const plannedMissingCount = sortedCurrentList.filter((product) =>
      plannedMissingProductIds.has(product.id),
    ).length;
    const lowStockShoppingCount = sortedCurrentList.filter((product) =>
      lowStockByProductId.has(product.id),
    ).length;
    const remainingShoppingCount = Math.max(0, visibleShoppingList.length - visibleCheckedCount);
    const completionPercent = visibleShoppingList.length > 0
      ? Math.round((visibleCheckedCount / visibleShoppingList.length) * 100)
      : 0;
    const shoppingHeroStats = [
      { value: sortedCurrentList.length, label: 'à prendre' },
      { value: remainingShoppingCount, label: 'restants' },
      { value: plannedMissingCount, label: 'pour menus' },
      { value: lowStockShoppingCount, label: 'stocks faibles' },
    ];

    const title = shoppingSubTab === 'main' ? 'Essentiels à racheter' : 'Compléments à racheter';
    const subtitle =
      shoppingSubTab === 'main'
        ? 'Les bases à garder dans la cuisine.'
        : 'Les produits utiles selon tes envies et tes menus.';

    const grouped: { [key: string]: Product[] } = {};
    for (const p of sortedCurrentList) {
      const cat = (p.category && MAIN_CATEGORIES.includes(p.category as MainCategory) ? p.category : 'Autres') || 'Autres';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }

    const categoryOrder: (string | MainCategory)[] = [...MAIN_CATEGORIES, 'Autres'];
    const renderShoppingEmpty = (
      emptyTitle: string,
      emptyText: string,
      actionLabel: string,
      action: () => void,
    ) => (
      <div className="shopping-empty-state">
        <div className="shopping-empty-visual" aria-hidden="true" />
        <div>
          <span className="hero-eyebrow">Liste claire</span>
          <h3>{emptyTitle}</h3>
          <p>{emptyText}</p>
          <button type="button" className="btn-primary" onClick={action}>
            {actionLabel}
          </button>
        </div>
      </div>
    );

    return (
      <>
        <div className="main-header">
          <div>
            <h1 className="main-title">Courses</h1>
            <p className="main-subtitle">La liste utile, construite avec ton stock et ton planning.</p>
          </div>
          <div className="main-header-right">
            <span className="tag">Liste intelligente</span>
          </div>
        </div>

        <section className="shopping-trip-band">
          <div className="shopping-trip-media" aria-hidden="true" />
          <div className="shopping-trip-content">
            <span className="hero-eyebrow">Passage en magasin</span>
            <h2>{pluralize(sortedCurrentList.length, 'article')} à regarder</h2>
            <p>
              {pluralize(plannedMissingCount, 'produit')} pour les repas prévus · {pluralize(lowStockShoppingCount, 'stock faible', 'stocks faibles')} · {pluralize(visibleCheckedCount, 'déjà coché')}
            </p>
            <div className="shopping-progress">
              <div className="shopping-progress-top">
                <span>Avancement</span>
                <strong>{completionPercent}%</strong>
              </div>
              <div className="stat-progress">
                <div className="stat-progress-fill" style={{ width: `${completionPercent}%` }} />
              </div>
            </div>
            <div className="hero-actions">
	              <button type="button" className="btn-primary btn-with-icon" onClick={() => setShowScanner(true)}>
	                <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
	                Scanner un produit
	              </button>
              <button type="button" className="btn-secondary btn-with-icon" onClick={openAddProductFlow}>
                <span className="btn-symbol btn-symbol--plus" aria-hidden="true" />
                Ajouter au stock
              </button>
            </div>
          </div>

          <div className="shopping-trip-stats">
            {shoppingHeroStats.map((stat) => (
              <span key={stat.label}>
                <strong>{stat.value}</strong>
                {stat.label}
              </span>
            ))}
          </div>
        </section>

        <section className="shopping-command-panel">
          <div className="shopping-command-head">
            <div className="subtabs">
            <button
              type="button"
              className={'subtab-btn' + (shoppingSubTab === 'main' ? ' subtab-btn--active' : '')}
              onClick={() => setShoppingSubTab('main')}
            >
              Essentiels
            </button>
            <button
              type="button"
              className={'subtab-btn' + (shoppingSubTab === 'others' ? ' subtab-btn--active' : '')}
              onClick={() => setShoppingSubTab('others')}
            >
              Compléments
            </button>
          </div>

            <div className="subtabs shopping-reason-tabs">
            {shoppingFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={'subtab-btn' + (shoppingFilter === option.value ? ' subtab-btn--active' : '')}
                onClick={() => setShoppingFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          </div>

          <div className="field-group full shopping-search-field">
            <label className="field-label">Recherche</label>
            <div className="field-row">
              <input
                className="field-input"
                value={shoppingSearch}
                onChange={(e) => setShoppingSearch(e.target.value)}
                placeholder="Produit, marque, raison..."
              />
              {shoppingSearch && (
                <button type="button" className="btn-tertiary" onClick={() => setShoppingSearch('')}>
                  Effacer
                </button>
              )}
              {hasActiveShoppingControls && (
                <button type="button" className="btn-tertiary" onClick={resetShoppingControls}>
                  Réinitialiser les filtres
                </button>
              )}
              {checkedShoppingIds.length > 0 && (
                <button type="button" className="btn-tertiary" onClick={() => setCheckedShoppingIds([])}>
                  Réinitialiser les coches
                </button>
              )}
              {checkedShoppingIds.length > 0 && (
                <button
                  type="button"
                  className="btn-tertiary"
                  onClick={() => setHideCheckedShopping((prev) => !prev)}
                >
                  {hideCheckedShopping ? 'Afficher les cochés' : 'Masquer les cochés'}
                </button>
              )}
            </div>
          </div>

          {visibleShoppingList.length > 0 && (
            <p className="muted shopping-command-count">
              {pluralize(visibleCheckedCount, 'produit')} coché{visibleCheckedCount > 1 ? 's' : ''} sur {pluralize(visibleShoppingList.length, 'article')} visible{visibleShoppingList.length > 1 ? 's' : ''}.
            </p>
          )}
        </section>

        <section className="shopping-list-board">
          <h2 className="section-title">
            {title}
          </h2>
          <p className="section-subtitle">{subtitle}</p>

          {info && <p className="info-text">{info}</p>}


          {currentList.length === 0 ? (
            renderShoppingEmpty(
              'Rien à acheter dans cette section',
              'Tes essentiels ou compléments sont couverts pour le moment. Tu peux ajouter un produit suivi ou préparer un menu pour générer de nouveaux besoins.',
              'Ajouter au stock',
              openAddProductFlow,
            )
          ) : visibleShoppingList.length === 0 ? (
            renderShoppingEmpty(
              'Aucun article ne correspond',
              'La recherche ou le filtre est trop précis. Reviens à la liste complète pour retrouver tes articles.',
              'Réinitialiser',
              resetShoppingControls,
            )
          ) : displayedShoppingList.length === 0 ? (
            renderShoppingEmpty(
              'Tout est coché',
              'Les articles visibles sont marqués comme pris. Tu peux afficher les cochés ou remettre la tournée à zéro.',
              'Afficher les cochés',
              () => setHideCheckedShopping(false),
            )
          ) : (
            categoryOrder.map((cat) => {
              const items = grouped[cat];
              if (!items || items.length === 0) return null;
              return (
                <div key={cat} className="shopping-category-section">
                  <div className="shopping-group-head">
                    <h3 className="shopping-group-title">{cat}</h3>
                    <span>{pluralize(items.length, 'article')}</span>
                  </div>
                  <ul className="shopping-list">
                    {items.map((p) => {
                      const reason = getShoppingReason(p);
                      const isChecked = checkedShoppingIds.includes(p.id);
                      const lowStockLabel = getLowStockLabel(p);
                      const plannedLabel = getPlannedMissingLabel(p);

                      return (
                        <li key={p.id} className={'shopping-list-item' + (isChecked ? ' shopping-list-item--checked' : '')}>
                          <button
                            type="button"
                            className={'shopping-check' + (isChecked ? ' shopping-check--checked' : '')}
                            aria-pressed={isChecked}
                            onClick={() => toggleShoppingChecked(p.id)}
                            title="Marquer comme pris"
                          >
                            <span aria-hidden="true" />
                          </button>

                          <div className="shopping-item-main">
                            <div className="shopping-item-heading">
                              <div>
                                <span className="shopping-product-name">{p.name}</span>
                                <span className="shopping-product-brand">
                                  {p.brand || p.generic_name || 'Produit à compléter'}
                                </span>
                              </div>
                              <span className={`shopping-product-reason ${getShoppingReasonClass(p)}`}>{reason}</span>
                            </div>

                            <div className="shopping-item-details">
                              {lowStockLabel && <span>{lowStockLabel}</span>}
                              {plannedLabel && <span>À prévoir : {plannedLabel}</span>}
                              {p.sub_category && <span>{p.sub_category}</span>}
                            </div>
                          </div>

                          <div className="shopping-item-actions">
                            <button
                              type="button"
                              className="btn-tertiary btn-with-icon"
                              onClick={() => startAddFromShopping(p)}
                            >
                              <span className="btn-symbol btn-symbol--plus" aria-hidden="true" />
                              Ajouter au stock
                            </button>

                            <button
                              type="button"
                              className="btn-tertiary"
                              onClick={() => void hideFromShopping(p.id)}
                              title="Retirer de la liste"
                            >
                              Retirer
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      </>
    );
  };

  const renderSettingsTab = () => {
    const settingCards = [
      {
        eyebrow: 'Péremption',
        title: 'Seuil bientôt',
        text: "Nombre de jours avant qu'un produit soit mis en avant.",
        value: `${settings.soonDays} j`,
        control: (
          <div className="field-group">
            <label className="field-label">Jours avant alerte</label>
            <input
              type="number"
              min={1}
              max={60}
              value={settings.soonDays}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSettings((prev) => ({ ...prev, soonDays: Number.isFinite(v) ? v : prev.soonDays }));
                setSettingsInfo(null);
              }}
              className="field-input"
            />
          </div>
        ),
      },
      {
        eyebrow: 'Recettes',
        title: 'Tolérance ingrédients',
        text: 'Nombre maximum de manquants pour afficher une recette comme faisable.',
        value: `${settings.recipesMaxMissing} max`,
        control: (
          <div className="field-group">
            <label className="field-label">Ingrédients manquants</label>
            <input
              type="number"
              min={0}
              max={10}
              value={settings.recipesMaxMissing}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSettings((prev) => ({
                  ...prev,
                  recipesMaxMissing: Number.isFinite(v) ? v : prev.recipesMaxMissing,
                }));
                setSettingsInfo(null);
              }}
              className="field-input"
            />
          </div>
        ),
      },
      {
        eyebrow: 'Calories',
        title: 'Objectif quotidien',
        text: 'Repère affiché sur le tableau de bord pour suivre la journée.',
        value: `${settings.dailyCalorieGoal} kcal`,
        control: (
          <div className="field-group">
            <label className="field-label">Calories par jour</label>
            <input
              type="number"
              min={0}
              step={50}
              value={settings.dailyCalorieGoal}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSettings((prev) => ({
                  ...prev,
                  dailyCalorieGoal: Number.isFinite(v) ? v : prev.dailyCalorieGoal,
                }));
                setSettingsInfo(null);
              }}
              className="field-input"
            />
          </div>
        ),
      },
      {
        eyebrow: 'Placards',
        title: 'Lieu par défaut',
        text: "Emplacement prérempli quand tu ajoutes un produit.",
        value: settings.defaultPlace || 'Placard',
        control: (
          <div className="field-group">
            <label className="field-label">Lieu favori</label>
            <input
              value={settings.defaultPlace}
              onChange={(e) => {
                setSettings((prev) => ({ ...prev, defaultPlace: e.target.value }));
                setSettingsInfo(null);
              }}
              className="field-input"
              placeholder={STOCK_PLACE_PLACEHOLDER}
            />
          </div>
        ),
      },
    ];
    const customizableRecipes = [...dbRecipes, ...SAMPLE_RECIPES].map(applyRecipeOverrides);
    const changeSettingsImage = async (
      event: ChangeEvent<HTMLInputElement>,
      kind: ImageAssetKind,
      imageKey: string,
    ) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;

      const uploadKey = `${kind}:${imageKey}`;
      setImageUploadingKey(uploadKey);
      setSettingsInfo(null);
      setError(null);

      try {
        await uploadImageAsset(kind, imageKey, file);
        setSettingsInfo('Photo mise à jour dans Supabase.');
      } catch (uploadError) {
        console.error(uploadError);
        setError(getErrorMessage(uploadError) ?? "Impossible d'envoyer cette photo.");
      } finally {
        setImageUploadingKey(null);
        input.value = '';
      }
    };
    const resetSettingsImage = async (kind: ImageAssetKind, imageKey: string) => {
      const uploadKey = `${kind}:${imageKey}`;
      setImageUploadingKey(uploadKey);
      setSettingsInfo(null);
      setError(null);

      try {
        await resetImageAsset(kind, imageKey);
        setSettingsInfo('Photo réinitialisée.');
      } catch (resetError) {
        console.error(resetError);
        setError(getErrorMessage(resetError) ?? 'Impossible de réinitialiser cette photo.');
      } finally {
        setImageUploadingKey(null);
      }
    };

    return (
      <>
        <div className="main-header">
          <div>
            <h1 className="main-title">Réglages</h1>
            <p className="main-subtitle">Tes préférences de stock, recettes et suivi du jour.</p>
          </div>
          <div className="main-header-right">
            <span className="tag">Préférences</span>
          </div>
        </div>

        <section className="settings-hero">
          <div>
            <span className="hero-eyebrow">Cuisine sur mesure</span>
            <h2>Une app réglée sur ta façon de stocker</h2>
            <p>Ces valeurs pilotent les alertes, les recettes proposées, les calories et les lieux par défaut.</p>
          </div>
          <div className="settings-hero-stats">
            <span><strong>{settings.soonDays}</strong>jours</span>
            <span><strong>{settings.recipesMaxMissing}</strong>manquants</span>
            <span><strong>{settings.dailyCalorieGoal}</strong>kcal</span>
          </div>
        </section>

        <section className="settings-grid">
          {settingCards.map((card) => (
            <article key={card.title} className="settings-card">
              <div className="settings-card-head">
                <span className="hero-eyebrow">{card.eyebrow}</span>
                <strong>{card.value}</strong>
              </div>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
              {card.control}
            </article>
          ))}
        </section>

        <section className="settings-image-panel">
          <div className="settings-section-head">
            <div>
              <span className="hero-eyebrow">Photos de l'app</span>
              <h2>Images des écrans</h2>
              <p>Choisis des fichiers image : ils seront envoyés dans le bucket Supabase de l'app.</p>
            </div>
          </div>

          <div className="image-settings-grid">
            {APP_IMAGE_FIELDS.map((field) => (
              <article key={field.key} className="image-setting-card">
                <div
                  className="image-setting-preview"
                  style={{ '--image-setting-preview': cssImageUrl(appImages[field.key]) } as CSSProperties}
                  aria-hidden="true"
                />
                <div className="image-setting-body">
                  <div>
                    <h3>{field.label}</h3>
                    <p>{field.description}</p>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Remplacer la photo</label>
                    <input
                      className="field-input file-input"
                      type="file"
                      accept={IMAGE_FILE_ACCEPT}
                      disabled={imageUploadingKey === `app:${field.key}`}
                      onChange={(event) => void changeSettingsImage(event, 'app', field.key)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-tertiary"
                    disabled={imageUploadingKey === `app:${field.key}`}
                    onClick={() => void resetSettingsImage('app', field.key)}
                  >
                    {imageUploadingKey === `app:${field.key}` ? 'Envoi...' : 'Réinitialiser'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="settings-image-panel">
          <div className="settings-section-head">
            <div>
              <span className="hero-eyebrow">Photos recettes</span>
              <h2>Images du carnet</h2>
              <p>Chaque recette peut avoir sa propre photo hébergée dans Supabase.</p>
            </div>
          </div>

          <div className="recipe-image-settings-grid">
            {customizableRecipes.map((recipe) => {
              const currentImage = recipeImageFor(recipe, recipeImages);

              return (
                <article key={recipe.id} className="recipe-image-setting-card">
                  <div
                    className="recipe-image-setting-preview"
                    style={{ '--image-setting-preview': cssImageUrl(currentImage) } as CSSProperties}
                    aria-hidden="true"
                  />
                  <div className="recipe-image-setting-body">
                    <div>
                      <h3>{recipe.name}</h3>
                      <p>{recipe.kind === 'savory' ? 'Salé' : 'Sucré'} · {pluralize(recipe.ingredients.length, 'ingrédient')}</p>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Remplacer la photo</label>
                      <div className="field-row">
                        <input
                          className="field-input file-input"
                          type="file"
                          accept={IMAGE_FILE_ACCEPT}
                          disabled={imageUploadingKey === `recipe:${recipe.id}`}
                          onChange={(event) => void changeSettingsImage(event, 'recipe', recipe.id)}
                        />
                        {recipeImages[recipe.id] && (
                          <button
                            type="button"
                            className="btn-tertiary"
                            disabled={imageUploadingKey === `recipe:${recipe.id}`}
                            onClick={() => void resetSettingsImage('recipe', recipe.id)}
                          >
                            {imageUploadingKey === `recipe:${recipe.id}` ? 'Envoi...' : 'Réinitialiser'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="settings-save-panel">
          <div>
	            <span className="hero-eyebrow">Préférences du navigateur</span>
	            <h2>Préférences prêtes</h2>
	            <p>Les réglages rapides restent sur cet appareil. Les photos et recettes personnalisées sont synchronisées avec Supabase.</p>
	          </div>
	          <button type="button" className="btn-primary" onClick={() => setSettingsInfo('Réglages enregistrés.')}>
	            Confirmer
	          </button>
	          {error && <p className="error-text">{error}</p>}
	          {settingsInfo && <p className="info-text">{settingsInfo}</p>}
	        </section>
      </>
    );
  };

  const renderRecipesTab = () => {
    if (recipesLoading) {
      return (
        <>
          <div className="main-header">
            <div>
              <h1 className="main-title">Recettes</h1>
              <p className="main-subtitle">Chargement des recettes…</p>
            </div>
          </div>
          
          <section className="card">
            <p className="muted">Chargement…</p>
          </section>
        </>
      );
    }

    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const matchingStocksForIngredient = (ingredientName: string) => {
      const key = normalize(ingredientName);
      if (!key) return [];

      return stocks
        .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name)
        .filter((s) => {
          const productName = normalize(getProductMatchName(s.product!));
          return productName.includes(key) || key.includes(productName);
        });
    };

    const stockQuantityInIngredientUnit = (stock: StockItem, ingredient: RecipeIngredient): number | null => {
      const qty = stock.quantity ?? 0;
      const stockUnit = (stock.unit ?? 'unité').toLowerCase();

      if (ingredient.unit === 'g') {
        if (stockUnit === 'g') return qty;
        if (stockUnit === 'unité' && stock.product?.grams_per_unit_g) {
          return qty * stock.product.grams_per_unit_g;
        }
      }

      if (ingredient.unit === 'ml') {
        if (stockUnit === 'l') return qty * 1000;
        if (stockUnit === 'ml') return qty;
      }

      if (ingredient.unit === 'unité') {
        if (stockUnit === 'unité') return qty;
      }

      return null;
    };

    const hasEnoughIngredient = (ingredient: RecipeIngredient) => {
      const matchingStocks = matchingStocksForIngredient(ingredient.name);
      if (matchingStocks.length === 0) return false;

      if (ingredient.amount == null || !ingredient.unit) return true;

      const available = matchingStocks.reduce((total, stock) => {
        const converted = stockQuantityInIngredientUnit(stock, ingredient);
        return converted == null ? total : total + converted;
      }, 0);

      return available >= ingredient.amount;
    };

    const urgentStockNames = stocks
      .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name)
      .filter((s) => {
        const status = getExpirationStatus(s.expiration_date, settings.soonDays);
        return status === 'soon' || status === 'expired' || s.is_open;
      })
      .map((s) => normalize(getProductMatchName(s.product!)));

    const usesUrgentIngredient = (ingredient: RecipeIngredient) => {
      const key = normalize(ingredient.name);
      return urgentStockNames.some((n) => n.includes(key) || key.includes(n));
    };

    // ✅ IMPORTANT : recettes DB + catalogue d'exemples
    const allRecipes: Recipe[] = [...dbRecipes, ...SAMPLE_RECIPES].map(applyRecipeOverrides);

    const enriched: EnrichedRecipe[] = allRecipes.map((r) => {
      const missing = r.ingredients
        .filter((ing: RecipeIngredient) => !hasEnoughIngredient(ing))
        .map((ing: RecipeIngredient) => ing.name);

      const urgentIngredients = r.ingredients
        .filter((ing: RecipeIngredient) => hasEnoughIngredient(ing) && usesUrgentIngredient(ing))
        .map((ing: RecipeIngredient) => ing.name);

      const missingCount = missing.length;
      const urgentCount = urgentIngredients.length;
      const feasible = missingCount <= settings.recipesMaxMissing;

      return { ...r, missing, missingCount, urgentIngredients, urgentCount, feasible };
    });

    const recipeSearchKey = normalize(recipeSearch);

    const searchFilteredRecipes = recipeSearchKey
      ? enriched.filter((recipe) => {
          const searchableText = [
            recipe.name,
            recipe.kind,
            recipe.tags?.join(' '),
            recipe.ingredients.map((ing: RecipeIngredient) => ing.name).join(' '),
            recipe.urgentIngredients.join(' '),
            recipe.missing.join(' '),
          ]
            .filter(Boolean)
            .map(String)
            .map(normalize)
            .join(' ');

          return searchableText.includes(recipeSearchKey);
        })
      : enriched;

    const recipeFilterOptions: { value: RecipeFilter; label: string }[] = [
      { value: 'all', label: 'Toutes' },
      { value: 'ready', label: '0 manquant' },
      { value: 'urgent', label: 'À utiliser vite' },
      { value: 'missing', label: 'Avec manquants' },
    ];

    const filteredRecipes = searchFilteredRecipes.filter((recipe) => {
      if (recipeFilter === 'ready') return recipe.missingCount === 0;
      if (recipeFilter === 'urgent') return recipe.urgentCount > 0;
      if (recipeFilter === 'missing') return recipe.missingCount > 0;

      return true;
    });

    const feasibleList = filteredRecipes
      .filter((r) => r.feasible)
      .sort((a, b) => b.urgentCount - a.urgentCount || a.missingCount - b.missingCount);

    const showRecipeInspiration =
      recipesSubTab === 'feasible'
      && feasibleList.length === 0
      && recipeFilter === 'all'
      && filteredRecipes.length > 0;

    const current = recipesSubTab === 'feasible'
      ? (showRecipeInspiration ? filteredRecipes.slice(0, 12) : feasibleList)
      : filteredRecipes;
    const savory = current.filter((r) => r.kind === 'savory');
    const sweet = current.filter((r) => r.kind === 'sweet');
    const readyRecipesCount = enriched.filter((recipe) => recipe.missingCount === 0).length;
    const urgentRecipesCount = enriched.filter((recipe) => recipe.urgentCount > 0).length;
    const cookBandMetrics = showRecipeInspiration
      ? [
          { value: current.length, label: 'idées' },
          { value: savory.length, label: 'salées' },
          { value: sweet.length, label: 'sucrées' },
        ]
      : [
          { value: feasibleList.length, label: 'faisables' },
          { value: readyRecipesCount, label: 'prêtes' },
          { value: urgentRecipesCount, label: 'anti-gaspi' },
        ];

    const headerTitle =
      showRecipeInspiration
        ? 'Inspirations pour démarrer'
        : recipesSubTab === 'feasible'
        ? `Faisable avec ton stock`
        : 'Toutes tes idées';

    const headerSubtitle =
      showRecipeInspiration
        ? 'Ajoute quelques produits au stock pour transformer ces idées en recettes faisables.'
        : recipesSubTab === 'feasible'
        ? `On accepte jusqu'à ${pluralize(settings.recipesMaxMissing, 'ingrédient')} manquant${settings.recipesMaxMissing > 1 ? 's' : ''}.`
        : 'Recettes enregistrées et idées de base.';

    const renderRecipeCard = (r: EnrichedRecipe) => {
      const isReady = r.missingCount === 0;
      const badge =
        r.urgentCount > 0
          ? `${pluralize(r.urgentCount, 'urgent')} · ${pluralize(r.missingCount, 'manquant')}`
          : pluralize(r.missingCount, 'manquant');
      const isDbRecipe = dbRecipes.some((x) => x.id === r.id); // permet d'afficher "supprimer" seulement sur DB
      const kcalR = kcalForRecipe(r, products);
      const visibleIngredients = r.ingredients.slice(0, 5);
      const remainingIngredients = r.ingredients.length - visibleIngredients.length;
      const tagLabel = r.tags?.[0] ?? (r.kind === 'savory' ? 'Plat' : 'Dessert');
      const readinessLabel = isReady
        ? 'Prête'
        : r.feasible
          ? `${r.missingCount} à acheter`
          : pluralize(r.missingCount, 'manquant');
      const readinessClass = isReady
        ? ' recipe-readiness-pill--ready'
        : r.feasible
          ? ''
          : ' recipe-readiness-pill--missing';
      const recipeCardStyle = {
        '--recipe-image': cssImageUrl(recipeImageFor(r, recipeImages)),
      } as CSSProperties;

      return (
        <div key={r.id} className="recipe-card recipe-card--visual" style={recipeCardStyle}>
          <div className="recipe-card-media">
            <div className="recipe-media-top">
              <span className="recipe-kind-pill">{r.kind === 'savory' ? 'Salé' : 'Sucré'}</span>
              <span className={'recipe-readiness-pill' + readinessClass}>{readinessLabel}</span>
            </div>
            <div className="recipe-media-bottom">
              <span>{tagLabel}</span>
              <span>{r.servings ? pluralize(r.servings, 'portion') : 'Recette'}</span>
            </div>
          </div>

          <div className="recipe-card-body">
            <div className="recipe-head">
              <div>
                <h3 className="recipe-title">{r.name}</h3>
                <div className="recipe-meta-row">
                  <span>
                    {kcalR.approx ? '≈ ' : ''}{kcalR.kcal} kcal
                  </span>
                  <span>{pluralize(r.ingredients.length, 'ingrédient')}</span>
                </div>
              </div>
              <div className="recipe-head-actions">
                <button
                  type="button"
                  className="recipe-delete-btn btn-with-icon"
                  onClick={() => openEditRecipe(r)}
                  title="Modifier cette recette"
                >
                  <span className="btn-symbol btn-symbol--edit" aria-hidden="true" />
                  Modifier
                </button>
                {isDbRecipe && (
                  <button
                    type="button"
                  className="recipe-delete-btn recipe-delete-btn--danger btn-with-icon"
                  onClick={() => void deleteRecipeInDb(r.id)}
                  title="Supprimer cette recette"
                >
                  <span className="btn-symbol btn-symbol--trash" aria-hidden="true" />
                  Supprimer
                </button>
                )}
              </div>
            </div>

            {recipesSubTab === 'feasible' && (
              <div className="recipe-stock-line">
                <span className="recipe-badge">{isReady ? 'Tout est disponible' : badge}</span>
              </div>
            )}

            {r.urgentIngredients.length > 0 && (
              <p className="recipe-urgent">
                À utiliser vite : {r.urgentIngredients.join(', ')}
              </p>
            )}

            <p className="recipe-subtitle">Ingrédients clés</p>
            <ul className="recipe-list recipe-list--preview">
              {visibleIngredients.map((ing: RecipeIngredient) => {
                const ok = hasEnoughIngredient(ing);
                return (
                  <li key={`${r.id}-${ing.name}`} className={ok ? 'ing-ok' : 'ing-missing'}>
                    <span className="ingredient-state" aria-hidden="true" />
                    <span>
                      {ing.name}
                      {ing.amount != null && ing.unit ? ` — ${ing.amount} ${ing.unit}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>

            {remainingIngredients > 0 && (
              <p className="recipe-more">+ {pluralize(remainingIngredients, 'ingrédient')}</p>
            )}

            {kcalR.missingCount > 0 && (
              <p className="recipe-meta">
                {pluralize(kcalR.missingCount, 'ingrédient')} sans calcul nutritionnel.
              </p>
            )}

            <div className="recipe-card-actions">
              <button
                type="button"
                className="recipe-add-btn recipe-add-btn--primary btn-with-icon"
                onClick={() => openPlanFromRecipe(r)}
              >
                <span className="btn-symbol btn-symbol--calendar" aria-hidden="true" />
                Planifier ce repas
              </button>
              {recipesSubTab === 'feasible' && r.missingCount > 0 && (
                <button
                  type="button"
                  className="recipe-add-btn"
                  onClick={() => void addMissingIngredientsToShopping(r.missing, r.kind)}
                >
                  Ajouter aux courses
                </button>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <>
        <div className="main-header">
          <div>
            <h1 className="main-title">Cuisiner</h1>
            <p className="main-subtitle">{headerSubtitle}</p>
          </div>
          <div className="main-header-right">
            <span className="tag">Idées repas</span>
          </div>
        </div>

        <section className="cook-band">
          <div>
            <span className="hero-eyebrow">Avec ton stock</span>
            <h2>Des idées sans repartir de zéro</h2>
            <p>
              L'app repère ce que tu as, ce qui expire et ce qu'il manque pour transformer ton stock en repas.
            </p>
          </div>
          <div className="cook-band-side">
            <div className="cook-band-metrics">
              {cookBandMetrics.map((metric) => (
                <span key={metric.label}><strong>{metric.value}</strong> {metric.label}</span>
              ))}
            </div>
            <button
              type="button"
              className="btn-primary cook-band-create btn-with-icon"
              onClick={() => {
                setError(null);
                setNewRecipeOpen(true);
              }}
            >
              <span className="btn-symbol btn-symbol--cook" aria-hidden="true" />
              Créer une recette
            </button>
          </div>
        </section>

        <section className="card">
          <div className="field-group full">
            <label className="field-label">Recherche</label>
            <div className="field-row">
              <input
                className="field-input"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                placeholder="Recette, ingrédient, envie..."
              />
              {recipeSearch && (
                <button type="button" className="btn-tertiary" onClick={() => setRecipeSearch('')}>
                  Effacer
                </button>
              )}
            </div>

            <div className="subtabs" style={{ marginTop: '0.6rem' }}>
              {recipeFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={'subtab-btn' + (recipeFilter === option.value ? ' subtab-btn--active' : '')}
                  onClick={() => setRecipeFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="muted" style={{ marginTop: '0.4rem' }}>
              {pluralize(current.length, 'recette')} affichée{current.length > 1 ? 's' : ''} sur {enriched.length}.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="subtabs">
            <button
              type="button"
              className={'subtab-btn' + (recipesSubTab === 'feasible' ? ' subtab-btn--active' : '')}
              onClick={() => setRecipesSubTab('feasible')}
            >
              Faisables
            </button>
            <button
              type="button"
              className={'subtab-btn' + (recipesSubTab === 'all' ? ' subtab-btn--active' : '')}
              onClick={() => setRecipesSubTab('all')}
            >
              Toutes
            </button>
          </div>

          <h2 className="section-title" style={{ marginTop: '0.7rem' }}>
            {headerTitle}
          </h2>

          <div className="recipe-section">
            <h3 className="recipe-section-title">Salé</h3>
            {savory.length === 0 ? (
              <p className="muted">
                {recipesSubTab === 'feasible'
                  ? `Aucune recette salée faisable avec ton stock (≤ ${settings.recipesMaxMissing} manquants).`
                  : 'Aucune recette salée.'}
              </p>
            ) : (
              <div className="recipe-grid">{savory.map(renderRecipeCard)}</div>
            )}
          </div>

          <div className="recipe-section" style={{ marginTop: '1rem' }}>
            <h3 className="recipe-section-title">Sucré</h3>
            {sweet.length === 0 ? (
              <p className="muted">
                {recipesSubTab === 'feasible'
                  ? `Aucune recette sucrée faisable avec ton stock (≤ ${settings.recipesMaxMissing} manquants).`
                  : 'Aucune recette sucrée.'}
              </p>
            ) : (
              <div className="recipe-grid">{sweet.map(renderRecipeCard)}</div>
            )}
          </div>
        </section>
      </>
    );
  };

  const renderPlaceholder = (title: string, description: string) => (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">{title}</h1>
          <p className="main-subtitle">{description}</p>
        </div>
        <div className="main-header-right">
          <span className="tag">Bientôt disponible</span>
        </div>
      </div>

      <section className="card">
        <p className="muted">
          Cette section n’est pas encore développée, mais la structure est déjà prête.
        </p>
      </section>
    </>
  );

  const newRecipeIngredientCount = newRecipeIngredients.trim()
    ? parseRecipeIngredients(newRecipeIngredients).length
    : 0;
  const newRecipeServingCount = Number(newRecipeServings);
  const newRecipePreviewServings =
    Number.isFinite(newRecipeServingCount) && newRecipeServingCount > 0
      ? newRecipeServingCount
      : 1;
  const editRecipeIngredientCount = editRecipeIngredients.trim()
    ? parseRecipeIngredients(editRecipeIngredients).length
    : 0;
  const editRecipeServingCount = Number(editRecipeServings);
  const editRecipePreviewServings =
    Number.isFinite(editRecipeServingCount) && editRecipeServingCount > 0
      ? editRecipeServingCount
      : 1;
  const editProductQuantityLabel = `${editQty || '0'} ${editUnit || 'unité'}`;
  const appImageStyle = {
    '--image-dashboard-hero': cssImageUrl(appImages.dashboardHero),
    '--image-stock-hero': cssImageUrl(appImages.stockHero),
    '--image-stock-empty': cssImageUrl(appImages.stockEmpty),
    '--image-shopping-hero': cssImageUrl(appImages.shoppingHero),
    '--image-shopping-empty': cssImageUrl(appImages.shoppingEmpty),
    '--image-planning-hero': cssImageUrl(appImages.planningHero),
    '--image-history-hero': cssImageUrl(appImages.historyHero),
    '--image-history-empty': cssImageUrl(appImages.historyEmpty),
  } as CSSProperties;

  let mainContent: ReactNode;
  if (activeTab === 'dashboard') mainContent = renderDashboard();
  else if (activeTab === 'stock') mainContent = renderStockTab();
  else if (activeTab === 'shopping') mainContent = renderShoppingTab();
  else if (activeTab === 'recipes') mainContent = renderRecipesTab();
  else if (activeTab === 'settings') mainContent = renderSettingsTab();
  else if (activeTab === 'history') mainContent = renderHistoryTab();
  else if (activeTab === 'weekmenu') mainContent = renderWeekMenuTab();
  else mainContent = renderPlaceholder('Section', 'À venir');

  return (
    <div className={`app-root app-root--${activeTab}`} style={appImageStyle}>
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}

      {newRecipeOpen && (
        <div className="modal-backdrop">
          <div className="modal-card recipe-modal-card">
            <div className="modal-head">
              <div>
                <p className="modal-eyebrow">Carnet maison</p>
                <h3 className="modal-title">Nouvelle recette</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Fermer la fenêtre"
                onClick={() => {
                  setError(null);
                  setNewRecipeImageSelection(null);
                  setNewRecipeOpen(false);
                }}
              >
                ✕
              </button>
            </div>

            <p className="modal-subtitle">
              Ajoute une idée simple, puis VPlacard la comparera au stock pour les menus et les courses.
            </p>

            <div
              className="modal-image-preview"
              style={{
                '--modal-image': cssImageUrl(newRecipeImagePreview || RECIPE_IMAGE_POOL[newRecipeKind][0]),
              } as CSSProperties}
              aria-hidden="true"
            />

            <div className="recipe-modal-preview">
              <span>{newRecipeKind === 'savory' ? 'Salé' : 'Sucré'}</span>
              <span>{pluralize(newRecipeIngredientCount, 'ingrédient')}</span>
              <span>{pluralize(newRecipePreviewServings, 'portion')}</span>
            </div>

            <div className="form-grid" style={{ marginTop: '0.85rem' }}>
              <div className="field-group full">
                <label className="field-label">Nom</label>
                <input
                  className="field-input"
                  placeholder="Ex : Gratin de pâtes"
                  value={newRecipeName}
                  onChange={(e) => setNewRecipeName(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Type</label>
                <select
                  className="field-input"
                  value={newRecipeKind}
                  onChange={(e) => setNewRecipeKind(e.target.value as RecipeKind)}
                >
                  <option value="savory">Salé</option>
                  <option value="sweet">Sucré</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">Portions</label>
                <input
                  className="field-input"
                  type="number"
                  min={1}
                  value={newRecipeServings}
                  onChange={(e) => setNewRecipeServings(e.target.value)}
                />
              </div>

              <div className="field-group full">
                <label className="field-label">Ingrédients</label>
                <textarea
                  className="field-input"
                  rows={4}
                  placeholder="oeuf 3 unité, fromage 40 g, huile 15 ml..."
                  value={newRecipeIngredients}
                  onChange={(e) => setNewRecipeIngredients(e.target.value)}
                />
              </div>

              <div className="field-group full">
                <label className="field-label">Photo de la recette</label>
                <div className="field-row">
                  <input
                    className="field-input file-input"
                    type="file"
                    accept={IMAGE_FILE_ACCEPT}
                    onChange={(event) => setNewRecipeImageSelection(event.currentTarget.files?.[0] ?? null)}
                  />
                  {newRecipeImageFile && (
                    <button type="button" className="btn-tertiary" onClick={() => setNewRecipeImageSelection(null)}>
                      Retirer
                    </button>
                  )}
                </div>
              </div>
            </div>

            {error && <p className="error-text">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setError(null);
                  setNewRecipeImageSelection(null);
                  setNewRecipeOpen(false);
                }}
              >
                Annuler
              </button>
              <button type="button" className="btn-primary" onClick={() => void createRecipeInDb()}>
                Créer la recette
              </button>
            </div>
          </div>
        </div>
      )}

      {editRecipeOpen && editRecipeTarget && (
        <div className="modal-backdrop">
          <div className="modal-card recipe-modal-card">
            <div className="modal-head">
              <div>
                <p className="modal-eyebrow">Carnet maison</p>
                <h3 className="modal-title">Modifier la recette</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Fermer la fenêtre"
                onClick={() => {
                  setEditRecipeImageSelection(null);
                  setEditRecipeOpen(false);
                }}
              >
                ✕
              </button>
            </div>

            <p className="modal-subtitle">
              Ajuste les portions et les ingrédients pour que les suggestions de repas restent fiables.
            </p>

            <div
              className="modal-image-preview"
              style={{
                '--modal-image': cssImageUrl(
                  editRecipeImagePreview
                  || (editRecipeTarget ? recipeImageFor(editRecipeTarget, recipeImages) : RECIPE_IMAGE_POOL[editRecipeKind][0]),
                ),
              } as CSSProperties}
              aria-hidden="true"
            />

            <div className="recipe-modal-preview">
              <span>{editRecipeKind === 'savory' ? 'Salé' : 'Sucré'}</span>
              <span>{pluralize(editRecipeIngredientCount, 'ingrédient')}</span>
              <span>{pluralize(editRecipePreviewServings, 'portion')}</span>
            </div>

            <div className="form-grid modal-form-grid">
              <div className="field-group full">
                <label className="field-label">Nom</label>
                <input
                  className="field-input"
                  value={editRecipeName}
                  onChange={(e) => setEditRecipeName(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Portions</label>
                <input
                  className="field-input"
                  type="number"
                  min={1}
                  value={editRecipeServings}
                  onChange={(e) => setEditRecipeServings(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Type</label>
                <select
                  className="field-input"
                  value={editRecipeKind}
                  onChange={(e) => setEditRecipeKind(e.target.value as RecipeKind)}
                >
                  <option value="savory">Salé</option>
                  <option value="sweet">Sucré</option>
                </select>
              </div>

              <div className="field-group full">
                <label className="field-label">Ingrédients</label>
                <textarea
                  className="field-input"
                  value={editRecipeIngredients}
                  onChange={(e) => setEditRecipeIngredients(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="field-group full">
                <label className="field-label">Photo de la recette</label>
                <div className="field-row">
                  <input
                    className="field-input file-input"
                    type="file"
                    accept={IMAGE_FILE_ACCEPT}
                    onChange={(event) => setEditRecipeImageSelection(event.currentTarget.files?.[0] ?? null)}
                  />
                  {editRecipeImageFile && (
                    <button type="button" className="btn-tertiary" onClick={() => setEditRecipeImageSelection(null)}>
                      Retirer
                    </button>
                  )}
                </div>
              </div>
            </div>

	            <div className="modal-actions">
	              <button
	                type="button"
	                className="btn-secondary"
	                onClick={() => {
	                  setEditRecipeImageSelection(null);
	                  setEditRecipeOpen(false);
	                }}
	              >
	                Annuler
	              </button>
	              <button type="button" className="btn-primary" onClick={() => void saveEditRecipe()}>
	                Enregistrer la recette
	              </button>
	            </div>
          </div>
        </div>
      )}

      {editOpen && editTarget && (
        <div className="modal-backdrop">
          <div className="modal-card product-modal-card">
            <div className="modal-head">
              <div>
                <p className="modal-eyebrow">Stock</p>
                <h3 className="modal-title">Modifier le produit</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Fermer la fenêtre"
                onClick={() => setEditOpen(false)}
              >
                ✕
              </button>
            </div>

            <p className="modal-subtitle">
              Ajuste l'identité, l'emplacement, les quantités et les infos nutritionnelles utilisées par les recettes.
            </p>

            <div className="modal-context-row">
              <span>{editCategory || 'Sans catégorie'}</span>
              <span>{editPlace || settings.defaultPlace}</span>
              <span>{editProductQuantityLabel}</span>
            </div>

            <div className="form-grid modal-form-grid product-modal-grid">
              <div className="field-group full">
                <label className="field-label">Nom</label>
                <input className="field-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>

              <div className="field-group full">
                <label className="field-label">Nom pour recettes/courses</label>
                <input
                  className="field-input"
                  value={editGenericName}
                  onChange={(e) => setEditGenericName(e.target.value)}
                  placeholder="Ex : pâtes, lait, moutarde..."
                />
              </div>

              <div className="field-group">
                <label className="field-label">Marque</label>
                <input className="field-input" value={editBrand} onChange={(e) => setEditBrand(e.target.value)} />
              </div>

              <div className="field-group">
                <label className="field-label">Code-barres</label>
                <input className="field-input" value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} />
              </div>

              <div className="field-group">
                <label className="field-label">Catégorie</label>
                <select
                  className="field-input"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as MainCategory | '')}
                >
                  <option value="">(Aucune)</option>
                  {MAIN_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {getSubcatsFor(editCategory).length > 0 && (
                <div className="field-group">
                  <label className="field-label">Sous-catégorie</label>
                  <select
                    className="field-input"
                    value={editSubCategory}
                    onChange={(e) => setEditSubCategory(e.target.value as SubCategory | '')}
                  >
                    <option value="">(Aucune)</option>
                    {getSubcatsFor(editCategory).map((sc) => (
                      <option key={sc} value={sc}>
                        {sc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field-group">
                <label className="field-label">Lieu</label>
                <input className="field-input" value={editPlace} onChange={(e) => setEditPlace(e.target.value)} />
              </div>

              <div className="field-group">
                <label className="field-label">Quantité</label>
                <input className="field-input" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
              </div>

              <div className="field-group">
                <label className="field-label">Unité</label>
                <select className="field-input" value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">kcal / 100g</label>
                <input
                  className="field-input"
                  value={editKcal100g}
                  onChange={(e) => setEditKcal100g(e.target.value)}
                  placeholder="ex: 250"
                />
              </div>

              <div className="field-group">
                <label className="field-label">Grammes par unité</label>
                <input
                  className="field-input"
                  value={editGramsPerUnit}
                  onChange={(e) => setEditGramsPerUnit(e.target.value)}
                  placeholder="ex: 125"
                />
              </div>

              <div className="field-group">
                <label className="field-label">Densité g/ml</label>
                <input
                  className="field-input"
                  value={editDensityGml}
                  onChange={(e) => setEditDensityGml(e.target.value)}
                  placeholder="ex: 1.00"
                />
              </div>

              <div className="field-group">
                <label className="field-label">Date de péremption</label>
                <input
                  type="date"
                  className="field-input"
                  value={editExpiration}
                  onChange={(e) => setEditExpiration(e.target.value)}
                />
                <button type="button" className="btn-tertiary field-inline-action" onClick={() => setEditExpiration('')}>
                  Effacer la date
                </button>
              </div>

              <div className="field-group">
                <label className="field-label">Type de date</label>
                <select
                  className="field-input"
                  value={editExpirationType}
                  onChange={(e) => setEditExpirationType(e.target.value as ExpirationType)}
                  disabled={!editExpiration}
                >
                  <option value="dlc">DLC - à consommer jusqu'au</option>
                  <option value="ddm">DDM - à consommer de préférence avant</option>
                  <option value="unknown">Inconnu</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">État</label>
                <select
                  className="field-input"
                  value={editIsOpen ? 'open' : 'closed'}
                  onChange={(e) => setEditIsOpen(e.target.value === 'open')}
                >
                  <option value="closed">Non ouvert</option>
                  <option value="open">Ouvert</option>
                </select>
              </div>
            </div>

            {autoFillLoading && (
              <p className="error-text" style={{ color: '#4b5563' }}>
                Recherche des informations du produit…
              </p>
            )}

            {info && <p className="info-text">{info}</p>}
            {error && <p className="error-text">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditOpen(false)}>
                Annuler
              </button>
              <button type="button" className="btn-primary" disabled={editSaving} onClick={() => void saveEdit()}>
                {editSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo" aria-hidden="true">V</div>
            <div>
              <div className="sidebar-title">VPlacard</div>
              <div className="sidebar-subtitle">Cuisine, stock & menus</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={'sidebar-item' + (activeTab === item.key ? ' sidebar-item--active' : '')}
                onClick={() => setActiveTab(item.key)}
              >
                <span className={`sidebar-item-icon sidebar-item-icon--${item.icon}`} aria-hidden="true" />
                <span className="sidebar-item-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-box">
              <div className="sidebar-footer-title">Cuisine du jour</div>
              <div className="sidebar-footer-text">
                Scanner un produit, sauver un ingrédient, préparer les courses.
              </div>
              <button type="button" className="sidebar-scan-btn btn-with-icon" onClick={() => setShowScanner(true)}>
                <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
                Scanner un produit
              </button>
            </div>
          </div>
        </aside>

        <main className="main">{mainContent}</main>
      </div>
      <button type="button" className="floating-scan" onClick={() => setShowScanner(true)}>
        <span className="btn-symbol btn-symbol--scan" aria-hidden="true" />
        Scanner un produit
      </button>
    </div>
  );
}

export default App;
