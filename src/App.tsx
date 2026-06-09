import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { supabase } from './supabaseClient';
import { BarcodeScanner } from './BarcodeScanner';
import './App.css';

type Tab = 'dashboard' | 'stock' | 'history' | 'weekmenu' | 'shopping' | 'recipes' | 'settings';
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
  return (SUBCATS as any)[cat] ?? [];
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

type Settings = {
  soonDays: number;
  recipesMaxMissing: number;
  defaultPlace: string;
};

const DEFAULT_SETTINGS: Settings = {
  soonDays: 7,
  recipesMaxMissing: 2,
  defaultPlace: 'Placard',
};

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

const SETTINGS_STORAGE_KEY = 'pantrypilot_settings_v1';

const si = (...names: string[]): RecipeIngredient[] =>
  names.map((n) => ({ name: n, amount: null, unit: null }));

const SAMPLE_RECIPES: Recipe[] = [
  // SALÉ
  {
    id: 'omelette-fromage',
    name: 'Omelette au fromage',
    kind: 'savory',
    ingredients: si('oeuf', 'fromage', 'huile', 'sel', 'poivre'),
    servings: null,
    tags: ['rapide'],
  },
  {
    id: 'pates-tomate',
    name: 'Pâtes sauce tomate',
    kind: 'savory',
    ingredients: si('pates', 'tomate', 'ail', 'huile', 'sel'),
    servings: null,
    tags: ['classique'],
  },
  {
    id: 'riz-legumes-saute',
    name: 'Riz aux légumes sautés',
    kind: 'savory',
    ingredients: si('riz', 'legume', 'huile', 'ail', 'sauce soja'),
    servings: null,
    tags: ['wok'],
  },
  {
    id: 'salade-thon-mais',
    name: 'Salade thon & maïs',
    kind: 'savory',
    ingredients: si('salade', 'thon', 'mais', 'huile', 'vinaigre'),
    servings: null,
    tags: ['frais'],
  },
  {
    id: 'soupe-lentilles',
    name: 'Soupe de lentilles',
    kind: 'savory',
    ingredients: si('lentille', 'carotte', 'oignon', 'bouillon', 'ail'),
    servings: null,
    tags: ['batch cooking'],
  },

  // SUCRÉ
  {
    id: 'pancakes',
    name: 'Pancakes',
    kind: 'sweet',
    ingredients: si('farine', 'oeuf', 'lait', 'sucre', 'levure'),
    servings: null,
    tags: ['petit dej'],
  },
  {
    id: 'bol-yaourt-fruits',
    name: 'Bol yaourt, fruits & granola',
    kind: 'sweet',
    ingredients: si('yaourt', 'fruit', 'granola', 'miel'),
    servings: null,
    tags: ['frais'],
  },
  {
    id: 'mug-cake-choco',
    name: 'Mug cake chocolat',
    kind: 'sweet',
    ingredients: si('farine', 'oeuf', 'lait', 'sucre', 'chocolat'),
    servings: null,
    tags: ['rapide'],
  },
  {
    id: 'compote-pomme-cannelle',
    name: 'Compote pomme cannelle',
    kind: 'sweet',
    ingredients: si('pomme', 'sucre', 'cannelle', 'citron'),
    servings: null,
    tags: ['léger'],
  },
  {
    id: 'cookies-choco',
    name: 'Cookies chocolat',
    kind: 'sweet',
    ingredients: si('farine', 'sucre', 'beurre', 'oeuf', 'chocolat'),
    servings: null,
    tags: ['gourmand'],
  },
];

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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
  { value: 'l', label: 'l' },
] as const;

function stepForUnit(unit: string | null): number {
  const u = (unit ?? 'unité').toLowerCase();
  if (u === 'g') return 50;       // +50g
  if (u === 'l') return 0.05;     // +0.05L (= 50ml)
  return 1;                       // +1 unité
}

function roundQty(value: number, unit: string | null): number {
  const u = (unit ?? 'unité').toLowerCase();
  if (u === 'l') return Math.round(value * 100) / 100; // 2 décimales
  return Math.round(value * 10) / 10;                  // safe (0.1) si besoin
}

function toNum(v: any): number | null {
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
      const pn = normalizeText(p.name);
      return pn === key || pn.includes(key) || key.includes(pn);
    }) ?? null
  );
}

