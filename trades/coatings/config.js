/* =========================================================
   APC ARCHITECTURAL PERFORMANCE COATINGS - TRADE CONFIGURATION
   ---------------------------------------------------------
   This file holds NOTHING secret. It is served to every
   visitor, so a password, API key or client secret must never
   be typed in here.

   THE GROUP CLOUD
     APC is one of three trades on ONE site, sharing ONE cloud:
     the same Supabase project the Glass & Aluminium app already
     uses. One project, not three, so the group can be reported
     on as a whole.

     The address and key are NOT repeated here. They are read
     from AGA's supabase-config.js by aga-cloud.js - the single
     source of truth for the whole site - so rotating the key is
     one edit in one file, not three edits that can drift apart
     and leave a trade silently unable to sync.

     What keeps the trades apart is not a separate project but
     the `trade` column: every quote is stamped 'apc' on the way
     in and filtered by it on the way out, so this app reads the
     construction book and never the plumbing one. That key lives
     in app.js (CLOUD_TRADE), which is where it belongs - it is a
     fact about this app, not about the cloud.

   APC_DRIVE_FUNCTION_URL
     The ONE value that is genuinely APC's own: an optional
     backend function that reaches a shared Google Drive folder,
     separate from the quote cloud above. See
     supabase/SETUP-DRIVE.md. Leave it blank and the Drive
     buttons simply stay hidden.

     This stays here rather than moving to the shared config
     because no other trade has it. Anything the other trades DO
     share belongs in aga-cloud.js.
   ========================================================= */
"use strict";

window.APC_DRIVE_FUNCTION_URL = "";

/*
   APC_CLOUD_FUNCTION_URL and APC_SUPABASE_ANON_KEY are set by
   aga-cloud.js, from AGA's config. Do not re-add them here: a
   second copy of the project URL and key is exactly what this
   arrangement removes.
*/
