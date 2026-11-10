-- =====================================================================
-- Centrala CRM + Generator stron — baza i zabezpieczenia
-- Supabase → SQL Editor → wklej CAŁY plik → Run.
-- Skrypt można uruchomić ponownie: nie kasuje zamówień ani stron.
--
-- !!! PLACEHOLDERY E-MAILI — TO NIE SĄ PRAWDZIWE ADRESY !!!
-- Zamień poniżej trzy przykładowe wiersze na prawdziwe e-maile wspólników
-- ZANIM ktokolwiek się zaloguje. Adresy @przyklad.pl nikogo nie wpuszczą,
-- ale mają zostać w pliku, żeby było widać, co uzupełnić.
-- Po wpisaniu prawdziwych adresów usuń placeholdery:
--   delete from public.allowed_emails where email like '%@przyklad.pl';
-- =====================================================================

-- Lista osób, które mają dostęp do danych CRM
create table if not exists public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;
-- (celowo brak reguł: tej listy nie da się odczytać ani zmienić ze strony www)

insert into public.allowed_emails (email) values
  (lower('TWOJ_EMAIL@przyklad.pl')),      -- PLACEHOLDER: e-mail właściciela, NIE prawdziwy adres
  (lower('EMAIL_MICHALA@przyklad.pl')),   -- PLACEHOLDER: e-mail Michała, NIE prawdziwy adres
  (lower('EMAIL_AGATY@przyklad.pl'))      -- PLACEHOLDER: e-mail Agaty, NIE prawdziwy adres
on conflict do nothing;

comment on table public.allowed_emails is
  'PLACEHOLDER: TWOJ_EMAIL@przyklad.pl, EMAIL_MICHALA@przyklad.pl i EMAIL_AGATY@przyklad.pl trzeba zamienić na prawdziwe adresy. Te trzy wpisy same z siebie nikogo nie logują.';

do $$
begin
  raise notice 'UWAGA — PLACEHOLDERY: allowed_emails ma przykładowe adresy @przyklad.pl. Zamień je na prawdziwe e-maile wspólników.';
end $$;

-- Czy zalogowana osoba jest w zespole?
create or replace function public.is_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_team() from public, anon;
grant execute on function public.is_team() to authenticated;

-- Wszystkie dane CRM: zamówienia, produkty, klienci, zadania, sklepy, boty, leady, wiadomości
create table if not exists public.records (
  col        text not null,              -- rodzaj: orders, products, customers, leads, messages, ...
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (col, id)
);
alter table public.records enable row level security;
alter table public.records replica identity full;   -- potrzebne do usuwania na żywo

-- Klucz e-mail do szukania klienta i limitu zamówień (tylko serwer, przez service_role).
alter table public.records add column if not exists email_key text
  generated always as (lower(coalesce(data->>'email', ''))) stored;
create index if not exists records_email_key on public.records (col, email_key);

drop policy if exists "zespol_czyta"   on public.records;
drop policy if exists "zespol_dodaje"  on public.records;
drop policy if exists "zespol_zmienia" on public.records;
drop policy if exists "zespol_usuwa"   on public.records;
create policy "zespol_czyta"   on public.records for select to authenticated using (public.is_team());
create policy "zespol_dodaje"  on public.records for insert to authenticated with check (public.is_team());
create policy "zespol_zmienia" on public.records for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "zespol_usuwa"   on public.records for delete to authenticated using (public.is_team());

revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- Zmiany widoczne u wspólników na żywo
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Strony one-page (Generator stron). Anon NIE ma dostępu.
-- Odczyt publiczny idzie przez Pages Function i klucz service_role.
-- ---------------------------------------------------------------------
create table if not exists public.pages (
  id           text primary key,
  slug         text not null unique,
  name         text not null,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  product_id   text,
  shop_id      text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  updated_by   uuid default auth.uid()
);
alter table public.pages enable row level security;
alter table public.pages replica identity full;
create index if not exists pages_status_slug on public.pages (status, slug);

drop policy if exists "strony_czyta"   on public.pages;
drop policy if exists "strony_dodaje"  on public.pages;
drop policy if exists "strony_zmienia" on public.pages;
drop policy if exists "strony_usuwa"   on public.pages;
create policy "strony_czyta"   on public.pages for select to authenticated using (public.is_team());
create policy "strony_dodaje"  on public.pages for insert to authenticated with check (public.is_team());
create policy "strony_zmienia" on public.pages for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "strony_usuwa"   on public.pages for delete to authenticated using (public.is_team());

