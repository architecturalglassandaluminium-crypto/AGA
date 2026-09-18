/* =========================================================
AGA CATALOGUE SYNC
=========================================================

Pulls the standard window and door price list straight off
the AGA online shop, so quotes are built on current prices
rather than on a list that was typed in by hand once.

SOURCE
------
https://agasouthafrica.co.za/shop/ runs on WooCommerce. The
shop exposes its own public catalogue endpoint (the Store
API), which returns every product as JSON - name, SKU,
price and dimensions - with no API key required:

    /wp-json/wc/store/v1/products

That is the same data the shop page renders, but in a form
the quote builder can read directly.

HOW IT BEHAVES
--------------
1. On load the app uses the saved catalogue if one exists,
   otherwise the built-in price list in quotes.js. Nothing
   waits on the network - the quote view opens immediately.
2. The "Refresh Catalogue" button fetches the live shop
   prices, saves them, and re-renders the product picker.
3. Everything is offline-first: a fetch that fails (no
   signal, shop down, CORS in a packaged build) leaves the
   last good catalogue in place and says so.
*/

const AGA_CATALOGUE_ENDPOINT =
    "https://agasouthafrica.co.za/wp-json/wc/store/v1/products?per_page=100";

/*
   The shop does not send Access-Control-Allow-Origin, so a page
   served from anywhere else cannot read that endpoint directly -
   the browser blocks it and the quote builder would never see a
   live price. The short route is a same-origin proxy that asks
   the shop on the page's behalf (the preview server and the
   hosting rewrite both provide one at /api/catalogue).

   If that route is not there - a plain static host, or the file
   opened straight off disk - fall back to the shop itself,
   which works wherever the origin is allowlisted or the app is
   packaged as a desktop build.
*/
const AGA_CATALOGUE_PROXY_ENDPOINT = "/api/catalogue";

const AGA_SHOP_PAGE = "https://agasouthafrica.co.za/shop/";

/* Where the fetched catalogue is cached, and where the date
   of the last successful pull is remembered. */
const AGA_CATALOGUE_KEY = "aga_catalogue";
const AGA_CATALOGUE_SYNC_KEY = "aga_catalogue_synced_at";

/* How long a fetch may take before we give up. The shop can
   be slow when LiteSpeed has to rebuild its cache. */
const AGA_CATALOGUE_TIMEOUT_MS = 20000;

/* =========================================================
WORKSHOP CLASSIFICATION
=========================================================

The shop tells us the product code, name, price and size,
but not which workshop system a product belongs to - that
lives in the category slugs, which are inconsistent across
products. So the system is derived from the item family,
and the nominal size is read off the code where the shop's
own dimensions are rounded to the nearest 10mm.

Fallback only: a product saved with an explicit "system" is
never reclassified.
*/

/*
   A product code for a top hung window, as the shop and the
   old built-in price list write it:

     PT  600 series top hung          0.6 x 1.2m -> PT612
     PTT 900 series top hung (T)      0.6 x 1.2m -> PTT612
   The first digit after PT is the width in metres and gives the
   series. The rest is the height with the decimal point removed,
   and never begins with 0 - every window is at least 0.5m high,
   and a 0.9m height is written 9, not 09. So the height is read
   from the back of the code and the width is whatever is left in
   front of it: PT612 is 2 digits of height (12 -> 1.2m) with the
   width digit 6 in front; PT129 is the height 29 -> 2.9m with the
   width digit 1 in front.

   Both the shop's rounded size and this nominal size land within
   10mm of each other for every product in the catalogue.
*/


/*
   The same code written on a quote, and in the shop name when the
   shop has not spelled the product out (PT912).
*/
const AGA_WINDOW_BARE_CODE = /^PTT?\d+$/;

