/* =========================================================
   APS / PIPEWISE - DEPLOYMENT CONFIGURATION
   ---------------------------------------------------------
   This file holds NOTHING secret. It is served to every
   visitor, so a password, API key, service key or client secret
   must never be typed in here.

   Read that again before pasting anything below. There are only
   ever two values in this file, and both are safe to publish:

   APS_CLOUD_FUNCTION_URL
     The URL of the small backend function that reads and writes
     the shared quote database. See supabase/SETUP-CLOUD.md.

     It looks like:
       https://abcdefghijklm.supabase.co/functions/v1/cloud

   APS_SUPABASE_ANON_KEY
     The project anon (public) key. This is designed to be
     public - it identifies the project, it does not grant access.
     Every request it makes is still filtered by row-level
     security against the signed-in user.

     DO NOT paste the service_role key here, and do not paste a
     sb_secret_... key. Those bypass all row-level security and
     would hand your entire quote history to anyone who opens
     View Source. If you are unsure which key you have: the anon
     key is the one that starts eyJ and is labelled "public" /
     "anon" in the dashboard.

   While both of these are left blank the app still works exactly
   as it always has: quotes are saved on the device, everything is
   usable offline, and the cloud buttons stay hidden so nobody is
   shown a control that cannot work.
   ========================================================= */
"use strict";

window.APS_CLOUD_FUNCTION_URL = "";
window.APS_SUPABASE_ANON_KEY = "";
