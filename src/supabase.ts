import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configOk = Boolean(url && anon);

export const supabase = createClient(url ?? "https://placeholder.supabase.co", anon ?? "placeholder", {
  auth: { persistSession: true, autoRefreshToken: true },
});

// mappa nome -> email degli account del team
export const TEAM = [
  { key: "mattia", name: "Mattia", email: "mattia@zen-air.app", owner: true },
  { key: "diego", name: "Diego", email: "diego@zen-air.app", owner: false },
  { key: "pier", name: "Pier", email: "pier@zen-air.app", owner: false },
] as const;

export function emailFor(key: string) {
  return TEAM.find((t) => t.key === key)?.email ?? "";
}
