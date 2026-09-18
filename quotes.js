/* =========================================================
AGA QUOTE BUILDER
=========================================================

A self-contained quote module for Architectural Glass &
Aluminium. It deliberately touches nothing inside app.js
except for two small hooks (VIEW_NAMES and renderAll), so
the production tracker continues to behave exactly as
before.

WHAT IT DOES
------------
1. Ships the AGA standard price list (pulled from the
company's online shop) so items can be quoted at the
published "from" price.
2. Lets the user add any window or door manually with their
own dimensions and rate - for sizes that are not on the
standard list.
3. Loads installation, production, glazing, delivery and
sundry costs onto the quote as separate money.

STORAGE
-------
Quotes live in localStorage under "aga_quotes". Like the
rest of the app they are offline-first: everything works
with no network, and nothing here can corrupt the windows,
projects or employee data already stored.
*/

/* =========================================================
   STORAGE
   ========================================================= */

const QUOTE_KEY = "aga_quotes";

/* Bumped whenever the shape of a saved quote changes so old
   quotes can be migrated rather than silently broken. */
const QUOTE_SCHEMA_VERSION = 1;

/* =========================================================
   MONEY & NUMBER HELPERS
   ========================================================= */

function quoteNumber(value, fallback = 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
}

function quoteRound(value, decimals = 2) {
    const factor = Math.pow(10, decimals);

    return Math.round((quoteNumber(value) + Number.EPSILON) * factor) / factor;
}

function quoteMoney(value) {
    const amount = quoteRound(value);

    /*
       Rounded to cents, then formatted with a space thousands
       separator - the convention used on South African quotes.
    */
    return (
        "R" +
        amount.toLocaleString("en-ZA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })
    );
}

function quoteUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return (
        "q-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10)
    );
}

