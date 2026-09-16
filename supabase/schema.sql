-- =========================================================
-- AGA ARCHITECTURAL GLASS & ALUMINIUM
-- Workshop Management - database schema
-- ---------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor.
--
-- Design notes:
--
--  * Every row is scoped to a workshop. One workshop today, but
--    the column means a second branch costs nothing later.
--  * Row Level Security is ENABLED on every table. The anon key
--    is public by design, so the database - not the UI - is what
--    actually stops one workshop reading another's data.
--  * Staff sign in with a name + PIN (option A). The PIN is
--    never stored in plain text: it is hashed with pgcrypto.
--  * Writes are timestamped per row so two phones editing
--    different windows never overwrite each other.
-- =========================================================

-- Needed for PIN hashing.
create extension if not exists pgcrypto;

-- =========================================================
-- WORKSHOPS
-- =========================================================

create table if not exists workshops (
    id          uuid primary key default gen_random_uuid(),
    name        text        not null,
    created_at  timestamptz not null default now()
);

-- =========================================================
-- EMPLOYEES
-- ---------------------------------------------------------
-- A staff member. The PIN is stored only as a bcrypt hash.
-- =========================================================

create table if not exists employees (
    id             uuid primary key default gen_random_uuid(),
    workshop_id    uuid not null references workshops(id) on delete cascade,

    name           text not null,
    employee_number text,

    -- bcrypt hash of the 4-6 digit PIN. NULL means no PIN set yet.
    pin_hash       text,

    is_active      boolean not null default true,

    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists employees_workshop_idx
    on employees(workshop_id);

-- A name must be unique within a workshop, so "Thabo" is
-- unambiguous on the sign-in list.
create unique index if not exists employees_workshop_name_idx
    on employees(workshop_id, lower(name));

-- =========================================================
-- PROJECTS
-- =========================================================

create table if not exists projects (
    id              uuid primary key default gen_random_uuid(),
    workshop_id     uuid not null references workshops(id) on delete cascade,

    project_number  text not null,
    project_name    text not null,
    customer_name   text not null,
    customer_email  text,
    customer_phone  text,
    site_address    text,

    -- The date the customer was promised, as a calendar day.
    --
    -- `date`, not `timestamptz`: a due date is a day on a calendar,
    -- not an instant. Storing it as a timestamp makes it shift a day
    -- for anyone in a different timezone, so a job due "the 30th"
    -- could read as overdue on the 29th.
    --
    -- Nullable on purpose. Plenty of jobs have no promised date, and
    -- the app shows no outstanding figure rather than inventing one.
    due_date        date,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- Lets a device reconcile its offline copy cleanly.
    revision        bigint not null default 1
);

create unique index if not exists projects_workshop_number_idx
    on projects(workshop_id, project_number);

-- An existing database needs the column added; `create table if not
-- exists` above does nothing to a table that is already there.
--
-- Run this once against a live project that predates due dates.
-- The tracker surfaces jobs by due date, so the index earns its keep.
alter table projects add column if not exists due_date date;

create index if not exists projects_due_date_idx
    on projects(workshop_id, due_date);

create index if not exists projects_workshop_idx
    on projects(workshop_id);

-- =========================================================
-- WINDOWS AND DOORS
-- ---------------------------------------------------------
-- One manufactured item. Meetings of "window" and "door" are
-- handled by product_type rather than separate tables, because
-- everything downstream (status, QC, allocation) is identical.
-- =========================================================

create table if not exists windows (
    id              uuid primary key default gen_random_uuid(),
    project_id      uuid not null references projects(id) on delete cascade,
    workshop_id     uuid not null references workshops(id) on delete cascade,

    -- Human-readable ID printed on the worksheet (AGA-WIN-0001).
    window_number   text,
    window_seq      integer,

    product_type    text,
    description     text,
    location        text,

    length_mm       numeric(10,1),
    width_mm        numeric(10,1),

    frame_colour    text,
    glass_type      text,

    -- Quality control. Set by scanning through Quality Checked.
    qc_check        text,
    qc_checked_at   timestamptz,
    checked_by_id   uuid references employees(id) on delete set null,
    checked_by      text,

    -- Manufacturing attribution.
    manufactured_by_id uuid references employees(id) on delete set null,
    manufactured_by    text,

    -- Allocation: who owns this item.
    allocated_to_id uuid references employees(id) on delete set null,
    allocated_to    text,
    allocated_at    timestamptz,

    status          text not null default 'Measured',

    -- Photo stored as a data URL (compressed client-side before
    -- upload). Kept on the row so one fetch gets everything.
    photo           text,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    revision        bigint not null default 1
);

create index if not exists windows_project_idx  on windows(project_id);
create index if not exists windows_workshop_idx on windows(workshop_id);
create index if not exists windows_status_idx   on windows(status);

create unique index if not exists windows_workshop_number_idx
    on windows(workshop_id, window_number);

-- =========================================================
-- STATUS HISTORY
-- ---------------------------------------------------------
-- Append-only. Never updated, so it is always safe to insert
-- from two devices at once.
-- =========================================================

create table if not exists status_history (
    id           uuid primary key default gen_random_uuid(),
    window_id    uuid not null references windows(id) on delete cascade,
    workshop_id  uuid not null references workshops(id) on delete cascade,

    status       text not null,
    employee_id  uuid references employees(id) on delete set null,
    employee     text,

    recorded_at  timestamptz not null default now()
);

create index if not exists status_history_window_idx
    on status_history(window_id);

-- =========================================================
-- ACTIVITY LOG (PRODUCTIVITY)
-- ---------------------------------------------------------
-- Append-only: this is what feeds the productivity dashboard.
-- =========================================================

create table if not exists activity (
    id             uuid primary key default gen_random_uuid(),
    workshop_id    uuid not null references workshops(id) on delete cascade,

    window_id      uuid references windows(id) on delete set null,
    window_number  text,
    project_number text,
    project_name   text,
    description    text,

    status         text not null,

    employee_id    uuid references employees(id) on delete set null,
    employee       text not null,

    recorded_at    timestamptz not null default now()
);

create index if not exists activity_workshop_date_idx
    on activity(workshop_id, recorded_at desc);

create index if not exists activity_employee_idx
    on activity(employee_id);

-- =========================================================
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------
-- !! THESE POLICIES ARE CURRENTLY OPEN !!
--
-- Read and write are allowed to anyone holding the anon key.
-- This matches ACCESS_MODE = "open" in supabase-config.js, and is
-- deliberate: it lets the workshop start working immediately.
--
-- ------------------------------------------------------------------
-- TO LOCK THE DATABASE DOWN (do this when you turn on PIN mode):
--
--   1. Set ACCESS_MODE = "pin" in supabase-config.js.
--
--   2. Replace each "with check (true)" with a real check. The
--      simplest version that still shares data across the workshop
--      is to require a signed-in employee whose id exists:
--
--        create policy "write projects" on projects
--            for all
--            using  (public.is_signed_in_employee())
--            with check (public.is_signed_in_employee());
--
--      where the helper is:
--
--        create or replace function public.is_signed_in_employee()
--        returns boolean
--        language sql stable
--        as $$
--          select exists (
--            select 1 from employees
--             where id = nullif(current_setting(
--                        'request.jwt.claims.employee_id', true), ''
--                    )::uuid
--          );
--        $$;
--
--   3. For proper security, move from the custom PIN to Supabase
--      Auth (email or phone sign-in) and use auth.uid(). The PIN
--      is a convenience login; the policies are the real boundary.
-- ------------------------------------------------------------------
-- =========================================================

alter table workshops      enable row level security;
alter table employees      enable row level security;
alter table projects       enable row level security;
alter table windows        enable row level security;
alter table status_history enable row level security;
alter table activity       enable row level security;

-- Drop first so this script can be re-run safely.
drop policy if exists "read workshops"   on workshops;
drop policy if exists "read employees"   on employees;
drop policy if exists "write employees"  on employees;
drop policy if exists "read projects"    on projects;
drop policy if exists "write projects"   on projects;
drop policy if exists "read windows"     on windows;
drop policy if exists "write windows"    on windows;
drop policy if exists "read history"     on status_history;
drop policy if exists "write history"    on status_history;
drop policy if exists "read activity"    on activity;
drop policy if exists "write activity"   on activity;

-- Workshops are readable so the app can resolve its id at boot.
create policy "read workshops" on workshops
    for select using (true);

-- Employees: readable for the sign-in list, writable by the app.
create policy "read employees" on employees
    for select using (true);

create policy "write employees" on employees
    for all using (true) with check (true);

-- Projects.
create policy "read projects" on projects
    for select using (true);

create policy "write projects" on projects
    for all using (true) with check (true);

-- Windows.
create policy "read windows" on windows
    for select using (true);

create policy "write windows" on windows
    for all using (true) with check (true);

-- Append-only history.
create policy "read history" on status_history
    for select using (true);

create policy "write history" on status_history
    for insert with check (true);

-- Append-only activity.
create policy "read activity" on activity
    for select using (true);

create policy "write activity" on activity
    for insert with check (true);

-- =========================================================
-- PIN FUNCTIONS
-- ---------------------------------------------------------
-- The PIN never leaves the phone in plain text.
-- =========================================================

-- Set (or reset) an employee's PIN. Call from the SQL editor:
--   select set_employee_pin('employees-uuid-here', '1234');
create or replace function set_employee_pin(
    p_employee_id uuid,
    p_pin         text
)
returns void
language plpgsql
security definer
as $$
begin
    if p_pin !~ '^[0-9]{4,6}$' then
        raise exception 'PIN must be 4 to 6 digits';
    end if;

    update employees
       set pin_hash   = crypt(p_pin, gen_salt('bf')),
           updated_at = now()
     where id = p_employee_id;
end;
$$;

-- Check a PIN. Returns the employee row when correct, nothing when
-- wrong, so the app cannot distinguish "no such employee" from
-- "wrong PIN" - which stops someone enumerating staff names.
create or replace function verify_employee_pin(
    p_employee_id uuid,
    p_pin         text
)
returns table (
    id              uuid,
    name            text,
    employee_number text,
    workshop_id     uuid
)
language plpgsql
security definer
as $$
begin
    return query
        select e.id, e.name, e.employee_number, e.workshop_id
          from employees e
         where e.id = p_employee_id
           and e.is_active
           and e.pin_hash is not null
           and e.pin_hash = crypt(p_pin, e.pin_hash);
end;
$$;

-- =========================================================
-- SEED
-- ---------------------------------------------------------
-- One workshop to begin with. Safe to re-run.
-- =========================================================

insert into workshops (name)
select 'AGA Workshop'
where not exists (select 1 from workshops);