revoke all on public.pages from anon;
grant select, insert, update, delete on public.pages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pages'
  ) then
    alter publication supabase_realtime add table public.pages;
  end if;
end $$;

-- Licznik prób z publicznych formularzy. Brak polityk = brak dostępu dla anon i authenticated.
-- Zapisuje wyłącznie serwer (service_role omija RLS).
create table if not exists public.public_hits (
  id         bigint generated always as identity primary key,
  kind       text not null,
  slug       text not null,
  ip         text,
  created_at timestamptz not null default now()
);
alter table public.public_hits enable row level security;
create index if not exists public_hits_lookup on public.public_hits (kind, ip, created_at desc);
revoke all on public.public_hits from anon, authenticated;

-- Gotowe! Dodanie nowego wspólnika później:
--   insert into public.allowed_emails (email) values (lower('nowy@przyklad.pl'));
-- I pamiętaj usunąć PLACEHOLDERY @przyklad.pl, gdy wpiszesz prawdziwe adresy.

-- =====================================================================
-- Baza produktów, aukcje, import z wtyczki, szkice Allegro, generacja.
-- Osobne tabele — nie mieszamy tego z public.records (EAV zamówień).
-- Skrypt można puścić ponownie. Tokeny Allegro i skróty kluczy API
-- nie są czytelne dla anon ani dla zalogowanego zespołu.
-- =====================================================================

create table if not exists public.product_catalogs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null default 'manual',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text not null default '',
  position numeric not null default 0,
  status text not null default 'todo',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid references public.product_catalogs(id) on delete set null,
  sku text,
  ean text,
  name text not null,
  catalog_name text,
  brand text,
  producer text,
  category_id text,
  category text,
  work_category_id uuid references public.work_categories(id) on delete set null,
  price numeric,
  base_price numeric,
  price_before_promo numeric,
  delivery_cost numeric,
  currency text not null default 'PLN',
  stock integer,
  shipping_time text,
  images jsonb not null default '[]'::jsonb,
  description text,
  description_sections jsonb not null default '[]'::jsonb,
  params jsonb not null default '[]'::jsonb,
  source_link text,
  allegro_product_id text,
  status text not null default 'active',
  generated jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_ean on public.products (ean);
create index if not exists products_catalog on public.products (catalog_id);

create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  source_offer_id text,
  allegro_offer_id text,
  account_id uuid,
  shop text,
  origin text not null default 'import',
  sku text,
  ean text,
  name text,
  catalog_name text,
  brand text,
  producer text,
  category_id text,
  category text,
  work_category_id uuid references public.work_categories(id) on delete set null,
  price numeric,
  base_price numeric,
  price_before_promo numeric,
  delivery_cost numeric,
  currency text not null default 'PLN',
  stock integer,
  status text not null default 'draft',
  shipping_time text,
  images jsonb not null default '[]'::jsonb,
  description text,
  description_sections jsonb not null default '[]'::jsonb,
  params jsonb not null default '[]'::jsonb,
  source_link text,
  allegro_product_id text,
  product_id uuid references public.products(id) on delete set null,
  missing jsonb not null default '[]'::jsonb,
  generated jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists auctions_source_offer on public.auctions (source_offer_id) where source_offer_id is not null and source_offer_id <> '';
create index if not exists auctions_status on public.auctions (status);
create index if not exists auctions_work on public.auctions (work_category_id);

create table if not exists public.product_offer_links (
  auction_id uuid not null references public.auctions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (auction_id, product_id)
);