/*
   Top hung window codes and their nominal sizes, in millimetres.

   The code carries the size but not in a way that can be read
   off reliably: PT129 is 1.2m wide and 0.9m high, while PT912 is
   0.9m wide and 1.2m high, and there is no way to tell the two
   apart without knowing which sizes the workshop actually makes.
   This table the catalogue: the shop only sells these thirty
   top hung windows, so an exact lookup beats a clever guess.

   Sizes are the shop's own published dimensions, rounded to the
   nearest 10mm (they list 1790mm as 1.8m and 890mm as 0.9m).
   Anything not in this table falls back to whatever the shop says
   the item measures, so a product added later still quotes.
*/
const AGA_WINDOW_SIZES = {
    PT66:   { series: 600,  heightMm: 600 },
    PT69:   { series: 600,  heightMm: 900 },
    PT96:   { series: 900,  heightMm: 600 },
    PT99:   { series: 900,  heightMm: 900 },
    PT612:  { series: 600,  heightMm: 1200 },
    PT126:  { series: 1200, heightMm: 600 },
    PT129:  { series: 1200, heightMm: 900 },
    PT1212: { series: 1200, heightMm: 1200 },
    PT156:  { series: 1500, heightMm: 600 },
    PT159:  { series: 1500, heightMm: 900 },
    PT912:  { series: 900,  heightMm: 1200 },

    PTT612:  { series: 600,  heightMm: 1200 },
    PTT615:  { series: 600,  heightMm: 1500 },
    PTT618:  { series: 600,  heightMm: 1800 },
    PTT621:  { series: 600,  heightMm: 2100 },
    PTT912:  { series: 900,  heightMm: 1200 },
    PTT915:  { series: 900,  heightMm: 1500 },
    PTT918:  { series: 900,  heightMm: 1800 },
    PTT921:  { series: 900,  heightMm: 2100 },
    PTT1212: { series: 1200, heightMm: 1200 },
    PTT1215: { series: 1200, heightMm: 1500 },
    PTT1218: { series: 1200, heightMm: 1800 },
    PTT1512: { series: 1500, heightMm: 1200 },
    PTT1515: { series: 1500, heightMm: 1500 },
    PTT1518: { series: 1500, heightMm: 1800 },
    PTT1812: { series: 1800, heightMm: 1200 },
    PTT1815: { series: 1800, heightMm: 1500 },
    PTT1818: { series: 1800, heightMm: 1800 },
    PTT186:  { series: 1800, heightMm: 600 },
    PTT189:  { series: 1800, heightMm: 900 }
};




/*
   The shop's category names are inconsistent - "600 Series Top
   Hung" and "600 series top hung" are both in use - so they are
   compared by what they say, not by how they are typed.
*/
function agaNormaliseLabel(value) {
    return quoteText(value).toLowerCase().replace(/\s+/g, " ");
}

/*
   The workshop name for a series, e.g. "600 Series Top Hung".
   Built from the digits in the code so it never follows the
   shop's casing, and so the series sorts as a number rather
   than as text.
*/
function agaSeriesSystem(series) {
    return Number(series) + " Series Top Hung";
}

function agaCategoryName(categories, needle) {
    const wanted = agaNormaliseLabel(needle);

    return (
        (categories || []).find(
            category => agaNormaliseLabel(category).indexOf(wanted) !== -1
        ) || ""
    );
}

/*
   Work out the workshop system for a product, given its code,
   the shop categories and whatever the shop says the item is.
*/
function agaCatalogueSystem(code, categories, name) {
    const upper = quoteText(code).toUpperCase();
    const slugText = (categories || []).join(" ").toLowerCase();
    const nameText = quoteText(name).toLowerCase();

    /* Sliding folding doors all share one system. */
    if (upper.indexOf("SFD") === 0 || slugText.indexOf("folding") !== -1) {
        return "Sliding Folding Doors";
    }

    /* Standard sliding doors likewise. */
    if (upper.indexOf("SSD") === 0 || slugText.indexOf("sliding door") !== -1) {
        return "Standard Sliding Doors";
    }

    /* Hinge doors. */
    if (upper.indexOf("DHD") === 0 || upper.indexOf("SHD") === 0) {
        return "Hinge Doors";
    }

    if (upper.indexOf("PD") === 0 || slugText.indexOf("pivot") !== -1) {
        return "Pivot Doors";
    }

    if (slugText.indexOf("doors") !== -1 || nameText.indexOf("door") !== -1) {
        return "Hinge Doors";
    }

    /*
       Top hung windows carry the series in the code: PT612 is a
       600 series window, PTT1818 the 1800 series. The extra T
       marks the taller variant of the same series.
    */
    const parts = AGA_WINDOW_SIZES[upper];

    if (parts) {
        return agaSeriesSystem(parts.series);
    }


    /*
       Fall back to whatever the shop filed it under, which
       sometimes carries the series in the name instead.
    */
    const seriesCategory = agaCategoryName(categories, "series");

    if (seriesCategory) {
        const digits = /\d+/.exec(seriesCategory);

        return digits
            ? agaSeriesSystem(digits[0])
            : agaNormaliseLabel(seriesCategory);
    }

    return "Top Hung Windows";
}

