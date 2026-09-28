/* =========================================================
   APC ARCHITECTURAL PERFORMANCE COATINGS — DEPLOYMENT CONFIGURATION
   ---------------------------------------------------------
   This file holds NOTHING secret. It is served to every
   visitor, so a password, API key or client secret must never
   be typed in here.

   APC_DRIVE_FUNCTION_URL
     The URL of the small backend function that reaches the
     shared Google Drive folder. After you deploy the function
     (see supabase/SETUP-DRIVE.md) paste its URL between the
     quotes below and save.

     It looks like:
       https://abcdefghijklm.supabase.co/functions/v1/drive

   APC_CLOUD_FUNCTION_URL
   APC_SUPABASE_ANON_KEY
     The shared quote database, the same arrangement the APS
     plumbing app uses. See supabase/SETUP-CLOUD.md.

     APC_SUPABASE_ANON_KEY is the project anon (public) key. It
     is designed to be public - it identifies the project, it
     does not grant access, and every request is still filtered
     by row-level security against the signed-in user.

     DO NOT paste the service_role key here, and do not paste a
     sb_secret_... key. Those bypass all row-level security and
     would hand your entire quote history to anyone who opens
     View Source. If you are unsure which key you have: the anon
     key is the one that starts eyJ and is labelled "public" /
     "anon" in the dashboard.

   While these are left blank the app still works perfectly:
   quotes are saved on the device, everything is usable offline,
   and the cloud and Drive buttons stay hidden so nobody is shown
   a control that cannot work.
   ========================================================= */
"use strict";

window.APC_DRIVE_FUNCTION_URL = "";
window.APC_CLOUD_FUNCTION_URL = "";
window.APC_SUPABASE_ANON_KEY = "";
