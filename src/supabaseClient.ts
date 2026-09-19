import { createClient } from "@supabase/supabase-js";

function readRequiredEnv(
  key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY",
): string {
  const value = import.meta.env[key];

  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${key}`);
  }

  return value;
}

const supabaseUrl = readRequiredEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = readRequiredEnv("VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
