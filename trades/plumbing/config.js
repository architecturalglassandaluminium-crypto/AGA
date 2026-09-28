/* =========================================================
   APS / PIPEWISE - TRADE CONFIGURATION
   ---------------------------------------------------------
   This file holds NOTHING secret. It is served to every
   visitor, so a password, API key, service key or client secret
   must never be typed in here.

   Read that again before pasting anything below. Every value in
   this file is safe to publish.

   THE GROUP CLOUD
     APS is one of three trades on ONE site, sharing ONE cloud:
     the same Supabase project the Glass & Aluminium app already
     uses. One project, not three, so the group can be reported
     on as a whole.

     The address and key are NOT repeated here. They are read
     from AGA's supabase-config.js by aga-cloud.js - the single
     source of truth for the whole site - so rotating the key is
     one edit in one file, not three edits that can drift apart
     and leave a trade silently unable to sync.

     What keeps the trades apart is not a separate project but
     the `trade` column: every quote is stamped 'aps' on the way
     in and filtered by it on the way out, so this app reads the
     plumbing book and never the coatings one. That key lives in
     app.js (CLOUD_TRADE), which is where it belongs - it is a
     fact about this app, not about the cloud.

   While the cloud is left unconfigured the app still works
   exactly as it always has: quotes are saved on the device,
   everything is usable offline, and the cloud buttons stay
   hidden so nobody is shown a control that cannot work.
   ========================================================= */

"use strict";

/*
   APS has no trade-specific settings of its own.

   APS_CLOUD_FUNCTION_URL and APS_SUPABASE_ANON_KEY are set by
   aga-cloud.js, from AGA's config. Do not re-add them here: a
   second copy of the project URL and key is exactly what this
   arrangement removes.
*/
