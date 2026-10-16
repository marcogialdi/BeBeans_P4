// Valori pubblici per definizione: la chiave "anon" di Supabase è fatta per stare nel browser.
// La protezione dei dati è garantita da login + RLS + controlli nella Edge Function.
// NON inserire qui VIN, clientId, clientSecret o account ID: vivono solo nei secrets di Supabase.

export const SUPABASE_URL = "https://<PROJECT_REF>.supabase.co";
export const SUPABASE_ANON_KEY = "<SUPABASE_ANON_KEY>";

// Nome mostrato in testata (scegli tu, non è il VIN).
export const CAR_NAME = "La mia auto";

// Ogni quanto ricaricare i dati mentre la pagina è aperta (minuti).
export const REFRESH_MINUTES = 5;
