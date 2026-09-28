// Tests for the AGA trade switcher (trades.js + the trade folders).
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/trades.test.js
//
// AGA is one application covering three trades. Glass & Aluminium is the
// app itself; Plumbing and Performance Coatings are complete quoting apps
// in trades/plumbing and trades/coatings, shown in an embedded frame.
//
// These tests are static and offline: they read the checked-in files and
// assert the wiring between them, so a rename or a missing folder fails
// here rather than in the browser. The behaviour itself (does the frame
// actually render) is verified in the browser via tools/qa-trades.mjs.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TRADES_JS = path.join(ROOT, 'trades.js');
const INDEX_HTML = path.join(ROOT, 'index.html');
const STYLES_CSS = path.join(ROOT, 'styles.css');
const SW_JS = path.join(ROOT, 'sw.js');

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------------------
// The trade folders
// ---------------------------------------------------------------------------

const TRADE_APPS = {
    plumbing: {
        description: 'APS plumbing quotation system',
        logo: 'APSlogo.png',
        logoType: 'image/png'
    },
    coatings: {
        description: 'APC Architectural Performance Coatings quotation system',
        logo: 'APClogo.jpg',
        logoType: 'image/jpeg'
    },
};

test('each trade is branded with its own company initials', () => {
    /*
       APS is Architectural Plumbing Services; APC is Architectural
       Performance Coatings. The coatings app was built from the plumbing
       one, so it carried "APS" in its title, print letterhead, manifest
       and saved company settings long after APC was settled - the brand
       the customer reads on a printed quote was simply the wrong company.

       The regex is deliberately anchored to the full phrase: "handyman"
       contains the letters "aps", so a bare /APS/ search would report a
       match on innocent words.
    */
    const plumbingHtml = read(path.join(ROOT, 'trades', 'plumbing', 'index.html'));
    const coatingsHtml = read(path.join(ROOT, 'trades', 'coatings', 'index.html'));
    const coatingsManifest = read(
        path.join(ROOT, 'trades', 'coatings', 'manifest.json')
    );
    const coatingsApp = read(path.join(ROOT, 'trades', 'coatings', 'app.js'));

    assert.match(
        plumbingHtml,
        /APS Architectural Plumbing Services/,
        'the plumbing app lost its APS branding'
    );

    for (const [label, source] of [
        ['index.html', coatingsHtml],
        ['manifest.json', coatingsManifest]
    ]) {
        assert.doesNotMatch(
            source,
            /APS Architectural Performance/,
            `the coatings ${label} still brands APC as APS`
        );
    }

    /*
       app.js is checked separately. It legitimately contains the OLD
       name once, inside the migration that corrects a company name
       already saved on a device - deleting that string would delete the
       fix. What must not appear is the old name as the DEFAULT a new
       quote starts from.
    */
    assert.doesNotMatch(
        coatingsApp,
        /settings\.name\s*\|\|=\s*'APS Architectural Performance/,
        'APC quotes still default to the APS company name'
    );
    assert.match(
        coatingsApp,
        /settings\.name\s*\|\|=\s*'APC Architectural Performance Coatings'/,
        'APC has no default company name'
    );

    assert.match(
        coatingsHtml,
        /<title>APC Architectural Performance Coatings/,
        'the coatings page title is not branded APC'
    );
});

test('each embedded trade has its own folder with an index.html', () => {
    for (const trade of Object.keys(TRADE_APPS)) {
        const indexPath = path.join(ROOT, 'trades', trade, 'index.html');
        assert.ok(
            fs.existsSync(indexPath),
            `trades/${trade}/index.html is missing`
        );
    }
});

test('each embedded trade ships its own app.js and styles.css', () => {
    for (const trade of Object.keys(TRADE_APPS)) {
        for (const asset of ['app.js', 'styles.css']) {
            const assetPath = path.join(ROOT, 'trades', trade, asset);
            assert.ok(
                fs.existsSync(assetPath),
                `trades/${trade}/${asset} is missing`
            );
        }
    }
});

test('each trade carries its own brand mark, named and typed correctly', () => {
    /*
       Each trade has its OWN logo: APS (blue, plumbing) and APC (navy,
       construction). They used to share one file, which meant the
       plumbing app displayed the coatings brand.

       The magic bytes are checked against the file's extension. A PNG
       served as .jpg is cached as image/jpeg by the service worker and
       renders as a broken image - which is exactly what happened when
       the APS PNG was saved under the APC .jpg filename.
    */
    for (const trade of Object.keys(TRADE_APPS)) {
        const config = TRADE_APPS[trade];
        const logoPath = path.join(ROOT, 'trades', trade, config.logo);

        assert.ok(
            fs.existsSync(logoPath),
            `trades/${trade}/${config.logo} is missing`
        );

        const bytes = fs.readFileSync(logoPath);

        if (config.logoType === 'image/jpeg') {
            assert.equal(bytes[0], 0xff, `${trade} logo is not a JPEG`);
            assert.equal(bytes[1], 0xd8, `${trade} logo is not a JPEG`);
            assert.equal(bytes[2], 0xff, `${trade} logo is not a JPEG`);
        } else {
            assert.equal(bytes[0], 0x89, `${trade} logo is not a PNG`);
            assert.equal(bytes[1], 0x50, `${trade} logo is not a PNG`);
            assert.equal(bytes[2], 0x4e, `${trade} logo is not a PNG`);
        }
    }
});

