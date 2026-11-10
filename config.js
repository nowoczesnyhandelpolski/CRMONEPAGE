// Centrala CRM — ustawienia połączenia z Supabase.
// Wklej tu 2 wartości z Supabase: Project Settings → API Keys / Data API.
// Klucz "publishable" (albo "anon") jest publiczny z założenia — dane chroni logowanie
// i reguły bezpieczeństwa z pliku supabase.sql. NIGDY nie wklejaj tu klucza "secret" ani "service_role".
window.CRM_CONFIG = {
  url: "https://ysijewwzpkpzxhjcshms.supabase.co",          // np. https://abcdxyz.supabase.co
  key: "sb_publishable_F6CnRzycgX84oC18FxUoSw_aKz73GRm"       // np. sb_publishable_...  (albo stary klucz anon: eyJ...)
};