function kcalForRecipe(recipe: Recipe, products: Product[]): { kcal: number; missingCount: number; approx: boolean } {
  let total = 0;
  let missing = 0;
  let approx = false;

  for (const ing of recipe.ingredients) {
    if (!ing.amount || !ing.unit) {
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

function mealCalories(meal: WeekMeal, recipes: Recipe[], products: Product[]): number | null {
  if (meal.kcal_override != null) return Math.round(meal.kcal_override);

  if (!meal.recipe_id) return null;
  const r = recipes.find((x) => x.id === meal.recipe_id);
  if (!r) return null;

  const kcalR = kcalForRecipe(r, products).kcal;
  const recipeServ = r.servings ?? 1;
  const mealServ = meal.servings ?? 1;

  // kcal par portion * nb portions
  return Math.round((kcalR / recipeServ) * mealServ);
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
      const amount = m?.[2] ? Number(String(m[2]).replace(',', '.')) : null;
      const unit = (m?.[3]?.toLowerCase() as IngredientUnit) ?? null;
      return { name, amount: Number.isFinite(amount as any) ? amount : null, unit };
    });
}

const navItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: '✨' },
  { key: 'stock', label: 'Placards & frigo', icon: '🧺' },
  { key: 'history', label: 'Anciens achats', icon: '🕘' },
  { key: 'weekmenu', label: 'Menu semaine', icon: '📅' },
  { key: 'shopping', label: 'Listes de courses', icon: '🛒' },
  { key: 'recipes', label: 'Recettes', icon: '🍽️' },
  { key: 'settings', label: 'Réglages', icon: '⚙️' },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shoppingSubTab, setShoppingSubTab] = useState<'main' | 'others'>('main');
  const [recipesSubTab, setRecipesSubTab] = useState<'feasible' | 'all'>('feasible');

  const [loading, setLoading] = useState(true);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Form stock
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<MainCategory | ''>('');
  const [place, setPlace] = useState(DEFAULT_SETTINGS.defaultPlace);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('unité');
  const [expiration, setExpiration] = useState('');
  const [expirationType, setExpirationType] = useState<ExpirationType>('dlc');
  const [barcode, setBarcode] = useState('');
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
  const [newRecipeIngredients, setNewRecipeIngredients] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);

  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editCategory, setEditCategory] = useState<MainCategory | ''>('');
  const [editPlace, setEditPlace] = useState('');
  const [editQty, setEditQty] = useState('0');
  const [editUnit, setEditUnit] = useState('unité');
  const [editExpiration, setEditExpiration] = useState(''); // '' => null
  const [editExpirationType, setEditExpirationType] = useState<ExpirationType>('dlc');
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
      }));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error(e);
    }
  }, [settings]);

  useEffect(() => {
    setPlace(settings.defaultPlace);
  }, [settings.defaultPlace]);

      const openEdit = (item: StockItem) => {
        setEditTarget(item);

        setEditName(item.product?.name ?? '');
        setEditBrand(item.product?.brand ?? '');
        setEditCategory((item.product?.category as MainCategory) ?? '');
        setEditSubCategory((item.product?.sub_category as SubCategory) ?? '');
        setEditPlace(item.place ?? '');
        setEditQty(String(item.quantity ?? 0));
        setEditUnit(item.unit ?? 'unité');
        setEditExpiration(item.expiration_date ?? ''); // '' si null
        setEditExpirationType(item.expiration_type ?? 'dlc');
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
      })
      .eq('id', stockId)
      .select('id, place, quantity, unit, expiration_date, expiration_type')
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
                    brand: editBrand.trim() || null,
                    category: editCategory ? editCategory : null,
                    sub_category:
                      editCategory === 'Produit sucré' || editCategory === 'Produit salé'
                        ? (editSubCategory || null)
                        : null,
                    barcode: editBarcode.trim() || null,
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
              brand: editBrand.trim() || null,
              category: editCategory ? editCategory : null,
              barcode: editBarcode.trim() || null,
            }
          : p,
      ),
    );

    setEditOpen(false);
    setEditTarget(null);
  } catch (e: any) {
    console.error(e);
    setError(e?.message ? `Erreur: ${e.message}` : "Erreur lors de l'enregistrement.");
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
    setError("Impossible de charger le menu de la semaine.");
    setWeekMeals([]);
    setWeekMealsLoading(false);
    return;
  }

  const normalized: WeekMeal[] = (data ?? []).map((r: any) => ({
  id: r.id,
  meal_date: r.meal_date,
  meal_slot: r.meal_slot as MealSlot,
  recipe_id: r.recipe_id ?? null,
  recipe_name: String(r.recipe_name ?? ''),
  recipe_kind: (r.recipe_kind as RecipeKind) ?? null,
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
}, [category]);

useEffect(() => {
  if (getSubcatsFor(editCategory).length === 0) setEditSubCategory('');
  else if (editSubCategory && !getSubcatsFor(editCategory).includes(editSubCategory)) setEditSubCategory('');
}, [editCategory]);

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
            ? ` ${createdCount} ingrédient(s) ajouté(s) à la liste de courses.`
            : ' Ingrédients manquants déjà présents dans la liste de courses.';
      } catch (e) {
        console.error(e);
        shoppingMessage = " Impossible d'ajouter les ingrédients manquants à la liste de courses.";
      }
    }    
    setInfo(`✅ Repas validé. ${stockMessage}${missingMessage}${shoppingMessage}`); 
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
          product:products (
            id,
            name,
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
        setError('Impossible de charger les stocks');
      } else {
        const normalized: StockItem[] = (stockData ?? []).map((row: any) => {
          const prodArray = row.product;
          const product = Array.isArray(prodArray) ? prodArray[0] : prodArray;

          return {
            id: row.id,
            place: row.place,
            quantity: row.quantity,
            unit: row.unit,
            expiration_date: row.expiration_date,
            expiration_type: (row.expiration_type as ExpirationType) ?? 'dlc',
            product: product
              ? {
                  id: product.id,
                  name: product.name,
                  brand: product.brand,
                  category: product.category,
                  sub_category: product.sub_category ?? null,
                  default_unit: product.default_unit,
                  barcode: product.barcode ?? null,
                  shopping_hidden: !!product.shopping_hidden,
                  is_main: !!product.is_main,
                  kcal_100g: product.kcal_100g, 
                  kcal_serving: product.kcal_serving, 
                  serving_size_g: product.serving_size_g, 
                  grams_per_unit_g: product.grams_per_unit_g,
                  density_g_ml: product.density_g_ml,
                }
              : null,
          };
        });

        setStocks(normalized);
      }

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`id,name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`);

      if (productsError) {
        console.error(productsError);
        if (!stockError) setError('Impossible de charger les produits');
      } else {
        const normalizedProducts: Product[] = (productsData ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          sub_category: p.sub_category ?? null,
          default_unit: p.default_unit,
          barcode: p.barcode ?? null,
          shopping_hidden: !!p.shopping_hidden,
          is_main: !!p.is_main,
          kcal_100g: p.kcal_100g, 
          kcal_serving: p.kcal_serving, 
          serving_size_g: p.serving_size_g, 
          grams_per_unit_g: p.grams_per_unit_g,
          density_g_ml: p.density_g_ml,
        }));
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
      setError('Impossible de charger les recettes.');
      setRecipesLoading(false);
      return;
    }

    const normalized: Recipe[] = (data ?? []).map((r: any) => {
      const ingredients: RecipeIngredient[] = (r.recipe_ingredients ?? [])
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((x: any) => ({
          name: String(x.ingredient),
          amount: x.amount ?? null,
          unit: (x.unit as IngredientUnit) ?? null,
        }));

      return {
        id: r.id,
        name: r.name,
        kind: r.kind as RecipeKind,
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

  const createRecipeInDb = async () => {
    const recipeName = newRecipeName.trim();
    if (!recipeName) return;

    const ingredients = parseRecipeIngredients(newRecipeIngredients);
    if (ingredients.length === 0) return;

    setError(null);

    // 1) create recipe
    const { data: recipeRow, error: recipeErr } = await supabase
      .from('recipes')
      .insert({ name: recipeName, kind: newRecipeKind })
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
      kind: recipeRow.kind,
      ingredients,
      servings: recipeRow.servings ?? null,
    }, ...prev]);
    setNewRecipeName('');
    setNewRecipeIngredients('');
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
  };

  // ---------- Toggle main ----------
  const handleToggleMain = async (productId: string, currentValue: boolean) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ is_main: !currentValue })
        .eq('id', productId)
        .select(`id,name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`)
        .single();

      if (error || !data) throw error || new Error('Erreur mise à jour produit');

      const updated: Product = {
        id: data.id,
        name: data.name,
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

  // ---------- Add stock ----------
  const handleAdd = async (e: FormEvent) => {
  e.preventDefault();
  setError(null);

  if (!name.trim()) {
    setError('Le nom du produit est obligatoire');
    return;
  }

  try {
    // 1) find/create product by barcode
    let productRow: any | null = null;
    const trimmedBarcode = barcode.trim();

    if (trimmedBarcode) {
      const { data: existingProducts, error: existingProductError } = await supabase
        .from('products')
        .select(`id,name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`)
        .eq('barcode', trimmedBarcode)
        .limit(1);

      if (existingProductError) throw existingProductError;
      if (existingProducts && existingProducts.length > 0) productRow = existingProducts[0];
    }

    if (!productRow) {
      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert({
          name: name.trim(),
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
        .select(`id,name,brand,category,sub_category,default_unit,barcode,shopping_hidden,is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml`)
        .single();

      if (productError || !productData) throw productError || new Error('Erreur création produit');
      productRow = productData;
    }

    const normalizedProduct: Product = {
      id: productRow.id,
      name: productRow.name,
      brand: productRow.brand,
      category: productRow.category,
      sub_category: productRow.sub_category ?? null,
      default_unit: productRow.default_unit,
      barcode: productRow.barcode ?? null,
      shopping_hidden: !!productRow.shopping_hidden,
      is_main: !!productRow.is_main,
      kcal_100g: productRow.kcal_100g, 
      kcal_serving: productRow.kcal_serving, 
      serving_size_g: productRow.serving_size_g, 
      grams_per_unit_g: productRow.grams_per_unit_g,
      density_g_ml: productRow.density_g_ml,
    };

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
      .select(`id,place,quantity,unit,expiration_date,expiration_type`)
      .eq('product_id', productId)
      .eq('place', trimmedPlace)
      .eq('unit', trimmedUnit);

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

    let finalStockRow: any;

    if (existing) {
      const newQuantity = (existing.quantity ?? 0) + qtyToAdd;

      const { data: updatedStock, error: updateError } = await supabase
        .from('stocks')
        .update({ quantity: newQuantity })
        .eq('id', existing.id)
        .select(
          `
          id, place, quantity, unit, expiration_date, expiration_type,
          product:products (
            id, name, brand, category, sub_category, default_unit, barcode,shopping_hidden, is_main,kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml
          )
        `,
        )
        .single();

      if (updateError || !updatedStock) throw updateError || new Error('Erreur mise à jour stock');
      finalStockRow = updatedStock;
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
        })
        .select(
          `
          id, place, quantity, unit, expiration_date, expiration_type,
          product:products (
            id, name, brand, category, sub_category, default_unit, barcode,shopping_hidden, is_main, kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml
          )
        `,
        )
        .single();

      if (stockError || !stockData) throw stockError || new Error('Erreur création stock');
      finalStockRow = stockData;
    }

    const prodArray = (finalStockRow as any).product;
    const product = Array.isArray(prodArray) ? prodArray[0] : prodArray;

    const newItem: StockItem = {
      id: finalStockRow.id,
      place: finalStockRow.place,
      quantity: finalStockRow.quantity,
      unit: finalStockRow.unit,
      expiration_date: finalStockRow.expiration_date,
      expiration_type: (finalStockRow.expiration_type as ExpirationType) ?? 'dlc',
      product: product
      ? {
          id: product.id,
          name: product.name,
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
        }
      : null,
    };

    setStocks((prev) => {
      const index = prev.findIndex((s) => s.id === newItem.id);
      if (index === -1) return [...prev, newItem];
      const copy = [...prev];
      copy[index] = newItem;
      return copy;
    });

    // reset form
    setName('');
    setBrand('');
    setCategory('');
    setEditSubCategory('');
    setQuantity('1');
    setUnit('unité');
    setExpiration('');
    setExpirationType('dlc');
    setBarcode('');
    setSubCategory('');
    setKcal100g('');
    setGramsPerUnit('');
    setDensityGml('');
  } catch (err) {
    console.error(err);
    setError("Erreur lors de l'ajout du produit");
  }
};

  // ---------- Shopping helpers ----------
  const recipeKindToCategory = (kind: RecipeKind) => (kind === 'sweet' ? 'Produit sucré' : 'Produit salé');

  const findExistingProductForKeyword = (keyword: string) => {
    const key = normalizeText(keyword);
    return products.find((p) => {
      const pn = normalizeText(p.name);
      return pn === key || pn.includes(key) || key.includes(pn);
    });
  };

  const ensureProductExistsForShopping = async (keyword: string, kind: RecipeKind) => {
    const local = findExistingProductForKeyword(keyword);
    if (local) return { product: local, created: false };

    const category = recipeKindToCategory(kind);

    const { data: created, error: createError } = await supabase
      .from('products')
      .insert({
        name: keyword,
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
      .select('id, name, brand, category, sub_category, default_unit, barcode, shopping_hidden, is_main, kcal_100g, kcal_serving, serving_size_g, grams_per_unit_g, density_g_ml')
      .single();

    if (createError || !created) throw createError || new Error('Erreur création produit');

    const normalized: Product = {
      id: created.id,
      name: created.name,
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
          ? '✅ Ingrédients déjà présents dans tes produits connus. Va voir ta liste de courses.'
          : `✅ Ajouté ${createdCount} ingrédient(s) à ta liste de courses.`,
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

  const updateStock = async (stockId: string, patch: Partial<Pick<StockItem, 'quantity' | 'unit' | 'place' | 'expiration_date' | 'expiration_type'>>) => {
  setError(null);

  const { data, error } = await supabase
    .from('stocks')
    .update(patch)
    .eq('id', stockId)
    .select('id, place, quantity, unit, expiration_date, expiration_type')
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

async function decrementStockForMeal(meal: WeekMeal): Promise<{ decremented: string[]; missing: string[] }> {
  if (!meal.ingredients || meal.ingredients.length === 0) {
    return { decremented: [], missing: [] };
  }

  const decrementedProducts: string[] = [];
  const missingIngredients: string[] = [];
  const usedStockIds = new Set<string>();

  for (const ingredient of meal.ingredients) {
    const key = normalizeText(ingredient);
    if (!key) continue;

    const candidates = stocks
      .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name && !usedStockIds.has(s.id))
      .filter((s) => {
        const productName = normalizeText(s.product!.name);
        return productName.includes(key) || key.includes(productName);
      })
      .sort((a, b) => {
        const statusA = getExpirationStatus(a.expiration_date, settings.soonDays);
        const statusB = getExpirationStatus(b.expiration_date, settings.soonDays);

        const score = (status: ExpirationStatus) =>
          status === 'expired' ? 0 : status === 'soon' ? 1 : 2;

        if (score(statusA) !== score(statusB)) return score(statusA) - score(statusB);

        return (a.expiration_date ?? '9999-12-31').localeCompare(b.expiration_date ?? '9999-12-31');
      });

    const stock = candidates[0];
    if (!stock) {
      missingIngredients.push(ingredient);
      continue;
    }

    usedStockIds.add(stock.id);

    const current = stock.quantity ?? 0;
    const step = stepForUnit(stock.unit);
    const next = Math.max(0, roundQty(current - step, stock.unit));

    const updated = await updateStock(stock.id, { quantity: next });
    if (updated) {
      decrementedProducts.push(stock.product?.name ?? ingredient);
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

const lowStockList = inStock
  .filter((item) => (item.quantity ?? 0) <= stepForUnit(item.unit))
  .sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''));


const priorityList = inStock
  .filter((item) => {
    const status = getExpirationStatus(item.expiration_date, settings.soonDays);
    return status === 'expired' || status === 'soon';
  })
  .sort((a, b) => {
    const statusA = getExpirationStatus(a.expiration_date, settings.soonDays);
    const statusB = getExpirationStatus(b.expiration_date, settings.soonDays);

    if (statusA !== statusB) return statusA === 'expired' ? -1 : 1;
    return (a.expiration_date ?? '').localeCompare(b.expiration_date ?? '');
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
  const groupedByCategory = MAIN_CATEGORIES.map((cat) => ({
    label: cat,
    items: outOfStock.filter((s) => s.product?.category === cat),
  }));

  return (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Anciens achats</h1>
          <p className="main-subtitle">
            Produits tombés à 0. Augmente la quantité pour les remettre au placard.
          </p>
        </div>
        <div className="main-header-right">
          <span className="tag">Historique</span>
        </div>
      </div>

      <section className="category-grid">
        {groupedByCategory.map(({ label, items }) => (
          <section key={label} className="card">
            <div className="category-head">
              <h2 className="section-title" style={{ margin: 0 }}>{label}</h2>
              <span className="category-count">{items.length}</span>
            </div>

            {items.length === 0 ? (
              <p className="muted" style={{ marginTop: '0.5rem' }}>Aucun élément.</p>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: 360 }}>
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Lieu</th>
                      <th>Quantité</th>
                      <th>Unité</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.product?.name ?? 'Produit'}</td>
                        <td>{item.place || '-'}</td>

                        <td>
                          <div className="qty-controls">
                            <button type="button" className="qty-btn" onClick={() => void changeQuantity(item, -1)}>−</button>
                            <span className="qty-value">{item.quantity ?? 0}</span>
                            <button type="button" className="qty-btn" onClick={() => void changeQuantity(item, +1)}>+</button>
                          </div>
                        </td>

                        <td>
                          <select
                            className="unit-select"
                            value={item.unit ?? 'unité'}
                            onChange={(e) => void changeUnit(item, e.target.value)}
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <button type="button" className="btn-tertiary" onClick={() => openEdit(item)}>✏️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </section>
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
  const allRecipes: Recipe[] = [...dbRecipes, ...SAMPLE_RECIPES];

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
      setPlanServings(String(existing.servings ?? 1));
      setPlanNotes(existing.notes ?? '');
    } else {
      setPlanRecipeValue('');
      setPlanCustomName('');
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

    const v = planRecipeValue;

    if (!v || v === 'custom') {
      recipe_name = planCustomName.trim();
      if (!recipe_name) {
        setError("Donne un nom au repas (ou choisis une recette).");
        return;
      }
    } else if (v.startsWith('db:')) {
      recipe_id = v.slice(3);
      const r = allRecipes.find((x) => x.id === recipe_id);
      recipe_name = r?.name ?? 'Recette';
      recipe_kind = r?.kind ?? null;
      ingredients = r?.ingredients ? r.ingredients.map((i) => i.name) : null;
    } else if (v.startsWith('sample:')) {
      const rid = v.slice(7);
      const r = allRecipes.find((x) => x.id === rid);
      recipe_name = r?.name ?? 'Recette';
      recipe_kind = r?.kind ?? null;
      ingredients = r?.ingredients ? r.ingredients.map((i) => i.name) : null;
      // pas de recipe_id en DB pour les samples => on stocke un snapshot
      recipe_id = null;
    }

    const servingsNum = Number(planServings);
    const servings = Number.isFinite(servingsNum) ? servingsNum : null;
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
      .map((s) => normalize(s.product!.name));

    const hasIngredient = (ingredient: string) => {
      const key = normalize(ingredient);
      return stockNames.some((n) => n.includes(key));
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
      setInfo("✅ Aucun ingrédient manquant détecté pour la semaine.");
      setActiveTab('shopping');
      return;
    }

    // on réutilise ta logique existante
    if (a.length > 0) await addMissingIngredientsToShopping(a, 'savory');
    if (b.length > 0) await addMissingIngredientsToShopping(b, 'sweet');
  };

  return (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Menu de la semaine</h1>
          <p className="main-subtitle">
            Planifie tes repas du lundi au dimanche (petit-déj / déjeuner / dîner).
          </p>
        </div>
        <div className="main-header-right">
          <span className="tag">Planning</span>
        </div>
      </div>

      <section className="card">
        <div className="week-controls">
          <button type="button" className="btn-tertiary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ← Semaine précédente
          </button>
          <button type="button" className="btn-tertiary" onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>
            Cette semaine
          </button>
          <button type="button" className="btn-tertiary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Semaine suivante →
          </button>

          <div style={{ flex: 1 }} />

          <button type="button" className="btn-secondary" onClick={() => void addWeekMissingToShopping()}>
            🛒 Ajouter ingrédients manquants
          </button>
        </div>

        {weekMealsLoading ? (
          <p className="muted" style={{ marginTop: '0.6rem' }}>Chargement…</p>
        ) : (
          <div className="week-grid">
            <div className="week-row week-row--head">
              <div className="week-cell week-cell--head">Repas</div>
              {days.map((d) => (
                <div key={toDateKey(d)} className="week-cell week-cell--head">
                  {d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </div>
              ))}
            </div>
            {MEAL_SLOTS.map((slot) => (
              <div key={slot.key} className="week-row">
                <div className="week-cell week-cell--slot">{slot.label}</div>

                {dayKeys.map((dk) => {
                  const cell = getCell(dk, slot.key);

                  return (
                    <div key={`${dk}-${slot.key}`} className="week-cell">
                      {!cell ? (
                        <button
                          type="button"
                          className="week-add"
                          onClick={() => openPlan(dk, slot.key)}
                        >
                          + Ajouter
                        </button>
                      ) : (
                        <div className="meal-mini">
                          <div className="meal-mini-title">{cell.recipe_name}</div>
                          {(() => {
                            const kcal = mealCalories(cell, dbRecipes, products);
                            return kcal != null ? <div className="meal-mini-meta">🔥 {kcal} kcal</div> : null;
                          })()}
                          <div className="meal-mini-meta">
                            {cell.servings ? `${cell.servings} pers.` : ''}
                            {cell.notes ? ` · ${cell.notes}` : ''}
                          </div>
                          <div className="meal-mini-actions">
                            {cell.consumed_at ? (
                              <span className="meal-consumed">Validé</span>
                            ) : (
                              <button type="button" className="btn-tertiary" onClick={() => void markWeekMealConsumed(cell)}>
                                Valider
                              </button>
                            )}
                            <button type="button" className="btn-tertiary" onClick={() => openPlan(dk, slot.key)}>
                              ✏️
                            </button>
                            <button type="button" className="btn-tertiary" onClick={() => void deleteWeekMeal(dk, slot.key)}>
                              🗑️
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </section>

      {/* Modal plan */}
      {planOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3 style={{ margin: 0 }}>
                Planifier — {planDate} · {MEAL_SLOTS.find((s) => s.key === planSlot)?.label}
              </h3>
              <button type="button" className="modal-close" onClick={() => setPlanOpen(false)}>✕</button>
            </div>

            <div className="field-group">
              <label className="field-label">Calories (optionnel)</label>
              <input
                className="field-input"
                value={planKcalOverride}
                onChange={(e) => setPlanKcalOverride(e.target.value)}
                placeholder="ex: 650"
              />
            </div>

            <div className="form-grid" style={{ marginTop: '0.6rem' }}>
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
                    {dbRecipes.map((r) => (
                      <option key={r.id} value={`db:${r.id}`}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="Recettes exemples">
                    {SAMPLE_RECIPES.map((r) => (
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
                <div className="field-group full">
                  <label className="field-label">Nom du repas</label>
                  <input
                    className="field-input"
                    value={planCustomName}
                    onChange={(e) => setPlanCustomName(e.target.value)}
                    placeholder="Ex : Restes / Sandwich / Pizza..."
                  />
                </div>
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
                Enregistrer
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
  setInfo("✅ Aliment retiré de la liste de courses.");
};

  // ---------- Tabs ----------
const renderStockTab = () => {
  const groupedByCategory = MAIN_CATEGORIES.map((cat) => ({
    label: cat,
    items: inStock.filter((s) => s.product?.category === cat),
  }));

  const renderRowsTable = (rows: StockItem[]) => (
    <div className="table-wrapper" style={{ maxHeight: 360 }}>
      <table className="stock-table">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Principal</th>
            <th>Lieu</th>
            <th>Quantité</th>
            <th>Unité</th>
            <th>Péremption</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((item) => {
            const expDate = item.expiration_date;
            const exp = expDate ? new Date(expDate).toLocaleDateString() : '-';
            const status = getExpirationStatus(expDate, settings.soonDays);
            const labelStatus = getExpirationLabel(status, item.expiration_type);
            const kcalInfo = kcalForStock(item);

            return (
              <tr key={item.id}>
                <td>
                  <div className="product-cell">
                    <span className="product-name">
                      {item.product?.name ?? 'Produit'}
                    </span>

                    {item.product?.brand && (
                      <span className="product-brand">{item.product.brand}</span>
                    )}

                    {kcalInfo.kcal != null && (
                      <span className="product-brand">
                        🔥 {kcalInfo.approx ? '≈ ' : ''}
                        {kcalInfo.kcal} kcal restantes
                      </span>
                    )}
                  </div>
                </td>

                <td>
                  {item.product ? (
                    <input
                      type="checkbox"
                      checked={item.product.is_main}
                      onChange={() =>
                        handleToggleMain(item.product!.id, item.product!.is_main)
                      }
                    />
                  ) : (
                    '-'
                  )}
                </td>

                <td>{item.place || '-'}</td>

                <td>
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
                </td>

                <td>
                  <select
                    className="unit-select"
                    value={item.unit ?? 'unité'}
                    onChange={(e) => void changeUnit(item, e.target.value)}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </td>

                <td>{exp}</td>

                <td>
                  <span className={`status-pill ${getExpirationClass(status, item.expiration_type)}`}>
                    <span className="status-dot" />
                    {labelStatus}
                  </span>
                </td>

                <td>
                  <button
                    type="button"
                    className="btn-tertiary"
                    onClick={() => openEdit(item)}
                    title="Modifier"
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderCategoryContent = (label: MainCategory, items: StockItem[]) => {
    if (items.length === 0) {
      return (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Aucun élément dans cette catégorie.
        </p>
      );
    }

    const subcats = getSubcatsFor(label);

    // pas de sous-catégories => table directe
    if (subcats.length === 0) return renderRowsTable(items);

    // sous-catégories => on n'affiche que celles qui ont au moins 1 produit
    const blocks = subcats
      .map((sc) => {
        const rows = items.filter((it) => (it.product?.sub_category ?? '') === sc);
        if (rows.length === 0) return null;

        return (
          <div key={sc} className="subcat-block">
            <h3 className="subcat-title">{sc}</h3>
            {renderRowsTable(rows)}
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
          {renderRowsTable(others)}
        </div>,
      );
    }

    return <>{blocks}</>;
  };

  return (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Placards & frigo</h1>
          <p className="main-subtitle">
            Inventaire détaillé rangé par grandes catégories.
          </p>
        </div>
        <div className="main-header-right">
          <span className="tag">Inventaire</span>
        </div>
      </div>

      {loading ? (
        <section className="card">
          <p>Chargement...</p>
        </section>
      ) : inStock.length === 0 ? (
        <section className="card">
          <p className="muted">Aucun produit en stock pour l’instant.</p>
        </section>
      ) : (
        <section className="category-grid">
          {groupedByCategory.map(({ label, items }) => (
            <section key={label} className="card">
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


    const renderDashboard = () => (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Tableau de bord</h1>
          <p className="main-subtitle">
            Vue d’ensemble + actions rapides : alertes péremption et ajout d’un produit.
          </p>
        </div>
        <div className="main-header-right">
          <span className="tag">Aperçu global</span>
        </div>
      </div>

      {/* Recap */}
      <section className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Articles en stock</div>
          <div className="stat-value">{totalItems}</div>
          <div className="stat-foot">Tous lieux confondus</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">À consommer bientôt</div>
          <div className="stat-value accent">{soonItems}</div>
          <div className="stat-foot">Sur les {settings.soonDays} prochains jours</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Périmés</div>
          <div className="stat-value danger">{expiredItems}</div>
          <div className="stat-foot">À vérifier rapidement</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Calories aujourd'hui</div>
          <div className="stat-value">{todayCalories}</div>
          <div className="stat-foot">Repas validés aujourd'hui</div>
        </div>
      </section>

      <section className="card card-soft">
        <h2 className="section-title">À consommer en priorité</h2>
        <p className="section-subtitle">Les produits les plus urgents à utiliser.</p>

        {priorityList.length === 0 ? (
          <p className="muted">Aucune urgence pour le moment.</p>
        ) : (
          <ul className="priority-list">
            {priorityList.map((item) => {
              const status = getExpirationStatus(item.expiration_date, settings.soonDays);
              const labelStatus = getExpirationLabel(status, item.expiration_type);

              return (
                <li key={item.id} className="priority-item">
                  <div className="priority-product">
                    <span className="priority-title">{item.product?.name ?? 'Produit'}</span>
                    <span className="priority-meta">
                      {item.place || 'Lieu non précisé'} · {item.quantity ?? 0} {item.unit ?? 'unité'}
                    </span>
                  </div>

                  <span className={`status-pill ${getExpirationClass(status, item.expiration_type)}`}>
                    <span className="status-dot" />
                    {labelStatus}
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
            <p className="muted">Rien à signaler ✅</p>
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

          {expiredList.length === 0 ? (
            <p className="muted">Aucun produit périmé ✅</p>
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

          {ddmExceededList.length === 0 ? (
            <p className="muted">Aucune DDM dépassée ✅</p>
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

        {todayMeals.every(({ meal }) => !meal) ? (
          <p className="muted">Aucun repas planifié aujourd'hui.</p>
        ) : (
          <ul className="dashboard-meal-list">
            {todayMeals.map(({ slot, meal }) => (
              <li key={slot.key} className="dashboard-meal-item">
                <span className="dashboard-meal-slot">{slot.label}</span>
                <span className="dashboard-meal-name">{meal?.recipe_name ?? '-'}</span>
                {meal?.consumed_at && <span className="dashboard-meal-status">Validé</span>}
                {meal && (() => {
                  const kcal = mealCalories(meal, dbRecipes, products);
                  return kcal != null ? (
                    <span className="dashboard-meal-kcal">{kcal} kcal</span>
                  ) : null;
                })()}
              </li>
            ))}
          </ul>
        )}
      </section>
      
      <section className="card">
        <h2 className="section-title">Stock faible</h2>
        <p className="section-subtitle">Produits à racheter ou surveiller.</p>

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
      <section className="card">
        <h2 className="section-title">Ajouter un produit</h2>
        <p className="section-subtitle">
          Ajout rapide depuis le tableau de bord (scanner + auto-remplissage OpenFoodFacts).
        </p>

        <form className="form-grid" onSubmit={handleAdd}>
          <div className="field-group full">
            <label className="field-label">Nom du produit *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field-input"
              placeholder="Pâtes, lait, riz..."
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
              <button type="button" className="btn-secondary" onClick={() => setShowScanner(true)}>
                📷 Scanner
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
              placeholder="Placard, frigo, congélateur..."
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

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              Ajouter au stock
            </button>
          </div>

          {autoFillLoading && (
            <p className="error-text" style={{ color: '#4b5563' }}>
              Recherche des informations du produit…
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>
    </>
  );


  const renderShoppingTab = () => {
    const lowStockProductIds = new Set(
      lowStockList.filter((s) => s.product?.id).map((s) => s.product!.id),
    );

    const plannedMissingNames = new Set<string>();

    for (const meal of weekMeals) {
      if (!meal.ingredients || meal.consumed_at) continue;

      for (const ingredient of meal.ingredients) {
        const key = normalizeText(ingredient);

        const hasStock = stocks.some((stock) => {
          if ((stock.quantity ?? 0) <= 0 || !stock.product?.name) return false;
          const productName = normalizeText(stock.product.name);
          return productName.includes(key) || key.includes(productName);
        });

        if (!hasStock) plannedMissingNames.add(key);
      }
    }

    const lowStockByProductId = new Map(
      lowStockList
        .filter((s) => s.product?.id)
        .map((s) => [s.product!.id, s]),
    );

    const plannedMissingProductIds = new Set(
      products
        .filter((product) => plannedMissingNames.has(normalizeText(product.name)))
        .map((product) => product.id),
    );

    const presentProductIds = new Set(
      inStock
        .filter((s) => s.product?.id && !lowStockProductIds.has(s.product.id))
        .map((s) => s.product!.id),
    );

    const missingMain = products.filter((p) => p.is_main && !p.shopping_hidden && !presentProductIds.has(p.id));
    const missingOthers = products.filter((p) => !p.is_main && !p.shopping_hidden && !presentProductIds.has(p.id));
    const currentList = shoppingSubTab === 'main' ? missingMain : missingOthers;

    const getShoppingReason = (product: Product) => {
      const isLowStock = lowStockByProductId.has(product.id);
      const isPlannedMissing = plannedMissingProductIds.has(product.id);

      if (isLowStock) return 'Stock faible';
      if (isPlannedMissing) return 'Repas planifié';
      return 'Absent';
    };

    const getShoppingReasonPriority = (product: Product) => {
      const reason = getShoppingReason(product);

      if (reason === 'Stock faible') return 0;
      if (reason === 'Repas planifié') return 1;
      return 2;
    };

    const sortedCurrentList = [...currentList].sort(
      (a, b) =>
        getShoppingReasonPriority(a) - getShoppingReasonPriority(b) ||
        a.name.localeCompare(b.name),
    );

    const title = shoppingSubTab === 'main' ? 'Aliments principaux manquants' : 'Autres aliments manquants';
    const subtitle =
      shoppingSubTab === 'main'
        ? 'Les aliments importants absents ou bientôt à racheter.'
        : 'Les aliments connus absents ou bientôt à racheter.';

    const grouped: { [key: string]: Product[] } = {};
    for (const p of sortedCurrentList) {
      const cat = (p.category && MAIN_CATEGORIES.includes(p.category as MainCategory) ? p.category : 'Autres') || 'Autres';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }

    const categoryOrder: (string | MainCategory)[] = [...MAIN_CATEGORIES, 'Autres'];

    return (
      <>
        <div className="main-header">
          <div>
            <h1 className="main-title">Listes de courses</h1>
            <p className="main-subtitle">Ta liste auto en fonction de ce qui manque dans tes placards.</p>
          </div>
          <div className="main-header-right">
            <span className="tag">Basée sur ton stock</span>
          </div>
        </div>

        <section className="card">
          <div className="subtabs">
            <button
              type="button"
              className={'subtab-btn' + (shoppingSubTab === 'main' ? ' subtab-btn--active' : '')}
              onClick={() => setShoppingSubTab('main')}
            >
              ⭐ Aliments principaux
            </button>
            <button
              type="button"
              className={'subtab-btn' + (shoppingSubTab === 'others' ? ' subtab-btn--active' : '')}
              onClick={() => setShoppingSubTab('others')}
            >
              Autres aliments
            </button>
          </div>

          <h2 className="section-title" style={{ marginTop: '0.6rem' }}>
            {title}
          </h2>
          <p className="section-subtitle">{subtitle}</p>

          {info && <p className="info-text">{info}</p>}

          {currentList.length === 0 ? (
            <p className="muted">Tout est à jour ✅</p>
          ) : (
            categoryOrder.map((cat) => {
              const items = grouped[cat];
              if (!items || items.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: '0.9rem' }}>
                  <h3 className="shopping-group-title">{cat}</h3>
                  <ul className="shopping-list">
                    {items.map((p) => {
                      const reason = getShoppingReason(p);
                      return (
                        <li key={p.id} className="shopping-list-item">
                          <span className="shopping-product-name">{p.name}</span>
                          {p.brand && <span className="shopping-product-brand">{p.brand}</span>}
                          <span className="shopping-product-reason">{reason}</span>
                          <button
                            type="button"
                            className="btn-tertiary"
                            onClick={() => void hideFromShopping(p.id)}
                            title="Retirer de la liste"
                          >
                            🗑️
                          </button>
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

  const renderSettingsTab = () => (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Réglages</h1>
          <p className="main-subtitle">Personnalise les seuils d’alerte, règles recettes et valeurs par défaut.</p>
        </div>
        <div className="main-header-right">
          <span className="tag">Sauvegarde locale</span>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title">Péremption</h2>
        <p className="section-subtitle">À partir de combien de jours : “à consommer bientôt”.</p>

        <div className="form-grid">
          <div className="field-group">
            <label className="field-label">Seuil “bientôt” (jours)</label>
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
        </div>
      </section>

      <section className="card" style={{ marginTop: '0.9rem' }}>
        <h2 className="section-title">Recettes</h2>
        <p className="section-subtitle">Recette “faisable” si ≤ X ingrédients manquants.</p>

        <div className="form-grid">
          <div className="field-group">
            <label className="field-label">Max ingrédients manquants</label>
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
        </div>
      </section>

      <section className="card" style={{ marginTop: '0.9rem' }}>
        <h2 className="section-title">Placards</h2>
        <p className="section-subtitle">Valeurs par défaut lors de l’ajout d’un produit.</p>

        <div className="form-grid">
          <div className="field-group full">
            <label className="field-label">Lieu par défaut</label>
            <input
              value={settings.defaultPlace}
              onChange={(e) => {
                setSettings((prev) => ({ ...prev, defaultPlace: e.target.value }));
                setSettingsInfo(null);
              }}
              className="field-input"
              placeholder="Placard, Frigo, Congélateur..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => setSettingsInfo('✅ Réglages enregistrés.')}>
            Enregistrer
          </button>
        </div>

        {settingsInfo && <p className="info-text">{settingsInfo}</p>}
      </section>
    </>
  );

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

    const stockNames = stocks
      .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name)
      .map((s) => normalize(s.product!.name));

    const hasIngredient = (ingredient: string) => {
      const key = normalize(ingredient);
      return stockNames.some((n) => n.includes(key));
    };

    const usesUrgentIngredient = (ingredient: string) => {
      const key = normalize(ingredient);
      return urgentStockNames.some((n) => n.includes(key));
    };

    const urgentStockNames = stocks
      .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name)
      .filter((s) => {
        const status = getExpirationStatus(s.expiration_date, settings.soonDays);
        return status === 'soon' || status === 'expired';
      })
      .map((s) => normalize(s.product!.name));

    // ✅ IMPORTANT : recettes DB + catalogue d'exemples
    const allRecipes: Recipe[] = [...dbRecipes, ...SAMPLE_RECIPES];

    const enriched = allRecipes.map((r) => {
      const missing = r.ingredients
        .filter((ing: RecipeIngredient) => !hasIngredient(ing.name))
        .map((ing: RecipeIngredient) => ing.name);

      const urgentIngredients = r.ingredients
        .filter((ing: RecipeIngredient) => hasIngredient(ing.name) && usesUrgentIngredient(ing.name))
        .map((ing: RecipeIngredient) => ing.name);

      const missingCount = missing.length;
      const urgentCount = urgentIngredients.length;
      const feasible = missingCount <= settings.recipesMaxMissing;

      return { ...r, missing, missingCount, urgentIngredients, urgentCount, feasible };
    });

    const feasibleList = enriched
      .filter((r) => r.feasible)
      .sort((a, b) => b.urgentCount - a.urgentCount || a.missingCount - b.missingCount);
    const current = recipesSubTab === 'feasible' ? feasibleList : enriched;

    const savory = current.filter((r) => r.kind === 'savory');
    const sweet = current.filter((r) => r.kind === 'sweet');

    const headerTitle =
      recipesSubTab === 'feasible'
        ? `Recettes faisables (≤ ${settings.recipesMaxMissing} ingrédients manquants)`
        : 'Recettes en général';

    const headerSubtitle =
      recipesSubTab === 'feasible'
        ? `Basé sur ton stock actuel. On accepte jusqu’à ${settings.recipesMaxMissing} ingrédients manquants.`
        : 'Catalogue de recettes (exemples) séparées en sucré / salé.';

    const renderRecipeCard = (r: any) => {
      const badge =
        r.urgentCount > 0
          ? `${r.urgentCount} urgent(s) · ${r.missingCount} manquant(s)`
          : `${r.missingCount} manquant(s)`;
      const isDbRecipe = dbRecipes.some((x) => x.id === r.id); // permet d'afficher "supprimer" seulement sur DB
      const kcalR = kcalForRecipe(r, products);
      return (
        <div key={r.id} className="recipe-card">
          <div className="recipe-head">
            <h3 className="recipe-title">{r.name}</h3>

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {recipesSubTab === 'feasible' && <span className="recipe-badge">{badge}</span>}

              {isDbRecipe && (
                <button
                  type="button"
                  className="recipe-delete-btn"
                  onClick={() => void deleteRecipeInDb(r.id)}
                  title="Supprimer cette recette"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
          
          <div className="recipe-actions">
            <button
              type="button"
              className="recipe-add-btn"
              onClick={() => openPlanFromRecipe(r)}
            >
              Planifier
            </button>
          </div>

          {r.urgentIngredients.length > 0 && (
            <p className="recipe-urgent">
              À utiliser vite : {r.urgentIngredients.join(', ')}
            </p>
          )}

          <p className="recipe-subtitle">Ingrédients :</p>
          <ul className="recipe-list">
            {r.ingredients.map((ing: RecipeIngredient) => {
              const ok = hasIngredient(ing.name);
              return (
                <li key={`${r.id}-${ing.name}`} className={ok ? 'ing-ok' : 'ing-missing'}>
                  {ok ? '✅ ' : '❌ '}
                  {ing.name}
                  {ing.amount != null && ing.unit ? ` — ${ing.amount} ${ing.unit}` : ''}
                </li>
              );
            })}
          </ul>
          
          <div className="recipe-meta">
            🔥 {kcalR.approx ? '≈ ' : ''}{kcalR.kcal} kcal
            {kcalR.missingCount > 0 ? ` · (${kcalR.missingCount} ingrédient(s) non calculés)` : ''}
          </div>
          {recipesSubTab === 'feasible' && r.missingCount > 0 && (
            <div className="recipe-actions">
              <button
                type="button"
                className="recipe-add-btn"
                onClick={() => void addMissingIngredientsToShopping(r.missing, r.kind)}
              >
                ➕ Ajouter les ingrédients manquants à la liste de courses
              </button>
            </div>
          )}
        </div>
      );
    };

    return (
      <>
        <div className="main-header">
          <div>
            <h1 className="main-title">Recettes</h1>
            <p className="main-subtitle">{headerSubtitle}</p>
          </div>
          <div className="main-header-right">
            <span className="tag">Prototype</span>
          </div>
        </div>

        {/* ✅ Formulaire : Ajouter une recette (DB) */}
        <section className="card" style={{ marginBottom: '0.9rem' }}>
          <h2 className="section-title">Ajouter une recette</h2>
          <p className="section-subtitle">Sépare les ingrédients par des virgules (ex : oeuf, farine, lait).</p>

          <div className="form-grid">
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

            <div className="field-group full">
              <label className="field-label">Ingrédients (virgules)</label>
              <input
                className="field-input"
                placeholder="oeuf, fromage, huile..."
                value={newRecipeIngredients}
                onChange={(e) => setNewRecipeIngredients(e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={() => void createRecipeInDb()}>
              Ajouter la recette
            </button>
          </div>
        </section>

        <section className="card">
          <div className="subtabs">
            <button
              type="button"
              className={'subtab-btn' + (recipesSubTab === 'feasible' ? ' subtab-btn--active' : '')}
              onClick={() => setRecipesSubTab('feasible')}
            >
              ✅ Faisables
            </button>
            <button
              type="button"
              className={'subtab-btn' + (recipesSubTab === 'all' ? ' subtab-btn--active' : '')}
              onClick={() => setRecipesSubTab('all')}
            >
              📚 Toutes
            </button>
          </div>

          <h2 className="section-title" style={{ marginTop: '0.7rem' }}>
            {headerTitle}
          </h2>

          <div className="recipe-section">
            <h3 className="recipe-section-title">🥘 Salé</h3>
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
            <h3 className="recipe-section-title">🍰 Sucré</h3>
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
    <div className="app-root">
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}
      {editOpen && editTarget && (
  <div className="modal-backdrop">
    <div className="modal-card">
      <div className="modal-head">
        <h3 style={{ margin: 0 }}>Modifier un produit</h3>
        <button type="button" className="modal-close" onClick={() => setEditOpen(false)}>
          ✕
        </button>
      </div>

      <div className="form-grid" style={{ marginTop: '0.5rem' }}>
        <div className="field-group full">
          <label className="field-label">Nom</label>
          <input className="field-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>

        <div className="field-group">
          <label className="field-label">Marque</label>
          <input className="field-input" value={editBrand} onChange={(e) => setEditBrand(e.target.value)} />
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

        <div className="field-group">
          <label className="field-label">Lieu</label>
          <input className="field-input" value={editPlace} onChange={(e) => setEditPlace(e.target.value)} />
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
          <label className="field-label">Date de péremption (optionnelle)</label>
          <input
            type="date"
            className="field-input"
            value={editExpiration}
            onChange={(e) => setEditExpiration(e.target.value)}
          />
          <button type="button" className="btn-tertiary" onClick={() => setEditExpiration('')}>
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

        <div className="field-group full">
          <label className="field-label">Code-barres</label>
          <input className="field-input" value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} />
        </div>
      </div>

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
            <div className="sidebar-logo">🥫</div>
            <div>
              <div className="sidebar-title">PantryPilot</div>
              <div className="sidebar-subtitle">Tes placards, en automatique</div>
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
                <span className="sidebar-item-icon">{item.icon}</span>
                <span className="sidebar-item-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-box">
              <div className="sidebar-footer-title">Roadmap</div>
              <div className="sidebar-footer-text">
                À venir : suggestions de recettes, partage de foyer…
              </div>
            </div>
          </div>
        </aside>

        <main className="main">{mainContent}</main>
      </div>
    </div>
  );
}

export default App;
