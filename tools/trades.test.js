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

/*
   Each of the three companies shows its OWN logo and its OWN name.

   The header used to carry the hard-coded letters "AGA" as text,
   which was wrong twice over: there was no logo at all, and the name
   stayed "Architectural Glass & Aluminium" even while a plumbing or
   coatings quote was on screen. All three now come from one identity
   table that setTrade() repaints on every switch.
*/
test('all three companies have a logo in the header identity table', () => {
    const source = read(TRADES_JS);
    const table = source.slice(
        source.indexOf('TRADE_IDENTITY'),
        source.indexOf('};', source.indexOf('TRADE_IDENTITY'))
    );

    for (const [trade, logo] of [
        ['glass', 'logo.png'],
        ['plumbing', 'trades/plumbing/APSlogo.png'],
        ['coatings', 'trades/coatings/APClogo.jpg']
    ]) {
        assert.match(
            table,
            new RegExp(`${trade}:\\s*\\{[\\s\\S]*?logo:\\s*"${logo.replace(/[/.]/g, '\\$&')}"`),
            `${trade} has no logo in TRADE_IDENTITY`
        );
    }

    /* The logos are real files, not placeholders. */
    for (const logo of [
        path.join(ROOT, 'logo.png'),
        path.join(ROOT, 'trades', 'plumbing', 'APSlogo.png'),
        path.join(ROOT, 'trades', 'coatings', 'APClogo.jpg')
    ]) {
        assert.ok(fs.existsSync(logo), `${logo} does not exist`);
    }
});

test('the header identity is repainted whenever the trade changes', () => {
    const source = read(TRADES_JS);

    /*
       Without this call in setTrade(), the table above is read once
       and never used: the header would keep showing whichever company
       was current when the page loaded.
    */
    const setTrade = source.slice(
        source.indexOf('function setTrade('),
        source.indexOf('\n    function', source.indexOf('function setTrade('))
    );
    assert.match(
        setTrade,
        /applyTradeIdentity\(\s*trade\s*\)/,
        'setTrade() never repaints the header identity'
    );
});

