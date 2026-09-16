// Minimal static file server for previewing AGA locally.
// Serves the project folder on http://127.0.0.1:8800/
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8800;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

// ---------------------------------------------------------------------------
// Catalogue proxy
//
// The AGA shop sits behind LiteSpeed and does not send
// Access-Control-Allow-Origin for cross-origin requests, so the quote
// builder cannot read the shop catalogue directly from a page served on a
// different origin. This route asks the shop server-side - where the browser
// same-origin policy does not apply - and hands the JSON back.
//
// It is a read-only pass-through of the shop's own public catalogue and takes
// no credentials from the request.
// ---------------------------------------------------------------------------
const CATALOGUE_URL =
    'https://agasouthafrica.co.za/wp-json/wc/store/v1/products?per_page=100';

function proxyCatalogue(res) {
    const upstream = https.get(
        CATALOGUE_URL,
        { headers: { Accept: 'application/json', 'User-Agent': 'AGA-Quote-Builder/1.0' } },
        shopRes => {
            let body = '';
            shopRes.setEncoding('utf8');
            shopRes.on('data', chunk => (body += chunk));
            shopRes.on('end', () => {
                res.writeHead(shopRes.statusCode === 200 ? 200 : 502, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'X-Catalogue-Source': 'agasouthafrica.co.za',
                });
                res.end(shopRes.statusCode === 200 ? body : JSON.stringify({ error: 'upstream ' + shopRes.statusCode }));
            });
        }
    );

    upstream.setTimeout(20000, () => upstream.destroy(new Error('timeout')));

    upstream.on('error', error => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error.message }));
    });
}

http.createServer((req, res) => {
    const requestPath = req.url.split('?')[0];

    if (requestPath === '/api/catalogue') {
        return proxyCatalogue(res);
    }

    // The production / new-project email endpoint is a Netlify function.
    // There is no mailer when previewing locally, so answer clearly and
    // let the app carry on - the same graceful "no backend" path it takes
    // on a static host.
    if (requestPath === '/api/send-production-email') {
        res.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
            success: false,
            message: 'Email is not configured in local preview.',
        }));
    }

    let urlPath = decodeURIComponent(requestPath);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found: ' + urlPath);
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, '127.0.0.1', () => {
    console.log(`AGA preview server running at http://127.0.0.1:${PORT}/`);
});