/*
   The nominal size stamped into a product code, as millimetres.
   1.2 x 0.9m is written PT129 - three characters, one decimal
   each. 1.8 x 1.8m is PTT1818 - four characters, two decimals
   each. Anything we cannot read returns null so the shop's own
   dimensions are used instead.
*/
function agaCatalogueSize(code) {
    const parts = AGA_WINDOW_SIZES[quoteText(code).toUpperCase()];

    if (!parts) {
        return null;
    }

    return {
        widthMm: parts.series,
        heightMm: parts.heightMm
    };
}

/* =========================================================
FROM SHOP JSON TO QUOTE PRODUCT
========================================================= */

/*
   WooCommerce keeps every amount as a minor-unit string
   ("921800" is R9 218.00), so the exponent has to be read
   off each response rather than assumed to be cents.
*/
function agaMinorUnits(amount, minorUnit) {
    const value = quoteNumber(amount, null);
    const unit = Number(minorUnit);

    if (value === null) {
        return null;
    }

    if (Number.isFinite(unit) && unit >= 0) {
        return quoteRound(value / Math.pow(10, unit));
    }

    return quoteRound(value);
}

function agaCataloguePrice(item) {
    const prices = item && item.prices ? item.prices : {};
    const minorUnit = prices.currency_minor_unit;
    const range = prices.price_range;

    /*
       A range (say R1 630.00 - R1 899.28) is what the shop
       shows when the frame finish changes the price, so keep
       both ends: the picker displays the range and the line
       loads the lower, "from", figure. A single price gets
       the "from" end only and no upper bound.
    */
    if (range && quoteNumber(range.min_amount, null) !== null) {
        const from = agaMinorUnits(range.min_amount, minorUnit);
        const to = agaMinorUnits(range.max_amount, minorUnit);

        if (from !== null) {
            return { priceFrom: from, priceTo: to !== null ? to : null };
        }
    }

    const value = agaMinorUnits(prices.price, minorUnit);

    return value !== null ? { priceFrom: value, priceTo: null } : null;
}

/*
   A name a customer can read on a quote.

   The shop names every top hung window after its code alone
   ("PT129"), which is fine on a picker row that already shows
   the code, and meaningless on the quote the customer receives.
   Those get a real name, with the series the rest of the app
   uses and the size in metres, and the shop's own wording wins
   wherever it is more descriptive than the code.
*/
function agaCatalogueName(code, system, shopName) {
    const shop = quoteText(shopName);
    const upper = quoteText(code).toUpperCase();
    const lookLikeCode =
        !shop || shop.toUpperCase() === upper || AGA_WINDOW_BARE_CODE.test(shop);

    const size = agaCatalogueSize(code);

    if (!lookLikeCode) {
        return shop;
    }

    if (!size) {
        return shop || code;
    }

    const metres = value => String(quoteRound(value / 1000, 1)) + "m";

    return (
        system +
        " \u2014 " +
        metres(size.widthMm) +
        " x " +
        metres(size.heightMm)
    );
}

function agaCatalogueDimension(value) {
    const number = quoteNumber(value, null);

    return number !== null && number > 0 ? Math.round(number) : null;
}

/*
   Turn one Store API product into the shape the quote builder
   uses everywhere else:

     code, name, category, system, widthMm, heightMm,
     priceFrom, priceTo

   Items with nothing to quote - no code or no usable price -
   are dropped rather than offered to the user.
*/
function agaProductFromShopItem(item) {
    if (!item) {
        return null;
    }

    const code = quoteText(item.sku) || quoteText(item.name);

    if (!code) {
        return null;
    }

    const price = agaCataloguePrice(item);

    if (!price) {
        return null;
    }

    const categories = (item.categories || [])
        .map(category => quoteText(category.name))
        .filter(Boolean);

    const system = agaCatalogueSystem(code, categories, item.name);

    /*
       Prefer the size implied by the product code (PT129 is a
       tidy 0.9 x 1.2m) and fall back to the shop dimensions,
       which are rounded.
    */
    const nominal = agaCatalogueSize(code);
    const dimensions = item.dimensions || {};

    const widthMm = nominal
        ? nominal.widthMm
        : agaCatalogueDimension(dimensions.width);

    const heightMm = nominal
        ? nominal.heightMm
        : agaCatalogueDimension(dimensions.height);

    return {
        code: code,
        name: agaCatalogueName(code, system, item.name),
        category: system.indexOf("Doors") !== -1 ? "Doors" : "Windows",
        system: system,
        widthMm: widthMm || 0,
        heightMm: heightMm || 0,
        priceFrom: price.priceFrom,
        priceTo: price.priceTo,
        /* Marks a price that came off the shop in this pull,
           rather than the list compiled into quotes.js. */
        live: true
    };
}

