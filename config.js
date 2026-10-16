// Valori pubblici per definizione: la chiave "anon" di Supabase è fatta per stare nel browser.
// La protezione dei dati è garantita da login + RLS + controlli nella Edge Function.
// NON inserire qui VIN, clientId, clientSecret o account ID: vivono solo nei secrets di Supabase.

export const SUPABASE_URL = "https://qxqqxlwzdcyiwzcpjxhu.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4cXF4bHd6ZGN5aXd6Y3BqeGh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTczMzIsImV4cCI6MjEwNzczMzMzMn0.MPEFloS-BpMjUZBhLxlK882ZcVaxH4jJ63Z-em2D450";

// Nome mostrato in testata (scegli tu, non è il VIN).
export const CAR_NAME = "La mia auto";

// Ogni quanto ricaricare i dati mentre la pagina è aperta (minuti).
export const REFRESH_MINUTES = 5;
