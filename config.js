// Centrala CRM — ustawienia połączenia z Supabase.
// Wklej tu 2 wartości z Supabase: Project Settings → API Keys / Data API.
// Klucz "publishable" (albo "anon") jest publiczny z założenia — dane chroni logowanie
// i reguły bezpieczeństwa z pliku supabase.sql. NIGDY nie wklejaj tu klucza "secret" ani "service_role".
window.CRM_CONFIG = {
  url: "WKLEJ_PROJECT_URL",          // np. https://abcdxyz.supabase.co
  key: "WKLEJ_PUBLISHABLE_KEY"       // np. sb_publishable_...  (albo stary klucz anon: eyJ...)
};
