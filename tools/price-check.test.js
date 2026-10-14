// Tests for the Price Check tab (price-check.js).
//
// The view is a comparison of what a product costs at each of the
// five stores the company buys from, plus a shopping list built from
// those comparisons. These tests cover the model - which is pure and
// needs no browser - and assert the wiring of the tab into the host
// page. The rendered table is verified in the browser via the QA
// scripts, because "does the grid actually lay out" is not something
// a string assertion can answer.
//
// Run with:  node --test tools/price-check.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const model = require('../price-check.js');
const {
    SUPPLIERS, CATALOGUE, supplierName, toPrice, applyOverrides,
    recordOverride, pricesFor, bestPrice, search, groupByCategory,
    toggleFavorite, addCustomItem,
    normaliseList, addLine, removeLine, setQuantity, toggleDone,
    listTotal, groupListBySupplier
} = model;

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// ---------------------------------------------------------------------------
// The five stores
// ---------------------------------------------------------------------------

test('all five named stores are in the price check', () => {
    const names = SUPPLIERS.map(store => store.name);
    for (const expected of [
        'Leroy Merlin',
        'Plumblink',
        'Chamberlains',
        'Bathroom Bizaar',
        'Builders Warehouse'
    ]) {
        assert.ok(names.includes(expected), `${expected} is not a store in the price check`);
    }
});