/*
   The floating switcher must not cover the quoting apps' own logos.

   It was pinned to the top-left, which is exactly where both quoting
   apps put their logo and menu in their header - so it sat over the
   company's mark on every screen of both apps. It now sits bottom-
   right, over blank space, and carries the selected company's logo.
*/
test('the floating switcher is out of the quoting apps logo corner', () => {
    const css = read(STYLES_CSS);

    const pill = css.match(/body\.trade-open \.app-header\s*\{([^}]*)\}/);
    assert.ok(pill, 'no body.trade-open .app-header rule');
    assert.match(pill[1], /position:\s*fixed/);

    /*
       Anchored bottom-right. Asserted by its anchor values rather
       than by "not top-left", because the point is that it is
       positively in a known-safe corner.
    */
    assert.match(pill[1], /bottom:\s*\d/);
    assert.match(pill[1], /right:\s*\d/);
    assert.match(pill[1], /top:\s*auto/);
    assert.doesNotMatch(
        pill[1],
        /(?:^|[;\s])top:\s*\d/,
        'the switcher is pinned to the top, over the apps own logo'
    );

    /* The logo rides along in the pill, so the company is always named. */
    assert.match(
        css,
        /body\.trade-open \.app-header \.company-info\s*\{[^}]*display:\s*flex/,
        'the company logo is hidden while a trade is open'
    );
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

test('the trade panel fills the WHOLE screen, not just below the header', () => {
    const css = read(STYLES_CSS);

    assert.match(css, /\.trade-view\s*\{/);

    /*
       The app is taken out of the flow and pinned to the window with
       inset:0. Sizing it as "the rest of a flex column" would depend
       on the header's real height, which is exactly the number this
       used to get wrong.
    */
    const view = css.match(/\.trade-view\s*\{([^}]*)\}/);
    assert.ok(view, '.trade-view has no rule');
    assert.match(view[1], /position:\s*fixed/);
    assert.match(view[1], /inset:\s*0/);

    /*
       With the app filling the window, the header can no longer be a
       full-width band on top of it - it becomes a small floating pill
       so the trade buttons stay reachable without costing the app any
       of the screen.
    */
    assert.match(css, /body\.trade-open \.app-header\s*\{[^}]*position:\s*fixed/);

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

/*
   The quick-start scenario box is gone from both quote forms.

   It was a way of BUILDING a quote on screen - pick a job type, get its
   services and materials dropped onto the form. Once priced, those lines
   are ordinary schedule lines and carry no trace of how they were
   entered, so the box had no place on the form and none on the printed
   document.

   The scenario LIBRARY is a different thing and stays: it is still a
   view, still maintained, and is how scenario templates are edited. Both
   halves of that have to be asserted, because removing the box and
   removing the library are opposite mistakes.
*/
for (const trade of ['plumbing', 'coatings']) {
    test(`the ${trade} quote form has no quick-start scenario box`, () => {
        const html = read(path.join(ROOT, 'trades', trade, 'index.html'));

        assert.doesNotMatch(
            html,
            /class="scenario-panel"/,
            'the scenario box is still on the quote form'
        );
        assert.doesNotMatch(
            html,
            /id="scenario-select"/,
            'the scenario picker is still on the quote form'
        );
        assert.doesNotMatch(
            html,
            /id="add-scenario"/,
            'the Add scenario button is still on the quote form'
        );

        /* The library survives: the nav button and the editor view. */
        assert.match(
            html,
            /id="scenarios-view"/,
            'the scenario library view was removed with the box'
        );
        assert.match(
            html,
            /id="scenario-editor-select"/,
            'the scenario editor was removed with the box'
        );
    });

    test(`the ${trade} app survives the missing scenario picker`, () => {
        const source = read(path.join(ROOT, 'trades', trade, 'app.js'));

        /*
           The picker is gone from the page, but the app code still
           refers to it. Unguarded, $(...) returns null and
           syncCustomScenarioOptions() throws on its first
           querySelectorAll - which runs at boot, so the whole app
           would fail to start. Both sync functions must therefore
           bail out on a missing select, and the Add scenario button
           must no longer be wired unconditionally.
        */
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

        for (const fn of ['syncMasterScenarioOptions', 'syncCustomScenarioOptions']) {
            const start = code.indexOf(`function ${fn}(`);
            assert.notEqual(start, -1, `${fn} is missing`);
            const body = code.slice(start, code.indexOf('\n}', start));
            assert.match(
                body,
                /if \(!select\) return/,
                `${fn} still assumes #scenario-select exists`
            );
        }

        /*
           The Add scenario button is gone from the page. Wiring it
           unconditionally means $('add-scenario') returns null at
           boot and the click binding throws, so the whole app fails
           to start. The binding may exist, but only behind a
           presence check.
        */
        const wiring = code.match(/.*\$\('add-scenario'\)\.addEventListener.*/);
        if (wiring) {
            assert.match(
                wiring[0],
                /^if \(\$\('add-scenario'\)\)/,
                'the Add scenario button is wired without checking the button exists'
            );
        }
    });
}

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
// The shared cloud
// ---------------------------------------------------------------------------

test('every quoting trade points at the same Supabase project as AGA', () => {
    const aga = read(path.join(ROOT, 'supabase-config.js'));
    const agaUrl = aga.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
    const agaKey = aga.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)?.[1];

    assert.ok(agaUrl, 'AGA has no Supabase URL');
    assert.ok(agaKey, 'AGA has no anon key');

    /*
       One cloud for all three companies, as agreed: the same project,
       not one each. If a trade ever points somewhere else, its quotes
       would be invisible to the group and nobody would notice until
       someone went looking for a job that was quoted.

       The trades no longer each name the project. One site, one cloud:
       aga-cloud.js reads AGA's config and passes the values on, so the
       project appears in supabase-config.js and NOWHERE else. These
       assertions therefore check the wiring - that each trade's page
       loads the shared config - and that the shared config really does
       derive its endpoint from AGA's URL, rather than comparing three
       copies of the same string.
    */
    for (const trade of ['plumbing', 'coatings']) {
        const html = read(path.join(ROOT, 'trades', trade, 'index.html'));

        assert.match(html, /src="\.\.\/\.\.\/supabase-config\.js"/,
            `trades/${trade} does not load AGA's supabase-config.js`);
        assert.match(html, /src="\.\.\/\.\.\/aga-cloud\.js"/,
            `trades/${trade} does not load the shared cloud config`);
    }

    const shared = read(path.join(ROOT, 'aga-cloud.js'));
    assert.match(shared, /SUPABASE_URL/, 'the shared config ignores AGA\'s URL');
    assert.match(shared, /SUPABASE_ANON_KEY/, 'the shared config ignores AGA\'s key');
    assert.match(shared, /\/functions\/v1\/cloud/,
        'the shared config does not build the cloud function endpoint');
});

test('the config files hold only the public key', () => {
    const configs = [
        read(path.join(ROOT, 'trades', 'plumbing', 'config.js')),
        read(path.join(ROOT, 'trades', 'coatings', 'config.js')),
        read(path.join(ROOT, 'supabase-config.js')),
        read(path.join(ROOT, 'aga-cloud.js'))
    ];

    /*
       Only the code is checked, not the comments: these files
       deliberately WARN against the secret key in their prose, and a
       naive search matches the warning as readily as the mistake.
    */
    for (const source of configs) {
        const code = source
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        assert.doesNotMatch(code, /sb_secret_/, 'a secret key is in a served config file');
        assert.doesNotMatch(code, /service_role/, 'the service role key is in a served config file');
    }
});

test('the Supabase project is named in exactly one file', () => {
    /*
       This is the point of the shared config. The project URL and the
       publishable key used to be typed out in three files - AGA's plus
       one per trade - which meant rotating the key at the dashboard was
       a three-file edit, and missing one left that trade silently
       unable to sync while the other two carried on working.

       Now supabase-config.js is the only place they appear. If a copy
       is ever pasted back into a trade config, this fails.
    */
    const projectUrl = 'mvymxqajdiupucrkeqpg';
    const publishableKey = 'sb_publishable_';

    const filesNamingTheProject = [];

    /*
       Every served .js and .html file, excluding the test suite (which
       uses placeholder keys by design) and node_modules/.git/supabase
       (the last being backend code with its own config).
    */
    const SKIP = new Set(['node_modules', '.git', 'supabase', 'tools']);

    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (SKIP.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!/\.(js|html)$/.test(entry.name)) continue;

            const source = read(full);
            if (source.includes(projectUrl) || source.includes(publishableKey)) {
                filesNamingTheProject.push(path.relative(ROOT, full).replace(/\\/g, '/'));
            }
        }
    };

    walk(ROOT);

    /*
       Only supabase-config.js may hold the values. A trade's config.js
       is allowed to MENTION it is not repeated there - that is prose
       in a comment, so compare against the stripped code as well.
    */
    const offenders = filesNamingTheProject.filter(rel => {
        if (rel === 'supabase-config.js') return false;

        /*
           A file is only an offender if the value is live code, not a
           comment explaining where the value now comes from.
        */
        const code = read(path.join(ROOT, rel))
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        return code.includes(projectUrl) || code.includes(publishableKey);
    });

    assert.deepEqual(
        offenders,
        [],
        'the Supabase project is named outside supabase-config.js: ' + offenders.join(', ')
    );
});