// ---------------------------------------------------------------------------
// trades.js
// ---------------------------------------------------------------------------

test('trades.js exists and is served from the app root', () => {
    assert.ok(fs.existsSync(TRADES_JS), 'trades.js is missing');
    const html = read(INDEX_HTML);
    assert.match(html, /<script src="trades\.js"><\/script>/);
});

test('trades.js is loaded after the scripts it depends on', () => {
    const html = read(INDEX_HTML);
    const appIndex = html.indexOf('<script src="app.js"></script>');
    const tradesIndex = html.indexOf('<script src="trades.js"></script>');
    assert.ok(appIndex > -1, 'app.js script tag not found');
    assert.ok(tradesIndex > -1, 'trades.js script tag not found');
    assert.ok(
        tradesIndex > appIndex,
        'trades.js must load after app.js'
    );
});

test('trades.js points each trade at its own folder', () => {
    const source = read(TRADES_JS);
    for (const trade of Object.keys(TRADE_APPS)) {
        assert.match(
            source,
            new RegExp(`trades/${trade}/index\\.html`),
            `trades.js does not reference trades/${trade}/index.html`
        );
    }
});

test('trades.js hides the production nav and views by class, not by id', () => {
    const source = read(TRADES_JS);

    /*
       The markup is <nav class="main-navigation"> and
       <main class="app-container"> with no ids. Looking these up by id
       silently returns null and leaves the production nav on screen
       behind the embedded app, so the classes are asserted directly.
    */
    assert.match(source, /"main-navigation"/);
    assert.match(source, /"app-container"/);
    assert.match(source, /getElementsByClassName/);

    const html = read(INDEX_HTML);
    assert.match(html, /class="main-navigation"/);
    assert.match(html, /class="app-container"/);
});

test('trades.js exposes the switcher for other code and tests', () => {
    const source = read(TRADES_JS);
    assert.match(source, /window\.setTrade\s*=/);
});

// ---------------------------------------------------------------------------
// index.html: the switcher and the panel
// ---------------------------------------------------------------------------

test('the header offers a button for each trade', () => {
    const html = read(INDEX_HTML);
    for (const trade of ['glass', 'plumbing', 'coatings']) {
        assert.match(
            html,
            new RegExp(`data-trade="${trade}"`),
            `no trade button for "${trade}"`
        );
    }
});

test('Glass & Aluminium is the trade selected on first load', () => {
    const html = read(INDEX_HTML);
    const match = html.match(
        /class="trade-button active"\s*\n?\s*data-trade="(\w+)"/
    );
    assert.ok(match, 'no active trade button found');
    assert.equal(match[1], 'glass');
});

test('the embedded trade panel exists and starts hidden', () => {
    const html = read(INDEX_HTML);
    assert.match(html, /id="trade-view"/);
    assert.match(html, /id="tradeFrameHolder"/);

    const tradeView = html.match(/<section id="trade-view"[^>]*>/);
    assert.ok(tradeView, 'trade-view section not found');
    assert.match(tradeView[0], /\bhidden\b/);
});

// ---------------------------------------------------------------------------
// styles.css
// ---------------------------------------------------------------------------

test('a hidden trade frame is actually hidden', () => {
    const css = read(STYLES_CSS);

    /*
       .trade-frame sets display:block, which overrides the browser's
       built-in [hidden] rule. Without an explicit [hidden] rule the
       previous trade's app stays painted on top of the newly selected
       one - the tab changes but the screen does not.
    */
    assert.match(css, /\.trade-frame\[hidden\]\s*\{[^}]*display:\s*none/);
});