/*
   Sort doors and windows in the order the workshop sells them:
   by family, then ascending by code. The shop's own ordering
   puts newest products first, which reads oddly on a quote.
*/
function agaCatalogueSort(products) {
    const sequence = [
        "Hinge Doors",
        "Standard Sliding Doors",
        "Sliding Folding Doors",
        "Pivot Doors",
        "600 Series Top Hung",
        "900 Series Top Hung",
        "1200 Series Top Hung",
        "1500 Series Top Hung",
        "1800 Series Top Hung"
    ];

    const rank = system => {
        const index = sequence.indexOf(system);

        return index === -1 ? sequence.length : index;
    };

    return products.slice().sort((a, b) => {
        if (a.category !== b.category) {
            return a.category === "Doors" ? -1 : 1;
        }

        if (rank(a.system) !== rank(b.system)) {
            return rank(a.system) - rank(b.system);
        }

        return a.code.localeCompare(b.code);
    });
}

/*
   Merge the shop products into an existing list. Matching is
   by product code, so a product that the shop has retired
   keeps the details it already had and simply falls back to
   whatever price was last fetched - never silently vanishes
   from a catalogue the workshop has been quoting from.
*/
function agaMergeProducts(existing, fetched) {
    const byCode = new Map();

    (existing || []).forEach(product => {
        if (product && product.code) {
            byCode.set(quoteText(product.code).toUpperCase(), product);
        }
    });

    (fetched || []).forEach(product => {
        if (product && product.code) {
            byCode.set(quoteText(product.code).toUpperCase(), product);
        }
    });

    return agaCatalogueSort(Array.from(byCode.values()));
}

/* =========================================================
STORAGE
========================================================= */

/*
   True only once the `let AGA_LIVE_PRODUCTS` above has finished
   initialising. Reading the binding before that throws a
   ReferenceError (the temporal dead zone), and `typeof` does
   NOT guard against it - only a real assignment lifts it.
*/
let AGA_CATALOGUE_SEED = false;

function agaCatalogueDefaultProducts() {
    /*
       The list compiled into quotes.js at the last manual
       capture. Used until the first successful pull.

       Three steps, because this runs from a `let` initialiser
       and quotes.js may legitimately not have run yet at that
       point:

       1. AGA_CATALOGUE_SEED - the live list is initialised,
          so it is the current answer and a later call must not
          overwrite it with the built-in list.
       2. AGA_BUILT_IN_PRODUCTS - quotes.js has loaded.
       3. [] - neither is ready, so the catalogue is empty until
          a refresh succeeds.

       Step 1 must test the flag rather than AGA_LIVE_PRODUCTS
       itself: that read throws during the initialiser.
    */
    if (AGA_CATALOGUE_SEED && AGA_LIVE_PRODUCTS.length) {
        return AGA_LIVE_PRODUCTS;
    }

    if (typeof AGA_BUILT_IN_PRODUCTS !== "undefined") {
        return AGA_BUILT_IN_PRODUCTS;
    }

    return [];
}

function agaCatalogueRead() {
    try {
        const stored = localStorage.getItem(AGA_CATALOGUE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            return [];
        }

        /* Anything restored from storage was fetched from the
           shop at some point, so it counts as live. */
        return parsed
            .filter(product => product && product.code)
            .map(product => Object.assign({}, product, { live: true }));
    } catch (error) {
        console.error("Could not read the saved catalogue:", error);

        return [];
    }
}

function agaCatalogueWrite(products) {
    try {
        localStorage.setItem(AGA_CATALOGUE_KEY, JSON.stringify(products));

        return true;
    } catch (error) {
        console.error("Could not save the catalogue:", error);

        return false;
    }
}

function agaCatalogueSyncStamp() {
    try {
        return localStorage.getItem(AGA_CATALOGUE_SYNC_KEY) || "";
    } catch (error) {
        return "";
    }
}

function agaCatalogueWriteSyncStamp(stamp) {
    try {
        localStorage.setItem(AGA_CATALOGUE_SYNC_KEY, stamp);
    } catch (error) {
        console.error("Could not record the catalogue sync time:", error);
    }
}

