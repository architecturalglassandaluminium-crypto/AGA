/* =========================================================
   TRADE SWITCHER
   ---------------------------------------------------------
   AGA covers three trades:

     glass      Architectural Glass & Aluminium - this app itself:
                production tracking, measurement, scanning and the
                window quote builder.
     plumbing   APS - Architectural Plumbing Services: the plumbing
                quotation and pricing system.
     coatings   APC - Architectural Performance Coatings: the
                construction company's quotation system (coatings,
                handyman, building, electrical, plastering and site
                works).

   Glass & Aluminium is the page you are on. The other two are
   complete applications in their own right, kept in trades/ and
   shown here in an iframe.

   WHY AN IFRAME
     The two quoting apps were built and tested standalone. They
     bring their own stylesheet, their own storage keys and their
     own hundreds of element ids, several of which collide with
     ids used by this page (for example both apps have a view
     called quotes-view). Loading them inside the same document
     would mean renaming every id, rewriting their CSS to stop it
     reaching the production screens, and re-testing a system that
     currently works. An iframe gives each app its own document,
     so nothing can leak either way, and the trade switch is just
     a matter of showing one or the other.

   The frame is created the first time a trade is opened and then
   reused, so switching back and forth does not reload the app or
   lose work in progress.
   ========================================================= */

"use strict";

