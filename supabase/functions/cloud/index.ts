/* =========================================================
   Supabase Edge Function: cloud
   ---------------------------------------------------------
   The shared quote store for the APS and APC quoting apps, in
   the same Supabase project the AGA app already uses.

   WHY THIS EXISTS ON A SERVER
   ---------------------------
   The apps are hosted on GitHub Pages, which serves static
   files only. A page cannot hold a database credential, because
   anything in the page is readable by every visitor. So the
   page calls this function, and this function holds the key and
   talks to the database.

   NO THIRD-PARTY IMPORT - ON PURPOSE
   ----------------------------------
   This function talks to PostgREST with plain fetch() instead of
   importing @supabase/supabase-js. An earlier version imported it
   from esm.sh, and the deployed function returned a bare
   500 Internal Server Error on every request - no JSON, no log
   message, nothing the app could act on.

   A 500 with no body means the module never finished loading, so
   nothing inside it ever ran, including its own error handler.
   The import was the one thing that could fail that way: it is
   fetched from a third-party domain at module scope.

   The REST calls here need no library. PostgREST is a plain HTTP
   API, and the app only ever lists, saves and deletes rows - so
   the dependency bought nothing and could break everything.

   IT DOES NOT HOLD A SECRET
   -------------------------
   Unlike the email function, this one needs no secret of its
   own: it talks to the database with the service role key, which
   Supabase supplies to every function automatically as
   SUPABASE_SERVICE_ROLE_KEY. Nothing has to be pasted here.

   THE CONTRACT
   ------------
   Every call is  GET/POST  <url>?action=<name>  with the anon key
   in the apikey header. The apps already speak this; the shapes
   below are what they expect back.

     action=status       -> { configured }
     action=list         -> { quotes: [ { id, body, updated_at } ] }
     action=save         -> POST { id, trade, quote }  -> { saved }
     action=delete       -> POST { id }                -> { deleted }
     action=settings     -> { body }        | POST { ... }  -> { saved }
     action=price-list   -> { body }        | POST { ... }  -> { saved }

   WHICH TRADE A CALL BELONGS TO
   -----------------------------
   The trade travels in the `trade` query parameter, and is
   required for the list, save, settings and price-list actions.
   A quote is stamped with it on the way in and filtered by it on
   the way out, so the plumbing app reads plumbing quotes and the
   coatings app reads coatings ones.

   ACCESS
   ------
   Open, as agreed for now: there is no sign-in requirement here,
   and the database policies allow any holder of the anon key to
   read and write every trade's rows. That is deliberate while
   the group gets running, and it matches the AGA app's
   ACCESS_MODE = "open". The policies in supabase/trades-schema.sql
   carry a marked section explaining how to require sign-in and
   confine each trade to its own quotes later.
   ========================================================= */

/* The trade keys the apps use. Anything else is rejected rather
   than written, so a typo cannot create a fourth, invisible
   book that no app will ever read again. */
const TRADES = ["aga", "aps", "apc"];

/* CORS. The apps are served from GitHub Pages and this function
   lives on a Supabase domain, so every call is cross-origin:
   without these headers the browser blocks the response.

   A LIST, not a single origin. AGA is worked on from the deployed
   site AND from a local preview server, and a function pinned to
   one of them silently fails on the other. Adding an origin to
   AGA_ALLOWED_ORIGIN (comma-separated) adds it here.
*/
const ALLOWED_ORIGINS = (
    Deno.env.get("AGA_ALLOWED_ORIGIN") ||
    "https://architecturalglassandaluminium-crypto.github.io,http://127.0.0.1:8800,http://localhost:8800"
)
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

/*
   The origin to answer, remembered for the length of one request.

   Every reply needs the CORS headers, and threading the request
   through twenty-odd json() call sites would be noise that could
   silently miss one. It is set once at the top of the handler, and
   an edge isolate serves one request at a time, so there is no
   chance of two requests reading each other's value.
*/
let requestOrigin = "";

/*
   Echo back the origin that asked, if it is one we serve. Echoing
   rather than always sending the first entry matters because the
   browser rejects a reply whose Allow-Origin does not match the
   page that made the request.
*/
function corsHeaders() {
    const allowed = ALLOWED_ORIGINS.includes(requestOrigin)
        ? requestOrigin
        : ALLOWED_ORIGINS[0];

    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };
}

function json(status: number, payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders()
        }
    });
}

/* =========================================================
   THE DATABASE, OVER PLAIN HTTP
   ========================================================= */

/*
   The REST base and the key.

   Read once, lazily, so a missing variable is reported by an
   ordinary JSON reply rather than throwing at module load - which
   is the failure this file exists to avoid.
*/
function config() {
    const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!url || !key) {
        return null;
    }

    return { rest: url + "/rest/v1", key };
}