test('every store has a name, a key and a link to its own site', () => {
    for (const store of SUPPLIERS) {
        assert.match(store.key, /^[a-z]+$/, `${store.name} has a key that is not a plain word`);
        assert.match(store.url, /^https:\/\//, `${store.name} has no https url`);
        /* The link is the store's own SEARCH, so a row's figure can be
           checked at source rather than dropping the user on a home
           page to hunt for it. */
        assert.match(store.url, /search\?q=$/, `${store.name} does not link to a product search`);
    }
});

test('each store key is distinct, so a column cannot merge with another', () => {
    const keys = SUPPLIERS.map(store => store.key);
    assert.equal(new Set(keys).size, keys.length);
});

test('supplierName resolves a key and falls back rather than printing undefined', () => {
    assert.equal(supplierName('plumblink'), 'Plumblink');
    assert.equal(supplierName('nope'), 'Reference price');
});

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

test('every catalogue entry has a category, a description and prices', () => {
    assert.ok(CATALOGUE.length > 0, 'the catalogue is empty');
    for (const product of CATALOGUE) {
        assert.equal(typeof product.category, 'string');
        assert.ok(product.category, `${product.description} has no category`);
        assert.equal(typeof product.description, 'string');
        assert.ok(product.description, 'a product has no description');
        assert.ok(Object.keys(product.prices).length > 0, `${product.description} has no prices`);
    }
});

test('every price in the catalogue belongs to a store that exists', () => {
    const keys = new Set(SUPPLIERS.map(store => store.key));
    for (const product of CATALOGUE) {
        for (const key of Object.keys(product.prices)) {
            assert.ok(keys.has(key), `${product.description} is priced at unknown store "${key}"`);
        }
    }
});

test('every catalogue price is a positive number', () => {
    for (const product of CATALOGUE) {
        for (const [key, price] of Object.entries(product.prices)) {
            assert.equal(typeof price, 'number', `${product.description} @ ${key} is not a number`);
            assert.ok(price > 0, `${product.description} @ ${key} is not positive`);
        }
    }
});

test('a product carries the date its price was captured', () => {
    /*
       Prices go stale and there is no feed to refresh them, so the
       date is the only thing standing between the user and a figure
       they believe is current. It is stamped on every row.
    */
    for (const product of CATALOGUE) {
        assert.match(product.checked, /^\d{4}-\d{2}-\d{2}$/, `${product.description} has no capture date`);
    }
});

test('every store carries at least one product, or it should not be offered', () => {
    for (const store of SUPPLIERS) {
        const carries = CATALOGUE.filter(product => product.prices[store.key] !== undefined);
        assert.ok(carries.length > 0, `${store.name} carries nothing in the catalogue`);
    }
});

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

test('toPrice accepts a number or a written price and rejects junk', () => {
    assert.equal(toPrice(349), 349);
    assert.equal(toPrice('349'), 349);
    assert.equal(toPrice('R349.90'), 349.90);
    assert.equal(toPrice(''), null);
    assert.equal(toPrice('abc'), null);
    assert.equal(toPrice(0), null);
    assert.equal(toPrice(-5), null);
    assert.equal(toPrice(null), null);
    assert.equal(toPrice(undefined), null);
});

test('a store with no saved price is absent from the ranking, not priced at zero', () => {
    const product = CATALOGUE.find(p => p.description === 'Geyser - 150L');
    const rows = pricesFor(product);
    assert.ok(!rows.some(row => row.supplier === 'chamberlains'), 'a store without a saved price is in the ranking');
    assert.ok(!rows.some(row => row.price === 0), 'an absent store became a zero price');
});

test('pricesFor ranks the stores cheapest first', () => {
    const product = CATALOGUE.find(p => p.description === 'Cement - 50kg PPC');
    const rows = pricesFor(product);
    for (let i = 1; i < rows.length; i++) {
        assert.ok(rows[i - 1].price <= rows[i].price, 'prices are not in ascending order');
    }
});

test('bestPrice is the cheapest figure and names every store that ties', () => {
    const product = CATALOGUE.find(p => p.description === 'Copper elbow - 15mm');
    const best = bestPrice(product);
    assert.equal(best.price, 6);
    /*
       Two stores share R6. A quote must not name one shop when the
       buyer may be standing in either.
    */
    assert.deepEqual(best.suppliers.sort(), ['builders', 'plumblink'].sort());
});

test('bestPrice on a product with no prices returns nothing, not Infinity', () => {
    const empty = { category: 'x', description: 'y', prices: {} };
    assert.deepEqual(bestPrice(empty), { price: null, suppliers: [] });
    assert.deepEqual(pricesFor(empty), []);
});

test('a junk price does not win the cheapest comparison', () => {
    const product = { category: 'x', description: 'Junk price', prices: { leroymerlin: 'R', plumblink: 100 } };
    const best = bestPrice(product);
    assert.equal(best.price, 100);
    assert.deepEqual(best.suppliers, ['plumblink']);
});

test('search matches on the description and the category, case-insensitively', () => {
    assert.ok(search(CATALOGUE, 'GEYSER').length > 0);
    assert.ok(search(CATALOGUE, 'sanitary').length > 0);
    assert.equal(search(CATALOGUE, '').length, CATALOGUE.length);
    assert.equal(search(CATALOGUE, 'zzzz-nothing').length, 0);
});

test('search does not mutate the catalogue it is given', () => {
    const before = CATALOGUE.length;
    search(CATALOGUE, '');
    assert.equal(CATALOGUE.length, before);
});

test('groupByCategory keeps the catalogue order and loses no product', () => {
    const groups = groupByCategory(CATALOGUE);
    const flattened = groups.flatMap(group => group.products);
    assert.equal(flattened.length, CATALOGUE.length, 'grouping dropped or duplicated products');
    assert.deepEqual(flattened.map(p => p.description), CATALOGUE.map(p => p.description));
});

test('toggleFavorite adds and removes one product without duplicates', () => {
    assert.deepEqual(toggleFavorite([], 'Copper pipe'), ['Copper pipe']);
    assert.deepEqual(toggleFavorite(['Copper pipe'], 'Copper pipe'), []);
    assert.deepEqual(toggleFavorite(['Other'], 'Copper pipe'), ['Other', 'Copper pipe']);
});

test('addCustomItem validates names and creates an editable unpriced row', () => {
    const empty = addCustomItem([], '  ', '', '2026-10-14');
    assert.equal(empty.added, false);
    const added = addCustomItem([], '  My valve  ', 'Valves', '2026-10-14');
    assert.equal(added.added, true);
    assert.deepEqual(added.items[0], {
        category: 'Valves',
        description: 'My valve',
        checked: '2026-10-14',
        prices: {}
    });
    assert.equal(addCustomItem(added.items, 'MY VALVE', '', '2026-10-14').added, false);
});

// ---------------------------------------------------------------------------
// Editing a price
// ---------------------------------------------------------------------------

test('an override replaces one store price and leaves the rest alone', () => {
    const overrides = recordOverride({}, 'Cement - 50kg PPC', 'leroymerlin', 110, '2026-10-14');
    const product = applyOverrides(CATALOGUE, overrides).find(p => p.description === 'Cement - 50kg PPC');
    assert.equal(product.prices.leroymerlin, 110);
    assert.equal(product.prices.builders, 124.9, 'the edit leaked into another store');
});

test('an override stamps the date the user checked it', () => {
    const overrides = recordOverride({}, 'Cement - 50kg PPC', 'leroymerlin', 110, '2026-10-14');
    const product = applyOverrides(CATALOGUE, overrides).find(p => p.description === 'Cement - 50kg PPC');
    assert.equal(product.checked, '2026-10-14');
});

test('a cleared price removes the store rather than storing a zero', () => {
    const withPrice = recordOverride({}, 'Cement - 50kg PPC', 'builders', 124.9, '2026-10-14');
    const cleared = recordOverride(withPrice, 'Cement - 50kg PPC', 'builders', '', '2026-10-14');
    const product = applyOverrides(CATALOGUE, cleared).find(p => p.description === 'Cement - 50kg PPC');
    assert.equal(product.prices.builders, undefined);
});

test('applyOverrides does not mutate the catalogue it is given', () => {
    const original = CATALOGUE.find(p => p.description === 'Cement - 50kg PPC').prices.leroymerlin;
    const overrides = recordOverride({}, 'Cement - 50kg PPC', 'leroymerlin', 1, '2026-10-14');
    applyOverrides(CATALOGUE, overrides);
    assert.equal(CATALOGUE.find(p => p.description === 'Cement - 50kg PPC').prices.leroymerlin, original);
});

test('an override for an unknown product is ignored, not appended', () => {
    const overrides = recordOverride({}, 'No such product', 'builders', 10, '2026-10-14');
    const products = applyOverrides(CATALOGUE, overrides);
    assert.equal(products.length, CATALOGUE.length);
    assert.ok(!products.some(p => p.description === 'No such product'));
});

// ---------------------------------------------------------------------------
// The shopping list
// ---------------------------------------------------------------------------

test('adding a product picks the cheapest store when none is named', () => {
    const product = CATALOGUE.find(p => p.description === 'Cement - 50kg PPC');
    const list = addLine([], product, '', 1);
    assert.equal(list.length, 1);
    assert.equal(list[0].supplier, 'chamberlains'); // R119.90, the cheapest
    assert.equal(list[0].price, 119.9);
});

test('adding a product respects a named store over the cheapest', () => {
    const product = CATALOGUE.find(p => p.description === 'Cement - 50kg PPC');
    const list = addLine([], product, 'builders', 1);
    assert.equal(list[0].supplier, 'builders');
    assert.equal(list[0].price, 124.9);
});

test('adding the same product twice increases the quantity, not the rows', () => {
    const product = CATALOGUE.find(p => p.description === 'Geyser - 150L');
    let list = addLine([], product, '', 1);
    list = addLine(list, product, '', 2);
    assert.equal(list.length, 1, 'a duplicate line was appended');
    assert.equal(list[0].quantity, 3);
});

test('quantity is at least one, whatever the caller passes', () => {
    const product = CATALOGUE.find(p => p.description === 'Geyser - 150L');
    for (const bad of [0, -4, '', 'abc', null]) {
        const list = addLine([], product, '', bad);
        assert.equal(list[0].quantity, 1, `quantity ${JSON.stringify(bad)} did not clamp to 1`);
    }
});

test('removeLine takes the whole line out', () => {
    const product = CATALOGUE[0];
    const list = removeLine(addLine([], product, '', 1), product.description);
    assert.equal(list.length, 0);
});

test('setQuantity clamps to one and does not touch other lines', () => {
    const a = CATALOGUE[0];
    const b = CATALOGUE[1];
    let list = addLine(addLine([], a, '', 1), b, '', 1);
    list = setQuantity(list, a.description, 0);
    assert.equal(list.find(l => l.description === a.description).quantity, 1);
    assert.equal(list.find(l => l.description === b.description).quantity, 1);
});

test('toggleDone flips one line and only that line', () => {
    const a = CATALOGUE[0];
    const b = CATALOGUE[1];
    let list = addLine(addLine([], a, '', 1), b, '', 1);
    list = toggleDone(list, a.description);
    assert.equal(list.find(l => l.description === a.description).done, true);
    assert.equal(list.find(l => l.description === b.description).done, false);
});

test('the list total prices only what is still to buy', () => {
    const product = CATALOGUE.find(p => p.description === 'Cement - 50kg PPC');
    let list = addLine([], product, '', 2); // 2 x 119.90
    assert.equal(Math.round(listTotal(list) * 100) / 100, 239.8);
    list = toggleDone(list, product.description);
    assert.equal(listTotal(list), 0, 'a bought line is still in the total');
});

test('groupListBySupplier splits the list by store with a per-store total', () => {
    const a = CATALOGUE.find(p => p.description === 'Cement - 50kg PPC');
    const b = CATALOGUE.find(p => p.description === 'Geyser - 150L');
    let list = addLine([], a, 'chamberlains', 1);
    list = addLine(list, b, 'plumblink', 1);
    const groups = groupListBySupplier(list);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map(g => g.name).sort(), ['Chamberlains', 'Plumblink']);
    for (const group of groups) {
        assert.ok(group.total > 0, `${group.name} has a zero total`);
        assert.ok(group.lines.every(line => line.supplier === group.supplier || group.supplier === ''));
    }
});