function quoteText(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

/*
   A readable "YYYY-MM-DD HH:MM" stamp for the footer. Built by
   hand rather than with toLocaleString so the printed sheet
   reads the same regardless of the operator's locale.
*/
/* A single space, named, so string literals in this file stay
   free of trailing/leading whitespace that editors trim. */
const SPACE = String.fromCharCode(32);

function quoteStamp(date) {
    const pad = value => String(value).padStart(2, "0");

    const day = [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-");

    const time = [
        pad(date.getHours()),
        pad(date.getMinutes())
    ].join(":");

    return day + SPACE + time;
}

function quoteEscape(value) {
    return quoteText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/* =========================================================
   STANDARD PRICE LIST
   =========================================================

   Prices are the published AGA shop prices for the shop
   address below, and are refreshed live by catalogue.js.

   Each product carries:
     code      - the shop product code (also used on quotes)
     name      - the shop product name
     category  - Doors / Windows, used for grouping the picker
     system    - the aluminium series or door system
     widthMm   - nominal width of the standard unit
     heightMm  - nominal height of the standard unit
     priceFrom - the published "from" price in Rand
     priceTo   - the published "to" price, or null when single
                 priced. The range covers the frame finish
                 variants (natural, bronze, white, etc).

   The "from" price is what is loaded onto a quote line by
   default; the user can overwrite the unit price on any line.
*/

const AGA_PRICE_LIST_SOURCE = "https://agasouthafrica.co.za/shop/";

/*
   The list below is the built-in price list: a starting point
   so the quote builder works before it has ever reached the
   shop. catalogue.js re-seeds it from the last fetched
   catalogue as soon as it loads, and Refresh Catalogue pulls
   the current shop prices over the top - see catalogue.js for
   the fetching and the merge rules.
*/
const AGA_BUILT_IN_PRODUCTS = [
    /* ---------------- Hinge doors ---------------- */
    { code: "DHD21", name: "Double Hinge Door 2.1m", category: "Doors", system: "Hinge Doors", widthMm: 1800, heightMm: 2100, priceFrom: 9218.00, priceTo: null },
    { code: "DHD24", name: "Double Hinge Door 2.4m", category: "Doors", system: "Hinge Doors", widthMm: 1800, heightMm: 2400, priceFrom: 11187.00, priceTo: null },
    { code: "SHD21", name: "Single Hinge Door 2.1m", category: "Doors", system: "Hinge Doors", widthMm: 900, heightMm: 2100, priceFrom: 5404.00, priceTo: null },
    { code: "SHD24", name: "Single Hinge Door 2.4m", category: "Doors", system: "Hinge Doors", widthMm: 900, heightMm: 2400, priceFrom: 5945.00, priceTo: null },

    /* ------------- Standard sliding doors ------------- */
    { code: "SSD1521", name: "Standard Sliding Door 1.5 x 2.1m", category: "Doors", system: "Standard Sliding Doors", widthMm: 1500, heightMm: 2100, priceFrom: 2875.00, priceTo: null },
    { code: "SSD1821", name: "Standard Sliding Door 1.8 x 2.1m", category: "Doors", system: "Standard Sliding Doors", widthMm: 1800, heightMm: 2100, priceFrom: 3075.00, priceTo: null },
    { code: "SSD2121", name: "Standard Sliding Door 2.1 x 2.1m", category: "Doors", system: "Standard Sliding Doors", widthMm: 2100, heightMm: 2100, priceFrom: 3547.00, priceTo: null },
    { code: "SSD2421", name: "Standard Sliding Door 2.4 x 2.1m", category: "Doors", system: "Standard Sliding Doors", widthMm: 2400, heightMm: 2100, priceFrom: 3835.00, priceTo: null },

    /* ----------- Sliding folding doors ---------------- */
    { code: "SFD2721", name: "Sliding Folding Door 2.7 x 2.1m", category: "Doors", system: "Sliding Folding Doors", widthMm: 2700, heightMm: 2100, priceFrom: 16826.00, priceTo: null },
    { code: "SFD2724", name: "Sliding Folding Door 2.7 x 2.4m", category: "Doors", system: "Sliding Folding Doors", widthMm: 2700, heightMm: 2400, priceFrom: 19007.00, priceTo: null },
    { code: "SFD3621", name: "Sliding Folding Door 3.6 x 2.1m", category: "Doors", system: "Sliding Folding Doors", widthMm: 3600, heightMm: 2100, priceFrom: 21569.00, priceTo: null },
    { code: "SFD3624", name: "Sliding Folding Door 3.6 x 2.4m", category: "Doors", system: "Sliding Folding Doors", widthMm: 3600, heightMm: 2400, priceFrom: 24435.00, priceTo: null },
    { code: "SFD4521", name: "Sliding Folding Door 4.5 x 2.1m", category: "Doors", system: "Sliding Folding Doors", widthMm: 4500, heightMm: 2100, priceFrom: 26402.00, priceTo: null },
    { code: "SFD4524", name: "Sliding Folding Door 4.5 x 2.4m", category: "Doors", system: "Sliding Folding Doors", widthMm: 4500, heightMm: 2400, priceFrom: 29891.00, priceTo: null },

    /* ------ 600 Series Top Hung (sliding windows) ----- */
    { code: "PT66", name: "600 Series Top Hung 0.6 x 0.6m", category: "Windows", system: "600 Series Top Hung", widthMm: 600, heightMm: 600, priceFrom: 762.00, priceTo: 829.32 },
    { code: "PT69", name: "600 Series Top Hung 0.6 x 0.9m", category: "Windows", system: "600 Series Top Hung", widthMm: 600, heightMm: 900, priceFrom: 877.00, priceTo: 977.98 },
    { code: "PT96", name: "600 Series Top Hung 0.9 x 0.6m", category: "Windows", system: "600 Series Top Hung", widthMm: 900, heightMm: 600, priceFrom: 817.00, priceTo: 917.98 },
    { code: "PT99", name: "600 Series Top Hung 0.9 x 0.9m", category: "Windows", system: "600 Series Top Hung", widthMm: 900, heightMm: 900, priceFrom: 1114.00, priceTo: 1265.47 },
    { code: "PT612", name: "600 Series Top Hung 0.6 x 1.2m", category: "Windows", system: "600 Series Top Hung", widthMm: 600, heightMm: 1200, priceFrom: 1005.00, priceTo: 1139.64 },
    { code: "PT126", name: "600 Series Top Hung 1.2 x 0.6m", category: "Windows", system: "600 Series Top Hung", widthMm: 1200, heightMm: 600, priceFrom: 990.00, priceTo: 1124.64 },
    { code: "PT129", name: "600 Series Top Hung 1.2 x 0.9m", category: "Windows", system: "600 Series Top Hung", widthMm: 1200, heightMm: 900, priceFrom: 1335.00, priceTo: 1536.96 },
    { code: "PT1212", name: "600 Series Top Hung 1.2 x 1.2m", category: "Windows", system: "600 Series Top Hung", widthMm: 1200, heightMm: 1200, priceFrom: 1630.00, priceTo: 1899.28 },

    /* ------ 900 Series Top Hung (sliding windows) ----- */
    { code: "PT156", name: "900 Series Top Hung 1.5 x 0.6m", category: "Windows", system: "900 Series Top Hung", widthMm: 1500, heightMm: 600, priceFrom: 1108.00, priceTo: 1276.30 },
    { code: "PT159", name: "900 Series Top Hung 1.5 x 0.9m", category: "Windows", system: "900 Series Top Hung", widthMm: 1500, heightMm: 900, priceFrom: 1475.00, priceTo: 1727.45 },
    { code: "PT912", name: "900 Series Top Hung 0.9 x 1.2m", category: "Windows", system: "900 Series Top Hung", widthMm: 900, heightMm: 1200, priceFrom: 1255.00, priceTo: 1456.96 },
    { code: "PTT612", name: "900 Series Top Hung (T) 0.6 x 1.2m", category: "Windows", system: "900 Series Top Hung", widthMm: 600, heightMm: 1200, priceFrom: 1267.00, priceTo: 1401.64 },
    { code: "PTT615", name: "900 Series Top Hung (T) 0.6 x 1.5m", category: "Windows", system: "900 Series Top Hung", widthMm: 600, heightMm: 1500, priceFrom: 1493.00, priceTo: 1661.30 },
    { code: "PTT618", name: "900 Series Top Hung (T) 0.6 x 1.8m", category: "Windows", system: "900 Series Top Hung", widthMm: 600, heightMm: 1800, priceFrom: 1607.00, priceTo: null },
    { code: "PTT912", name: "900 Series Top Hung (T) 0.9 x 1.2m", category: "Windows", system: "900 Series Top Hung", widthMm: 900, heightMm: 1200, priceFrom: 1562.00, priceTo: 1763.96 },
    { code: "PTT915", name: "900 Series Top Hung (T) 0.9 x 1.5m", category: "Windows", system: "900 Series Top Hung", widthMm: 900, heightMm: 1500, priceFrom: 1860.00, priceTo: 2112.45 },
    { code: "PTT918", name: "900 Series Top Hung (T) 0.9 x 1.8m", category: "Windows", system: "900 Series Top Hung", widthMm: 900, heightMm: 1800, priceFrom: 2133.00, priceTo: null },
    { code: "PTT921", name: "900 Series Top Hung (T) 0.9 x 2.1m", category: "Windows", system: "900 Series Top Hung", widthMm: 900, heightMm: 2100, priceFrom: 2090.00, priceTo: null },

    /* ------ 1200 Series Top Hung (sliding windows) ---- */
    { code: "PTT1212", name: "1200 Series Top Hung (T) 1.2 x 1.2m", category: "Windows", system: "1200 Series Top Hung", widthMm: 1200, heightMm: 1200, priceFrom: 1895.00, priceTo: 2164.28 },
    { code: "PTT1215", name: "1200 Series Top Hung (T) 1.2 x 1.5m", category: "Windows", system: "1200 Series Top Hung", widthMm: 1200, heightMm: 1500, priceFrom: 2258.00, priceTo: 2594.60 },
    { code: "PTT1218", name: "1200 Series Top Hung (T) 1.2 x 1.8m", category: "Windows", system: "1200 Series Top Hung", widthMm: 1200, heightMm: 1800, priceFrom: 2577.00, priceTo: null },
    { code: "PTT1512", name: "1200 Series Top Hung (T) 1.5 x 1.2m", category: "Windows", system: "1200 Series Top Hung", widthMm: 1500, heightMm: 1200, priceFrom: 2044.00, priceTo: 2380.60 },
    { code: "PTT1515", name: "1200 Series Top Hung (T) 1.5 x 1.5m", category: "Windows", system: "1200 Series Top Hung", widthMm: 1500, heightMm: 1500, priceFrom: 2425.00, priceTo: 2845.75 },
    { code: "PTT1518", name: "1200 Series Top Hung (T) 1.5 x 1.8m", category: "Windows", system: "1200 Series Top Hung", widthMm: 1500, heightMm: 1800, priceFrom: 2789.00, priceTo: null },

    /* ------ 1500 Series Top Hung (sliding windows) ---- */
    { code: "PTT1812", name: "1500 Series Top Hung (T) 1.8 x 1.2m", category: "Windows", system: "1500 Series Top Hung", widthMm: 1800, heightMm: 1200, priceFrom: 2348.00, priceTo: 2751.92 },
    { code: "PTT1815", name: "1500 Series Top Hung (T) 1.8 x 1.5m", category: "Windows", system: "1500 Series Top Hung", widthMm: 1800, heightMm: 1500, priceFrom: 2810.00, priceTo: 3314.90 },
    { code: "PTT1818", name: "1500 Series Top Hung (T) 1.8 x 1.8m", category: "Windows", system: "1500 Series Top Hung", widthMm: 1800, heightMm: 1800, priceFrom: 3213.00, priceTo: null },

    /* ------ 1800 Series Top Hung (sliding windows) ---- */
    { code: "PTT186", name: "1800 Series Top Hung (T) 1.8 x 0.6m", category: "Windows", system: "1800 Series Top Hung", widthMm: 1800, heightMm: 600, priceFrom: 1588.00, priceTo: 1789.96 },
    { code: "PTT189", name: "1800 Series Top Hung (T) 1.8 x 0.9m", category: "Windows", system: "1800 Series Top Hung", widthMm: 1800, heightMm: 900, priceFrom: 2167.00, priceTo: 2469.94 }
];

const AGA_PRODUCT_BY_CODE = AGA_BUILT_IN_PRODUCTS.reduce((map, product) => {
    map[product.code] = product;

    return map;
}, {});

/*
   catalogue.js owns the live price list and keeps
   AGA_PRODUCT_BY_CODE in step with it. Everything in this
   file reads the list through these two helpers so there is
   only ever one answer to "what do we sell and for how much".
*/
function agaLiveProducts() {
    if (
        window.AGA_CATALOGUE &&
        typeof window.AGA_CATALOGUE.products === "function"
    ) {
        const products = window.AGA_CATALOGUE.products();

        if (products && products.length) {
            return products;
        }
    }

    return AGA_BUILT_IN_PRODUCTS;
}

function agaProductHint() {
    return document.getElementById("quoteProductHint");
}

/* =========================================================
   FRAME FINISHES
   =========================================================

   The shop price range is driven by the frame finish. Until
   AGA publishes a per-finish price we quote the "from" price
   and let the finish be recorded on the line for the workshop.
*/

const AGA_QUOTE_FINISHES = [
    "Natural Aluminium",
    "Bronze",
    "Charcoal Grey",
    "White",
    "Black",
    "Brushed Silver"
];

/* =========================================================
   COST DEFAULTS
   =========================================================

   Sensible starting points for a quote. Every one of these is
   editable on the quote itself - these only seed the fields so
   a quote can be built without retyping the obvious.
*/

const AGA_QUOTE_COST_DEFAULTS = {
    productionRate: 0,
    productionFixed: 0,
    installRate: 0,
    installPerSqm: 0,
    glazingRate: 0,
    delivery: 0,
    sundries: 0,
    discount: 0,
    vatRate: 15,
    deposit: 50
};

/* Fee lines sit after the goods lines in the summary. */
const QUOTE_FEE_LABELS = {
    productionRate: "Production (% of goods)",
    productionFixed: "Production - fixed",
    installRate: "Installation (% of goods)",
    installPerSqm: "Installation per m\u00B2",
    glazingRate: "Glazing (% of goods)",
    delivery: "Delivery / Transport",
    sundries: "Sundries / Hardware"
};

/* =========================================================
   STORAGE
   ========================================================= */

function getQuotes() {
    try {
        const stored = localStorage.getItem(QUOTE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            console.warn("Invalid quote data found in localStorage.");
            return [];
        }

        return parsed;
    } catch (error) {
        console.error("Could not read quotes:", error);
        showError("The saved quotes could not be loaded.");

        return [];
    }
}

function saveQuotes(quotes) {
    try {
        localStorage.setItem(QUOTE_KEY, JSON.stringify(quotes));

        return true;
    } catch (error) {
        console.error("Could not save quotes:", error);
        showError("The quote could not be saved. Storage may be full.");

        return false;
    }
}

function generateQuoteNumber() {
    const quotes = getQuotes();

    let highest = 0;

    quotes.forEach(quote => {
        const match = /^AGA-Q-(\d+)$/.exec(quoteText(quote.quoteNumber));

        if (match) {
            highest = Math.max(highest, Number(match[1]));
        }
    });

    return "AGA-Q-" + String(highest + 1).padStart(5, "0");
}

/* =========================================================
   THE QUOTE IN PROGRESS
   ========================================================= */

function blankQuoteLine(overrides = {}) {
    return Object.assign(
        {
            id: quoteUuid(),
            code: "",
            description: "",
            itemType: "Window",
            manual: false,
            qty: 1,
            lengthMm: 0,
            widthMm: 0,
            finish: AGA_QUOTE_FINISHES[0],
            unitPrice: 0,
            discount: 0
        },
        overrides
    );
}

function blankQuote() {
    return {
        schemaVersion: QUOTE_SCHEMA_VERSION,
        id: "",
        quoteNumber: "",
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        projectName: "",
        projectRef: "",
        siteAddress: "",
        validUntil: "",
        notes: "",
        lines: [],
        costs: Object.assign({}, AGA_QUOTE_COST_DEFAULTS),
        otherLabel: "",
        otherAmount: 0,
        createdAt: "",
        updatedAt: ""
    };
}

/*
   Held in memory rather than the DOM. The form fields are the
   source of truth for header/cost values, but lines are kept
   here so an accidental re-render never loses them.
*/
let quoteDraft = blankQuote();

/* =========================================================
   ROOF & WATERPROOFING QUOTATION MODEL
   =========================================================

   A second document type alongside the window/door quote.

   The template mirrors the AGA roof & waterproofing quotation:
   a cover page, scope of works, per-section pricing tables
   (Preliminaries / Roof Works / Carport Works), a project
   timeline, a costing summary and an acceptance page.

   Every field is optional. Sections with no rows are dropped
   from the printed sheet rather than printing an empty frame.
*/

const ROOF_QUOTE_SCHEMA_VERSION = 1;

/* Section codes drive the printed headings (A, B, C ...). */
const ROOF_QUOTE_SECTIONS = [
    { code: "A", title: "PRELIMINARIES" },
    { code: "B", title: "ROOF WORKS \u2014 RESIDENTIAL UNITS" },
    { code: "C", title: "CARPORT WORKS (Corrugated Iron)" }
];

function blankRoofQuoteCosting() {
    return {
        /* Per-line costing summary rows (excl. VAT). */
        rows: [],
        /* Free text blocks. */
        inclusionNotes: "",
        terms: "",
        /* Optional extras printed below the main total. */
        extras: []
    };
}

function blankRoofQuoteLine(overrides = {}) {
    return Object.assign(
        {
            id: quoteUuid(),
            /* Which pricing section (A/B/C) the row belongs to. */
            section: "A",
            code: "",
            description: "",
            qty: 1,
            unit: "",
            rate: null,
            amount: null,
            /* "Included", "Lump sum", or blank for a normal row. */
            qualifier: ""
        },
        overrides
    );
}

function blankRoofQuoteStage(overrides = {}) {
    return Object.assign(
        {
            id: quoteUuid(),
            title: "",
            duration: "",
            activities: []
        },
        overrides
    );
}

function blankRoofQuote() {
    return {
        schemaVersion: ROOF_QUOTE_SCHEMA_VERSION,
        id: "",
        docType: "roof",
        quoteNumber: "",
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        attention: "",
        customerRef: "",
        projectName: "",
        siteAddress: "",
        validUntil: "",
        preparedBy: "",
        /* Quote date, ISO (yyyy-mm-dd). Blank means "today". */
        quoteDate: "",
        /* Scope of works: array of { title, items: [] }. */
        scope: [],
        /* Preliminaries & notes bullets. */
        preliminaries: [],
        /* "What this cost includes" groups: { title, items: [] }. */
        includes: [],
        lines: [],
        timeline: [],
        costing: blankRoofQuoteCosting(),
        /* VAT and deposit, stored as numbers. */
        vatRate: 15,
        depositPercent: 60,
        createdAt: "",
        updatedAt: ""
    };
}

/* =========================================================
   CALCULATION
   ========================================================= */

function quoteLineAreaSqm(line) {
    const lengthM = quoteNumber(line.lengthMm) / 1000;
    const widthM = quoteNumber(line.widthMm) / 1000;

    return lengthM * widthM * quoteNumber(line.qty, 1);
}

function quoteLineTotal(line) {
    const gross = quoteNumber(line.unitPrice) * quoteNumber(line.qty, 1);
    const discount = quoteNumber(line.discount);

    return quoteRound(gross * (1 - discount / 100));
}

/*
   Returns every calculated figure for a quote so the render
   code and the print sheet can never drift apart.
*/
function calculateQuote(quote) {
    const lines = Array.isArray(quote.lines) ? quote.lines : [];

    const itemsSubtotal = quoteRound(
        lines.reduce((sum, line) => sum + quoteLineTotal(line), 0)
    );

    const totalAreaSqm = quoteRound(
        lines.reduce((sum, line) => sum + quoteLineAreaSqm(line), 0),
        3
    );

    const totalQty = lines.reduce(
        (sum, line) => sum + quoteNumber(line.qty, 1),
        0
    );

    const costs = quote.costs || {};

    /*
       Percentage costs are charged on the goods total, which is
       what "cost of the windows" means to the workshop.
    */
    const productionFromRate = itemsSubtotal * quoteNumber(costs.productionRate) / 100;
    const productionFixed = quoteNumber(costs.productionFixed);
    const installFromRate = itemsSubtotal * quoteNumber(costs.installRate) / 100;
    const installFromArea = totalAreaSqm * quoteNumber(costs.installPerSqm);
    const glazing = itemsSubtotal * quoteNumber(costs.glazingRate) / 100;
    const delivery = quoteNumber(costs.delivery);
    const sundries = quoteNumber(costs.sundries);
    const otherAmount = quoteNumber(quote.otherAmount);

    const feeLines = [
        { key: "productionRate", label: QUOTE_FEE_LABELS.productionRate, amount: quoteRound(productionFromRate) },
        { key: "productionFixed", label: QUOTE_FEE_LABELS.productionFixed, amount: quoteRound(productionFixed) },
        { key: "installRate", label: QUOTE_FEE_LABELS.installRate, amount: quoteRound(installFromRate) },
        { key: "installPerSqm", label: QUOTE_FEE_LABELS.installPerSqm, amount: quoteRound(installFromArea) },
        { key: "glazingRate", label: QUOTE_FEE_LABELS.glazingRate, amount: quoteRound(glazing) },
        { key: "delivery", label: QUOTE_FEE_LABELS.delivery, amount: quoteRound(delivery) },
        { key: "sundries", label: QUOTE_FEE_LABELS.sundries, amount: quoteRound(sundries) }
    ].filter(fee => fee.amount > 0);

    if (otherAmount > 0) {
        feeLines.push({
            key: "other",
            label: quoteText(quote.otherLabel) || "Other",
            amount: quoteRound(otherAmount)
        });
    }

    const costSubtotal = quoteRound(
        feeLines.reduce((sum, fee) => sum + fee.amount, 0)
    );

    const subtotal = quoteRound(itemsSubtotal + costSubtotal);

    const discountPercent = quoteNumber(costs.discount);
    const discountAmount = quoteRound(subtotal * discountPercent / 100);
    const netExVat = quoteRound(subtotal - discountAmount);

    const vatRate = quoteNumber(costs.vatRate);
    const vatAmount = quoteRound(netExVat * vatRate / 100);
    const grandTotal = quoteRound(netExVat + vatAmount);

    const depositAmount = quoteRound(
        grandTotal * quoteNumber(costs.deposit) / 100
    );

    return {
        itemsSubtotal,
        totalAreaSqm,
        totalQty,
        feeLines,
        costSubtotal,
        subtotal,
        discountPercent,
        discountAmount,
        netExVat,
        vatRate,
        vatAmount,
        grandTotal,
        depositAmount
    };
}

/* =========================================================
   READING THE FORM
   ========================================================= */

function quoteFieldValue(id) {
    const field = document.getElementById(id);

    return field ? field.value : "";
}

function quoteFieldNumber(id, fallback = 0) {
    const raw = quoteFieldValue(id);

    return raw === "" ? fallback : quoteNumber(raw, fallback);
}

/*
   Pulls the header, cost and summary fields off the screen
   into the draft. Lines are untouched because they are edited
   in place in the table.
*/
function syncQuoteFromForm() {
    quoteDraft.customerName = quoteFieldValue("quoteCustomerName");
    quoteDraft.customerEmail = quoteFieldValue("quoteCustomerEmail");
    quoteDraft.customerPhone = quoteFieldValue("quoteCustomerPhone");
    quoteDraft.projectName = quoteFieldValue("quoteProjectName");
    quoteDraft.projectRef = quoteFieldValue("quoteProjectRef");
    quoteDraft.siteAddress = quoteFieldValue("quoteSiteAddress");
    quoteDraft.validUntil = quoteFieldValue("quoteValidUntil");
    quoteDraft.notes = quoteFieldValue("quoteNotes");
    quoteDraft.otherLabel = quoteFieldValue("quoteOtherLabel");

    quoteDraft.otherAmount = quoteFieldNumber("quoteOtherAmount");

    quoteDraft.costs = {
        productionRate: quoteFieldNumber("quoteProdRate"),
        productionFixed: quoteFieldNumber("quoteProdFixed"),
        installRate: quoteFieldNumber("quoteInstallRate"),
        installPerSqm: quoteFieldNumber("quoteInstallPerSqm"),
        glazingRate: quoteFieldNumber("quoteGlazingRate"),
        delivery: quoteFieldNumber("quoteDelivery"),
        sundries: quoteFieldNumber("quoteSundries"),
        discount: quoteFieldNumber("quoteDiscount"),
        vatRate: quoteFieldNumber("quoteVatRate"),
        deposit: quoteFieldNumber("quoteDeposit")
    };

    return quoteDraft;
}

function fillQuoteForm(quote) {
    const set = (id, value) => {
        const field = document.getElementById(id);

        if (field) {
            field.value = value === undefined || value === null ? "" : value;
        }
    };

    set("quoteCustomerName", quote.customerName);
    set("quoteCustomerEmail", quote.customerEmail);
    set("quoteCustomerPhone", quote.customerPhone);
    set("quoteProjectName", quote.projectName);
    set("quoteProjectRef", quote.projectRef);
    set("quoteSiteAddress", quote.siteAddress);
    set("quoteValidUntil", quote.validUntil);
    set("quoteNotes", quote.notes);
    set("quoteOtherLabel", quote.otherLabel);
    set("quoteOtherAmount", quote.otherAmount || "");

    const costs = Object.assign({}, AGA_QUOTE_COST_DEFAULTS, quote.costs || {});

    set("quoteProdRate", costs.productionRate);
    set("quoteProdFixed", costs.productionFixed);
    set("quoteInstallRate", costs.installRate);
    set("quoteInstallPerSqm", costs.installPerSqm);
    set("quoteGlazingRate", costs.glazingRate);
    set("quoteDelivery", costs.delivery);
    set("quoteSundries", costs.sundries);
    set("quoteDiscount", costs.discount);
    set("quoteVatRate", costs.vatRate);
    set("quoteDeposit", costs.deposit);

    const note = document.getElementById("quoteNumberNote");

    if (note) {
        note.textContent = quote.quoteNumber
            ? "Quote " + quote.quoteNumber
            : "Not saved yet";
    }
}

/* =========================================================
   THE PRODUCT PICKER
   ========================================================= */

function renderQuoteProductOptions() {
    const select = document.getElementById("quoteProductSelect");

    if (!select) {
        return;
    }

    const previous = select.value;

    /* Group by category then workshop system, so the list reads
       like the shop rather than one long flat dump. */
    const groups = new Map();

    agaLiveProducts().forEach(product => {
        const key = product.category + " \u2014 " + product.system;

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key).push(product);
    });

    /*
       Speed up the very common "start typing the code" case:
       the select is searchable natively by typing its option
       text, which already starts with the product code.
    */
    const options = agaLiveProducts();

    let html = '<option value="">Select a standard product...</option>';

    if (!options.length) {
        html +=
            '<option value="" disabled>No catalogue loaded \u2014 press Refresh Catalogue</option>';
    }

    groups.forEach((products, label) => {
        html += '<optgroup label="' + quoteEscape(label) + '">';

        products.forEach(product => {
            const price = product.priceTo
                ? quoteMoney(product.priceFrom) + " \u2013 " + quoteMoney(product.priceTo)
                : quoteMoney(product.priceFrom);

            /* A product priced straight from the shop is
               marked so it is obvious on screen. */
            const source = product.live ? "" : " (built-in)";

            html +=
                '<option value="' +
                quoteEscape(product.code) +
                '">' +
                quoteEscape(
                    product.code +
                    " \u00B7 " +
                    product.name +
                    " \u00B7 " +
                    price +
                    source
                ) +
                "</option>";
        });

        html += "</optgroup>";
    });

    select.innerHTML = html;
    select.value = previous;

    /*
       The note belongs to this list, so redraw it here too.
       initQuotes() draws it once at startup, but that misses the
       case where a refresh or a saved catalogue changes the count
       afterwards - the note would keep describing the old list.
    */
    if (typeof agaRenderCatalogueNote === "function") {
        agaRenderCatalogueNote();
    }
}

/* =========================================================
   LINES
   ========================================================= */

function addStandardProductToQuote(code) {
    /* catalogue.js keeps this index in step with whichever
       price list is in use - fetched or built in. */
    const product = agaProductLookup(code);

    if (!product) {
        showToast("Please choose a standard product first.", "error");

        return;
    }

    quoteDraft.lines.push(
        blankQuoteLine({
            code: product.code,
            description: product.name,
            itemType: product.category === "Doors" ? "Door" : "Window",
            manual: false,
            qty: 1,
            lengthMm: product.heightMm,
            widthMm: product.widthMm,
            unitPrice: product.priceFrom
        })
    );

    showSuccess(product.code + " added to the quote.");

    renderQuoteLines();
    renderQuoteSummary();
}

function addManualLineToQuote() {
    quoteDraft.lines.push(
        blankQuoteLine({
            code: "",
            description: "Manual window \u2014 enter description",
            itemType: "Window",
            manual: true,
            qty: 1,
            lengthMm: 0,
            widthMm: 0,
            unitPrice: 0
        })
    );

    showSuccess("Manual line added. Capture the size and rate.");

    renderQuoteLines();
    renderQuoteSummary();

    /*
       Focus the new row's description so a manual capture is
       quick - the drumbeat of quoting odd sizes.
    */
    const rows = document.querySelectorAll("#quoteLinesBody tr");

    if (rows.length) {
        const lastRow = rows[rows.length - 1];
        const field = lastRow.querySelector('[data-field="description"]');

        if (field) {
            field.focus();
            field.select();
        }
    }
}

function removeQuoteLine(lineId) {
    quoteDraft.lines = quoteDraft.lines.filter(line => line.id !== lineId);

    renderQuoteLines();
    renderQuoteSummary();
}

function duplicateQuoteLine(lineId) {
    const line = quoteDraft.lines.find(item => item.id === lineId);

    if (!line) {
        return;
    }

    const copy = Object.assign({}, line, { id: quoteUuid() });

    quoteDraft.lines.push(copy);

    renderQuoteLines();
    renderQuoteSummary();
}

function updateQuoteLine(lineId, field, value) {
    const line = quoteDraft.lines.find(item => item.id === lineId);

    if (!line) {
        return;
    }

    if (field === "qty" || field === "lengthMm" || field === "widthMm" ||
        field === "unitPrice" || field === "discount") {
        line[field] = quoteNumber(value);
    } else if (field === "itemType" || field === "finish") {
        line[field] = quoteText(value);
    } else {
        line[field] = value;
    }

    /*
       Update only the affected row's total rather than
       re-rendering the table, so the caret stays in the field
       the user is typing in.
    */
    const row = document.querySelector(
        '#quoteLinesBody tr[data-line-id="' + line.id + '"]'
    );

    if (row) {
        const totalCell = row.querySelector(".q-line-total");

        if (totalCell) {
            totalCell.textContent = quoteMoney(quoteLineTotal(line));
        }
    }

    renderQuoteSummary();
}

function quoteFinishOptionsHtml(selected) {
    return AGA_QUOTE_FINISHES.map(
        finish =>
            '<option value="' +
            quoteEscape(finish) +
            '"' +
            (finish === selected ? " selected" : "") +
            ">" +
            quoteEscape(finish) +
            "</option>"
    ).join("");
}

function renderQuoteLines() {
    const body = document.getElementById("quoteLinesBody");
    const empty = document.getElementById("quoteLinesEmpty");

    if (!body) {
        return;
    }

    if (!quoteDraft.lines.length) {
        body.innerHTML = "";

        if (empty) {
            empty.hidden = false;
        }

        return;
    }

    if (empty) {
        empty.hidden = true;
    }

    body.innerHTML = quoteDraft.lines
        .map(line => {
            const total = quoteLineTotal(line);

            return `
                <tr data-line-id="${quoteEscape(line.id)}">
                    <td class="q-code">
                        <input type="text" class="quote-cell-input" data-field="code"
                            value="${quoteEscape(line.code)}" placeholder="${line.manual ? "MAN" : "\u2014"}"
                            aria-label="Product code">
                    </td>
                    <td class="q-desc">
                        <input type="text" class="quote-cell-input" data-field="description"
                            value="${quoteEscape(line.description)}" placeholder="Description">
                    </td>
                    <td class="q-type">
                        <select class="quote-cell-input" data-field="itemType" aria-label="Item type">
                            <option value="Window"${line.itemType === "Window" ? " selected" : ""}>Window</option>
                            <option value="Door"${line.itemType === "Door" ? " selected" : ""}>Door</option>
                            <option value="Shopfront"${line.itemType === "Shopfront" ? " selected" : ""}>Shopfront</option>
                            <option value="Curtain Wall"${line.itemType === "Curtain Wall" ? " selected" : ""}>Curtain Wall</option>
                            <option value="Shower"${line.itemType === "Shower" ? " selected" : ""}>Shower</option>
                            <option value="Other"${line.itemType === "Other" ? " selected" : ""}>Other</option>
                        </select>
                    </td>
                    <td class="q-qty">
                        <input type="number" class="quote-cell-input" data-field="qty" min="1" step="1"
                            value="${quoteNumber(line.qty, 1)}" aria-label="Quantity">
                    </td>
                    <td class="q-size">
                        <input type="number" class="quote-cell-input" data-field="lengthMm" min="0" step="1"
                            value="${quoteNumber(line.lengthMm)}" aria-label="Length in millimetres">
                    </td>
                    <td class="q-size">
                        <input type="number" class="quote-cell-input" data-field="widthMm" min="0" step="1"
                            value="${quoteNumber(line.widthMm)}" aria-label="Width in millimetres">
                    </td>
                    <td class="q-fins">
                        <select class="quote-cell-input" data-field="finish" aria-label="Frame finish">
                            ${quoteFinishOptionsHtml(line.finish)}
                        </select>
                    </td>
                    <td class="q-unit">
                        <input type="number" class="quote-cell-input" data-field="unitPrice" min="0" step="0.01"
                            value="${quoteRound(line.unitPrice)}" aria-label="Unit price">
                    </td>
                    <td class="q-disc">
                        <input type="number" class="quote-cell-input" data-field="discount" min="0" max="100" step="0.1"
                            value="${quoteNumber(line.discount)}" aria-label="Line discount percent">
                    </td>
                    <td class="q-line q-line-total">${quoteMoney(total)}</td>
                    <td class="q-actions">
                        <button type="button" class="quote-row-button" data-action="duplicate"
                            data-line-id="${quoteEscape(line.id)}" title="Duplicate line" aria-label="Duplicate line">
                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>
                        </button>
                        <button type="button" class="quote-row-button quote-row-remove" data-action="remove"
                            data-line-id="${quoteEscape(line.id)}" title="Remove line" aria-label="Remove line">
                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        })
        .join("");
}

/* =========================================================
   SUMMARY
   ========================================================= */

function renderQuoteSummary() {
    const quote = syncQuoteFromForm();
    const totals = calculateQuote(quote);

    const set = (id, value) => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    };

    set("quoteItemsSubtotal", quoteMoney(totals.itemsSubtotal));
    set("quoteCostSubtotal", quoteMoney(totals.costSubtotal));
    set("quoteSubtotal", quoteMoney(totals.subtotal));
    set("quoteDiscountAmount", "-" + quoteMoney(totals.discountAmount));
    set("quoteNetExVat", quoteMoney(totals.netExVat));
    set("quoteVatLabel", "VAT @ " + quoteNumber(totals.vatRate) + "%");
    set("quoteVatAmount", quoteMoney(totals.vatAmount));
    set("quoteGrandTotal", quoteMoney(totals.grandTotal));
    set("quoteDepositAmount", quoteMoney(totals.depositAmount));

    set(
        "quoteAreaNote",
        "Total area: " + totals.totalAreaSqm.toFixed(3) + " m\u00B2 \u00B7 " +
        totals.totalQty + " item(s)"
    );

    return totals;
}

/* =========================================================
   SAVE / LOAD / CLEAR
   ========================================================= */

function collectQuoteDraft() {
    syncQuoteFromForm();

    if (!quoteText(quoteDraft.customerName)) {
        showToast("Please capture the customer name before saving.", "error");

        const field = document.getElementById("quoteCustomerName");

        if (field) {
            field.focus();
        }

        return null;
    }

    if (!quoteDraft.lines.length) {
        showToast("Add at least one quote line before saving.", "error");

        return null;
    }

    const now = new Date().toISOString();

    if (!quoteDraft.id) {
        quoteDraft.id = quoteUuid();
    }

    if (!quoteDraft.quoteNumber) {
        quoteDraft.quoteNumber = generateQuoteNumber();
    }

    if (!quoteDraft.createdAt) {
        quoteDraft.createdAt = now;
    }

    quoteDraft.updatedAt = now;
    quoteDraft.schemaVersion = QUOTE_SCHEMA_VERSION;

    /* Store a deep copy so later edits to the draft cannot
       mutate the saved record in memory. */
    return JSON.parse(JSON.stringify(quoteDraft));
}

function saveCurrentQuote() {
    const record = collectQuoteDraft();

    if (!record) {
        return false;
    }

    const quotes = getQuotes();
    const index = quotes.findIndex(quote => quote.id === record.id);

    if (index >= 0) {
        quotes[index] = record;
    } else {
        quotes.push(record);
    }

    if (!saveQuotes(quotes)) {
        return false;
    }

    quoteDraft = record;

    fillQuoteForm(record);
    renderQuotesList();

    showSuccess("Quote " + record.quoteNumber + " saved.");

    return true;
}

function loadQuote(quoteId) {
    const quotes = getQuotes();
    const quote = quotes.find(item => item.id === quoteId);

    if (!quote) {
        showToast("That quote could not be found.", "error");

        return;
    }

    /* Normalise older records so a missing field never throws. */
    quoteDraft = Object.assign(blankQuote(), quote, {
        lines: (quote.lines || []).map(line =>
            Object.assign(blankQuoteLine(), line)
        ),
        costs: Object.assign(
            {},
            AGA_QUOTE_COST_DEFAULTS,
            quote.costs || {}
        )
    });

    fillQuoteForm(quoteDraft);
    renderQuoteLines();
    renderQuoteSummary();

    window.scrollTo({ top: 0, behavior: "smooth" });

    showSuccess("Quote " + (quoteDraft.quoteNumber || "") + " loaded.");
}

function deleteQuote(quoteId) {
    const quotes = getQuotes();
    const quote = quotes.find(item => item.id === quoteId);

    if (!quote) {
        return;
    }

    const label = quote.quoteNumber || "this quote";

    if (!window.confirm("Delete " + label + "? This cannot be undone.")) {
        return;
    }

    saveQuotes(quotes.filter(item => item.id !== quoteId));

    if (quoteDraft.id === quoteId) {
        resetQuoteForm();
    }

    renderQuotesList();

    showSuccess("Quote " + label + " deleted.");
}

function resetQuoteForm() {
    quoteDraft = blankQuote();

    fillQuoteForm(quoteDraft);
    renderQuoteLines();
    renderQuoteSummary();
}

/* =========================================================
   SAVED QUOTES LIST
   ========================================================= */

function renderQuotesList() {
    const container = document.getElementById("quotesList");

    if (!container) {
        return;
    }

    const searchField = document.getElementById("quoteSearch");
    const term = quoteText(searchField ? searchField.value : "").toLowerCase();

    let quotes = getQuotes();

    if (term) {
        quotes = quotes.filter(quote =>
            [
                quote.quoteNumber,
                quote.customerName,
                quote.projectName,
                quote.siteAddress
            ]
                .map(quoteText)
                .join(" ")
                .toLowerCase()
                .includes(term)
        );
    }

    /* Newest first. */
    quotes = quotes.slice().sort((a, b) =>
        quoteText(b.updatedAt).localeCompare(quoteText(a.updatedAt))
    );

    if (!quotes.length) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                </span>
                <h3>${term ? "No matching quotes" : "No saved quotes yet"}</h3>
                <p>${term ? "Try a different search term." : "Build a quote above and save it to keep it here."}</p>
            </div>
        `;

        return;
    }

    container.innerHTML = quotes
        .map(quote => {
            const totals = calculateQuote(quote);
            const updated = quoteText(quote.updatedAt).slice(0, 10);

            return `
                <div class="quote-list-item">
                    <div class="quote-list-main">
                        <div class="quote-list-title">
                            <strong>${quoteEscape(quote.quoteNumber || "Draft")}</strong>
                            <span class="quote-list-customer">${quoteEscape(quote.customerName || "No customer")}</span>
                        </div>
                        <div class="quote-list-meta">
                            <span>${quoteEscape(quote.projectName || "No project name")}</span>
                            <span>${quote.lines ? quote.lines.length : 0} line(s)</span>
                            <span>${totals.totalAreaSqm.toFixed(2)} m&sup2;</span>
                            <span>Updated ${quoteEscape(updated)}</span>
                        </div>
                    </div>
                    <div class="quote-list-total">
                        <span>Total incl. VAT</span>
                        <strong>${quoteMoney(totals.grandTotal)}</strong>
                    </div>
                    <div class="quote-list-actions">
                        <button type="button" class="secondary-button quote-list-button"
                            data-quote-action="load" data-quote-id="${quoteEscape(quote.id)}">
                            Open
                        </button>
                        <button type="button" class="quote-row-button quote-row-remove"
                            data-quote-action="delete" data-quote-id="${quoteEscape(quote.id)}"
                            title="Delete quote" aria-label="Delete quote">
                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
}

/* =========================================================
   LINKING TO PRODUCTION PROJECTS
   ========================================================= */

function renderQuoteProjectOptions() {
    const select = document.getElementById("quoteProjectRef");

    if (!select || typeof getProjects !== "function") {
        return;
    }

    const previous = select.value;

    let projects = [];

    try {
        projects = getProjects();
    } catch (error) {
        console.warn("Could not read projects for quote linking:", error);
    }

    select.innerHTML =
        '<option value="">Not linked</option>' +
        projects
            .map(
                project =>
                    '<option value="' +
                    quoteEscape(project.id) +
                    '">' +
                    quoteEscape(project.name || project.customerName || "Project") +
                    "</option>"
            )
            .join("");

    select.value = previous;

    /* Keep the selection if it still exists. */
    if (select.value !== previous) {
        select.value = "";
    }
}

/* =========================================================
   PRINT SHEET
   ========================================================= */

function buildQuotePrintSheet() {
    const quote = syncQuoteFromForm();
    const totals = calculateQuote(quote);
    const now = new Date();

    const rows = quote.lines
        .map(
            (line, index) => `
                <tr>
                    <td class="c-num">${index + 1}</td>
                    <td class="c-code">${quoteEscape(line.code || "\u2014")}</td>
                    <td class="c-desc">
                        ${quoteEscape(line.description)}
                        ${line.manual ? '<span class="print-manual-tag">Manual size</span>' : ""}
                    </td>
                    <td class="c-type">${quoteEscape(line.itemType)}</td>
                    <td class="c-qty">${quoteNumber(line.qty, 1)}</td>
                    <td class="c-size">${quoteNumber(line.lengthMm) || "\u2014"}</td>
                    <td class="c-size">${quoteNumber(line.widthMm) || "\u2014"}</td>
                    <td class="c-finish">${quoteEscape(line.finish)}</td>
                    <td class="c-money">${quoteMoney(line.unitPrice)}</td>
                    <td class="c-money">${quoteMoney(quoteLineTotal(line))}</td>
                </tr>
            `
        )
        .join("");

    const feeRows = totals.feeLines
        .map(
            fee => `
                <tr>
                    <td>${quoteEscape(fee.label)}</td>
                    <td class="c-money">${quoteMoney(fee.amount)}</td>
                </tr>
            `
        )
        .join("");

    return `
        <header class="print-letterhead">
            <img src="FullLetterHead.png" alt="AGA Architectural Glass &amp; Aluminium"
                class="print-letterhead-image">
        </header>

        <div class="print-rule-heavy"></div>

        <section class="print-titleblock">
            <div class="print-titleblock-main">
                <h1>Quotation</h1>
                <p class="print-titleblock-sub">${quoteEscape(quote.projectName || "Supply of aluminium windows &amp; doors")}</p>
            </div>
            <div class="print-titleblock-id">
                <span class="print-id-label">Quote No.</span>
                <strong>${quoteEscape(quote.quoteNumber || "DRAFT")}</strong>
                <span class="print-status-chip">Valid until ${quoteEscape(quote.validUntil || "\u2014")}</span>
            </div>
        </section>

        <div class="print-rule-light"></div>

        <section class="print-section">
            <h2 class="print-section-title">Customer Detail</h2>
            <table class="print-detail-grid">
                <tr>
                    <th>Customer</th>
                    <td>${quoteEscape(quote.customerName || "\u2014")}</td>
                    <th>Contact</th>
                    <td>${quoteEscape(quote.customerPhone || "\u2014")}</td>
                </tr>
                <tr>
                    <th>Email</th>
                    <td>${quoteEscape(quote.customerEmail || "\u2014")}</td>
                    <th>Valid Until</th>
                    <td>${quoteEscape(quote.validUntil || "\u2014")}</td>
                </tr>
                <tr>
                    <th>Project</th>
                    <td>${quoteEscape(quote.projectName || "\u2014")}</td>
                    <th>Date</th>
                    <td>${now.toISOString().slice(0, 10)}</td>
                </tr>
                <tr>
                    <th>Site Address</th>
                    <td colspan="3">${quoteEscape(quote.siteAddress || "\u2014")}</td>
                </tr>
            </table>
        </section>

        <section class="print-section">
            <h2 class="print-section-title">
                Items
                <span class="print-section-note">${quote.lines.length} line(s) &middot; ${totals.totalAreaSqm.toFixed(3)} m&sup2;</span>
            </h2>

            <table class="print-schedule quote-print-schedule">
                <thead>
                    <tr>
                        <th class="c-num">#</th>
                        <th class="c-code">Code</th>
                        <th class="c-desc">Description</th>
                        <th class="c-type">Item</th>
                        <th class="c-qty">Qty</th>
                        <th class="c-size">Length</th>
                        <th class="c-size">Width</th>
                        <th class="c-finish">Finish</th>
                        <th class="c-money">Unit</th>
                        <th class="c-money">Total</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </section>

        <section class="print-section quote-print-costs">
            <div class="quote-print-col">
                <h2 class="print-section-title">Installation &amp; Production</h2>
                <table class="print-cost-table">
                    <tbody>
                        ${feeRows || '<tr><td colspan="2" class="quote-print-none">No additional costs loaded.</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div class="quote-print-col">
                <h2 class="print-section-title">Totals</h2>
                <table class="print-cost-table print-totals-table">
                    <tbody>
                        <tr><td>Items</td><td class="c-money">${quoteMoney(totals.itemsSubtotal)}</td></tr>
                        <tr><td>Installation &amp; production</td><td class="c-money">${quoteMoney(totals.costSubtotal)}</td></tr>
                        <tr><td>Subtotal</td><td class="c-money">${quoteMoney(totals.subtotal)}</td></tr>
                        <tr><td>Discount (${quoteNumber(totals.discountPercent)}%)</td><td class="c-money">-${quoteMoney(totals.discountAmount)}</td></tr>
                        <tr><td>Net excluding VAT</td><td class="c-money">${quoteMoney(totals.netExVat)}</td></tr>
                        <tr><td>VAT @ ${quoteNumber(totals.vatRate)}%</td><td class="c-money">${quoteMoney(totals.vatAmount)}</td></tr>
                        <tr class="print-row-strong"><td>Total incl. VAT</td><td class="c-money">${quoteMoney(totals.grandTotal)}</td></tr>
                        <tr><td>Deposit required</td><td class="c-money">${quoteMoney(totals.depositAmount)}</td></tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section class="print-section">
            <h2 class="print-section-title">Notes &amp; Terms</h2>
            <div class="print-notes-box">${quoteEscape(quote.notes) || "&nbsp;"}</div>
        </section>

        <section class="print-section print-signoff">
            <h2 class="print-section-title">Acceptance</h2>
            <div class="print-signatures">
                <div class="print-signature">
                    <div class="print-signature-line"></div>
                    <strong>Customer Signature</strong>
                    <span class="print-signature-blank"></span>
                </div>
                <div class="print-signature">
                    <div class="print-signature-line"></div>
                    <strong>Name &amp; Date</strong>
                    <span class="print-signature-blank"></span>
                </div>
                <div class="print-signature">
                    <div class="print-signature-line"></div>
                    <strong>For AGA</strong>
                    <span class="print-signature-blank"></span>
                </div>
            </div>
        </section>

        <footer class="print-footer">
            <div class="print-footer-details">
                <strong>AGA Architectural Glass &amp; Aluminium</strong>
                <span>Unit 7 Central Lake Factory Park, 5 Louis Friedman Street,</span>
                <span>Factoria, Krugersdorp</span>
                <span>010 597 6616 &middot; info@agasouthafrica.co.za</span>
                <span class="print-footer-generated">Printed ${quoteStamp(now)}</span>
            </div >
        </footer >
        `;
}

function printQuote() {
    const sheet = document.getElementById("quotePrintSheet");

    if (!sheet) {
        return;
    }

    syncQuoteFromForm();

    if (!quoteDraft.lines.length) {
        showToast("Add at least one quote line before printing.", "error");

        return;
    }

    sheet.innerHTML = buildQuotePrintSheet();

    document.body.classList.add("printing-quote");

    const cleanup = () => {
        document.body.classList.remove("printing-quote");
        window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.print();
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

/*
   Prints the roof & waterproofing quotation.

   Crucially this is a separate document from the window/door
   quote: it reuses the same header fields, but the body comes
   from the roof model (scope, pricing sections, timeline,
   costing summary, acceptance).
*/
function printRoofQuote(roofQuote) {
    const sheet = document.getElementById("roofQuotePrintSheet");

    if (!sheet) {
        return;
    }

    const quote = Object.assign(blankRoofQuote(), roofQuote || {});

    if (!quoteText(quote.customerName)) {
        showToast("Capture the customer name before printing the quotation.", "error");

        return;
    }

    sheet.innerHTML = buildRoofQuotePrintSheet(quote);

    document.body.classList.add("printing-roof");

    const cleanup = () => {
        document.body.classList.remove("printing-roof");
        window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    window.print();
}

function initialiseQuoteEventListeners() {
    const refreshButton = document.getElementById(
        "quoteRefreshCatalogueButton"
    );

    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            if (
                !window.AGA_CATALOGUE ||
                typeof window.AGA_CATALOGUE.refresh !== "function"
            ) {
                showError("The catalogue module did not load.");

                return;
            }

            window.AGA_CATALOGUE.refresh();
        });
    }

    const addProductButton = document.getElementById("quoteAddProductButton");

    if (addProductButton) {
        addProductButton.addEventListener("click", () => {
            const select = document.getElementById("quoteProductSelect");

            addStandardProductToQuote(select ? select.value : "");
        });
    }

    const addManualButton = document.getElementById("quoteAddManualButton");

    if (addManualButton) {
        addManualButton.addEventListener("click", addManualLineToQuote);
    }

    const productSelect = document.getElementById("quoteProductSelect");

    if (productSelect) {
        /* Enter in the picker is the fast path for a keyboard
           user capturing a long schedule. */
        productSelect.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                addStandardProductToQuote(productSelect.value);
            }
        });
    }

    const linesBody = document.getElementById("quoteLinesBody");

    if (linesBody) {
        /*
           One delegated listener for every cell. Using "input"
           rather than "keyup" means paste, spinner clicks and
           mobile keyboards all behave the same.
        */
        linesBody.addEventListener("input", event => {
            const field = event.target.dataset.field;

            if (!field) {
                return;
            }

            const row = event.target.closest("tr");

            if (!row) {
                return;
            }

            updateQuoteLine(row.dataset.lineId, field, event.target.value);
        });

        linesBody.addEventListener("change", event => {
            const field = event.target.dataset.field;

            if (!field) {
                return;
            }

            const row = event.target.closest("tr");

            if (!row) {
                return;
            }

            updateQuoteLine(row.dataset.lineId, field, event.target.value);
        });

        linesBody.addEventListener("click", event => {
            const button = event.target.closest("[data-action]");

            if (!button) {
                return;
            }

            const lineId = button.dataset.lineId;

            if (button.dataset.action === "remove") {
                removeQuoteLine(lineId);
            } else if (button.dataset.action === "duplicate") {
                duplicateQuoteLine(lineId);
            }
        });
    }

    /*
       Cost and summary fields feed the totals live. Every
       number field is covered, so a percentage typed in the
       cost card moves the grand total immediately.
    */
    [
        "quoteProdRate",
        "quoteProdFixed",
        "quoteInstallRate",
        "quoteInstallPerSqm",
        "quoteGlazingRate",
        "quoteDelivery",
        "quoteSundries",
        "quoteOtherLabel",
        "quoteOtherAmount",
        "quoteDiscount",
        "quoteVatRate",
        "quoteDeposit"
    ].forEach(id => {
        const field = document.getElementById(id);

        if (field) {
            field.addEventListener("input", renderQuoteSummary);
        }
    });

    const saveButton = document.getElementById("quoteSaveButton");

    if (saveButton) {
        saveButton.addEventListener("click", saveCurrentQuote);
    }

    const printButton = document.getElementById("quotePrintButton");

    if (printButton) {
        printButton.addEventListener("click", printQuote);
    }

    const resetButton = document.getElementById("quoteResetButton");

    if (resetButton) {
        resetButton.addEventListener("click", () => {
            if (!quoteDraft.lines.length ||
                window.confirm("Clear the quote currently on screen? Saved quotes are not affected.")) {
                resetQuoteForm();
                showSuccess("Quote cleared.");
            }
        });
    }

    const newButton = document.getElementById("quoteNewButton");

    if (newButton) {
        newButton.addEventListener("click", () => {
            resetQuoteForm();
            showSuccess("Started a new quote.");
        });
    }

    const searchField = document.getElementById("quoteSearch");

    if (searchField) {
        searchField.addEventListener("input", renderQuotesList);
    }

    const quotesList = document.getElementById("quotesList");

    if (quotesList) {
        quotesList.addEventListener("click", event => {
            const button = event.target.closest("[data-quote-action]");

            if (!button) {
                return;
            }

            if (button.dataset.quoteAction === "load") {
                loadQuote(button.dataset.quoteId);
            } else if (button.dataset.quoteAction === "delete") {
                deleteQuote(button.dataset.quoteId);
            }
        });
    }
}

/* =========================================================
   Hooks called by app.js
   ========================================================= */

function renderQuotes() {
    renderQuoteProjectOptions();
    renderQuotesList();

    /*
       Only re-render the lines table when the view is actually
       on screen, so background re-renders never fight with a
       half-typed cell.
    */
    const view = document.getElementById("quotes-view");

    if (view && view.classList.contains("active")) {
        renderQuoteLines();
        renderQuoteSummary();
    }
}

function initQuotes() {
    /* renderQuoteProductOptions() redraws the catalogue note itself. */
    renderQuoteProductOptions();
    renderQuoteProjectOptions();
    renderQuoteLines();
    renderQuoteSummary();
    renderQuotesList();
    initialiseQuoteEventListeners();
}

/* Expose the few things other modules may need. */
window.renderQuotes = renderQuotes;
window.initQuotes = initQuotes;

/*
   Deliberately not assigned on load. catalogue.js runs after
   this file and sets window.AGA_STANDARD_PRODUCTS to the list
   actually in use, so writing the built-in list here would be
   overwritten a moment later anyway.
*/
/* =========================================================
   ROOF QUOTATION CALCULATION
   =========================================================

   Every printed figure comes from here, so the costing summary
   and the section totals can never disagree.
*/

function roofQuoteLineAmount(line) {
    /* An explicit amount wins; otherwise qty x rate. */
    if (line.amount !== null && line.amount !== undefined && line.amount !== "") {
        return quoteRound(quoteNumber(line.amount));
    }

    if (line.rate !== null && line.rate !== undefined && line.rate !== "") {
        return quoteRound(quoteNumber(line.qty, 1) * quoteNumber(line.rate));
    }

    /* "Included" / "Lump sum" rows carry no money of their own. */
    return 0;
}

function calculateRoofQuote(quote) {
    const lines = (quote.lines || []).map(line =>
        Object.assign(blankRoofQuoteLine(), line)
    );

    const sectionTotals = {};

    lines.forEach(line => {
        const code = quoteText(line.section) || "A";

        sectionTotals[code] = quoteRound(
            (sectionTotals[code] || 0) + roofQuoteLineAmount(line)
        );
    });

    const extras = (quote.costing && quote.costing.extras) || [];

    const extrasTotal = quoteRound(
        extras.reduce((sum, extra) => sum + quoteNumber(extra.amount), 0)
    );

    const exVat = quoteRound(
        lines.reduce((sum, line) => sum + roofQuoteLineAmount(line), 0) + extrasTotal
    );

    const vatRate = quoteNumber((quote.costing && quote.costing.vatRate) ?? quote.vatRate, 15);
    const vatAmount = quoteRound(exVat * (vatRate / 100));
    const depositPercent = quoteNumber(quote.depositPercent, 0);

    return {
        lines: lines,
        sectionTotals: sectionTotals,
        extras: extras,
        extrasTotal: extrasTotal,
        exVat: exVat,
        vatRate: vatRate,
        vatAmount: vatAmount,
        total: quoteRound(exVat + vatAmount),
        depositPercent: depositPercent,
        depositAmount: quoteRound(exVat * (depositPercent / 100))
    };
}

/*
   Money for the roof document.

   Matches the example quote, which writes thousands with a
   space ("R 518 652.00") rather than a comma. Grouping is done
   by hand so the printed sheet reads the same on every locale.
*/
/*
   Groups thousands with a space, matching the example quote
   ("R 518 652.00"). The separator is written as an escape so
   it survives any editor or toolchain that trims stray bytes.
*/
function groupThousands(digits) {
    return String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function roofMoney(value) {
    const amount = quoteRound(value);
    const negative = amount < 0;
    const fixed = Math.abs(amount).toFixed(2);
    const parts = fixed.split(".");
    const whole = groupThousands(parts[0]);

    return (negative ? "-" : "") + "R " + whole + "." + parts[1];
}

/* Quantities keep their own grouping, without a currency mark. */
function roofQty(value, decimals = 0) {
    const amount = quoteRound(quoteNumber(value), decimals);
    const fixed = Math.abs(amount).toFixed(decimals);
    const parts = fixed.split(".");
    const whole = groupThousands(parts[0]);

    return parts.length > 1 ? whole + "." + parts[1] : whole;
}

/* =========================================================
   ROOF QUOTATION PRINT SHEET
   =========================================================
*/

function roofQuoteBullets(items, className = "roof-bullets") {
    const clean = (items || []).filter(item => quoteText(item));

    if (!clean.length) {
        return "";
    }

    return `
        <ul class="${className}">
            ${clean.map(item => `<li>${quoteEscape(item)}</li>`).join("")}
        </ul>
    `;
}

function roofQuoteScopeBlocks(quote) {
    const blocks = (quote.scope || []).filter(
        block => quoteText(block.title) || (block.items || []).some(item => quoteText(item))
    );

    if (!blocks.length) {
        return "";
    }

    return blocks
        .map(
            block => `
                <section class="roof-section">
                    ${quoteText(block.title) ? `<h2 class="roof-section-title">${quoteEscape(block.title)}</h2>` : ""}
                    ${roofQuoteBullets(block.items)}
                </section>
            `
        )
        .join("");
}

function roofQuoteIncludeGroups(quote) {
    const groups = (quote.includes || []).filter(
        group => quoteText(group.title) || (group.items || []).some(item => quoteText(item))
    );

    if (!groups.length) {
        return "";
    }

    return `
        <section class="roof-section">
            <h2 class="roof-section-title">What This Cost Includes</h2>
            ${groups
            .map(
                group => `
                        <div class="roof-include-group">
                            ${quoteText(group.title) ? `<h3 class="roof-include-title">${quoteEscape(group.title)}</h3>` : ""}
                            <ul class="roof-check-list">
                                ${(group.items || [])
                        .filter(item => quoteText(item))
                        .map(item => `<li>${quoteEscape(item)}</li>`)
                        .join("")}
                            </ul>
                        </div>
                    `
            )
            .join("")}
        </section>
    `;
}

/*
   Renders the per-section pricing tables.

   A section with no rows is skipped entirely. Rows that are
   marked "Included" print the word instead of a rate and amount,
   which is how the example quote handles cleaning that is folded
   into the painting rate.
*/
function roofQuotePricingTables(quote, totals) {
    const lines = totals.lines;

    if (!lines.length) {
        return "";
    }

    const sections = ROOF_QUOTE_SECTIONS.map(section => {
        const rows = lines.filter(line => (quoteText(line.section) || "A") === section.code);

        if (!rows.length) {
            return "";
        }

        return `
            <section class="roof-section roof-price-section">
                <h2 class="roof-section-title">${quoteEscape(section.code)}. ${quoteEscape(section.title)}</h2>
                <table class="roof-price-table">
                    <thead>
                        <tr>
                            <th class="c-code">Item</th>
                            <th class="c-desc">Description</th>
                            <th class="c-qty">Qty</th>
                            <th class="c-unit">Unit</th>
                            <th class="c-rate">Rate (R)</th>
                            <th class="c-amount">Amount (R)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows
                .map(line => {
                    const included = quoteText(line.qualifier).toLowerCase() === "included";
                    const amount = roofQuoteLineAmount(line);

                    return `
                                    <tr>
                                        <td class="c-code">${quoteEscape(line.code || "\u2014")}</td>
                                        <td class="c-desc">${quoteEscape(line.description || "\u2014")}</td>
                                        <td class="c-qty">${line.qty === "" ? "\u2014" : roofQty(line.qty)}</td>
                                        <td class="c-unit">${quoteEscape(line.unit || "\u2014")}</td>
                                        <td class="c-rate">${included
                            ? quoteEscape(line.qualifier)
                            : line.rate === null || line.rate === undefined || line.rate === ""
                                ? quoteEscape(line.qualifier || "\u2014")
                                : roofMoney(line.rate)
                        }</td>
                                        <td class="c-amount">${included ? "\u2014" : roofMoney(amount)}</td>
                                    </tr>
                                `;
                })
                .join("")}
                    </tbody>
                </table>
            </section>
        `;
    }).join("");

    return sections;
}

function roofQuoteTimeline(quote) {
    const stages = (quote.timeline || []).filter(
        stage => quoteText(stage.title) || (stage.activities || []).some(item => quoteText(item))
    );

    if (!stages.length) {
        return "";
    }

    return `
        <section class="roof-section roof-timeline">
            <h2 class="roof-section-title">Project Timeline</h2>
            <p class="roof-note">The timeline assumes normal weather conditions and standard access.</p>
            ${stages
            .map(
                (stage, index) => `
                        <div class="roof-timeline-stage">
                            <h3 class="roof-timeline-title">
                                ${index + 1}) ${quoteEscape(stage.title)}
                                ${quoteText(stage.duration) ? ` <span class="roof-timeline-duration">&mdash; ${quoteEscape(stage.duration)}</span>` : ""}
                            </h3>
                            ${(stage.activities || []).some(item => quoteText(item))
                        ? `<span class="roof-timeline-label">Activities:</span>${roofQuoteBullets(stage.activities)}`
                        : ""}
                        </div>
                    `
            )
            .join("")}
        </section>
    `;
}

/*
   Quantity cell text, e.g. "3 090 m\u00b2" or "1 Item".
   Kept out of the template so the nested quoting stays
   readable.
*/
function roofQuoteQuantityLabel(line) {
    if (line.qty === "") {
        return "\u2014";
    }

    const unit = quoteText(line.unit);

    return quoteEscape(unit ? [roofQty(line.qty), unit].join(" ") : roofQty(line.qty));
}

/*
   Rate cell text for the costing summary, e.g. "R 107.80/m\u00b2"
   or "Included" when the work is folded into another rate.
*/
function roofQuoteRateLabel(line) {
    const hasRate = !(line.rate === null || line.rate === undefined || line.rate === "");

    if (!hasRate) {
        return quoteEscape(line.qualifier || "\u2014");
    }

    const unit = quoteText(line.unit);

    return quoteEscape(unit ? roofMoney(line.rate) + "/" + unit : roofMoney(line.rate));
}

/*
   Amount cell text. "Included" rows contribute no money, so
   printing "R 0.00" would read as a free line item. They show
   the qualifier instead.
*/
function roofQuoteAmountLabel(line) {
    if (quoteText(line.qualifier) && roofQuoteLineAmount(line) === 0) {
        return quoteEscape(line.qualifier);
    }

    return roofMoney(roofQuoteLineAmount(line));
}

function roofQuoteCostingSummary(totals) {
    const rows = totals.lines
        .filter(line => roofQuoteLineAmount(line) > 0 || quoteText(line.description))
        .map(
            line => `
                <tr>
                    <td>${quoteEscape(line.description || "\u2014")}</td>
                    <td class="c-qty">${roofQuoteQuantityLabel(line)}</td>
                    <td class="c-rate">${roofQuoteRateLabel(line)}</td>
                    <td class="c-amount">${roofQuoteAmountLabel(line)}</td>
                </tr>
            `
        )
        .join("");

    const extras = totals.extras
        .filter(extra => quoteText(extra.label) || quoteNumber(extra.amount))
        .map(
            extra => `
                <tr>
                    <td>${quoteEscape(extra.label || "\u2014")}</td>
                    <td class="c-qty">&mdash;</td>
                    <td class="c-rate">&mdash;</td>
                    <td class="c-amount">${roofMoney(quoteNumber(extra.amount))}</td>
                </tr>
            `
        )
        .join("");

    return `
        <section class="roof-section roof-costing">
            <h2 class="roof-section-title">Costing Summary (Excl. VAT)</h2>
            <table class="roof-costing-table">
                <thead>
                    <tr>
                        <th class="c-desc">Component</th>
                        <th class="c-qty">Quantity</th>
                        <th class="c-rate">Rate</th>
                        <th class="c-amount">Total (R)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    ${extras}
                    <tr class="roof-row-strong">
                        <td>TOTAL PROJECT COST</td>
                        <td class="c-qty">&mdash;</td>
                        <td class="c-rate">&mdash;</td>
                        <td class="c-amount">${roofMoney(totals.exVat)}</td>
                    </tr>
                    <tr>
                        <td>VAT @ ${quoteNumber(totals.vatRate)}%</td>
                        <td class="c-qty">&mdash;</td>
                        <td class="c-rate">&mdash;</td>
                        <td class="c-amount">${roofMoney(totals.vatAmount)}</td>
                    </tr>
                    <tr class="roof-row-strong">
                        <td>TOTAL INCL. VAT</td>
                        <td class="c-qty">&mdash;</td>
                        <td class="c-rate">&mdash;</td>
                        <td class="c-amount">${roofMoney(totals.total)}</td>
                    </tr>
                    ${totals.depositPercent > 0
            ? `<tr>
                                <td>Deposit required (${quoteNumber(totals.depositPercent)}%)</td>
                                <td class="c-qty">&mdash;</td>
                                <td class="c-rate">&mdash;</td>
                                <td class="c-amount">${roofMoney(totals.depositAmount)}</td>
                            </tr>`
            : ""
        }
                </tbody>
            </table>
        </section>
        `;
}

/*
   The quote date, written day-first ("16-02-2026") to match
   the example quotation. A saved quote keeps its own date; a
   fresh one shows today.
*/
function roofQuoteDateLabel(quote, now) {
    const stored = quoteText(quote.quoteDate);

    if (stored) {
        const parts = stored.split("-");

        return parts.length === 3 ? [parts[2], parts[1], parts[0]].join("-") : stored;
    }

    return [now.getDate(), now.getMonth() + 1, now.getFullYear()]
        .map(value => String(value).padStart(2, "0"))
        .join("-");
}

function roofQuoteCover(quote, now) {
    const date = roofQuoteDateLabel(quote, now);

    return `
        <section class="roof-cover roof-break-before">
            <div class="roof-cover-title">
                <h1>QUOTATION</h1>
                <div class="roof-cover-date">
                    <span>Date:</span>
                    <strong>${quoteEscape(date)}</strong>
                </div>
            </div>

            <div class="roof-cover-grid">
                <div class="roof-cover-block">
                    <h2 class="roof-cover-label">CLIENT</h2>
                    <table class="roof-cover-table">
                        <tr>
                            <th>To:</th>
                            <td>${quoteEscape(quote.customerName || "\u2014")}</td>
                        </tr>
                        <tr>
                            <th>Attention:</th>
                            <td>${quoteEscape(quote.attention || "\u2014")}</td>
                        </tr>
                        <tr>
                            <th>Your Ref:</th>
                            <td>${quoteEscape(quote.customerRef || "\u2014")}</td>
                        </tr>
                        <tr>
                            <th>Contact No:</th>
                            <td>${quoteEscape(quote.customerPhone || "\u2014")}</td>
                        </tr>
                        <tr>
                            <th>Email:</th>
                            <td>${quoteEscape(quote.customerEmail || "\u2014")}</td>
                        </tr>
                    </table>
                </div>

                <div class="roof-cover-block">
                    <h2 class="roof-cover-label">OFFICE</h2>
                    <table class="roof-cover-table">
                        <tr>
                            <th>Quote Ref:</th>
                            <td>${quoteEscape(quote.quoteNumber || "DRAFT")}</td>
                        </tr>
                        <tr>
                            <th>Prepared by:</th>
                            <td>${quoteEscape(quote.preparedBy || "\u2014")}</td>
                        </tr>
                        <tr>
                            <th>Project:</th>
                            <td>${quoteEscape(quote.projectName || "\u2014")}</td>
                        </tr>
                        <tr>
                            <th>Site:</th>
                            <td>${quoteEscape(quote.siteAddress || "\u2014")}</td>
                        </tr>
                        <tr>
                            <th>Valid Until:</th>
                            <td>${quoteEscape(quote.validUntil || "\u2014")}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <div class="roof-cover-office">
                <p><strong>AGA Architectural Glass &amp; Aluminium</strong></p>
                <p>Unit 7, Central Lake Factory Park, 5 Louis Friedman Street, Factoria, Krugersdorp</p>
                <p>010 597 6616 &middot; info@agasouthafrica.co.za &middot; jan@agasouthafrica.co.za</p>
                <p>Reg No: 2020/852932/07</p>
            </div>
        </section>
        `;
}

function buildRoofQuotePrintSheet(quote) {
    const totals = calculateRoofQuote(quote);
    const now = new Date();

    const preliminaries = roofQuoteBullets(quote.preliminaries, "roof-bullets roof-preliminaries");
    const terms = quoteText(quote.costing && quote.costing.terms)
        ? `<section class="roof-section">
                <h2 class="roof-section-title">Terms &amp; Conditions</h2>
                <ul class="roof-bullets roof-terms">
                    ${quoteText(quote.costing.terms)
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length)
            .map(line => `<li>${quoteEscape(line.replace(/^[\u2022\-\*]\s*/, ""))}</li>`)
            .join("")}
                </ul>
            </section > `
        : "";

    const inclusions = quoteText(quote.costing && quote.costing.inclusionNotes)
        ? `<section class="roof-section">
                <h2 class="roof-section-title">Notes &amp; Inclusions</h2>
                <ul class="roof-bullets">
                    ${quoteText(quote.costing.inclusionNotes)
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length)
            .map(line => `<li>${quoteEscape(line.replace(/^[\u2022\-\*]\s*/, ""))}</li>`)
            .join("")}
                </ul>
            </section>`
        : "";

    return `
        <header class="print-letterhead roof-letterhead">
            <img src="FullLetterHead.png" alt="AGA Architectural Glass &amp; Aluminium"
                class="print-letterhead-image">
        </header>

        <div class="print-rule-heavy"></div>

        <section class="roof-titleblock">
            <div class="roof-titleblock-main">
                <h1>${quoteEscape(quote.projectName || "Roof Waterproofing, Painting &amp; Repairs")}</h1>
                <p class="roof-titleblock-sub">Quotation</p>
            </div>
            <div class="roof-titleblock-id">
                <span class="roof-id-label">Quote Ref</span>
                <strong>${quoteEscape(quote.quoteNumber || "DRAFT")}</strong>
                <span class="roof-status-chip">Valid until ${quoteEscape(quote.validUntil || "\u2014")}</span>
            </div>
        </section>

        <div class="print-rule-light"></div>

        <section class="roof-section">
            <h2 class="roof-section-title">Quotation Detail</h2>
            <table class="print-detail-grid">
                <tr>
                    <th>Client</th>
                    <td>${quoteEscape(quote.customerName || "\u2014")}</td>
                    <th>Quote Ref</th>
                    <td>${quoteEscape(quote.quoteNumber || "DRAFT")}</td>
                </tr>
                <tr>
                    <th>Project Address</th>
                    <td>${quoteEscape(quote.siteAddress || "\u2014")}</td>
                    <th>Date</th>
                    <td>${quoteEscape(roofQuoteDateLabel(quote, now))}</td>
                </tr>
                <tr>
                    <th>Prepared By</th>
                    <td>${quoteEscape(quote.preparedBy || "\u2014")}</td>
                    <th>Valid Until</th>
                    <td>${quoteEscape(quote.validUntil || "\u2014")}</td>
                </tr>
            </table>
        </section>

        ${roofQuoteScopeBlocks(quote)}
        ${preliminaries ? `<section class="roof-section"><h2 class="roof-section-title">Preliminaries &amp; Notes</h2>${preliminaries}</section>` : ""}
        ${roofQuoteIncludeGroups(quote)}
        ${roofQuotePricingTables(quote, totals)}
        ${roofQuoteTimeline(quote)}
        ${roofQuoteCostingSummary(totals)}
        ${inclusions}
        ${terms}

        <section class="roof-section roof-acceptance roof-break-before">
            <h2 class="roof-section-title">Acceptance of Quotation</h2>
            <p class="roof-acceptance-text">
                I/We hereby accept the above quotation and agree to the terms and conditions stated.
                I/We authorize the contractor to proceed with the work as specified.
            </p>
            <table class="roof-signatures">
                <tbody>
                    <tr>
                        <td class="roof-signature"><span class="roof-signature-line"></span><strong>Client Name</strong></td>
                        <td class="roof-signature"><span class="roof-signature-line"></span><strong>Company (if applicable)</strong></td>
                    </tr>
                    <tr>
                        <td class="roof-signature"><span class="roof-signature-line"></span><strong>Signature</strong></td>
                        <td class="roof-signature"><span class="roof-signature-line"></span><strong>Date</strong></td>
                    </tr>
                    <tr>
                        <td class="roof-signature"><span class="roof-signature-line"></span><strong>Contact Number</strong></td>
                        <td class="roof-signature"></td>
                    </tr>
                </tbody>
            </table>
        </section>

        <footer class="print-footer">
            <div class="print-footer-details">
                <strong>AGA Architectural Glass &amp; Aluminium</strong>
                <span>Unit 7 Central Lake Factory Park, 5 Louis Friedman Street,</span>
                <span>Factoria, Krugersdorp &middot; Reg No: 2020/852932/07</span>
                <span>010 597 6616 &middot; info@agasouthafrica.co.za</span>
                <span class="print-footer-generated">Printed ${quoteStamp(now)}</span>
            </div>
        </footer>
    `;
}