test('the trade panel fills the space below the header', () => {
    const css = read(STYLES_CSS);
    assert.match(css, /\.trade-view\s*\{/);
    assert.match(css, /\.trade-frame\s*\{/);
});

// ---------------------------------------------------------------------------
// APC works on the same basis as APS
// ---------------------------------------------------------------------------

test('the coatings app carries the same planning layer as the plumbing app', () => {
    const plumbing = read(path.join(ROOT, 'trades', 'plumbing', 'app.js'));
    const coatings = read(path.join(ROOT, 'trades', 'coatings', 'app.js'));

    /*
       APC is a construction company working on the same basis as APS:
       quote a job, then plan it. These are the functions that make up
       that planning layer. They were missing from the coatings app - it
       had the quoting half only - so a rename or a bad merge that drops
       one of them is caught here rather than when a planner opens the
       page and it does nothing.
    */
    const shared = [
        'addWorkingMinutes',
        'workingMinutesBetween',
        'workingDaysFor',
        'taskDuration',
        'autoScheduleItems',
        'sequenceItems',
        'renderProjects',
        'setPlanningView',
        'saveProject',
        'newProject',
        'deleteProject',
        'autoPlanProject',
        'collectPlanningList',
        'persistProjects',
        'switchPlanningProject',
        'renderTimeline',
        'addQuoteItemsToProject'
    ];

    for (const name of shared) {
        assert.match(
            plumbing,
            new RegExp(`function ${name}\\b`),
            `the plumbing app has no ${name}`
        );
        assert.match(
            coatings,
            new RegExp(`function ${name}\\b`),
            `the coatings app is missing the planning function ${name}`
        );
    }
});

test('the coatings app has its own construction task times, not the plumbing ones', () => {
    const coatings = read(path.join(ROOT, 'trades', 'coatings', 'app.js'));

    /*
       The duration maths is shared, but the time PER TASK is not: a
       plumber's day is not a builder's. If the plumbing table is ever
       copied across wholesale, a construction quote would schedule
       "Unblock drain" instead of "Cast concrete slab".
    */
    assert.match(coatings, /const DEFAULT_TASK_MINUTES/);
    assert.match(
        coatings,
        /'Cast concrete slab'/,
        'the coatings task table has no construction tasks'
    );
    assert.doesNotMatch(
        coatings,
        /'Unblock drain or sewer line'/,
        'the plumbing task table was copied into the construction app'
    );
});

test('a construction day is 8 hours', () => {
    const coatings = read(path.join(ROOT, 'trades', 'coatings', 'app.js'));

    /*
       The plumbing app assumes 7 hours on site. Construction works 8, so
       every duration and finish date in APC depends on this number.
    */
    assert.match(coatings, /const WORKING_HOURS_PER_DAY = 8;/);
});

test('the coatings app wires its planning and cloud controls', () => {
    const coatings = read(path.join(ROOT, 'trades', 'coatings', 'app.js'));
    const html = read(path.join(ROOT, 'trades', 'coatings', 'index.html'));

    /*
       Both halves have to be present. Markup with no wiring is a screen
       of dead buttons; wiring with no markup throws on load, because the
       handler attaches to an element that is not there.
    */
    for (const id of ['new-project', 'save-project', 'auto-plan-project', 'add-planning-task']) {
        assert.match(html, new RegExp(`id="${id}"`), `no #${id} in the markup`);
        /*
           The handler reads $(\'new-project\') - the app's own id helper.
           The dollar sign is escaped: in a regex an unescaped $ is
           end-of-string, so it would never match the literal text.
        */
        assert.match(
            coatings,
            new RegExp(`\\$\\('${id}'\\)`),
            `#${id} is never wired up`
        );
    }

    for (const view of ['scenarios', 'planning']) {
        assert.match(
            html,
            new RegExp(`data-view="${view}"`),
            `the ${view} view has no nav button`
        );
        assert.match(
            html,
            new RegExp(`id="${view}-view"`),
            `the ${view} view section is missing`
        );
    }
});

// ---------------------------------------------------------------------------
// Trade data must not cross over
// ---------------------------------------------------------------------------

test('the coatings app does not migrate or read the plumbing storage keys', () => {
    const source = read(path.join(ROOT, 'trades', 'coatings', 'app.js'));

    /*
       The plumbing app's live data is stored under "pipewise-" keys.
       The coatings app once migrated those keys to "apc-" when the two
       were separate apps on separate origins. Now that both trades are
       served from one origin, that copy would pull the plumber's saved
       quotes and company settings into the coatings trade the first
       time it was opened.

       Only the explanatory comment may mention pipewise-; there must be
       no code referencing it.
    */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(
        code,
        /pipewise/i,
        'coatings app code still references the plumbing (pipewise) keys'
    );
    assert.doesNotMatch(
        code,
        /migrateLegacyStorage/,
        'the cross-trade storage migration is back'
    );
});

test('each trade owns a distinct storage prefix', () => {
    const plumbing = read(path.join(ROOT, 'trades', 'plumbing', 'app.js'));
    const coatings = read(path.join(ROOT, 'trades', 'coatings', 'app.js'));

    assert.match(plumbing, /'pipewise-quotes'/, 'plumbing key not found');
    assert.match(coatings, /STORAGE_PREFIX = 'apc-'/, 'coatings key not found');

    /*
       The two prefixes must not collide, or one trade silently
       overwrites the other's saved quotes and settings.
    */
    assert.notEqual('pipewise-', 'apc-');
});

// ---------------------------------------------------------------------------
// service worker
// ---------------------------------------------------------------------------

test('trades.js is part of the cached app shell', () => {
    const sw = read(SW_JS);
    assert.match(
        sw,
        /"\.\/trades\.js"/,
        'trades.js is not in the service worker app shell'
    );
});