create table if not exists public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'allegro',
  auction_id uuid references public.auctions(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  account_id uuid,
  name text,
  price numeric,
  stock integer,
  status text not null default 'draft',
  offer_id text,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.listing_drafts(id) on delete set null,
  account_id uuid,
  product_id uuid,
  name text,
  status text not null,
  offer_id text,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offer_import_batches (
  id text primary key,
  name text,
  account_login text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.offer_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null references public.offer_import_batches(id) on delete cascade,
  pos integer not null default 0,
  source_offer_id text,
  ean text,
  status text not null default 'draft',
  missing jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  product_id uuid,
  auction_id uuid,
  updated_at timestamptz not null default now()
);
create index if not exists offer_import_items_batch on public.offer_import_items (batch_id, pos);

create table if not exists public.category_commissions (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique,
  label text not null,
  rate_pct numeric not null check (rate_pct >= 0 and rate_pct < 95),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('s1', 's1_pro', 's1_max')),
  status text not null default 'queued',
  target text not null default 'page',
  product_id uuid,
  page_id text,
  import_item_id uuid,
  cost_estimate_pln numeric not null default 0,
  cost_actual_pln numeric,
  model text,
  error text,
  result jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  page_id text,
  kind text not null check (kind in ('image', 'video')),
  bucket text not null default 'media',
  path text not null,
  public_url text,
  mime text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.allegro_accounts (
  id uuid primary key default gen_random_uuid(),
  shop text not null default '',
  login text,
  seller_id text,
  expires_at timestamptz,
  connected_by uuid,
  created_at timestamptz not null default now(),
  last_error text
);

create table if not exists public.allegro_secrets (
  account_id uuid primary key references public.allegro_accounts(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.allegro_oauth_states (
  state text primary key,
  user_id uuid,
  created_at timestamptz not null default now()
);

-- Zespół widzi dane handlowe. Tokenów i skrótu klucza nie dostaje.
do $$
declare t text;
begin
  foreach t in array array[
    'product_catalogs','work_categories','products','auctions','product_offer_links',
    'listing_drafts','listing_items','offer_import_batches','offer_import_items',
    'category_commissions','generation_jobs','media','api_keys','allegro_accounts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists zespol_czyta on public.%I', t);
    execute format('drop policy if exists zespol_dodaje on public.%I', t);
    execute format('drop policy if exists zespol_zmienia on public.%I', t);
    execute format('drop policy if exists zespol_usuwa on public.%I', t);
    execute format('create policy zespol_czyta on public.%I for select to authenticated using (public.is_team())', t);
    execute format('create policy zespol_dodaje on public.%I for insert to authenticated with check (public.is_team())', t);
    execute format('create policy zespol_zmienia on public.%I for update to authenticated using (public.is_team()) with check (public.is_team())', t);
    execute format('create policy zespol_usuwa on public.%I for delete to authenticated using (public.is_team())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Skrót klucza nie jest czytelny z panelu. Wystawianie i odwołanie idzie przez funkcje poniżej (bez service_role).
revoke select (key_hash) on public.api_keys from authenticated;
revoke insert, update, delete on public.api_keys from authenticated;

-- Klucz API zespołu. Wywołanie z JWT użytkownika i kluczem publishable.
create or replace function public.create_api_key(p_label text, p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Zły skrót klucza.';
  end if;
  insert into public.api_keys (key_hash, label, created_by)
  values (p_key_hash, left(coalesce(nullif(btrim(p_label), ''), 'Wtyczka'), 80), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.revoke_api_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  update public.api_keys set revoked_at = now() where id = p_id and revoked_at is null;
end;
$$;

revoke all on function public.create_api_key(text, text) from public, anon;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.create_api_key(text, text) to authenticated, service_role;
grant execute on function public.revoke_api_key(uuid) to authenticated, service_role;

create or replace function public.nhp_num(p text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return replace(p, ',', '.')::numeric;
exception when others then
  return null;
end;
$$;
revoke all on function public.nhp_num(text) from public, anon, authenticated;

-- Import z wtyczki. Anon woła funkcję skrótem klucza; nie czyta tabeli api_keys.
create or replace function public.import_offer_export(p_key_hash text, p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key public.api_keys%rowtype;
  v_catalog uuid;
  v_item jsonb;
  v_data jsonb;
  v_product uuid;
  v_auction uuid;
  v_batch text;
  v_saved int := 0;
  v_flagged int := 0;
  v_now timestamptz := now();
  v_price numeric;
  v_status text;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  select * into v_key from public.api_keys where key_hash = p_key_hash and revoked_at is null;
  if not found then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  update public.api_keys set last_used_at = v_now where id = v_key.id;

  v_batch := nullif(p_batch->>'batch_id', '');
  if v_batch is null or v_batch !~ '^[A-Za-z0-9_-]{6,64}$' then
    v_batch := 'imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  end if;
  insert into public.offer_import_batches (id, name, account_login, created_by, updated_at)
  values (
    v_batch,
    coalesce(nullif(p_batch->>'name', ''), 'Import z wtyczki'),
    nullif(p_batch->>'account_login', ''),
    v_key.created_by,
    v_now
  )
  on conflict (id) do update
    set name = excluded.name, account_login = excluded.account_login, updated_at = excluded.updated_at;

  select id into v_catalog from public.product_catalogs where name = 'Import z wtyczki' limit 1;
  if v_catalog is null then
    insert into public.product_catalogs (name, source) values ('Import z wtyczki', 'extension') returning id into v_catalog;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_batch->'items', '[]'::jsonb))
  loop
    v_data := coalesce(v_item->'item', '{}'::jsonb);
    v_status := coalesce(nullif(v_item->>'status', ''), 'draft');
    if v_status = 'flagged' or lower(coalesce(v_item->>'flagged', '')) in ('true', 't', '1') then
      v_flagged := v_flagged + 1;
    end if;
    v_price := public.nhp_num(v_data->>'price');

    v_product := null;
    if coalesce(v_data->>'ean', '') <> '' then
      select id into v_product from public.products where ean = v_data->>'ean' limit 1;
    end if;
    if v_product is null and coalesce(v_data->>'sku', '') <> '' then
      select id into v_product from public.products where sku = v_data->>'sku' limit 1;
    end if;
    if v_product is null and coalesce(v_data->>'source_link', '') <> '' then
      select id into v_product from public.products where source_link = v_data->>'source_link' limit 1;
    end if;

    if v_product is null then
      insert into public.products (
        catalog_id, sku, ean, name, catalog_name, producer, brand, category_id, category,
        price, base_price, price_before_promo, delivery_cost, shipping_time,
        images, description, description_sections, params, source_link, allegro_product_id, status, updated_at
      ) values (
        v_catalog,
        coalesce(nullif(v_data->>'sku', ''), nullif(v_data->>'ean', '')),
        nullif(v_data->>'ean', ''),
        coalesce(nullif(v_data->>'catalog_name', ''), 'Bez nazwy'),
        nullif(v_data->>'catalog_name', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'category_id', ''),
        nullif(v_data->>'category', ''),
        v_price,
        public.nhp_num(v_data->>'base_price'),
        public.nhp_num(v_data->>'price_before_promo'),
        public.nhp_num(v_data->>'delivery_cost'),
        nullif(v_data->>'shipping_time', ''),
        coalesce(v_data->'images', '[]'::jsonb),
        (select string_agg(s->>'text', E'\n\n') from jsonb_array_elements(coalesce(v_data->'description_sections', '[]'::jsonb)) s where s->>'type' = 'text'),
        coalesce(v_data->'description_sections', '[]'::jsonb),
        coalesce(v_data->'parameters', '[]'::jsonb),
        nullif(v_data->>'source_link', ''),
        nullif(v_data->>'allegro_product_id', ''),
        case when v_price is null then 'flagged' else 'active' end,
        v_now
      ) returning id into v_product;
    else
      update public.products set
        catalog_id = coalesce(catalog_id, v_catalog),
        sku = coalesce(nullif(sku, ''), nullif(v_data->>'sku', ''), nullif(v_data->>'ean', '')),
        name = coalesce(nullif(name, ''), nullif(v_data->>'catalog_name', ''), 'Bez nazwy'),
        catalog_name = coalesce(catalog_name, nullif(v_data->>'catalog_name', '')),
        producer = coalesce(nullif(v_data->>'producer', ''), producer),
        brand = coalesce(nullif(v_data->>'producer', ''), brand),
        category = coalesce(nullif(v_data->>'category', ''), category),
        category_id = coalesce(nullif(v_data->>'category_id', ''), category_id),
        price = coalesce(v_price, price),
        base_price = coalesce(public.nhp_num(v_data->>'base_price'), base_price),
        price_before_promo = coalesce(public.nhp_num(v_data->>'price_before_promo'), price_before_promo),
        delivery_cost = coalesce(public.nhp_num(v_data->>'delivery_cost'), delivery_cost),
        shipping_time = coalesce(nullif(v_data->>'shipping_time', ''), shipping_time),
        images = case when jsonb_typeof(v_data->'images') = 'array' and jsonb_array_length(v_data->'images') > 0 then v_data->'images' else images end,
        description_sections = case when jsonb_typeof(v_data->'description_sections') = 'array' and jsonb_array_length(v_data->'description_sections') > 0 then v_data->'description_sections' else description_sections end,
        params = case when jsonb_typeof(v_data->'parameters') = 'array' and jsonb_array_length(v_data->'parameters') > 0 then v_data->'parameters' else params end,
        source_link = coalesce(nullif(v_data->>'source_link', ''), source_link),
        allegro_product_id = coalesce(nullif(v_data->>'allegro_product_id', ''), allegro_product_id),
        updated_at = v_now
      where id = v_product;
    end if;

    v_auction := null;
    if coalesce(v_data->>'source_offer_id', '') <> '' then
      select id into v_auction from public.auctions where source_offer_id = v_data->>'source_offer_id' limit 1;
    end if;
    if v_auction is null and coalesce(v_data->>'source_link', '') <> '' then
      select id into v_auction from public.auctions where source_link = v_data->>'source_link' limit 1;
    end if;

    if v_auction is null then
      insert into public.auctions (
        source_offer_id, origin, ean, name, catalog_name, producer, brand, category_id, category,
        price, base_price, price_before_promo, delivery_cost, shipping_time,
        images, description, description_sections, params, source_link, allegro_product_id,
        product_id, missing, status, updated_at
      ) values (
        nullif(v_data->>'source_offer_id', ''),
        'import',
        nullif(v_data->>'ean', ''),
        coalesce(nullif(v_data->>'catalog_name', ''), 'Bez nazwy'),
        nullif(v_data->>'catalog_name', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'category_id', ''),
        nullif(v_data->>'category', ''),
        v_price,
        public.nhp_num(v_data->>'base_price'),
        public.nhp_num(v_data->>'price_before_promo'),
        public.nhp_num(v_data->>'delivery_cost'),
        nullif(v_data->>'shipping_time', ''),
        coalesce(v_data->'images', '[]'::jsonb),
        (select string_agg(s->>'text', E'\n\n') from jsonb_array_elements(coalesce(v_data->'description_sections', '[]'::jsonb)) s where s->>'type' = 'text'),
        coalesce(v_data->'description_sections', '[]'::jsonb),
        coalesce(v_data->'parameters', '[]'::jsonb),
        nullif(v_data->>'source_link', ''),
        nullif(v_data->>'allegro_product_id', ''),
        v_product,
        coalesce(v_data->'missing', '[]'::jsonb),
        v_status,
        v_now
      ) returning id into v_auction;
    else
      update public.auctions set
        product_id = v_product,
        name = coalesce(nullif(v_data->>'catalog_name', ''), name),
        catalog_name = coalesce(catalog_name, nullif(v_data->>'catalog_name', '')),
        price = coalesce(v_price, price),
        base_price = coalesce(public.nhp_num(v_data->>'base_price'), base_price),
        delivery_cost = coalesce(public.nhp_num(v_data->>'delivery_cost'), delivery_cost),
        missing = coalesce(v_data->'missing', missing),
        status = v_status,
        updated_at = v_now
      where id = v_auction;
    end if;

    insert into public.product_offer_links (auction_id, product_id)
    values (v_auction, v_product)
    on conflict do nothing;

    insert into public.offer_import_items (batch_id, pos, source_offer_id, ean, status, missing, data, product_id, auction_id, updated_at)
    values (
      v_batch,
      coalesce((v_item->>'pos')::int, v_saved),
      nullif(v_data->>'source_offer_id', ''),
      nullif(v_data->>'ean', ''),
      v_status,
      coalesce(v_data->'missing', '[]'::jsonb),
      v_data,
      v_product,
      v_auction,
      v_now
    );
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'saved', v_saved, 'flagged', v_flagged, 'total_items', v_saved, 'url', '/#import-wtyczki');
end;
$$;

create or replace function public.touch_api_key(p_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  update public.api_keys set last_used_at = now()
   where key_hash = p_key_hash and revoked_at is null
   returning label into v_label;
  if v_label is null then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  return jsonb_build_object('ok', true, 'label', v_label);
end;
$$;

revoke all on function public.import_offer_export(text, jsonb) from public;
revoke all on function public.touch_api_key(text) from public;
grant execute on function public.import_offer_export(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.touch_api_key(text) to anon, authenticated, service_role;

alter table public.allegro_secrets enable row level security;
alter table public.allegro_oauth_states enable row level security;
revoke all on public.allegro_secrets from anon, authenticated;
revoke all on public.allegro_oauth_states from anon, authenticated;
grant all on public.allegro_secrets to service_role;
grant all on public.allegro_oauth_states to service_role;

-- Pliki wideo i zdjęć. Ścieżki są losowe. Odczyt publiczny jest potrzebny opublikowanej stronie.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists media_team_read on storage.objects;
drop policy if exists media_team_insert on storage.objects;
drop policy if exists media_team_update on storage.objects;
drop policy if exists media_team_delete on storage.objects;
drop policy if exists media_public_read on storage.objects;
create policy media_team_read on storage.objects for select to authenticated using (bucket_id = 'media' and public.is_team());
create policy media_team_insert on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_team());
create policy media_team_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_team()) with check (bucket_id = 'media' and public.is_team());
create policy media_team_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_team());
create policy media_public_read on storage.objects for select to anon using (bucket_id = 'media');

-- Wgranie zdjęcia z wtyczki bez service_role: zezwolenie po skrócie klucza, deduplikacja po skrócie pliku.
create table if not exists public.media_files (
  sha256 text primary key,
  path text not null unique,
  public_url text not null,
  mime text,
  created_at timestamptz not null default now()
);
alter table public.media_files enable row level security;
revoke all on public.media_files from anon, authenticated;
grant all on public.media_files to service_role;

create table if not exists public.media_upload_permits (
  path text primary key,
  sha256 text not null,
  mime text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.media_upload_permits enable row level security;
revoke all on public.media_upload_permits from anon, authenticated;
grant all on public.media_upload_permits to service_role;

create or replace function public.media_upload_allowed(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.media_upload_permits
    where path = p_path and expires_at > now()
  );
$$;
revoke all on function public.media_upload_allowed(text) from public;
grant execute on function public.media_upload_allowed(text) to anon, authenticated, service_role;

create or replace function public.claim_media_upload(p_key_hash text, p_sha256 text, p_path text, p_mime text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.api_keys where key_hash = p_key_hash and revoked_at is null) then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Zły skrót zdjęcia.';
  end if;
  if p_path is null or p_path !~ '^products/[a-z0-9_-]{1,60}/[a-z0-9_-]{1,60}-[0-9]{1,4}\.(jpg|jpeg|png|webp|gif|avif)$' then
    raise exception 'Zła ścieżka zdjęcia.';
  end if;
  select public_url into v_url from public.media_files where sha256 = p_sha256;
  if v_url is not null then
    return jsonb_build_object('skip', true, 'path', (select path from public.media_files where sha256 = p_sha256), 'public_url', v_url);
  end if;
  insert into public.media_upload_permits (path, sha256, mime, expires_at)
  values (p_path, p_sha256, left(coalesce(p_mime, 'image/jpeg'), 80), now() + interval '20 minutes')
  on conflict (path) do update set sha256 = excluded.sha256, mime = excluded.mime, expires_at = excluded.expires_at;
  return jsonb_build_object('skip', false, 'path', p_path);
end;
$$;

create or replace function public.complete_media_upload(p_key_hash text, p_sha256 text, p_path text, p_public_url text, p_mime text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from public.api_keys where key_hash = p_key_hash and revoked_at is null) then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.media_upload_permits
    where path = p_path and sha256 = p_sha256 and expires_at > now()
  ) then
    raise exception 'Brak zezwolenia na ten plik.';
  end if;
  insert into public.media_files (sha256, path, public_url, mime)
  values (p_sha256, p_path, p_public_url, left(coalesce(p_mime, ''), 80))
  on conflict (sha256) do update set path = excluded.path, public_url = excluded.public_url;
  delete from public.media_upload_permits where path = p_path;
  return jsonb_build_object('ok', true, 'path', p_path, 'public_url', p_public_url);
end;
$$;

revoke all on function public.claim_media_upload(text, text, text, text) from public;
revoke all on function public.complete_media_upload(text, text, text, text, text) from public;
grant execute on function public.claim_media_upload(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.complete_media_upload(text, text, text, text, text) to anon, authenticated, service_role;

drop policy if exists media_permit_insert on storage.objects;
create policy media_permit_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'media' and public.media_upload_allowed(name));

-- Klucz OpenAI: tylko szyfrogram. Brak polityk SELECT. Panel dostaje last4 przez funkcję statusu.
create table if not exists public.openai_connection (
  id smallint primary key default 1 check (id = 1),
  cipher text not null,
  iv text not null,
  last4 text not null,
  text_model text not null,
  image_model text not null,
  proof text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.openai_connection enable row level security;
revoke all on public.openai_connection from anon, authenticated;
grant all on public.openai_connection to service_role;

create or replace function public.openai_connection_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.openai_connection%rowtype;
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  select * into v from public.openai_connection where id = 1;
  if not found then
    return jsonb_build_object('has_key', false, 'last4', '', 'text_model', 'gpt-5-mini', 'image_model', 'gpt-image-1');
  end if;
  return jsonb_build_object(
    'has_key', true,
    'last4', v.last4,
    'text_model', v.text_model,
    'image_model', v.image_model
  );
end;
$$;

create or replace function public.openai_connection_save(
  p_cipher text,
  p_iv text,
  p_last4 text,
  p_text_model text,
  p_image_model text,
  p_proof text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_cipher is null or p_cipher !~ '^[A-Za-z0-9+/]+=*$' or length(p_cipher) < 16 or length(p_cipher) > 8000 then
    raise exception 'Zły szyfrogram.';
  end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]+=*$' or length(p_iv) < 8 or length(p_iv) > 64 then
    raise exception 'Zły wektor szyfrowania.';
  end if;
  if p_last4 is null or p_last4 !~ '^[A-Za-z0-9]{4}$' then
    raise exception 'Zła końcówka klucza.';
  end if;
  if p_text_model is null or p_text_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu tekstu.';
  end if;
  if p_image_model is null or p_image_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu zdjęć.';
  end if;
  if p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then
    raise exception 'Zły dowód szyfrowania.';
  end if;
  insert into public.openai_connection (id, cipher, iv, last4, text_model, image_model, proof, updated_by)
  values (1, p_cipher, p_iv, p_last4, p_text_model, p_image_model, p_proof, auth.uid())
  on conflict (id) do update set
    cipher = excluded.cipher,
    iv = excluded.iv,
    last4 = excluded.last4,
    text_model = excluded.text_model,
    image_model = excluded.image_model,
    proof = excluded.proof,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

create or replace function public.openai_connection_models(p_text_model text, p_image_model text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_text_model is null or p_text_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu tekstu.';
  end if;
  if p_image_model is null or p_image_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu zdjęć.';
  end if;
  update public.openai_connection
     set text_model = p_text_model, image_model = p_image_model, updated_at = now(), updated_by = auth.uid()
   where id = 1;
  if not found then
    raise exception 'Najpierw zapisz klucz OpenAI.';
  end if;
end;
$$;

create or replace function public.openai_connection_clear()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  delete from public.openai_connection where id = 1;
end;
$$;

-- Szyfrogram tylko dla wywołania z dowodem sha256(NHP_ENC_KEY). Sam dowód nie odszyfrowuje klucza.
create or replace function public.openai_connection_cipher(p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.openai_connection%rowtype;
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then
    raise exception 'Brak dostępu do zapisanego klucza.' using errcode = '42501';
  end if;
  select * into v from public.openai_connection where id = 1;
  if not found then
    return null;
  end if;
  if v.proof is distinct from p_proof then
    raise exception 'Brak dostępu do zapisanego klucza.' using errcode = '42501';
  end if;
  return jsonb_build_object('cipher', v.cipher, 'iv', v.iv, 'text_model', v.text_model, 'image_model', v.image_model);
end;
$$;

revoke all on function public.openai_connection_status() from public, anon;
revoke all on function public.openai_connection_save(text, text, text, text, text, text) from public, anon;
revoke all on function public.openai_connection_models(text, text) from public, anon;
revoke all on function public.openai_connection_clear() from public, anon;
revoke all on function public.openai_connection_cipher(text) from public, anon;
grant execute on function public.openai_connection_status() to authenticated, service_role;
grant execute on function public.openai_connection_save(text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.openai_connection_models(text, text) to authenticated, service_role;
grant execute on function public.openai_connection_clear() to authenticated, service_role;
grant execute on function public.openai_connection_cipher(text) to authenticated, service_role;

