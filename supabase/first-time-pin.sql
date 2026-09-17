-- =========================================================
-- AGA - FIRST-TIME PIN ENROLMENT
-- ---------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor, after schema.sql.
--
-- WHAT THIS CHANGES
--
-- Before: an employee could not sign in until somebody ran
-- set_employee_pin() for them, by hand, from this editor. A new
-- hire was invisible to the sign-in list until then.
--
-- After: an employee is created with NO PIN. The first time they
-- pick their name, the app asks them to CHOOSE one, and saves it.
--
-- WHY NOT A DEFAULT PIN OF 0000
--
-- A shared default is not a secret. The staff list is readable by
-- anyone holding the publishable key (see "read employees" in
-- schema.sql), so every name is public, and anyone could sign in as
-- any colleague who had not yet changed theirs - which is exactly
-- the impersonation the PIN exists to prevent (see the header of
-- signin.js).
--
-- Instead: no PIN means "not enrolled yet", which is a state that
-- can be told apart from "has a PIN", and the person claims their
-- own name on first use.
--
-- This is idempotent - safe to run more than once.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Tell "no PIN yet" apart from "PIN is set"
-- ---------------------------------------------------------
-- pin_hash alone cannot express this: it is either a hash or NULL,
-- and NULL is what we want for "not enrolled". pin_set_at records
-- WHEN they enrolled, which is also useful for an audit.
alter table employees
    add column if not exists pin_set_at timestamptz;

-- Anyone who already has a PIN was enrolled by hand, so backfill
-- the timestamp from their last update - otherwise they would look
-- un-enrolled and be asked to set a PIN they already have.
update employees
   set pin_set_at = coalesce(updated_at, created_at, now())
 where pin_hash is not null
   and pin_set_at is null;

-- ---------------------------------------------------------
-- 2. Does this employee still need to choose a PIN?
-- ---------------------------------------------------------
-- The sign-in form calls this the moment a name is picked, so it
-- can show "Set your PIN" instead of "Enter your PIN".
--
-- Deliberately returns ONLY a boolean: no name, no hash, nothing
-- that would let a caller learn anything else about the row.
create or replace function employee_needs_pin(p_employee_id uuid)
returns boolean
language sql
security definer
stable
as $$
    select coalesce(
        (
            select e.is_active
               and (e.pin_hash is null or e.pin_set_at is null)
              from employees e
             where e.id = p_employee_id
        ),
        false
    );
$$;

-- ---------------------------------------------------------
-- 3. Claim a name by choosing a PIN
-- ---------------------------------------------------------
-- This is the one function the app can call to WRITE a PIN, and it
-- is written so that it can only ever set a PIN where none exists:
--
--   * it refuses if a PIN is already set (pin_hash is not null),
--     so it cannot be used to overwrite somebody's PIN - an
--     attacker cannot re-enrol a colleague and take their name;
--
--   * it refuses an inactive employee;
--
--   * it enforces 4-6 digits in the database, not just the form,
--     because the form is not the boundary.
create or replace function claim_employee_pin(
    p_employee_id uuid,
    p_pin         text
)
returns boolean
language plpgsql
security definer
as $$
declare
    affected integer;
begin
    if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
        raise exception 'PIN must be 4 to 6 digits';
    end if;

    update employees
       set pin_hash   = crypt(p_pin, gen_salt('bf')),
           pin_set_at = now(),
           updated_at = now()
     where id = p_employee_id
       and is_active
       -- The guard that makes this safe: only ever fill a gap.
       and pin_hash is null;

    get diagnostics affected = row_count;

    return affected > 0;
end;
$$;

-- ---------------------------------------------------------
-- 4. Permissions
-- ---------------------------------------------------------
-- Both functions are SECURITY DEFINER, so they run with the
-- privileges of their owner rather than the caller's - which is
-- what lets an anonymous phone enrol without being granted UPDATE
-- on the employees table directly.
--
-- anon gets execute on exactly these two. It does NOT get update
-- on employees, so the only write it can make to a PIN is through
-- claim_employee_pin, with its "only if empty" guard.
grant execute on function employee_needs_pin(uuid)   to anon, authenticated;
grant execute on function claim_employee_pin(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------
-- 5. Check
-- ---------------------------------------------------------
-- Expect one row per active employee, with needs_pin true for
-- anyone who has not chosen one yet:
--
--   select name, pin_hash is null as no_pin, pin_set_at
--     from employees
--    order by name;
-- =========================================================
