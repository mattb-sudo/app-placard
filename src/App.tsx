import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { supabase } from './supabaseClient';
import { BarcodeScanner } from './BarcodeScanner';
import './App.css';

type Tab = 'dashboard' | 'stock' | 'shopping' | 'recipes' | 'settings';

type ExpirationStatus = 'ok' | 'soon' | 'expired';

const MAIN_CATEGORIES = [
  'Produit de santé',
  'Produit sucré',
  'Produit salé',
  'Produit ménager',
  'Épices',
] as const;

type MainCategory = (typeof MAIN_CATEGORIES)[number];

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  default_unit: string | null;
  barcode: string | null;
  is_main: boolean;
};

type StockItem = {
  id: string;
  place: string | null;
  quantity: number | null;
  unit: string | null;
  expiration_date: string | null;
  product: Product | null;
};

type RecipeKind = 'savory' | 'sweet';

type Recipe = {
  id: string;
  name: string;
  kind: RecipeKind;          // 'savory' ou 'sweet'
  ingredients: string[];     // mots-clés (simples) pour faire du matching
  tags?: string[];           // optionnel
};

type Settings = {
  soonDays: number; // nb de jours avant péremption => "bientôt"
  recipesMaxMissing: number; // nb max d'ingrédients manquants
  defaultPlace: string; // lieu par défaut
};

const DEFAULT_SETTINGS: Settings = {
  soonDays: 7,
  recipesMaxMissing: 2,
  defaultPlace: 'Placard',
};

const SETTINGS_STORAGE_KEY = 'pantrypilot_settings_v1';


const SAMPLE_RECIPES: Recipe[] = [
  // SALÉ (5)
  {
    id: 'omelette-fromage',
    name: 'Omelette au fromage',
    kind: 'savory',
    ingredients: ['oeuf', 'fromage', 'huile', 'sel', 'poivre'],
    tags: ['rapide'],
  },
  {
    id: 'pates-tomate',
    name: 'Pâtes sauce tomate',
    kind: 'savory',
    ingredients: ['pates', 'tomate', 'ail', 'huile', 'sel'],
    tags: ['classique'],
  },
  {
    id: 'riz-legumes-saute',
    name: 'Riz aux légumes sautés',
    kind: 'savory',
    ingredients: ['riz', 'legume', 'huile', 'ail', 'sauce soja'],
    tags: ['wok'],
  },
  {
    id: 'salade-thon-mais',
    name: 'Salade thon & maïs',
    kind: 'savory',
    ingredients: ['salade', 'thon', 'mais', 'huile', 'vinaigre'],
    tags: ['frais'],
  },
  {
    id: 'soupe-lentilles',
    name: 'Soupe de lentilles',
    kind: 'savory',
    ingredients: ['lentille', 'carotte', 'oignon', 'bouillon', 'ail'],
    tags: ['batch cooking'],
  },

  // SUCRÉ (5)
  {
    id: 'pancakes',
    name: 'Pancakes',
    kind: 'sweet',
    ingredients: ['farine', 'oeuf', 'lait', 'sucre', 'levure'],
    tags: ['petit dej'],
  },
  {
    id: 'bol-yaourt-fruits',
    name: 'Bol yaourt, fruits & granola',
    kind: 'sweet',
    ingredients: ['yaourt', 'fruit', 'granola', 'miel'],
    tags: ['frais'],
  },
  {
    id: 'mug-cake-choco',
    name: 'Mug cake chocolat',
    kind: 'sweet',
    ingredients: ['farine', 'oeuf', 'lait', 'sucre', 'chocolat'],
    tags: ['rapide'],
  },
  {
    id: 'compote-pomme-cannelle',
    name: 'Compote pomme cannelle',
    kind: 'sweet',
    ingredients: ['pomme', 'sucre', 'cannelle', 'citron'],
    tags: ['léger'],
  },
  {
    id: 'cookies-choco',
    name: 'Cookies chocolat',
    kind: 'sweet',
    ingredients: ['farine', 'sucre', 'beurre', 'oeuf', 'chocolat'],
    tags: ['gourmand'],
  },
];


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


function getExpirationLabel(status: ExpirationStatus): string {
  if (status === 'expired') return 'Périmé';
  if (status === 'soon') return 'À consommer bientôt';
  return 'OK';
}

