/* =========================================================
   APC ARCHITECTURAL PERFORMANCE COATINGS — DEPLOYMENT CONFIGURATION
   ---------------------------------------------------------
   This file holds NOTHING secret. It is served to every
   visitor, so a password, API key or client secret must never
   be typed in here.

   THE GROUP CLOUD
     APC shares one cloud with AGA and APS - the same Supabase
     project the Glass & Aluminium app already uses. One project,
     not three, so the group can be reported on as a whole.

     What keeps the trades apart is not a separate project but
     the `trade` column: every quote is stamped 'apc' on the way
     in and filtered by it on the way out, so this app reads the
     construction book and never the plumbing one.

   APC_CLOUD_FUNCTION_URL
     The backend function that reads and writes the shared quote
     database. See supabase/SETUP-CLOUD.md.

   APC_SUPABASE_ANON_KEY
     The project's PUBLIC (publishable) key. It is designed to be
     shipped in front-end code: it identifies the project, it
     does not grant access on its own, and this file is served to
     every visitor anyway.

     DO NOT paste the sb_secret_... or service_role key here.
     That one bypasses Row Level Security entirely and would hand
     the whole group's quote history to anyone who opens View
     Source.

   APC_DRIVE_FUNCTION_URL
     Optional, and separate from the above: a backend function
     that reaches a shared Google Drive folder. See
     supabase/SETUP-DRIVE.md. Leave it blank and the Drive buttons
     simply stay hidden.

   While these are left blank the app still works perfectly:
   quotes are saved on the device, everything is usable offline,
   and the cloud and Drive buttons stay hidden so nobody is shown
   a control that cannot work.
   ========================================================= */
"use strict";

window.APC_DRIVE_FUNCTION_URL = "";

window.APC_CLOUD_FUNCTION_URL =
    "https://mvymxqajdiupucrkeqpg.supabase.co/functions/v1/cloud";

window.APC_SUPABASE_ANON_KEY =
    "sb_publishable_U5wCUR1JeDskIqQdGwdAbg_zaczJYlJ";
