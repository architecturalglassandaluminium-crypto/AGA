-- =========================================================
-- AGA GROUP - TRADES CLOUD SCHEMA
-- ---------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor, in the SAME
-- project the AGA app already uses.
--
-- WHAT THIS IS FOR
-- ----------------
-- The three trades quote through one app:
--
--   aga   Architectural Glass & Aluminium
--   aps   Architectural Plumbing Services
--   apc   Architectural Performance Coatings
--
-- The window/door production data AGA already keeps is in
-- schema.sql and is untouched by this file. This adds the
-- quoting side that the APS and APC apps share: their saved
-- quotes, and the company settings and price list that every
-- device should quote from.
--
-- ONE TABLE, A TRADE COLUMN
-- -------------------------
-- Rather than three near-identical tables, every quote carries
-- the trade that wrote it. The apps each read their own trade
-- and never see the others' quotes, while the group can still
-- be reported on as a whole from one query.
--
-- WHY A QUOTE IS ONE JSON COLUMN
-- ------------------------------
-- A quote is a deeply nested document - customer, labour,
-- materials, services, totals, photos. Modelled as columns it
-- would be a dozen tables joined on every read, and each app
-- change would need a migration. The apps never query INSIDE a
-- quote; they save it, list it, and delete it. So the body is
-- stored whole, and only the fields needed to find a row - id,
-- trade, updated_at - are columns. This is the same shape the
-- apps already use in localStorage, so nothing is reshaped in
-- transit.
--
-- ACCESS
-- ------
-- Chosen deliberately for now: everyone has access everywhere.
-- There is no sign-in requirement, and any of the three trades
-- can read and write any trade's rows. The policies below say
-- that plainly, so it is obvious what is protecting the data:
-- nothing but the anon key being unlisted. Tighten the marked
-- section at the bottom before this holds anything sensitive.
-- =========================================================

-- =========================================================
-- QUOTES
-- ---------------------------------------------------------
-- One row per saved quote, shared by every device.
-- =========================================================

create table if not exists trade_quotes (
    -- The quote's own id, minted by the app that created it. Two
    -- phones that both start "quote 40" therefore cannot collide.
    id          text primary key,

    trade       text not null,

    -- The whole quote document, exactly as the app holds it.
    body        jsonb not null default '{}'::jsonb,

    created_at  timestamptz not null default now(),

    /*
       Stamped by the DATABASE on every write, never by the device.

       The two apps resolve a conflict by newest-wins, so a phone
       with a wrong clock would otherwise be able to claim its copy
       is the fresh one and overwrite real work.
    */
    updated_at  timestamptz not null default now()
);

create index if not exists trade_quotes_trade_updated_idx
    on trade_quotes (trade, updated_at desc);

-- =========================================================
-- COMPANY SETTINGS AND PRICE LIST
-- ---------------------------------------------------------
-- One row per trade. Shared on purpose: two staff quoting the
-- same job must not quote it at different rates.
-- =========================================================

create table if not exists trade_settings (
    trade       text primary key,
    body        jsonb not null default '{}'::jsonb,
    updated_at  timestamptz not null default now()
);

create table if not exists trade_prices (
    trade       text primary key,
    body        jsonb not null default '{}'::jsonb,
    updated_at  timestamptz not null default now()
);

-- =========================================================
-- KEEP updated_at HONEST
-- ---------------------------------------------------------
-- A BEFORE UPDATE trigger, so the timestamp cannot be set by
-- the client even if it tried. This is what makes newest-wins
-- trustworthy.
-- =========================================================

create or replace function touch_trade_row()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trade_quotes_touch on trade_quotes;
create trigger trade_quotes_touch
    before update on trade_quotes
    for each row execute function touch_trade_row();

drop trigger if exists trade_settings_touch on trade_settings;
create trigger trade_settings_touch
    before update on trade_settings
    for each row execute function touch_trade_row();

drop trigger if exists trade_prices_touch on trade_prices;
create trigger trade_prices_touch
    before update on trade_prices
    for each row execute function touch_trade_row();

-- =========================================================
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------
-- Enabled on every table, as it is on the workshop tables.
-- The anon key is public by design, so the database - not the
-- UI - is what decides who can reach what.
-- =========================================================

alter table trade_quotes   enable row level security;
alter table trade_settings enable row level security;
alter table trade_prices   enable row level security;

/*
   =========================================================
   OPEN ACCESS - EVERYONE HAS ACCESS EVERYWHERE
   ---------------------------------------------------------
   These four policies allow any holder of the anon key to read
   and write every trade's quotes and settings. That is what was
   asked for while the group gets running, and it matches the
   AGA app's ACCESS_MODE = "open".

   TO TIGHTEN THIS LATER:

     1. Require sign-in too, so the anon key alone is not enough:

          drop policy if exists "open read"  on trade_quotes;
          drop policy if exists "open write" on trade_quotes;
          create policy "signed-in read"  on trade_quotes
              for select to authenticated using (true);
          create policy "signed-in write" on trade_quotes
              for all    to authenticated using (true) with check (true);

     2. Restrict a trade to its own quotes, so the plumbing app can
        never read the coatings book:

          drop policy if exists "signed-in read" on trade_quotes;
          create policy "own trade only" on trade_quotes
              for all to authenticated
              using (trade = (auth.jwt() -> 'user_metadata' ->> 'trade'))
              with check (trade = (auth.jwt() -> 'user_metadata' ->> 'trade'));

        and set user_metadata.trade when you create each staff login.

     3. Do the same for trade_settings and trade_prices.
   =========================================================
*/

drop policy if exists "open read"  on trade_quotes;
create policy "open read" on trade_quotes
    for select using (true);

drop policy if exists "open write" on trade_quotes;
create policy "open write" on trade_quotes
    for all using (true) with check (true);

drop policy if exists "open read"  on trade_settings;
create policy "open read" on trade_settings
    for select using (true);

drop policy if exists "open write" on trade_settings;
create policy "open write" on trade_settings
    for all using (true) with check (true);

drop policy if exists "open read"  on trade_prices;
create policy "open read" on trade_prices
    for select using (true);

drop policy if exists "open write" on trade_prices;
create policy "open write" on trade_prices
    for all using (true) with check (true);

-- =========================================================
-- DONE.
-- Next: deploy the cloud function - see supabase/SETUP-CLOUD.md
-- =========================================================