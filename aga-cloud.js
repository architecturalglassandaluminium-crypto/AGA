/* =========================================================
   AGA GROUP - ONE CLOUD CONFIGURATION (SHARED)
   ---------------------------------------------------------
   ONE SITE, ONE CLOUD.

   All three trades - Architectural Glass & Aluminium, APS
   (plumbing) and APC (coatings) - are served from this one
   site and quote through this one Supabase project.

   This file is the ONE place the quoting trades read the
   cloud address and key from. Before it existed, the same
   project URL and the same publishable key were typed out
   three times:

       supabase-config.js          (AGA)
       trades/plumbing/config.js   (APS)
       trades/coatings/config.js   (APC)

   Three copies of one key is three chances to drift. Rotating
   the key at the Supabase dashboard meant editing three files,
   and missing one left that trade quietly unable to sync while
   the other two carried on working - the kind of fault nobody
   notices until someone goes looking for a job that was quoted.

   Now the values are read from AGA's config and passed on, so
   AGA's supabase-config.js is the single source of truth.
   Change it there and every trade follows.

   WHERE THE VALUES COME FROM
     supabase-config.js exposes SUPABASE_URL and
     SUPABASE_ANON_KEY as global constants. This file derives
     the function endpoint from that URL, so the project is
     named exactly once in the whole codebase.

   NOTHING SECRET LIVES HERE
     The publishable key is designed to be shipped in
     front-end code: it identifies the project, it does not
     grant access on its own, and both this file and
     supabase-config.js are served to every visitor. What
     protects the data is the Row Level Security in
     supabase/trades-schema.sql.

     NEVER paste the sb_secret_... or service_role key here, or
     into any config file on this site. That one bypasses Row
     Level Security entirely and would hand the whole group's
     quote history to anyone who opens View Source.

   HOW THE TRADES USE IT
     Each trade app reads window.APS_* / window.APC_* as it
     always has. Those names are filled in below from the one
     shared source, so no trade app had to change - only the
     place the value comes from did.

     A trade must still send its own `trade` key ('aps' or
     'apc') with every request; that is what keeps the three
     books apart in the one shared table. See CLOUD_TRADE in
     each app.
   ========================================================= */

"use strict";

(function () {

   /*
      AGA's config, loaded before this file. Read defensively:
      if someone loads this without supabase-config.js the
      trades must still work offline rather than throwing on
      load and leaving a blank page.
   */
   var agaUrl = (typeof SUPABASE_URL === "string" && SUPABASE_URL.trim()) || "";
   var agaKey = (typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY.trim()) || "";

   /*
      The shared quote backend, derived from the project URL so
      the project itself is written down in exactly one place.
      Trailing slashes are trimmed first, or a URL ending in "/"
      would produce a double slash and a 404.
   */
   var functionsUrl = agaUrl
      ? agaUrl.replace(/\/+$/, "") + "/functions/v1/cloud"
      : "";

   /*
      Hand the same two values to every trade, under the names
      each app already looks for. Kept as window properties
      because the trade apps are plain scripts, not modules.
   */
   window.AGA_CLOUD_FUNCTION_URL = functionsUrl;
   window.AGA_SUPABASE_ANON_KEY = agaKey;

   window.APS_CLOUD_FUNCTION_URL = functionsUrl;
   window.APS_SUPABASE_ANON_KEY = agaKey;

   window.APC_CLOUD_FUNCTION_URL = functionsUrl;
   window.APC_SUPABASE_ANON_KEY = agaKey;

})();