test('the mailer derives its project ref instead of copying it', () => {
    /*
       email.js used to hold the project ref on its own line. A second
       copy of the ref is a second thing to update when the project
       moves - and a stale one fails quietly, because a failed send is
       swallowed on purpose so email never blocks the workshop. It now
       reads the ref out of SUPABASE_URL like everything else, so it
       cannot drift.
    */
    const email = read(path.join(ROOT, 'email.js'));
    const code = email.replace(/\/\*[\s\S]*?\*\//g, '');

    assert.match(code, /function supabaseProjectRef\(\)/,
        'email.js no longer derives the project ref');
    assert.match(code, /typeof SUPABASE_URL === "string"/,
        'email.js does not read SUPABASE_URL');
    assert.doesNotMatch(code, /mvymxqajdiupucrkeqpg/,
        'email.js still hard-codes the project ref');

    /*
       The endpoint must still be the FUNCTION url, not the REST url,
       and the function name must still match what is deployed.
    */
    assert.match(code, /\/functions\/v1\/\$\{EMAIL_FUNCTION_NAME\}/,
        'the mailer endpoint is no longer a functions/v1 URL');
    assert.match(code, /EMAIL_FUNCTION_NAME = "send-email"/,
        'the deployed mailer function name changed');
});

test('the shared cloud config hands every trade the same values', () => {
    /*
       aga-cloud.js is plain browser script, so rather than import it we
       run it the way the page does - with a window to write to - and
       check what a trade would actually read.

       The endpoint is DERIVED from AGA's URL, so a URL ending in a
       slash must not produce "//functions" and a 404.
    */
    const source = read(path.join(ROOT, 'supabase-config.js'));
    const agaUrl = source.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
    const agaKey = source.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];
    const shared = read(path.join(ROOT, 'aga-cloud.js'));

    const run = (url) => {
        const window = {};
        const fn = new Function('window', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', shared);
        fn(window, url, agaKey);
        return window;
    };

    const asLoaded = run(agaUrl);

    assert.equal(
        asLoaded.APS_CLOUD_FUNCTION_URL,
        agaUrl + '/functions/v1/cloud',
        'APS is not handed the cloud endpoint'
    );
    assert.equal(
        asLoaded.APC_CLOUD_FUNCTION_URL,
        asLoaded.APS_CLOUD_FUNCTION_URL,
        'APS and APC were given different cloud endpoints'
    );
    assert.equal(asLoaded.APS_SUPABASE_ANON_KEY, agaKey,
        'APS is not handed AGA\'s key');
    assert.equal(asLoaded.APC_SUPABASE_ANON_KEY, agaKey,
        'APC is not handed AGA\'s key');

    /*
       A trailing slash is the classic way to get a double slash and a
       404 that only shows up in one environment.
    */
    const withSlash = run(agaUrl + '/');
    assert.equal(
        withSlash.APS_CLOUD_FUNCTION_URL,
        agaUrl + '/functions/v1/cloud',
        'a trailing slash in SUPABASE_URL produces a double slash'
    );

    /*
       Loaded without AGA's config (a partial deploy, or a page that
       forgot it), the values must come out blank so the app degrades to
       offline storage rather than fetching an undefined URL.
    */
    const unconfigured = run('');
    assert.equal(unconfigured.APS_CLOUD_FUNCTION_URL, '',
        'an unset project URL must leave the endpoint blank, not partial');

    /*
       And the same thing again, but running the REAL files in ONE shared
       context the way two <script> tags do.

       This matters: supabase-config.js declares SUPABASE_URL with const,
       which creates a script-scoped binding rather than a property of
       window. aga-cloud.js and email.js reference the BARE name, so they
       only see it if the scripts share a global scope. The stubs above
       pass the value in as a parameter and would keep passing even if
       that sharing broke, so the real thing is run here too.
    */
    const vm = require('node:vm');
    const supabaseConfig = read(path.join(ROOT, 'supabase-config.js'));
    const cloudConfig = read(path.join(ROOT, 'aga-cloud.js'));
    const email = read(path.join(ROOT, 'email.js'));

    const page = vm.createContext({
        window: {},
        console: { log() {}, warn() {}, error() {} },
    });
    vm.runInContext(supabaseConfig, page);
    vm.runInContext(cloudConfig, page);
    vm.runInContext(email, page);

    const seen = JSON.parse(vm.runInContext(
        'JSON.stringify({' +
        ' aps: window.APS_CLOUD_FUNCTION_URL,' +
        ' apc: window.APC_CLOUD_FUNCTION_URL,' +
        ' apsKey: window.APS_SUPABASE_ANON_KEY,' +
        ' apcKey: window.APC_SUPABASE_ANON_KEY,' +
        ' mailerRef: typeof SUPABASE_PROJECT_REF === "string" ? SUPABASE_PROJECT_REF : null,' +
        ' mailerEndpoint: typeof EMAIL_ENDPOINT === "string" ? EMAIL_ENDPOINT : null })',
        page
    ));

    const expectedEndpoint = agaUrl + '/functions/v1/cloud';
    const expectedRef = agaUrl.replace(/^https:\/\//, '').replace(/\.supabase\.co$/, '');

    assert.equal(seen.aps, expectedEndpoint,
        'running the real files, APS is not handed the cloud endpoint');
    assert.equal(seen.apc, expectedEndpoint,
        'running the real files, APC is not handed the cloud endpoint');
    assert.equal(seen.apsKey, agaKey, 'running the real files, APS has no key');
    assert.equal(seen.apcKey, agaKey, 'running the real files, APC has no key');

    /*
       The mailer's project ref must come out of the shared config, not
       be a copy that can go stale. A wrong ref is a 404, and a failed
       send is swallowed on purpose so email never blocks the workshop -
       which is exactly why it must not be able to drift.
    */
    assert.equal(seen.mailerRef, expectedRef,
        'the mailer did not derive the project ref from SUPABASE_URL');
    assert.equal(
        seen.mailerEndpoint,
        agaUrl + '/functions/v1/send-email',
        'the mailer endpoint is wrong'
    );
});

test('both trade service workers cache the shared cloud config', () => {
    /*
       index.html loads supabase-config.js and aga-cloud.js from the app
       root. On a phone with no signal an uncached script is simply
       missing, so the cloud constants never get set and sync fails with
       no obvious cause. Both must be in the offline file list.

       The path is resolved from the SERVICE WORKER's own folder, not
       from index.html - the two are one level apart, which is exactly
       how this was got wrong the first time: '../x' looked right beside
       index.html's '../../x' but pointed at trades/x, which does not
       exist. Asserting on the literal string would have locked the bug
       in, so each entry is resolved on disk instead.
    */
    for (const [trade, logo] of [['plumbing', 'APSlogo.png'], ['coatings', 'APClogo.jpg']]) {
        const swPath = path.join(ROOT, 'trades', trade, 'service-worker.js');
        const sw = read(swPath);
        const swDir = path.dirname(swPath);

        /* Every './...' and '../...' entry in the file list. */
        const listed = [...sw.matchAll(/'(\.\.?\/[^']+)'/g)].map(m => m[1]);
        assert.ok(listed.length >= 8, `trades/${trade} has no offline file list`);

        for (const entry of listed) {
            /* './' means the folder itself; test it as index.html. */
            const target = entry.replace(/\/$/, '/index.html');
            assert.ok(
                fs.existsSync(path.resolve(swDir, target)),
                `trades/${trade} service worker lists '${entry}', which does not ` +
                `exist relative to its own folder (${path.resolve(swDir, target)})`
            );
        }

        /*
           And the two shared files specifically, because a file list that
           simply omits them still passes a general check.
        */
        for (const shared of ['../../supabase-config.js', '../../aga-cloud.js']) {
            assert.ok(
                listed.includes(shared),
                `trades/${trade} service worker does not cache ${shared}`
            );
        }

        assert.ok(listed.includes(`./${logo}`),
            `trades/${trade} service worker lost its brand mark`);
    }

    /*
       The AGA shell lists files from its own root, so './' is right
       there. Checked the same way - resolved, not pattern-matched.
    */
    const agaListed = [...read(SW_JS).matchAll(/"(\.\/[^"]+)"/g)].map(m => m[1]);
    assert.ok(agaListed.includes('./aga-cloud.js'),
        'the AGA shell does not cache aga-cloud.js');

    for (const entry of agaListed) {
        const target = entry.replace(/\/$/, 'index.html');
        assert.ok(
            fs.existsSync(path.resolve(ROOT, target)),
            `the AGA shell lists '${entry}', which does not exist`
        );
    }
});

test('every local file a page loads actually exists', () => {
    /*
       A wrong path here is invisible until it matters: the browser
       simply does not load the script, and an app that depends on it
       fails later for an unrelated-looking reason. The shared cloud
       config is loaded by relative path from two directories deep, so
       this is exactly the kind of reference that goes wrong quietly.
    */
    const PAGES = ['index.html', 'trades/plumbing/index.html', 'trades/coatings/index.html'];

    for (const page of PAGES) {
        const full = path.join(ROOT, page);
        const html = read(full);
        const dir = path.dirname(full);

        const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map(m => m[1]);

        for (const ref of refs) {
            /* Remote, in-page, protocol and data URLs are not files. */
            if (/^(https?:)?\/\//.test(ref)) continue;
            if (/^(#|mailto:|tel:|data:)/.test(ref)) continue;

            const clean = ref.split('?')[0].split('#')[0];
            if (!clean) continue;

            const target = clean.startsWith('/')
                ? path.join(ROOT, clean)
                : path.resolve(dir, clean);

            assert.ok(
                fs.existsSync(target),
                `${page} loads "${ref}", which does not exist (${path.relative(ROOT, target)})`
            );
        }
    }
});

test('every trade names itself when it calls the cloud', () => {
    /*
       The trade travels in the request, is stamped on the quote and
       filters the list, which is what keeps the books apart in one
       shared table. The function rejects a call with no trade rather
       than guessing, so an app that stopped sending it would fail
       loudly on every sync.
    */
    const expected = { plumbing: 'aps', coatings: 'apc' };

    for (const [trade, key] of Object.entries(expected)) {
        const source = read(path.join(ROOT, 'trades', trade, 'app.js'));

        assert.match(
            source,
            new RegExp(`const CLOUD_TRADE = '${key}';`),
            `trades/${trade} does not declare its cloud trade`
        );
        assert.match(
            source,
            /'&trade=' \+ encodeURIComponent\(CLOUD_TRADE\)/,
            `trades/${trade} does not send its trade with the request`
        );
    }
});

test('the cloud function accepts exactly the trades the apps send', () => {
    const fn = read(
        path.join(ROOT, 'supabase', 'functions', 'cloud', 'index.ts')
    );

    const list = fn.match(/const TRADES = \[([^\]]+)\]/)?.[1] || '';

    for (const key of ['aga', 'aps', 'apc']) {
        assert.match(list, new RegExp(`"${key}"`),
            `the cloud function does not accept the "${key}" trade`);
    }
});

test('the dashboard paste copy matches the real function', () => {
    /*
       There are two ways to deploy this function: the Supabase CLI,
       which uses supabase/functions/cloud/index.ts, and the dashboard,
       which needs the source pasted into a text box. The paste copy
       exists so nobody has to install the CLI - but two copies of one
       function is exactly the drift this codebase keeps having to
       unpick.

       So the paste copy must be the SAME CODE, ignoring only the
       banner comment at the top, which explains the dashboard steps
       and is worthless to the CLI. If they ever diverge, the deployed
       behaviour depends on which route someone happened to use.
    */
    const strip = (source) =>
        source
            /* Drop block comments (the paste copy's banner is longer). */
            .replace(/\/\*[\s\S]*?\*\//g, '')
            /*
               Drop line comments, but NOT the '//' inside a string:
               the import URL contains one, and a naive strip of
               '//...' deletes the import and the rest of the line,
               making two identical files look different.
            */
            .split('\n')
            .map(line => {
                const marker = line.indexOf('//');
                if (marker === -1) return line;
                /* Count quotes before the marker: an odd number means
                   the '//' is inside a string, so keep the line. */
                const quotes = (line.slice(0, marker).match(/"/g) || []).length;
                return quotes % 2 === 1 ? line : line.slice(0, marker);
            })
            .join('\n')
            .replace(/\s+/g, ' ')
            .trim();

    const real = read(path.join(ROOT, 'supabase', 'functions', 'cloud', 'index.ts'));
    const paste = read(path.join(ROOT, 'supabase', 'CLOUD-DASHBOARD-PASTE.ts'));

    assert.ok(paste.length > 0, 'the dashboard paste copy is empty');
    assert.equal(
        strip(paste),
        strip(real),
        'supabase/CLOUD-DASHBOARD-PASTE.ts has drifted from the real function - ' +
        'the two deploy routes would behave differently'
    );
});

test('the cloud function answers with CORS headers for the deployed site', () => {
    const fn = read(
        path.join(ROOT, 'supabase', 'functions', 'cloud', 'index.ts')
    );

    /*
       The apps are on GitHub Pages and the function is on a Supabase
       domain, so every call is cross-origin and is blocked without
       these headers. The local preview origins are in the list too,
       or the cloud would work deployed and fail while developing.
    */
    assert.match(fn, /Access-Control-Allow-Origin/);
    assert.match(fn, /architecturalglassandaluminium-crypto\.github\.io/);
    assert.match(fn, /127\.0\.0\.1:8800/);
});

test('the cloud function scopes every write to the calling trade', () => {
    const fn = read(
        path.join(ROOT, 'supabase', 'functions', 'cloud', 'index.ts')
    );

    /*
       The function holds the service role key, which bypasses Row Level
       Security entirely. That makes the trade filter the ONLY thing
       stopping one trade reaching another's rows, so every statement
       that touches a table must carry it.

       delete was the one that did not: it filtered on `id` alone. Quote
       ids are prefixed per app today, so nothing collides - but that is
       a convention in the apps, not a constraint in the database, and a
       future id scheme would let a delete land on the wrong trade.
    */
    const deleteBlock = fn.match(/case "delete":\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';

    assert.ok(deleteBlock, 'the function has no delete action');
    assert.match(
        deleteBlock,
        /\?id=eq\.\$\{encodeURIComponent\(id\)\}/,
        'the delete does not filter on the id'
    );
    assert.match(
        deleteBlock,
        /&trade=eq\.\$\{encodeURIComponent\(trade\)\}/,
        'the delete is not scoped to the trade that asked for it'
    );

    /*
       And the same standard everywhere else. The queries are PostgREST
       strings now, so every one that touches a table must carry
       trade=eq. on its path. Counted rather than pattern-matched at one
       call site, so a new action that forgets the filter is caught.
    */
    const tradeFilters = (fn.match(/trade=eq\.\$\{encodeURIComponent\(trade\)\}/g) || []).length;
    assert.equal(tradeFilters, 3,
        `expected 3 queries to filter by trade, found ${tradeFilters}`);

    /*
       A quote is stamped with the trade on the way in, so a save cannot
       write into another trade's book even if the id were made up.
    */
    assert.match(fn, /body:\s*JSON\.stringify\(\{\s*id,\s*trade,\s*body:\s*quote\s*\}\)/,
        'a saved quote is not stamped with the calling trade');

    /*
       Settings and the price list go through one helper, which stamps
       the trade on write and filters on read. If that helper is ever
       bypassed with a direct call, this notices.
    */
    const sharedUpsert = /body:\s*JSON\.stringify\(\{\s*trade,\s*body:\s*payload\s*\}\)/.test(fn);
    assert.ok(sharedUpsert,
        'the shared settings/price-list write is not stamped with the trade');

    /*
       Nothing may touch a table without the trade being resolved first:
       one readTrade call per action that reaches the database.
    */
    const readTradeCalls = (fn.match(/readTrade\(url\)/g) || []).length;
    assert.ok(readTradeCalls >= 4,
        `only ${readTradeCalls} actions resolve a trade before touching the database`);
});

test('the cloud function has no third-party import', () => {
    /*
       The deployed function returned a bare 500 with no body on every
       request. A 500 with no JSON means the module never finished
       loading - nothing inside it ran, including its own error handler
       - and the only thing that can fail that way is a module-scope
       import from a third-party domain.

       The function now talks to PostgREST with plain fetch, so there is
       nothing to resolve before the code can run. This test keeps it
       that way: a bare 500 is the hardest failure to diagnose from the
       app, which can only report an opaque network error.
    */
    const fn = read(path.join(ROOT, 'supabase', 'functions', 'cloud', 'index.ts'));

    /* Strip comments: the header explains WHY there is no import, and a
       naive search matches that explanation as readily as an import. */
    const code = fn
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(line => {
            const marker = line.indexOf('//');
            if (marker === -1) return line;
            const quotes = (line.slice(0, marker).match(/"/g) || []).length;
            return quotes % 2 === 1 ? line : line.slice(0, marker);
        })
        .join('\n');

    assert.doesNotMatch(code, /^\s*import\s/m,
        'the cloud function imports at module scope again - a failing import ' +
        'makes the whole function answer a bare 500 that the app cannot read');
    assert.doesNotMatch(code, /esm\.sh|cdn\.jsdelivr|unpkg\.com/,
        'the cloud function depends on a third-party module host again');

    /* It must still reach the database - removing the import is only
       correct if the REST calls actually replaced it. */
    assert.match(code, /fetch\(/,
        'the cloud function does not call the REST API');
    assert.match(code, /\/rest\/v1/,
        'the cloud function does not build a PostgREST URL');
});

// ---------------------------------------------------------------------------
// Stores and the best price
// ---------------------------------------------------------------------------

/*
   Both quoting apps must price a job the same way: take the cheapest
   price for an item across the catalogue and every store, then say
   WHICH store that price came from. These tests pin the pieces that
   make that true, because it is easy to break by editing one app.
*/

const PLUMBING_APP = path.join(ROOT, 'trades', 'plumbing', 'app.js');
const COATINGS_APP = path.join(ROOT, 'trades', 'coatings', 'app.js');
const PLUMBING_HTML = path.join(ROOT, 'trades', 'plumbing', 'index.html');
const COATINGS_HTML = path.join(ROOT, 'trades', 'coatings', 'index.html');

test('Leroy Merlin is a store in both quoting apps', () => {
    /**
     * LeRoy Merlin, https://leroymerlin.co.za/, sells both plumbing
     * (pipes, geysers, taps) and building supplies (cement, bricks,
     * blocks), so it belongs on the shelf of BOTH trades - not just
     * the one that happened to be edited first.
     */
    for (const [label, file] of [
        ['plumbing (APS)', PLUMBING_APP],
        ['coatings (APC)', COATINGS_APP]
    ]) {
        const source = read(file);
        assert.match(
            source,
            /leroymerlin:\s*\{\s*name:\s*'Leroy Merlin',\s*url:\s*'https:\/\/leroymerlin\.co\.za\/'\s*\}/,
            `${label} has no Leroy Merlin store card`
        );
        assert.match(
            source,
            /leroymerlin:\s*\{/, // the price catalogue entry
            `${label} has no Leroy Merlin price catalogue`
        );
    }
});

test('the Leroy Merlin tab is offered in both quoting apps', () => {
    for (const [label, file] of [
        ['plumbing (APS)', PLUMBING_HTML],
        ['coatings (APC)', COATINGS_HTML]
    ]) {
        assert.match(
            read(file),
            /data-supplier="leroymerlin"/,
            `${label} has no Leroy Merlin store tab`
        );
    }
});

test('every store in the tab row is a store the app actually knows', () => {
    /**
     * A tab is a data-supplier key the click handler looks up in
     * supplierInfo. A tab with no entry there renders, is clickable,
     * then throws - the store card list and the markup have to agree.
     */
    for (const [label, appFile, htmlFile] of [
        ['plumbing (APS)', PLUMBING_APP, PLUMBING_HTML],
        ['coatings (APC)', COATINGS_APP, COATINGS_HTML]
    ]) {
        const app = read(appFile);
        const html = read(htmlFile);
        const tabs = [...html.matchAll(/data-supplier="([a-z]+)"/g)].map(m => m[1]);

        assert.ok(tabs.length, `${label} has no store tabs`);
        assert.equal(new Set(tabs).size, tabs.length,
            `${label} lists the same store twice`);

        for (const key of tabs) {
            assert.match(
                app,
                new RegExp(`${key}:\\s*\\{\\s*name:`),
                `${label} has a ${key} tab but no ${key} store card`
            );
        }
    }
});

test('both apps price a catalogue cost against a named reference store', () => {
    /**
     * The catalogue's own cost used to be attributed to no store at
     * all (coatings) or to a store that was never named in the
     * supplier list (plumbing). Both now park it on REFERENCE_SUPPLIER,
     * so the best-price label can always answer "which store?".
     */
    const plumbing = read(PLUMBING_APP);
    const coatings = read(COATINGS_APP);

    assert.match(plumbing, /const REFERENCE_SUPPLIER = 'plumblink';/);
    assert.match(coatings, /const REFERENCE_SUPPLIER = 'builders';/);

    for (const [label, source] of [
        ['plumbing (APS)', plumbing],
        ['coatings (APC)', coatings]
    ]) {
        assert.match(
            source,
            /\{ supplier: REFERENCE_SUPPLIER, cost: baseCost \}/,
            `${label} does not know which store its catalogue cost belongs to`
        );
        assert.doesNotMatch(
            source,
            /supplier: 'reference'/,
            `${label} still labels the catalogue cost as "reference" instead of a store`
        );
    }
});

test('the cheapest price is labelled with the store it came from', () => {
    /**
     * This is the ask: when a product is added the row must show the
     * lowest price AND name the store it was found at. A bare
     * currency figure does not tell a buyer where to go.
     */
    for (const [label, appFile, htmlFile] of [
        ['plumbing (APS)', PLUMBING_APP, PLUMBING_HTML],
        ['coatings (APC)', COATINGS_APP, COATINGS_HTML]
    ]) {
        const app = read(appFile);

        assert.match(
            app,
            /function getMaterialSupplierLabel\(material\)/,
            `${label} has no best-price label helper`
        );

        /*
           The label prints the price, a separator and the store
           name(s). Both apps must produce the same shape. The
           separator is written as a character class so this test
           itself stays plain ASCII: a \u escape in a regex literal
           is consumed by the regex engine, not by the file.

           The closing brace of the template expression is part of
           the pattern: the app writes ${currency(...)}, not
           ${currency(...).
        */
        assert.match(
            app,
            /\$\{currency\(bestPrice\.cost\)\}\s*[^\s]\s*\$\{bestPrice\.suppliers\.map\(supplierName\)\.join\(', '\)\}/,
            `${label} does not print "<price> - <store>"`
        );

        /*
           The material row must use the label, not the old bare
           currency(getSupplierCost(...)) which showed a price with
           no store beside it.
        */
        assert.match(
            app,
            /class="material-best-price"[^>]*>\$\{getMaterialSupplierLabel\(material\)\}</,
            `${label} material row does not use the labelled best price`
        );
        assert.doesNotMatch(
            app,
            /class="material-best-price">\$\{material\.description \? currency\(getSupplierCost/,
            `${label} still shows an unlabelled best price`
        );

        assert.match(
            read(htmlFile),
            /<span>Best price \(store\)<\/span>/,
            `${label} column heading does not say the store is shown`
        );
    }
});

test('the best-price label falls back instead of showing a store it has not got', () => {
    /*
       No description yet, or nothing priced: the cell must read
       "\u2014" or "No price match", never "R0.00 - undefined".
    */
    for (const [label, file] of [
        ['plumbing (APS)', PLUMBING_APP],
        ['coatings (APC)', COATINGS_APP]
    ]) {
        const source = read(file);
        const helper = source.match(/function getMaterialSupplierLabel[\s\S]*?\n\}/)?.[0] || '';

        assert.ok(helper, `${label} has no getMaterialSupplierLabel body`);
        assert.match(helper, /No price match/, `${label} has no empty-store fallback`);
        /*
           supplierName( is inside a template literal, so the text of
           the helper contains `.map(supplierName)` - a plain
           supplierName( with nothing before it would not match.
        */
        assert.match(helper, /supplierName\)/, `${label} does not name the store safely`);
        assert.match(
            source,
            /function supplierName\(key\) \{ return supplierInfo\[key\]\?\.name \|\| 'Reference price'; \}/,
            `${label} has no safe store-name lookup`
        );
    }
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