/* =========================================================
   APS ARCHITECTURAL PERFORMANCE COATINGS — DEPLOYMENT CONFIGURATION
   ---------------------------------------------------------
   This file holds NOTHING secret. It is served to every
   visitor, so a password, API key or client secret must never
   be typed in here.

   APS_DRIVE_FUNCTION_URL
     The URL of the small backend function that reaches the
     shared Google Drive folder. After you deploy the function
     (see supabase/SETUP-DRIVE.md) paste its URL between the
     quotes below and save.

     It looks like:
       https://abcdefghijklm.supabase.co/functions/v1/drive

     While this is left blank the app still works perfectly:
     quotes are saved on the device and the Drive buttons stay
     hidden, so nobody is shown a control that cannot work.
   ========================================================= */
"use strict";

window.APS_DRIVE_FUNCTION_URL = "";