(function () {

    /*
       Where each embedded trade lives. Both are served from the
       same origin as this page, so the frame needs no special
       headers and works offline once cached.

       The key is the data-trade value on the header button; the
       title is what a screen reader announces for the frame.
    */
    var TRADE_APPS = {
        plumbing: {
            title: "APS Architectural Plumbing Services",
            src: "trades/plumbing/index.html"
        },
        coatings: {
            title: "APC Architectural Performance Coatings",
            src: "trades/coatings/index.html"
        }
    };

    /*
       Glass & Aluminium's own identity.

       This is the trade the page IS, so it needs no entry above -
       TRADE_APPS only describes trades that live in an iframe. It is
       listed here anyway because the header must be able to go BACK
       to it, and because holding all three sets side by side is what
       lets restoreTrade() paint the right one on load.

       The logo files are opaque rather than transparent: AGA's sits
       on a grey field, the other two on white. That is why the header
       shows them on a white plate (styles.css .company-logo) instead
       of straight onto the dark blue.
    */
    var TRADE_IDENTITY = {
        glass: {
            logo: "logo.png",
            name: "Architectural Glass &amp; Aluminium",
            tagline: "Production &amp; Measurement System",
            summary: "Track every window from measurement to installation"
        },
        plumbing: {
            logo: "trades/plumbing/APSlogo.png",
            name: "Architectural Plumbing Services",
            tagline: "Plumbing Quotation &amp; Pricing System",
            summary: "Quote a plumbing job, then plan it from call-out to completion"
        },
        coatings: {
            logo: "trades/coatings/APClogo.jpg",
            name: "Architectural Performance Coatings",
            tagline: "Construction Quotation System",
            summary: "Quote coatings, building, electrical and site work, then plan it"
        }
    };

    /*
       The production parts of the page that are hidden while a
       quoting trade is open. The header stays, because it carries
       the trade switcher the user needs to get back.

       Both are matched by class, not id: the markup has
       <nav class="main-navigation"> and <main class="app-container">
       with no ids on either.
    */
    var GLASS_REGIONS = [
        "main-navigation",
        "app-container"
    ];

    var currentTrade = "glass";

    /* Element id -> the iframe created for it, so a trade opened
       once is only loaded once. */
    var frames = {};

    function byId(id) {
        return document.getElementById(id);
    }

    function byClass(name) {
        return Array.prototype.slice.call(
            document.getElementsByClassName(name)
        );
    }

    /* Every element carrying one of the production region classes. */
    function glassRegions() {
        var found = [];
        GLASS_REGIONS.forEach(function (name) {
            found = found.concat(byClass(name));
        });
        return found;
    }

    /* =========================================================
       GLASS & ALUMINIUM
       ========================================================= */

    function showGlass() {

        /*
           Reveal the production navigation and the views, and put
           the embedded frame away.
        */
        glassRegions().forEach(function (el) {
            el.hidden = false;
            el.style.display = "";
        });

        var tradeView = byId("trade-view");
        if (tradeView) {
            tradeView.hidden = true;
        }
        if (byId("portfolio-view")) byId("portfolio-view").hidden = true;

        /*
           Hide every embedded frame too. The parent panel is hidden
           as well, but leaving a frame marked visible means the next
           visit to that trade shows it before its own app has had a
           chance to settle.
        */
        Object.keys(frames).forEach(function (key) {
            frames[key].hidden = true;
        });

        document.body.classList.remove("trade-open");
    }

    /* =========================================================
       EMBEDDED TRADES
       ========================================================= */

    function buildFrame(trade) {

        var config = TRADE_APPS[trade];
        var holder = byId("tradeFrameHolder");

        if (!config || !holder) {
            return null;
        }

        var frame = document.createElement("iframe");
        frame.className = "trade-frame";
        frame.title = config.title;
        frame.src = config.src;

        /*
           allow-same-origin lets the frame read its own
           localStorage, which is where these apps keep saved
           quotes. allow-scripts is required for the app to run at
           all. No other permissions are granted.
        */
        frame.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
        );

        holder.appendChild(frame);
        frames[trade] = frame;

        return frame;
    }

    function showTrade(trade) {

        var config = TRADE_APPS[trade];
        var tradeView = byId("trade-view");

        if (!config || !tradeView) {
            return;
        }

        /*
           Hide the production navigation and views. The embedded
           app is a full quoting system of its own; leaving the
           production nav visible would offer controls that act on
           a screen the user cannot see.
        */
        glassRegions().forEach(function (el) {
            el.hidden = true;
            el.style.display = "none";
        });

        /*
           Create the frame on first use, then reuse it.
        */
        if (!frames[trade]) {
            buildFrame(trade);
        }

        Object.keys(frames).forEach(function (key) {
            frames[key].hidden = key !== trade;
        });

        tradeView.hidden = false;
        if (byId("portfolio-view")) byId("portfolio-view").hidden = true;
        document.body.classList.add("trade-open");
    }

    /* =========================================================
   HEADER IDENTITY
   ---------------------------------------------------------
   The logo, name and tagline in the header belong to the SELECTED
   trade, so they are repainted on every switch. Without this the
   header kept saying "Architectural Glass & Aluminium" above a
   plumbing quote.

   The strings carry their own &amp; because they are written with
   innerHTML: the company names all contain an ampersand, and using
   textContent here would print a bare "&" on the page.
   ========================================================= */

    function applyTradeIdentity(trade) {
        var identity = TRADE_IDENTITY[trade];
        if (!identity) {
            return;
        }

        var logo = byId("company-logo");
        if (logo) {
            /* Only swap the file when it actually changes: setting
               src to its current value re-fetches the image, which
               makes the logo flicker on every switch. */
            if (logo.getAttribute("src") !== identity.logo) {
                logo.setAttribute("src", identity.logo);
            }
        }

        var fields = [
            ["company-name", identity.name],
            ["company-tagline", identity.tagline],
            ["company-summary", identity.summary]
        ];
        fields.forEach(function (pair) {
            var element = byId(pair[0]);
            if (element) {
                element.innerHTML = pair[1];
            }
        });
    }

    /* =========================================================
       SWITCHING
       ========================================================= */

    function setTrade(trade) {

        if (trade !== "glass" && trade !== "portfolio" && !TRADE_APPS[trade]) {
            trade = "glass";
        }

        currentTrade = trade;

        applyTradeIdentity(trade);

        if (byId("portfolioButton")) {
            byId("portfolioButton").classList.toggle("active", trade === "portfolio");
            byId("portfolioButton").setAttribute("aria-pressed", trade === "portfolio" ? "true" : "false");
        }

        /*
           Light up the button for the chosen trade.
        */
        byClass("trade-button").forEach(function (button) {
            if (!button.dataset.trade) return;
            var isActive = button.dataset.trade === trade;
            button.classList.toggle("active", isActive);
            button.setAttribute(
                "aria-selected",
                isActive ? "true" : "false"
            );
        });

        if (trade === "glass") {
            showGlass();
        } else if (trade === "portfolio") {
            glassRegions().forEach(function (el) {
                el.hidden = true;
                el.style.display = "none";
            });
            if (byId("trade-view")) byId("trade-view").hidden = true;
            Object.keys(frames).forEach(function (key) { frames[key].hidden = true; });
            if (byId("portfolio-view")) byId("portfolio-view").hidden = false;
            document.body.classList.remove("trade-open");
            if (typeof window.renderPortfolio === "function") window.renderPortfolio();
        } else {
            showTrade(trade);
        }

        /*
           Remember the choice so a reload returns to the same
           trade. Kept in sessionStorage rather than localStorage:
           this is where the user is now, not a saved setting, and
           a fresh visit should start on the production app.
        */
        try {
            sessionStorage.setItem("aga_trade", trade);
        } catch (error) {
            /* Private mode can refuse storage; the app still works. */
        }

        window.scrollTo({ top: 0, behavior: "auto" });
    }

    function restoreTrade() {

        var saved = null;

        try {
            saved = sessionStorage.getItem("aga_trade");
        } catch (error) {
            saved = null;
        }

        if (saved && (saved === "glass" || saved === "portfolio" || TRADE_APPS[saved])) {
            setTrade(saved);
        }
    }

    /* =========================================================
       WIRING
       ========================================================= */

    function init() {

        byClass("trade-button").forEach(function (button) {
            if (!button.dataset.trade) return;
            button.addEventListener("click", function () {
                setTrade(button.dataset.trade);
            });
        });
        if (byId("portfolioButton")) {
            byId("portfolioButton").addEventListener("click", function () { setTrade("portfolio"); });
        }

        restoreTrade();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    /*
       Exposed so other code (and tests) can drive the switcher.
    */
    window.setTrade = setTrade;
    window.currentTrade = function () {
        return currentTrade;
    };

})();