/* =========================================================
THE LIVE CATALOGUE
=========================================================

   AGA_LIVE_PRODUCTS is the single list every quote screen
   reads. It starts as the saved catalogue, or the built-in
   list, and is replaced in place after each successful pull.
*/

let AGA_LIVE_PRODUCTS = agaCatalogueDefaultProducts();

/* The binding above is now initialised, so agaCatalogueDefaultProducts()
   may safely read it from here on. */
AGA_CATALOGUE_SEED = true;

let AGA_CATALOGUE_SYNCED_AT = "";
let AGA_CATALOGUE_IS_LIVE = false;

let AGA_PRODUCT_INDEX = new Map();

function agaIndexProducts(products) {
    AGA_PRODUCT_INDEX = new Map();

    products.forEach(product => {
        AGA_PRODUCT_INDEX.set(quoteText(product.code).toUpperCase(), product);
    });
}

function agaCatalogueApply(products) {
    AGA_LIVE_PRODUCTS = agaCatalogueSort(products);
    agaIndexProducts(AGA_LIVE_PRODUCTS);

    /*
       quotes.js resolves a picker selection through this map.
       Keeping it in step means the rest of the quote builder
       needs no knowledge of where the list came from.
    */
    if (typeof AGA_PRODUCT_BY_CODE === "object" && AGA_PRODUCT_BY_CODE) {
        Object.keys(AGA_PRODUCT_BY_CODE).forEach(code => {
            delete AGA_PRODUCT_BY_CODE[code];
        });

        AGA_LIVE_PRODUCTS.forEach(product => {
            AGA_PRODUCT_BY_CODE[product.code] = product;
        });
    }

    window.AGA_STANDARD_PRODUCTS = AGA_LIVE_PRODUCTS;
}

function agaCatalogueSeed() {
    const saved = agaCatalogueRead();

    AGA_CATALOGUE_SYNCED_AT = agaCatalogueSyncStamp();

    /*
       A saved catalogue is proof of a previous good pull, so
       it outranks the built-in list even before the sync time
       is known.
    */
    if (saved.length) {
        AGA_CATALOGUE_IS_LIVE = true;
        agaCatalogueApply(saved);

        return;
    }

    AGA_CATALOGUE_IS_LIVE = false;
    agaCatalogueApply(agaCatalogueDefaultProducts());
}

function agaProductLookup(code) {
    return AGA_PRODUCT_INDEX.get(quoteText(code).toUpperCase()) || null;
}

function agaProductCount() {
    return AGA_LIVE_PRODUCTS.length;
}

/* =========================================================
FETCHING
========================================================= */

/* One request, parsed. Rejects with a readable reason. */
function agaCatalogueRequest(url) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (callback, value) => {
            if (!settled) {
                settled = true;
                callback(value);
            }
        };

        let timer = setTimeout(() => {
            finish(reject, new Error("The AGA shop did not respond in time."));
        }, AGA_CATALOGUE_TIMEOUT_MS);

        fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" }

            /*
               No credentials on purpose: the catalogue is public,
               and omitting them avoids a CORS preflight that
               LiteSpeed answers inconsistently.
            */
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(
                        "The AGA shop returned HTTP " + response.status + "."
                    );
                }

                return response.json();
            })
            .then(payload => {
                const products = agaCatalogueProducts(payload);

                if (!products.length) {
                    throw new Error(
                        "The AGA shop returned no products. The catalogue was left as it was."
                    );
                }

                finish(resolve, products);
            })
            .catch(error => finish(reject, error))
            .then(() => clearTimeout(timer));
    });
}

/*
   Fetch the catalogue, preferring the same-origin proxy. A
   missing proxy is the expected case on a static host, so only
   the last failure is reported - that is the one the user needs
   to see.
*/
function agaCatalogueFetchLive() {
    return agaCatalogueRequest(AGA_CATALOGUE_PROXY_ENDPOINT).catch(proxyError => {
        console.warn(
            "AGA catalogue proxy unavailable, trying the shop directly:",
            proxyError.message
        );

        return agaCatalogueRequest(AGA_CATALOGUE_ENDPOINT).catch(shopError => {
            /*
               A blocked direct read is reported as an opaque
               "Failed to fetch", which tells the user nothing.
               Name the real cause: the shop refuses cross-origin
               reads, so the app needs to be served with the
               catalogue proxy.
            */
            throw new Error(
                shopError.message === "Failed to fetch"
                    ? "The AGA shop refused the cross-origin request. Serve the app with the catalogue proxy (see catalogue.js), or open it from the shop's own domain."
                    : shopError.message
            );
        });
    });
}

