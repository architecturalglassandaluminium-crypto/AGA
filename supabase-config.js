/* =========================================================
   AGA - BACKEND CONFIGURATION
   ---------------------------------------------------------
   Fill in the two values from your Supabase project:

     Supabase dashboard -> Project Settings -> API

       Project URL      -> SUPABASE_URL
       anon public key  -> SUPABASE_ANON_KEY

   BOTH ARE SAFE TO BE PUBLIC. The anon key is designed to be
   shipped in front-end code; what actually protects your data is
   the Row Level Security in supabase/schema.sql.

   NEVER put the "service_role" key in this file. It bypasses all
   security and this file is served to every visitor.
   ========================================================= */

"use strict";

const SUPABASE_URL = "";        /* e.g. https://abcdefgh.supabase.co */

const SUPABASE_ANON_KEY = "";   /* e.g. eyJhbGciOi... */

/*
   The workshop this build belongs to. Generated when you run the
   schema; find it with:

       select id from workshops;

   Leave blank and the app will look up the single workshop row.
*/
const SUPABASE_WORKSHOP_ID = "";

/* =========================================================
   ACCESS MODE
   ---------------------------------------------------------

   "open"  - anyone who opens the link can use the app. No PIN.
             Chosen deliberately for now, to get the workshop
             running. Employees still pick their name when scanning,
             so work is still attributed to a person.

   "pin"   - staff pick their name and enter a PIN once per phone.

   TO LOCK IT DOWN LATER:
     1. Set ACCESS_MODE to "pin" below.
     2. Add your staff and give each a PIN (see supabase/SETUP.md,
        steps 5 and 6).
     3. Tighten the database policies - supabase/schema.sql has a
        marked section explaining exactly what to change.
   ========================================================= */

const ACCESS_MODE = "open";

/*
   Is the app running without a PIN?
*/
function isOpenAccess() {
    return ACCESS_MODE !== "pin";
}

window.isOpenAccess = isOpenAccess;

/*
   Is a backend configured? While the two values above are blank the
   app stays entirely offline and keeps using localStorage, so the
   workshop is never left with a broken tool mid-setup.
*/
function isBackendConfigured() {

    /*
       Deliberately self-contained: this file loads before app.js,
       so it must not depend on helpers defined there.
    */
    return Boolean(
        String(SUPABASE_URL || "").trim() &&
        String(SUPABASE_ANON_KEY || "").trim()
    );
}

window.isBackendConfigured = isBackendConfigured;