// Mapping très simple des catégories Open Food Facts vers tes 5 grandes catégories
function mapOffCategoryToMainCategory(offCat: string): MainCategory {
  const c = offCat.toLowerCase();

  if (c.includes('épice') || c.includes('herbes') || c.includes('spice')) {
    return 'Épices';
  }
  if (
    c.includes('ménager') ||
    c.includes('entretien') ||
    c.includes('nettoy') ||
    c.includes('lessive')
  ) {
    return 'Produit ménager';
  }
  if (
    c.includes('sucr') ||
    c.includes('dessert') ||
    c.includes('chocolat') ||
    c.includes('biscuit') ||
    c.includes('gâteau')
  ) {
    return 'Produit sucré';
  }
  if (
    c.includes('complément') ||
    c.includes('vitamine') ||
    c.includes('santé') ||
    c.includes('médicament')
  ) {
    return 'Produit de santé';
  }

  // Par défaut : salé
  return 'Produit salé';
}

const navItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: '✨' },
  { key: 'stock', label: 'Placards & frigo', icon: '🧺' },
  { key: 'shopping', label: 'Listes de courses', icon: '🛒' },
  { key: 'recipes', label: 'Recettes', icon: '🍽️' },
  { key: 'settings', label: 'Réglages', icon: '⚙️' },
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

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('stock');
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shoppingSubTab, setShoppingSubTab] = useState<'main' | 'others'>(
    'main',
  );
  const [recipesSubTab, setRecipesSubTab] = useState<'feasible' | 'all'>('feasible');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Champs du formulaire (onglet stock)
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<MainCategory | ''>('');
  const [place, setPlace] = useState(DEFAULT_SETTINGS.defaultPlace);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('unité');
  const [expiration, setExpiration] = useState('');
  const [barcode, setBarcode] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);

  const autofillFromBarcode = async (code: string) => {
    if (!code) return;
    setAutoFillLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(
          code,
        )}.json`,
      );
      const json = await res.json();

      if (json.status !== 1) {
        setError(
          "Produit introuvable dans Open Food Facts, tu peux remplir les infos à la main.",
        );
        setAutoFillLoading(false);
        return;
      }

      const p = json.product;

      if (!name && p.product_name) {
        setName(p.product_name);
      }

      if (!brand && p.brands) {
        const firstBrand = String(p.brands).split(',')[0].trim();
        setBrand(firstBrand);
      }

      if (!category && p.categories) {
        const firstCategory = String(p.categories).split(',')[0].trim();
        const mapped = mapOffCategoryToMainCategory(firstCategory);
        setCategory(mapped);
      }
    } catch (e) {
      console.error(e);
      setError("Erreur lors de la récupération des informations produit.");
    } finally {
      setAutoFillLoading(false);
    }
  };

    const handleBarcodeDetected = (raw: string) => {
    const cleaned = cleanBarcode(raw);

    if (!cleaned) {
      setError("Scan illisible : aucun chiffre détecté. Réessaie en visant mieux le code-barres.");
      return; // on ne ferme pas forcément, ou tu peux garder ouvert
    }

    setBarcode(cleaned);
    setShowScanner(false);
    void autofillFromBarcode(cleaned);
  };

  useEffect(() => {
  setPlace(settings.defaultPlace);
}, [settings.defaultPlace]);

  // Charger stocks + produits au démarrage
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const {
        data: stockData,
        error: stockError,
      } = await supabase
        .from('stocks')
        .select(
          `
          id,
          place,
          quantity,
          unit,
          expiration_date,
          product:products (
            id,
            name,
            brand,
            category,
            default_unit,
            barcode,
            is_main
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
            product: product
              ? {
                  id: product.id,
                  name: product.name,
                  brand: product.brand,
                  category: product.category,
                  default_unit: product.default_unit,
                  barcode: product.barcode ?? null,
                  is_main: !!product.is_main,
                }
              : null,
          };
        });

        setStocks(normalized);
      }

      const {
        data: productsData,
        error: productsError,
      } = await supabase
        .from('products')
        .select(
          `
          id,
          name,
          brand,
          category,
          default_unit,
          barcode,
          is_main
        `,
        );

      if (productsError) {
        console.error(productsError);
        if (!stockError) {
          setError('Impossible de charger les produits');
        }
      } else {
        const normalizedProducts: Product[] = (productsData ?? []).map(
          (p: any) => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
            category: p.category,
            default_unit: p.default_unit,
            barcode: p.barcode ?? null,
            is_main: !!p.is_main,
          }),
        );
        setProducts(normalizedProducts);
      }

      setLoading(false);
    };

    void fetchData();
  }, []);

  useEffect(() => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as Partial<Settings>;
    setSettings((prev) => ({
      soonDays:
        typeof parsed.soonDays === 'number' ? parsed.soonDays : prev.soonDays,
      recipesMaxMissing:
        typeof parsed.recipesMaxMissing === 'number'
          ? parsed.recipesMaxMissing
          : prev.recipesMaxMissing,
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

  // Marquer / dé-marquer un produit comme "aliment principal"
  const handleToggleMain = async (productId: string, currentValue: boolean) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ is_main: !currentValue })
        .eq('id', productId)
        .select(
          `
          id,
          name,
          brand,
          category,
          default_unit,
          barcode,
          is_main
        `,
        )
        .single();

      if (error || !data) {
        throw error || new Error('Erreur mise à jour produit');
      }

      const updated: Product = {
        id: data.id,
        name: data.name,
        brand: data.brand,
        category: data.category,
        default_unit: data.default_unit,
        barcode: data.barcode ?? null,
        is_main: !!data.is_main,
      };

      // Mettre à jour la liste des produits
      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === updated.id);
        if (idx === -1) return [...prev, updated];
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });

      // Mettre à jour tous les stocks qui utilisent ce produit
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

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Le nom du produit est obligatoire');
      return;
    }

    try {
      // 1. Trouver ou créer le produit en fonction du code-barres
      let productRow: any | null = null;
      const trimmedBarcode = barcode.trim();

      if (trimmedBarcode) {
        const {
          data: existingProducts,
          error: existingProductError,
        } = await supabase
          .from('products')
          .select(
            `
            id,
            name,
            brand,
            category,
            default_unit,
            barcode,
            is_main
          `,
          )
          .eq('barcode', trimmedBarcode)
          .limit(1);

        if (existingProductError) {
          throw existingProductError;
        }

        if (existingProducts && existingProducts.length > 0) {
          productRow = existingProducts[0];
        }
      }

      if (!productRow) {
        const {
          data: productData,
          error: productError,
        } = await supabase
          .from('products')
          .insert({
            name: name.trim(),
            brand: brand.trim() || null,
            category: category ? category : null,
            default_unit: unit.trim() || null,
            barcode: trimmedBarcode || null,
            is_main: false,
          })
          .select(
            `
            id,
            name,
            brand,
            category,
            default_unit,
            barcode,
            is_main
          `,
          )
          .single();

        if (productError || !productData) {
          throw productError || new Error('Erreur création produit');
        }

        productRow = productData;
      }

      const normalizedProduct: Product = {
        id: productRow.id,
        name: productRow.name,
        brand: productRow.brand,
        category: productRow.category,
        default_unit: productRow.default_unit,
        barcode: productRow.barcode ?? null,
        is_main: !!productRow.is_main,
      };

      // Tenir à jour la liste des produits connus
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

      // 2. Vérifier s'il existe déjà une ligne de stock identique
      let stockQuery = supabase
        .from('stocks')
        .select(
          `
          id,
          place,
          quantity,
          unit,
          expiration_date
        `,
        )
        .eq('product_id', productId)
        .eq('place', trimmedPlace)
        .eq('unit', trimmedUnit);

      if (expiration) {
        stockQuery = stockQuery.eq('expiration_date', expiration);
      }

      const {
        data: existingStocks,
        error: existingStocksError,
      } = await stockQuery.limit(1);

      if (existingStocksError) {
        throw existingStocksError;
      }

      const existing = existingStocks && existingStocks[0];

      let finalStockRow: any;

      if (existing) {
        // 2a. Mise à jour de la quantité sur la ligne existante
        const newQuantity = (existing.quantity ?? 0) + qtyToAdd;

        const {
          data: updatedStock,
          error: updateError,
        } = await supabase
          .from('stocks')
          .update({
            quantity: newQuantity,
          })
          .eq('id', existing.id)
          .select(
            `
            id,
            place,
            quantity,
            unit,
            expiration_date,
            product:products (
              id,
              name,
              brand,
              category,
              default_unit,
              barcode,
              is_main
            )
          `,
          )
          .single();

        if (updateError || !updatedStock) {
          throw updateError || new Error('Erreur mise à jour stock');
        }

        finalStockRow = updatedStock;
      } else {
        // 2b. Création d'une nouvelle ligne de stock
        const {
          data: stockData,
          error: stockError,
        } = await supabase
          .from('stocks')
          .insert({
            product_id: productId,
            place: trimmedPlace || null,
            quantity: qtyToAdd,
            unit: trimmedUnit || null,
            expiration_date: expiration || null,
          })
          .select(
            `
            id,
            place,
            quantity,
            unit,
            expiration_date,
            product:products (
              id,
              name,
              brand,
              category,
              default_unit,
              barcode,
              is_main
            )
          `,
          )
          .single();

        if (stockError || !stockData) {
          throw stockError || new Error('Erreur création stock');
        }

        finalStockRow = stockData;
      }

      // 3. Normalisation pour le state React
      const prodArray = (finalStockRow as any).product;
      const product = Array.isArray(prodArray) ? prodArray[0] : prodArray;

      const newItem: StockItem = {
        id: (finalStockRow as any).id,
        place: (finalStockRow as any).place,
        quantity: (finalStockRow as any).quantity,
        unit: (finalStockRow as any).unit,
        expiration_date: (finalStockRow as any).expiration_date,
        product: product
          ? {
              id: product.id,
              name: product.name,
              brand: product.brand,
              category: product.category,
              default_unit: product.default_unit,
              barcode: product.barcode ?? null,
              is_main: !!product.is_main,
            }
          : null,
      };

      // 4. Mise à jour du state stocks
      setStocks((prev) => {
        const index = prev.findIndex((s) => s.id === newItem.id);
        if (index === -1) {
          return [...prev, newItem];
        }
        const copy = [...prev];
        copy[index] = newItem;
        return copy;
      });

      // 5. Reset du formulaire
      setName('');
      setBrand('');
      setCategory('');
      setQuantity('1');
      setUnit('unité');
      setExpiration('');
      setBarcode('');
    } catch (err: any) {
      console.error(err);
      setError("Erreur lors de l'ajout du produit");
    }
  };

  const totalItems = stocks.length;
  const soonItems = stocks.filter(
    (item) => getExpirationStatus(item.expiration_date, settings.soonDays) === 'soon',
  ).length;
  const expiredItems = stocks.filter(
    (item) => getExpirationStatus(item.expiration_date, settings.soonDays) === 'expired',
  ).length;

  const criticalItems = stocks.filter((item) => {
    const status = getExpirationStatus(item.expiration_date, settings.soonDays);
    return status === 'soon' || status === 'expired';
  });

  const renderStockTab = () => {
    const groupedByCategory = MAIN_CATEGORIES.map((cat) => ({
      label: cat,
      items: stocks.filter((s) => s.product?.category === cat),
    }));

    return (
      <>
        <div className="main-header">
          <div>
            <h1 className="main-title">Placards & frigo</h1>
            <p className="main-subtitle">
              Gère ton inventaire en temps réel : lieux, quantités, dates de péremption.
            </p>
          </div>
          <div className="main-header-right">
            <span className="tag">v0.1 – prototype</span>
          </div>
        </div>

        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Articles en stock</div>
            <div className="stat-value">{totalItems}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">À consommer bientôt</div>
            <div className="stat-value accent">{soonItems}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Périmés</div>
            <div className="stat-value danger">{expiredItems}</div>
          </div>
        </section>

        {criticalItems.length > 0 && (
          <section className="card card-soft">
            <h2 className="section-title">À consommer rapidement</h2>
            <p className="section-subtitle">
              Ces produits arrivent en fin de vie, pense à les utiliser dans tes prochains repas.
            </p>
            <div className="chips-row">
              {criticalItems.map((item) => (
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
          </section>
        )}

        <section className="inventory-grid">
          {/* Formulaire */}
          <div className="card">
            <h2 className="section-title">Ajouter un produit</h2>
            <p className="section-subtitle">
              Renseigne ce que tu viens de ranger dans tes placards, ton frigo ou ton congélateur.
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
                  Code-barres{' '}
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    (optionnel)
                  </span>
                </label>
                <div className="field-row">
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="field-input"
                    placeholder="Ex : 3017624010701"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowScanner(true)}
                  >
                    📷 Scanner
                  </button>
                </div>
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
                  onChange={(e) =>
                    setCategory(e.target.value as MainCategory | '')
                  }
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
          </div>

          {/* Inventaire groupé par catégories, avec case "aliment principal" */}
          <div className="card">
            <h2 className="section-title">Inventaire détaillé par catégorie</h2>

            {loading ? (
              <p>Chargement...</p>
            ) : stocks.length === 0 ? (
              <p className="muted">Aucun produit en stock pour l’instant.</p>
            ) : (
              <div className="table-wrapper">
                {groupedByCategory.map(({ label, items }) =>
                  items.length === 0 ? null : (
                    <div key={label} style={{ marginBottom: '0.9rem' }}>
                      <h3
                        style={{
                          fontSize: '0.9rem',
                          margin: '0 0 0.25rem',
                          color: '#374151',
                          fontWeight: 600,
                        }}
                      >
                        {label}
                      </h3>
                      <table className="stock-table">
                        <thead>
                          <tr>
                            <th>Produit</th>
                            <th>Principal</th>
                            <th>Lieu</th>
                            <th>Quantité</th>
                            <th>Péremption</th>
                            <th>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => {
                            const expDate = item.expiration_date;
                            const exp = expDate
                              ? new Date(expDate).toLocaleDateString()
                              : '-';

                            const status = getExpirationStatus(expDate, settings.soonDays);
                            const labelStatus = getExpirationLabel(status);

                            return (
                              <tr key={item.id}>
                                <td>
                                  <div className="product-cell">
                                    <span className="product-name">
                                      {item.product?.name ?? 'Produit'}
                                    </span>
                                    {item.product?.brand && (
                                      <span className="product-brand">
                                        {item.product.brand}
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
                                        handleToggleMain(
                                          item.product!.id,
                                          item.product!.is_main,
                                        )
                                      }
                                    />
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td>{item.place || '-'}</td>
                                <td>
                                  {item.quantity ?? '-'} {item.unit ?? ''}
                                </td>
                                <td>{exp}</td>
                                <td>
                                  <span
                                    className={`status-pill status-${status}`}
                                  >
                                    <span className="status-dot" />
                                    {labelStatus}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </section>
      </>
    );
  };

  const renderDashboard = () => (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Tableau de bord</h1>
          <p className="main-subtitle">
            Vue d’ensemble de tes stocks et de ce qu’il faut surveiller.
          </p>
        </div>
        <div className="main-header-right">
          <span className="tag">Aperçu global</span>
        </div>
      </div>

      <section className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Articles en stock</div>
          <div className="stat-value">{totalItems}</div>
          <div className="stat-foot">Tous lieux confondus</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">À consommer bientôt</div>
          <div className="stat-value accent">{soonItems}</div>
          <div className="stat-foot">Sur les 7 prochains jours</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Périmés</div>
          <div className="stat-value danger">{expiredItems}</div>
          <div className="stat-foot">À vérifier rapidement</div>
        </div>
      </section>

      <section className="card card-soft">
        <h2 className="section-title">Focus produits sensibles</h2>
        {criticalItems.length === 0 ? (
          <p className="muted">
            Rien à signaler pour l’instant, tu es à jour sur tes stocks ✅
          </p>
        ) : (
          <>
            <p className="section-subtitle">
              Voici les produits à utiliser en priorité dans tes prochains repas :
            </p>
            <div className="chips-row">
              {criticalItems.map((item) => {
                const status = getExpirationStatus(item.expiration_date, settings.soonDays);
                const label = getExpirationLabel(status);
                return (
                  <div key={item.id} className="chip">
                    <span className="chip-title">
                      {item.product?.name ?? 'Produit'}
                    </span>
                    <span className="chip-meta">
                      {label}
                      {item.expiration_date &&
                        ` · ${new Date(
                          item.expiration_date,
                        ).toLocaleDateString()}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );

  const renderShoppingTab = () => {
    // Produits actuellement présents (quantité > 0)
    const presentProductIds = new Set(
      stocks
        .filter((s) => (s.quantity ?? 0) > 0 && s.product?.id)
        .map((s) => s.product!.id),
    );

    const missingMain = products.filter(
      (p) => p.is_main && !presentProductIds.has(p.id),
    );
    const missingOthers = products.filter(
      (p) => !p.is_main && !presentProductIds.has(p.id),
    );

    const currentList = shoppingSubTab === 'main' ? missingMain : missingOthers;
    const title =
      shoppingSubTab === 'main'
        ? 'Aliments principaux manquants'
        : 'Autres aliments manquants';
    const subtitle =
      shoppingSubTab === 'main'
        ? 'Les aliments que tu as marqués comme importants mais que tu n’as plus en stock.'
        : 'Les aliments que tu as déjà utilisés par le passé, mais qui ne sont plus en stock.';

    // Regroupement par grande catégorie
    const grouped: { [key: string]: Product[] } = {};
    for (const p of currentList) {
      const cat =
        (p.category && MAIN_CATEGORIES.includes(p.category as MainCategory)
          ? p.category
          : 'Autres') || 'Autres';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }

    const categoryOrder: (string | MainCategory)[] = [
      ...MAIN_CATEGORIES,
      'Autres',
    ];

    return (
      <>
        <div className="main-header">
          <div>
            <h1 className="main-title">Listes de courses</h1>
            <p className="main-subtitle">
              Génère automatiquement ta liste de courses en fonction de ce qui manque dans tes placards.
            </p>
          </div>
          <div className="main-header-right">
            <span className="tag">Basée sur ton stock</span>
          </div>
        </div>

        <section className="card">
          <div className="subtabs">
            <button
              type="button"
              className={
                'subtab-btn' +
                (shoppingSubTab === 'main' ? ' subtab-btn--active' : '')
              }
              onClick={() => setShoppingSubTab('main')}
            >
              ⭐ Aliments principaux
            </button>
            <button
              type="button"
              className={
                'subtab-btn' +
                (shoppingSubTab === 'others' ? ' subtab-btn--active' : '')
              }
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
            <p className="muted">
              Pour cette section, tout est à jour : rien à ajouter à ta liste de courses ✅
            </p>
          ) : (
            categoryOrder.map((cat) => {
              const items = grouped[cat];
              if (!items || items.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: '0.9rem' }}>
                  <h3 className="shopping-group-title">{cat}</h3>
                  <ul className="shopping-list">
                    {items.map((p) => (
                      <li key={p.id} className="shopping-list-item">
                        <span className="shopping-product-name">{p.name}</span>
                        {p.brand && (
                          <span className="shopping-product-brand">
                            {p.brand}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      </>
    );
  };

  const recipeKindToCategory = (kind: 'savory' | 'sweet') =>
  kind === 'sweet' ? 'Produit sucré' : 'Produit salé';

const findExistingProductForKeyword = (keyword: string) => {
  const key = normalizeText(keyword);
  return products.find((p) => {
    const pn = normalizeText(p.name);
    // match "oeuf" avec "oeufs", "pates" avec "pâtes", etc.
    return pn === key || pn.includes(key) || key.includes(pn);
  });
};

const ensureProductExistsForShopping = async (
  keyword: string,
  kind: 'savory' | 'sweet',
) => {
  // 1) On regarde d'abord dans l'état local
  const local = findExistingProductForKeyword(keyword);
  if (local) return { product: local, created: false };

  // 2) Sinon on vérifie côté Supabase (au cas où)
  const { data: existing, error: existingError } = await supabase
    .from('products')
    .select('id, name, brand, category, default_unit, barcode, is_main')
    .ilike('name', `%${keyword}%`)
    .limit(1);

  if (existingError) throw existingError;

  if (existing && existing.length > 0) {
    const p = existing[0] as any;
    const normalized = {
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      default_unit: p.default_unit,
      barcode: p.barcode ?? null,
      is_main: !!p.is_main,
    };
    // sync state
    setProducts((prev) => {
      const idx = prev.findIndex((x) => x.id === normalized.id);
      if (idx === -1) return [...prev, normalized];
      const copy = [...prev];
      copy[idx] = normalized;
      return copy;
    });
    return { product: normalized, created: false };
  }

  // 3) On crée un "produit" minimal (dans la bonne grande catégorie)
  const category = recipeKindToCategory(kind);

  const { data: created, error: createError } = await supabase
    .from('products')
    .insert({
      name: keyword,            // volontairement simple
      brand: null,
      category,                 // sucré/salé
      default_unit: null,
      barcode: null,
      is_main: false,
    })
    .select('id, name, brand, category, default_unit, barcode, is_main')
    .single();

  if (createError || !created) throw createError || new Error('Erreur création produit');

  const normalized = {
    id: (created as any).id,
    name: (created as any).name,
    brand: (created as any).brand,
    category: (created as any).category,
    default_unit: (created as any).default_unit,
    barcode: (created as any).barcode ?? null,
    is_main: !!(created as any).is_main,
  };

  setProducts((prev) => [...prev, normalized]);
  return { product: normalized, created: true };
};

const addMissingIngredientsToShopping = async (
  missing: string[],
  kind: 'savory' | 'sweet',
) => {
  if (!missing || missing.length === 0) return;

  setError(null);
  setInfo(null);

  try {
    let createdCount = 0;

    // On traite en série pour simplifier (tu peux paralléliser plus tard)
    for (const ing of missing) {
      const trimmed = ing.trim();
      if (!trimmed) continue;

      const { created } = await ensureProductExistsForShopping(trimmed, kind);
      if (created) createdCount += 1;
    }

    // Petit bonus UX : on bascule direct sur la liste de courses
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
  const renderSettingsTab = () => {
  return (
    <>
      <div className="main-header">
        <div>
          <h1 className="main-title">Réglages</h1>
          <p className="main-subtitle">
            Personnalise les seuils d’alerte, les règles recettes et les valeurs par défaut.
          </p>
        </div>
        <div className="main-header-right">
          <span className="tag">Sauvegarde locale</span>
        </div>
      </div>

      <section className="card">
        <h2 className="section-title">Péremption</h2>
        <p className="section-subtitle">
          Définis à partir de combien de jours un produit est considéré “à consommer bientôt”.
        </p>

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
                setSettings((prev) => ({
                  ...prev,
                  soonDays: Number.isFinite(v) ? v : prev.soonDays,
                }));
                setSettingsInfo(null);
              }}
              className="field-input"
            />
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: '0.9rem' }}>
        <h2 className="section-title">Recettes</h2>
        <p className="section-subtitle">
          Contrôle la règle “recette faisable si ≤ X ingrédients manquants”.
        </p>

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
                  recipesMaxMissing: Number.isFinite(v)
                    ? v
                    : prev.recipesMaxMissing,
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
        <p className="section-subtitle">
          Valeurs par défaut utilisées lors de l’ajout d’un produit.
        </p>

        <div className="form-grid">
          <div className="field-group full">
            <label className="field-label">Lieu par défaut</label>
            <input
              value={settings.defaultPlace}
              onChange={(e) => {
                setSettings((prev) => ({
                  ...prev,
                  defaultPlace: e.target.value,
                }));
                setSettingsInfo(null);
              }}
              className="field-input"
              placeholder="Placard, Frigo, Congélateur..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setSettingsInfo('✅ Réglages enregistrés.')}
          >
            Enregistrer
          </button>
        </div>

        {settingsInfo && <p className="info-text">{settingsInfo}</p>}
      </section>
    </>
  );
};

  const renderRecipesTab = () => {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const stockNames = stocks
    .filter((s) => (s.quantity ?? 0) > 0 && s.product?.name)
    .map((s) => normalize(s.product!.name));

  const hasIngredient = (ingredient: string) => {
    const key = normalize(ingredient);
    return stockNames.some((n) => n.includes(key));
  };

  const enriched = SAMPLE_RECIPES.map((r) => {
    const missing = r.ingredients.filter((ing) => !hasIngredient(ing));
    const available = r.ingredients.filter((ing) => hasIngredient(ing));
    const missingCount = missing.length;
    const feasible = missingCount <= settings.recipesMaxMissing;

    return { ...r, missing, available, missingCount, feasible };
  });

  const feasibleList = enriched
    .filter((r) => r.feasible)
    .sort((a, b) => a.missingCount - b.missingCount);

  const allList = enriched;
  const current = recipesSubTab === 'feasible' ? feasibleList : allList;

  const savory = current.filter((r) => r.kind === 'savory');
  const sweet = current.filter((r) => r.kind === 'sweet');

  const headerTitle =
  recipesSubTab === 'feasible'
    ? `Recettes faisables (≤ ${settings.recipesMaxMissing} ingrédients manquants)`
    : 'Recettes en général';


  const headerSubtitle =
    recipesSubTab === 'feasible'
      ? 'Basé sur ton stock actuel. On accepte jusqu’à ${settings.recipesMaxMissing} ingrédients manquants.'
      : 'Catalogue de recettes (exemples) séparées en sucré / salé.';

  const renderRecipeCard = (r: any) => {
    const badge = `🧾 ${r.missingCount} manquant(s)`;

    return (
      <div key={r.id} className="recipe-card">
        <div className="recipe-head">
          <h3 className="recipe-title">{r.name}</h3>
          {recipesSubTab === 'feasible' && (
            <span className="recipe-badge">{badge}</span>
          )}
        </div>

        <p className="recipe-subtitle">Ingrédients :</p>
        <ul className="recipe-list">
          {r.ingredients.map((ing: string) => (
            <li key={ing}>{ing}</li>
          ))}
        </ul>

        {recipesSubTab === 'feasible' && r.missingCount > 0 && (
          <>
            <p className="recipe-subtitle">Manque :</p>
            <ul className="recipe-list">
              {r.missing.map((ing: string) => (
                <li key={ing}>{ing}</li>
              ))}
            </ul>

            {/* ✅ Bouton : ajoute les ingrédients manquants à la liste de courses */}
            <div className="recipe-actions">
              <button
                type="button"
                className="recipe-add-btn"
                onClick={() =>
                  void addMissingIngredientsToShopping(r.missing, r.kind)
                }
              >
                ➕ Ajouter les ingrédients manquants à la liste de courses
              </button>
            </div>
          </>
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

      <section className="card">
        <div className="subtabs">
          <button
            type="button"
            className={
              'subtab-btn' +
              (recipesSubTab === 'feasible' ? ' subtab-btn--active' : '')
            }
            onClick={() => setRecipesSubTab('feasible')}
          >
            ✅ Faisables
          </button>
          <button
            type="button"
            className={
              'subtab-btn' +
              (recipesSubTab === 'all' ? ' subtab-btn--active' : '')
            }
            onClick={() => setRecipesSubTab('all')}
          >
            📚 Toutes
          </button>
        </div>

        <h2 className="section-title" style={{ marginTop: '0.7rem' }}>
          {headerTitle}
        </h2>

        {/* SALÉ */}
        <div className="recipe-section">
          <h3 className="recipe-section-title">🥘 Salé</h3>
          {savory.length === 0 ? (
            <p className="muted">
              {recipesSubTab === 'feasible'
                ? "Aucune recette salée faisable avec ton stock (≤ 2 manquants)."
                : 'Aucune recette salée dans le catalogue (pour l’instant).'}
            </p>
          ) : (
            <div className="recipe-grid">{savory.map(renderRecipeCard)}</div>
          )}
        </div>

        {/* SUCRÉ */}
        <div className="recipe-section" style={{ marginTop: '1rem' }}>
          <h3 className="recipe-section-title">🍰 Sucré</h3>
          {sweet.length === 0 ? (
            <p className="muted">
              {recipesSubTab === 'feasible'
                ? "Aucune recette sucrée faisable avec ton stock (≤ 2 manquants)."
                : 'Aucune recette sucrée dans le catalogue (pour l’instant).'}
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
          On pourra y ajouter :
        </p>
        <ul className="feature-list">
          <li>des écrans dédiés,</li>
          <li>des filtres intelligents,</li>
          <li>et des automatisations (ajout auto dans les listes, idées repas, etc.).</li>
        </ul>
      </section>
    </>
  );

  let mainContent: ReactNode;
  if (activeTab === 'dashboard') mainContent = renderDashboard();
  else if (activeTab === 'stock') mainContent = renderStockTab();
  else if (activeTab === 'shopping') mainContent = renderShoppingTab();
  else if (activeTab === 'recipes') mainContent = renderRecipesTab();
  else if (activeTab === 'settings') mainContent = renderSettingsTab();
  else
    mainContent = renderPlaceholder(
      'Réglages & préférences',
      'Personnalise les seuils d’alerte, les lieux de stockage et plus encore.',
    );

  return (
    <div className="app-root">
      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
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
                className={
                  'sidebar-item' +
                  (activeTab === item.key ? ' sidebar-item--active' : '')
                }
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
                À venir : listes de courses intelligentes, suggestions de recettes, partage
                de foyer…
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