/* Parse the payload of a catalogue response. */
function agaCatalogueProducts(payload) {
    const items = Array.isArray(payload) ? payload : [];

    return items.map(agaProductFromShopItem).filter(Boolean);
}

/* =========================================================
REFRESHING
========================================================= */

let AGA_CATALOGUE_REFRESHING = false;

/*
   Fetch the live shop prices, save them, and hand the result
   to the quote builder. Returns the merged product list, or
   null when nothing could be fetched - in which case the
   catalogue on screen is untouched.
*/
function agaCatalogueRefresh() {
    if (AGA_CATALOGUE_REFRESHING) {
        return Promise.resolve(null);
    }

    AGA_CATALOGUE_REFRESHING = true;

    agaSetRefreshButtonState(true);

    return agaCatalogueFetchLive()
        .then(fetched => {
            const merged = agaMergeProducts(AGA_LIVE_PRODUCTS, fetched);

            agaCatalogueApply(merged);
            agaCatalogueWrite(merged);

            AGA_CATALOGUE_SYNCED_AT = quoteStamp(new Date());
            AGA_CATALOGUE_IS_LIVE = true;

            agaCatalogueWriteSyncStamp(AGA_CATALOGUE_SYNCED_AT);

            agaRenderCatalogueNote();

            if (typeof renderQuoteProductOptions === "function") {
                renderQuoteProductOptions();
            }

            showSuccess(
                "Catalogue updated from the AGA shop \u2014 " +
                merged.length +
                " products."
            );

            return merged;
        })
        .catch(error => {
            /*
               The shop is the source of truth, but a failed pull
               is not a reason to stop quoting: keep what we have
               and tell the user why it did not update.
            */
            console.error("AGA catalogue refresh failed:", error);

            showError(
                (error && error.message
                    ? error.message
                    : "The catalogue could not be refreshed.") +
                " The prices already loaded are still in use."
            );

            return null;
        })
        .then(result => {
            AGA_CATALOGUE_REFRESHING = false;
            agaSetRefreshButtonState(false);

            return result;
        });
}

/* =========================================================
THE REFRESH BUTTON
========================================================= */

function agaSetRefreshButtonState(busy) {
    const button = document.getElementById("quoteRefreshCatalogueButton");

    if (!button) {
        return;
    }

    button.disabled = busy;
    button.classList.toggle("is-busy", busy);

    const label = button.querySelector(".button-label");

    if (label) {
        label.textContent = busy ? "Refreshing\u2026" : "Refresh Catalogue";
    }
}

function agaCataloguedateText() {
    if (!AGA_CATALOGUE_SYNCED_AT) {
        return "";
    }

    /* Stored as "YYYY-MM-DD HH:MM" - show the date half. */
    return AGA_CATALOGUE_SYNCED_AT.split(" ")[0];
}

function agaRenderCatalogueNote() {
    const note = document.getElementById("quoteProductHint");

    if (!note) {
        return;
    }

    if (!AGA_CATALOGUE_IS_LIVE) {
        note.textContent =
            "Using the built-in AGA price list. Press Refresh Catalogue to pull current prices from the shop.";
        note.classList.remove("quote-product-hint-live");
        note.classList.add("quote-product-hint-offline");

        return;
    }

    const synced = agaCataloguedateText();

    note.textContent =
        "Prices pulled from the AGA online shop" +
        (synced ? " on " + synced : "") +
        " \u00B7 " +
        agaProductCount() +
        " products.";

    note.classList.remove("quote-product-hint-offline");
    note.classList.add("quote-product-hint-live");
}

/* Exposed for the quote module and for anything that needs
   to check where a price came from. */
window.AGA_CATALOGUE = {
    products: () => AGA_LIVE_PRODUCTS,
    lookup: agaProductLookup,
    refresh: agaCatalogueRefresh,
    isLive: () => AGA_CATALOGUE_IS_LIVE,
    syncedAt: () => AGA_CATALOGUE_SYNCED_AT,
    source: AGA_SHOP_PAGE
};

/*
   Seed as soon as this file runs: app.js and quotes.js only
   read the list, so it has to be in place before they do.
*/
agaCatalogueSeed();
