/* =========================================================
   APS / PIPEWISE - DEPLOYMENT CONFIGURATION
   ---------------------------------------------------------
   This file holds NOTHING secret. It is served to every
   visitor, so a password, API key, service key or client secret
   must never be typed in here.

   Read that again before pasting anything below. Every value in
   this file is safe to publish.

   THE GROUP CLOUD
     APS shares one cloud with AGA and APC - the same Supabase
     project the Glass & Aluminium app already uses. One project,
     not three, so the group can be reported on as a whole.

     What keeps the trades apart is not a separate project but
     the `trade` column: every quote is stamped 'aps' on the way
     in and filtered by it on the way out, so this app reads the
     plumbing book and never the coatings one.

   APS_CLOUD_FUNCTION_URL
     The backend function that reads and writes the shared quote
     database. See supabase/SETUP-CLOUD.md.

   APS_SUPABASE_ANON_KEY
     The project's PUBLIC (publishable) key. It is designed to be
     shipped in front-end code: it identifies the project, it
     does not grant access on its own, and this file is served to
     every visitor anyway.

     DO NOT paste the sb_secret_... or service_role key here.
     That one bypasses Row Level Security entirely and would hand
     the whole group's quote history to anyone who opens View
     Source.

   While these are left blank the app still works exactly as it
   always has: quotes are saved on the device, everything is
   usable offline, and the cloud buttons stay hidden so nobody is
   shown a control that cannot work.
   ========================================================= */
"use strict";

window.APS_CLOUD_FUNCTION_URL =
    "https://mvymxqajdiupucrkeqpg.supabase.co/functions/v1/cloud";

window.APS_SUPABASE_ANON_KEY =
    "sb_publishable_U5wCUR1JeDskIqQdGwdAbg_zaczJYlJ";