/*
   One PostgREST call, as fetch.

   `path` is everything after the table name, e.g.
   "?trade=eq.aps&select=id,body,updated_at&order=updated_at.desc".

   PostgREST answers 200/201/204 for success; anything else is
   turned into a thrown Error so the caller's catch block reports
   it, rather than the app being handed a silent failure.
*/
async function rest(
    conf: { rest: string; key: string },
    table: string,
    path: string,
    init: RequestInit = {}
) {
    const response = await fetch(`${conf.rest}/${table}${path}`, {
        ...init,
        headers: {
            apikey: conf.key,
            Authorization: `Bearer ${conf.key}`,
            "Content-Type": "application/json",
            /* Ask for the saved row back on a write, so a write that
               silently matched nothing is visible rather than assumed. */
            Prefer: "return=representation",
            ...(init.headers || {})
        }
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(`${table} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/* Read the trade from the query string, rejecting anything unknown. */
function readTrade(url: URL): string | null {
    const trade = String(url.searchParams.get("trade") || "").trim().toLowerCase();
    return TRADES.includes(trade) ? trade : null;
}

Deno.serve(async (request: Request) => {

    /* Remember who asked, so every reply carries the right CORS
       header. Set before anything can return. */
    requestOrigin = request.headers.get("Origin") || "";

    /*
       The browser sends a preflight OPTIONS before a cross-origin
       POST, and it must be answered with the CORS headers or the
       real request is never sent. Answered before the database is
       consulted, so a preflight can never fail on configuration.
    */
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    /*
       Everything from here on is wrapped, including reading the
       configuration. A function that throws at module scope is
       what cost this deployment a day: the platform answers a bare
       500 and the app can only report an opaque network failure.
       A thrown error must always come back as JSON.
    */
    try {
        const url = new URL(request.url);
        const action = String(url.searchParams.get("action") || "").trim();

        const conf = config();

        if (!conf) {
            /* Not configured: the app hides its cloud buttons and keeps
               saving on the device, so this is a setting, not an error. */
            return json(200, { configured: false });
        }

        /* A body is only present on a POST; a GET has none. */
        let payload: Record<string, any> = {};
        if (request.method === "POST") {
            try {
                payload = (await request.json()) ?? {};
            } catch {
                return json(400, { error: "The request body was not valid JSON." });
            }
        }

        switch (action) {

            /* ---- is the cloud usable at all ---- */
            case "status":
                return json(200, { configured: true });

            /* ---- every quote for one trade ---- */
            case "list": {
                const trade = readTrade(url);
                if (!trade) return json(400, { error: "Unknown or missing trade." });

                const rows = await rest(
                    conf,
                    "trade_quotes",
                    `?trade=eq.${encodeURIComponent(trade)}` +
                    `&select=id,body,updated_at` +
                    `&order=updated_at.desc`
                );

                return json(200, { quotes: rows ?? [] });
            }

            /* ---- save one quote ---- */
            case "save": {
                const trade = readTrade(url);
                if (!trade) return json(400, { error: "Unknown or missing trade." });

                const quote = payload.quote;
                const id = String(payload.id || (quote && quote.id) || "").trim();

                if (!id) return json(400, { error: "A quote needs an id." });
                if (!quote || typeof quote !== "object") {
                    return json(400, { error: "A quote needs a body." });
                }

                await rest(conf, "trade_quotes", "?on_conflict=id", {
                    method: "POST",
                    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
                    body: JSON.stringify({ id, trade, body: quote })
                });

                return json(200, { saved: id });
            }

            /* ---- remove one quote ---- */
            case "delete": {
                const trade = readTrade(url);
                if (!trade) return json(400, { error: "Unknown or missing trade." });

                const id = String(payload.id || "").trim();

                if (!id) return json(400, { error: "A quote needs an id." });

                /*
                   The trade is part of the WHERE, not decoration.
                   Quote ids are minted per app ("quote 40"), so two
                   trades can hold rows with the same id - and this
                   function holds the service role key, which bypasses
                   Row Level Security. Scoping the delete to the trade
                   that asked means a client bug cannot remove another
                   trade's quote.
                */
                await rest(
                    conf,
                    "trade_quotes",
                    `?id=eq.${encodeURIComponent(id)}` +
                    `&trade=eq.${encodeURIComponent(trade)}`,
                    { method: "DELETE" }
                );

                return json(200, { deleted: id });
            }

            /* ---- company settings, one row per trade ---- */
            case "settings":
                return readWriteShared(
                    conf, "trade_settings", url, payload,
                    request.method === "POST"
                );

            /* ---- price list, one row per trade ---- */
            case "price-list":
                return readWriteShared(
                    conf, "trade_prices", url, payload,
                    request.method === "POST"
                );

            default:
                return json(400, { error: "Unknown action." });
        }
    } catch (error) {
        /*
           A thrown error must still come back as JSON, or the app
           sees an opaque network failure and reports the wrong
           thing to the person using it.
        */
        return json(500, {
            error: error instanceof Error ? error.message : "Unexpected error."
        });
    }
});

/*
   Settings and the price list behave identically: GET returns the
   stored body, POST replaces it. Kept in one place so the two
   cannot drift apart.

   `isWrite` is passed in rather than inferred from `arguments`,
   which is not reliable inside an async function and would have
   made every GET look like an empty POST.
*/
async function readWriteShared(
    conf: { rest: string; key: string },
    table: string,
    url: URL,
    payload: Record<string, any>,
    isWrite: boolean
) {
    const trade = readTrade(url);
    if (!trade) return json(400, { error: "Unknown or missing trade." });

    if (isWrite) {
        if (!payload || !Object.keys(payload).length) {
            return json(400, { error: "Nothing to save." });
        }

        await rest(conf, table, "?on_conflict=trade", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify({ trade, body: payload })
        });

        return json(200, { saved: trade });
    }

    const rows = await rest(
        conf,
        table,
        `?trade=eq.${encodeURIComponent(trade)}&select=body&limit=1`
    );

    const body = Array.isArray(rows) && rows.length ? rows[0].body : {};

    return json(200, { body: body || {} });
}