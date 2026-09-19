import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "vplacard-media";
const IMAGE_CONTENT_TYPE = "image/jpeg";

const assets = [
  {
    path: "app/default-dashboard-hero.jpg",
    source:
      "https://images.unsplash.com/photo-1498837167922-ddd27525d352?fm=jpg&fit=crop&w=1400&q=80",
  },
  {
    path: "app/default-stock-hero.jpg",
    source:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?fm=jpg&fit=crop&w=1400&q=80",
  },
  {
    path: "app/default-stock-empty.jpg",
    source:
      "https://images.unsplash.com/photo-1586201375761-83865001e31c?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "app/default-shopping-hero.jpg",
    source:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?fm=jpg&fit=crop&w=1400&q=80",
  },
  {
    path: "app/default-shopping-empty.jpg",
    source:
      "https://images.unsplash.com/photo-1578916171728-46686eac8d58?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "app/default-planning-hero.jpg",
    source:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "app/default-history-hero.jpg",
    source:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "app/default-history-empty.jpg",
    source:
      "https://images.unsplash.com/photo-1556910103-1c02745aae4d?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-savory-1.jpg",
    source:
      "https://images.unsplash.com/photo-1551183053-bf91a1d81141?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-savory-2.jpg",
    source:
      "https://images.unsplash.com/photo-1543352634-a1c51d9f1fa7?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-savory-3.jpg",
    source:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-savory-4.jpg",
    source:
      "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-sweet-1.jpg",
    source:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-sweet-2.jpg",
    source:
      "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-sweet-3.jpg",
    source:
      "https://images.unsplash.com/photo-1563805042-7684c019e1cb?fm=jpg&fit=crop&w=900&q=80",
  },
  {
    path: "recipes/default-sweet-4.jpg",
    source:
      "https://images.unsplash.com/photo-1518091270798-06f27624a89e?fm=jpg&fit=crop&w=900&q=80",
  },
];

function parseEnvFile(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) return [line, ""];
        const key = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

async function readEnvFile(path) {
  try {
    return parseEnvFile(await readFile(path, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }

    throw error;
  }
}

function isExistingAssetError(error) {
  const message = String(error?.message ?? error ?? "");
  const statusCode = String(error?.statusCode ?? error?.status ?? "");
  const code = String(error?.error ?? "");

  return (
    statusCode === "409" ||
    /already exists|duplicate|asset already exists/i.test(`${message} ${code}`)
  );
}

async function uploadAsset(supabase, asset) {
  const response = await fetch(asset.source, {
    headers: { accept: IMAGE_CONTENT_TYPE },
  });

  if (!response.ok) {
    throw new Error(
      `Impossible de télécharger ${asset.source} (${response.status})`,
    );
  }

  const body = new Uint8Array(await response.arrayBuffer());
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(asset.path, body, {
      cacheControl: "31536000",
      contentType: IMAGE_CONTENT_TYPE,
      upsert: false,
    });

  if (error) {
    if (isExistingAssetError(error)) {
      console.log(`skip ${asset.path}`);
      return;
    }

    throw error;
  }

  console.log(`upload ${asset.path}`);
}

const env = {
  ...(await readEnvFile(".env")),
  ...(await readEnvFile(".env.local")),
};

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error(
    "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont nécessaires dans .env ou .env.local",
  );
}

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
);

for (const asset of assets) {
  await uploadAsset(supabase, asset);
}
