/*
   Netlify function: catalogue
   Reachable at /.netlify/functions/catalogue, rewritten from
   /api/catalogue by netlify.toml.

   The AGA shop (agasouthafrica.co.za) does not send an
   Access-Control-Allow-Origin header, so a browser sitting on any
   other domain cannot read its catalogue directly - the request is
   blocked before the quote builder ever sees a price.

   This function asks the shop from the server side, where the
   same-origin policy does not apply, and hands the JSON straight
   back to the page. It is the same endpoint the shop's own
   storefront uses:

     https://agasouthafrica.co.za/wp-json/wc/store/v1/products

   It is a read-only pass-through of the shop's public catalogue and
   takes no credentials from the caller.
*/

const CATALOGUE_URL =
    "https://agasouthafrica.co.za/wp-json/wc/store/v1/products?per_page=100";

exports.handler = async () => {
    try {
        const response = await fetch(CATALOGUE_URL, {
            headers: {
                Accept: "application/json",
                "User-Agent": "AGA-Quote-Builder/1.0"
            }
        });

        if (!response.ok) {
            return {
                statusCode: 502,
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({
                    error: "The AGA shop returned HTTP " + response.status + "."
                })
            };
        }

        const body = await response.text();

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                /* Prices change rarely; a short cache keeps the
                   button responsive without going stale. */
                "Cache-Control": "public, max-age=300",
                "X-Catalogue-Source": "agasouthafrica.co.za"
            },
            body: body
        };
    } catch (error) {
        return {
            statusCode: 502,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ error: error.message })
        };
    }
};
