import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = !!url && !!key;

// When env vars are missing the app still runs, saving to this device only.
export const supabase = supabaseConfigured ? createClient(url!, key!) : null;
