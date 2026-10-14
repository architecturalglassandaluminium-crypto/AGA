const PRODUCTS_URL = "https://bathroom.co.za/wp-json/wc/store/v1/products";
const RESULT_LIMIT = 20;

function respond(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        },
        body: JSON.stringify(body)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod && event.httpMethod !== "GET") {
        return respond(405, { error: "Only GET requests are supported." });
    }

    const search = String(event.queryStringParameters && event.queryStringParameters.search || "").trim();
    if (!search || search.length > 160) {
        return respond(400, { error: "Provide a product name up to 160 characters." });
    }

    const url = new URL(PRODUCTS_URL);
    url.searchParams.set("search", search);
    url.searchParams.set("per_page", String(RESULT_LIMIT));

    try {
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": "AGA-Price-Check/1.0"
            },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            return respond(502, { error: "Bathroom Bizaar returned HTTP " + response.status + "." });
        }

        const products = await response.json();
        if (!Array.isArray(products)) {
            return respond(502, { error: "Bathroom Bizaar returned an invalid product list." });
        }

        return respond(200, products.map((product) => {
            const priceData = product && product.prices || {};
            const minorUnit = Number(priceData.currency_minor_unit);
            const minorPrice = Number(priceData.price);
            return {
                name: String(product && product.name || ""),
                sku: String(product && product.sku || ""),
                permalink: String(product && product.permalink || ""),
                currency: String(priceData.currency_code || ""),
                price: Number.isFinite(minorPrice) && Number.isInteger(minorUnit) && minorUnit >= 0
                    ? minorPrice / Math.pow(10, minorUnit)
                    : null,
                inStock: Boolean(product && product.is_in_stock)
            };
        }));
    } catch (error) {
        return respond(502, {
            error: error && error.name === "TimeoutError"
                ? "Bathroom Bizaar did not respond within 10 seconds."
                : "Could not refresh Bathroom Bizaar prices: " + (error && error.message || "unknown network error")
        });
    }
};
