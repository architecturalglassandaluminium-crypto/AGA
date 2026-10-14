'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../netlify/functions/price-check-refresh');

test('refresh endpoint rejects blank and oversized product names', async () => {
    const blank = await handler({ queryStringParameters: { search: '  ' } });
    const long = await handler({ queryStringParameters: { search: 'x'.repeat(161) } });
    assert.equal(blank.statusCode, 400);
    assert.equal(long.statusCode, 400);
});

test('refresh endpoint only permits GET requests', async () => {
    const response = await handler({ httpMethod: 'POST', queryStringParameters: { search: 'basin' } });
    assert.equal(response.statusCode, 405);
});

test('refresh endpoint normalises the public WooCommerce price response', async t => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });

    let requestedUrl;
    global.fetch = async (url, options) => {
        requestedUrl = new URL(url);
        assert.match(options.headers.Accept, /application\/json/);
        return {
            ok: true,
            json: async () => [{
                name: 'Troye Basin',
                sku: 'E0000216',
                permalink: 'https://bathroom.co.za/product/troye-basin/',
                prices: { price: '99500', currency_code: 'ZAR', currency_minor_unit: 2 },
                is_in_stock: true
            }]
        };
    };

    const response = await handler({ queryStringParameters: { search: 'Troye Basin' } });
    assert.equal(response.statusCode, 200);
    assert.equal(requestedUrl.origin + requestedUrl.pathname, 'https://bathroom.co.za/wp-json/wc/store/v1/products');
    assert.equal(requestedUrl.searchParams.get('search'), 'Troye Basin');
    assert.equal(requestedUrl.searchParams.get('per_page'), '20');
    assert.deepEqual(JSON.parse(response.body), [{
        name: 'Troye Basin',
        sku: 'E0000216',
        permalink: 'https://bathroom.co.za/product/troye-basin/',
        currency: 'ZAR',
        price: 995,
        inStock: true
    }]);
});

test('refresh endpoint reports an upstream failure instead of returning success-shaped data', async t => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => ({ ok: false, status: 503 });

    const response = await handler({ queryStringParameters: { search: 'copper pipe' } });
    assert.equal(response.statusCode, 502);
    assert.match(JSON.parse(response.body).error, /HTTP 503/);
});

test('refresh route is wired for Netlify and local preview', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve(__dirname, '..');
    assert.match(fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8'), /\/api\/price-check-refresh/);
    assert.match(fs.readFileSync(path.join(root, 'preview-server.js'), 'utf8'), /priceCheckRefresh\.handler/);
});
