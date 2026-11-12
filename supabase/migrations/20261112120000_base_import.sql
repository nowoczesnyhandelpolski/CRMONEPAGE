-- Import produktów z Base (BaseLinker).
-- Produkt pamięta źródło i id z Base, więc ponowny import aktualizuje wiersz zamiast dodawać nowy.
-- Migracja tylko dopisuje kolumny i indeksy. Niczego nie kasuje i można ją uruchomić ponownie.

-- Skąd jest produkt: manual (ręcznie / wtyczka), base (katalog Base), base_hurtownia (magazyn zewnętrzny w Base).
alter table public.products add column if not exists source text not null default 'manual';
-- Id katalogu Base (np. 307) albo magazynu zewnętrznego (np. shop_2445 / warehouse_12).
alter table public.products add column if not exists base_inventory_id text;
-- Id produktu w Base.
alter table public.products add column if not exists base_product_id text;
alter table public.products add column if not exists base_synced_at timestamptz;
-- Warianty z Base: [{ base_id, name, sku, ean, price, stock }].
alter table public.products add column if not exists variants jsonb not null default '[]'::jsonb;
-- Id wariantów w Shopify: { "<id wariantu w Base>": "<id wariantu w Shopify>" }.
-- Osobna kolumna poza wyzwalaczem kolejki, żeby zapis po wysyłce nie wysyłał produktu ponownie.
alter table public.products add column if not exists shopify_variant_map jsonb not null default '{}'::jsonb;

-- Klucz do upsertu. Wiersze spoza Base mają null, a null się nie powtarza, więc ich nie blokuje.
create unique index if not exists products_base_ref
  on public.products (source, base_inventory_id, base_product_id);

-- Katalog Base = katalog w Centrali (product_catalogs.source = 'base').
alter table public.product_catalogs add column if not exists external_id text;
create unique index if not exists product_catalogs_source_external
  on public.product_catalogs (source, external_id);

-- Zmiana wariantów albo stanu też ma trafić do Shopify (gdy produkt już tam jest).
drop trigger if exists products_shopify_queue on public.products;
create trigger products_shopify_queue
  after update of workflow_status, price, description, name, catalog_name, ean, sku, images, description_sections, stock, variants
  on public.products
  for each row execute function public.nhp_queue_shopify_product();