test('normaliseList survives junk, and drops only the unusable lines', () => {
    const cleaned = normaliseList([
        null,
        'nope',
        { description: '', quantity: 1 },
        { description: 'Real line', quantity: 2, price: 'R10.50' }
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].description, 'Real line');
    assert.equal(cleaned[0].quantity, 2);
    assert.equal(cleaned[0].price, 10.5);
});

test('normaliseList on a non-array returns an empty list, not a crash', () => {
    assert.deepEqual(normaliseList(null), []);
    assert.deepEqual(normaliseList('nope'), []);
    assert.deepEqual(normaliseList(undefined), []);
});

test('the model does not depend on the DOM being present', () => {
    /*
       price-check.js is loaded in the browser and required in node.
       The model half must export cleanly with no document at all -
       which is how every test above ran.
    */
    assert.equal(typeof model.collect, 'undefined');
    for (const name of ['addLine', 'bestPrice', 'pricesFor', 'listTotal']) {
        assert.equal(typeof model[name], 'function', `${name} is not exported`);
    }
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

test('the price check is a view in the host page and app.js knows it', () => {
    const html = read('index.html');
    assert.match(html, /id="pricecheck-view"/, 'the price check view section is missing');
    assert.match(html, /data-view="pricecheck"/, 'the nav button for the price check is missing');
    assert.match(html, /<script src="price-check\.js"><\/script>/, 'price-check.js is not loaded');
    assert.match(read('app.js'), /"pricecheck"/, 'app.js does not list the price check view');
});

test('the price check is repainted when its tab is opened', () => {
    /*
       The table is rebuilt from storage on entry, like the portfolio
       and the planning schedule. Without this call the section would
       be shown empty until something else happened to redraw it.
    */
    assert.match(read('app.js'), /viewName === "pricecheck"[\s\S]{0,120}renderPriceCheck/);
});

test('the five stores are named in the table header of the host page', () => {
    const html = read('index.html');
    for (const name of ['Leroy Merlin', 'Plumblink', 'Chamberlains', 'Bathroom Bizaar', 'Builders Warehouse']) {
        assert.match(html, new RegExp(name), `${name} has no column in the price table`);
    }
});

test('the shopping list has a total and a way to clear it', () => {
    const html = read('index.html');
    assert.match(html, /id="priceCheckTotal"/);
    assert.match(html, /id="priceCheckClearButton"/);
    assert.match(html, /id="priceCheckList"/);
});

test('the shopping list appears before the store comparison', () => {
    const html = read('index.html');
    assert.ok(
        html.indexOf('<!-- SHOPPING LIST -->') < html.indexOf('<!-- SIDE-BY-SIDE PRICE COMPARISON -->'),
        'the shopping list is not above the store comparison'
    );
});

test('all five full retailer catalogues are directly linked', () => {
    const html = read('index.html');
    for (const [name, url] of [
        ['Leroy Merlin', 'https://leroymerlin.co.za/'],
        ['Plumblink', 'https://www.plumblink.co.za/all-products'],
        ['Chamberlains', 'https://www.chamberlains.co.za/'],
        ['Builders Warehouse', 'https://www.builders.co.za/'],
        ['Bathroom Bizaar', 'https://bathroom.co.za/']
    ]) {
        assert.ok(html.includes(`href="${url}"`), `${name} full catalogue link is missing`);
    }
    assert.match(html, /small, manually maintained sample, not a live or complete retailer catalogue/);
});

test('the price table supports persistent favourites and adding custom items', () => {
    const html = read('index.html');
    const source = read('price-check.js');
    assert.match(html, /id="priceCheckFavoritesOnly"/);
    assert.match(html, /id="priceCheckAddFavoriteButton"/);
    assert.match(html, /id="priceCheckFavoriteForm"/);
    assert.match(source, /var FAVORITES_KEY = "aga_price_check_favorites"/);
    assert.match(source, /var CUSTOM_ITEMS_KEY = "aga_price_check_custom_items"/);
    assert.match(source, /favorite\.dataset\.favorite = product\.description/);
});

test('price refresh updates only exact Bathroom Bizaar matches and reports other stores as unchanged', () => {
    const html = read('index.html');
    const source = read('price-check.js');
    assert.match(html, /id="priceCheckRefreshButton"/);
    assert.match(html, /id="priceCheckRefreshStatus"[^>]*role="status"/);
    assert.match(source, /\/api\/price-check-refresh\?search=/);
    assert.match(source, /normaliseProductName\(candidate\.name\) === expectedName/);
    assert.match(source, /Leroy Merlin, Plumblink, Chamberlains and Builders Warehouse have no verified public price feeds/);
});

test('every product has a status and a store search path for all five stores', () => {
    const source = read('price-check.js');
    assert.match(
        source,
        /SUPPLIERS\.forEach\(function \(store\)/,
        'the product rows do not iterate over every store'
    );
    assert.match(source, /No price recorded/, 'missing store prices are not clearly labelled');
    assert.match(
        source,
        /value\.append\(storeLink\(store\.key, product\.description, "Search store/,
        'a product/store cell has no link to check the store'
    );
    assert.equal(SUPPLIERS.length, 5);
    assert.ok(CATALOGUE.length > 0);
});
// ---------------------------------------------------------------------------
// Responsive markup: the phone layout is pure CSS, and it reads the
// data-label a cell carries. If a cell loses that attribute the row
// still renders on a laptop and silently loses its labels on a phone,
// which is exactly the kind of breakage a screenshot of a desktop
// browser never shows.
// ---------------------------------------------------------------------------

test('every price cell carries the store name it will be labelled with on a phone', () => {
    const source = read('price-check.js');
    assert.match(
        source,
        /cell\.dataset\.label\s*=\s*store\.name/,
        'a store price cell has no data-label, so the stacked phone row would lose its store name'
    );
});

test('the best-price cell carries its own label', () => {
    assert.match(
        read('price-check.js'),
        /bestCell\.dataset\.label\s*=\s*"Best price"/,
        'the best-price cell has no data-label'
    );
});

test('the stylesheet switches the table into cards on a phone', () => {
    const css = read('styles.css');
    /*
       Below the breakpoint the table stops being a table: the header
       row is dropped and each row is painted as a card, with the
       store name coming from data-label. Without these the page
       scrolls sideways again and the store names go off screen with
       the prices they belong to.
    */
    assert.match(css, /@media \(max-width: 760px\)/, 'no phone breakpoint for the price table');
    assert.match(css, /\.price-table thead \{ display: none; \}/, 'the table header is not dropped on a phone');
    assert.match(css, /content: attr\(data-label\)/, 'the stacked row does not print its store label');
});

test('a store price and its label stay on one line on a phone', () => {
    const css = read('styles.css');
    const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
    assert.match(
        phone,
        /td\.price-cell\s*\{[\s\S]{0,200}display:\s*flex/,
        'store cells do not flex into a label/figure line on a phone'
    );
    assert.match(
        phone,
        /justify-content:\s*space-between/,
        'the store label and its price are not pushed to opposite ends of the line'
    );
});

test('the shopping list controls stay reachable on a phone', () => {
    const css = read('styles.css');
    const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
    /* The quantity and remove controls move to their own row so the
       product description is never squeezed to nothing by them. */
    assert.match(phone, /grid-template-areas:/, 'the shopping line does not reflow on a phone');
    assert.match(phone, /"tick name price"/, 'the shopping line lost its first row');
    assert.match(phone, /"tick qty remove"/, 'the shopping line lost its control row');
});

test('the price check is compacted rather than left at the app default', () => {
    const css = read('styles.css');
    /* A page of tables does not need the dashboard's airy spacing. */
    assert.match(css, /#pricecheck-view \.page-header \{ margin-bottom: 14px; \}/);
    assert.match(css, /#pricecheck-view \.section-card \{ padding: 14px; margin-bottom: 12px; \}/);
});
test('the nav bar wraps and every tab stays reachable', () => {
    const css = read('styles.css');
    /*
       With eight tabs the bar overflowed at tablet widths, which hid
       "Quotes" and "Price Check" behind a sideways scroll with nothing
       to say they were there. The base rule wraps instead.
    */
    const base = css.slice(css.indexOf('.main-navigation {'), css.indexOf('.nav-button {'));
    assert.match(base, /flex-wrap:\s*wrap/, 'the nav bar does not wrap, so tabs can hide behind a scroll');
    assert.doesNotMatch(base, /overflow-x:\s*auto/, 'the nav bar still scrolls sideways');
});

test('the longest nav tabs carry a short label for a narrow screen', () => {
    const html = read('index.html');
    /*
       "Productivity" and "Price Check" cannot fit eight ways on a
       small phone. They clip to a fragment, which stops being a word -
       so they carry a shorter label the stylesheet swaps in. The
       button keeps its full aria-label for a screen reader.
    */
    for (const [view, full, short] of [
        ['dashboard', 'Dashboard', 'Home'],
        ['productivity', 'Productivity', 'Stats'],
        ['pricecheck', 'Price Check', 'Prices']
    ]) {
        const button = html.slice(
            html.indexOf(`data-view="${view}"`),
            html.indexOf('</button>', html.indexOf(`data-view="${view}"`))
        );
        assert.match(button, new RegExp(`aria-label="${full}"`), `${view} lost its full accessible name`);
        assert.match(button, new RegExp(`data-short="${short}"`), `${view} has no short label`);
    }

    const css = read('styles.css');
    assert.match(css, /\.nav-label\[data-short\]::after\s*\{[^}]*content:\s*attr\(data-short\)/);
});
