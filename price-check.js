/* =========================================================
   PRICE CHECK
   ---------------------------------------------------------
   Compare what a product costs at each of the five stores the
   company actually buys from, then keep a shopping list of the
   lines worth buying.

   WHY IT IS SEPARATE FROM THE QUOTE BUILDER
   -----------------------------------------
   The quoting apps already hold a catalogue and price a material
   against it, but that price exists to build a QUOTE: it is rolled
   into a total, marked up and printed for a customer. What the
   office asks far more often is a smaller, duller question -
   "what does a 110mm pipe cost this week, and where is it
   cheapest?" - and that has nowhere to live today. Opening a
   throwaway quote to answer it would either save junk into the
   quote book or lose the answer on reload.

   So this is a read-and-compare tool with its own storage. It
   never touches a quote, a project or an invoice.

   THE REFERENCE CATALOGUE IS LOCAL, DELIBERATELY
   ----------------------------------------------
   The cross-store table is a small editable reference list, not
   each retailer's full catalogue. Bathroom Bizaar has a public
   WooCommerce product API, which the user can explicitly refresh.
   No public price feed has been verified for the other four
   retailers, so their figures stay manually maintained.

   The view remains useful offline: saved prices and favourites
   load locally, while a refresh reports which online prices could
   actually be checked. Each row carries `checked`, and editing a
   price locally stamps today's date.
   ========================================================= */

"use strict";

(function (root) {

    /*
       The five stores, in the order the office names them.

       `key` is what appears in data-supplier attributes and in
       storage; `name` is what a human reads. `url` is the store's
       own product search for the current query, so a row always
       offers a way to check the figure at the source.
    */
    var SUPPLIERS = [
        { key: "leroymerlin", name: "Leroy Merlin", url: "https://leroymerlin.co.za/search?q=" },
        { key: "plumblink", name: "Plumblink", url: "https://www.plumblink.co.za/search?q=" },
        { key: "chamberlains", name: "Chamberlains", url: "https://www.chamberlains.co.za/search?q=" },
        { key: "bathroombizaar", name: "Bathroom Bizaar", url: "https://bathroom.co.za/search?q=" },
        { key: "builders", name: "Builders Warehouse", url: "https://www.builders.co.za/search?q=" }
    ];

    /*
       The catalogue.

       One entry per product, with a captured price per store.
       Missing prices mean there is no saved figure for that store;
       the store search link lets the buyer check its current listing.

       Prices are captured reference figures in Rand, ex VAT, and
       are editable in the UI. `checked` is the date they were
       captured.
    */
    var CHECKED_DEFAULT = "2026-10-14";

    var CATALOGUE = [
        {
            category: "Pipes & fittings",
            description: "PVC pressure pipe - 110mm x 6m",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 349, plumblink: 329, builders: 359 }
        },
        {
            category: "Pipes & fittings",
            description: "PVC pressure pipe - 50mm x 6m",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 199, plumblink: 205, builders: 195 }
        },
        {
            category: "Pipes & fittings",
            description: "HDPE drainage pipe - 110mm x 5m",
            checked: CHECKED_DEFAULT,
            prices: { plumblink: 349, builders: 379 }
        },
        {
            category: "Pipes & fittings",
            description: "Copper pipe - 15mm x 5.5m",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 449, plumblink: 419, builders: 445 }
        },
        {
            category: "Pipes & fittings",
            description: "Copper elbow - 15mm",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 7.5, plumblink: 6, builders: 6 }
        },
        {
            category: "Pipes & fittings",
            description: "Plumbing tape PTFE - 12mm x 7m",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 19.9, plumblink: 24.5, builders: 21.9, chamberlains: 18.9 }
        },
        {
            category: "Pipes & fittings",
            description: "PVC coupling - 110mm",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 34.9, plumblink: 29.9, builders: 32.5 }
        },
        {
            category: "Water heating",
            description: "Geyser - 150L",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 4599, plumblink: 4299, builders: 4699 }
        },
        {
            category: "Water heating",
            description: "Geyser installation kit - Standard",
            checked: CHECKED_DEFAULT,
            prices: { plumblink: 950, builders: 1099 }
        },
        {
            category: "Sanitary ware",
            description: "Toilet - Standard",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 1699, plumblink: 1589, builders: 1589, bathroombizaar: 1999 }
        },
        {
            category: "Sanitary ware",
            description: "Basin - Standard",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 899, builders: 899, bathroombizaar: 995 }
        },
        {
            category: "Sanitary ware",
            description: "Shower screen - 900 x 2000mm",
            checked: CHECKED_DEFAULT,
            prices: { bathroombizaar: 2295, builders: 2499 }
        },
        {
            category: "Sanitary ware",
            description: "Vanity cabinet - 600mm",
            checked: CHECKED_DEFAULT,
            prices: { bathroombizaar: 3195, builders: 2899, leroymerlin: 2999 }
        },
        {
            category: "Taps & mixers",
            description: "Basin mixer - 15mm",
            checked: CHECKED_DEFAULT,
            prices: { plumblink: 2199, bathroombizaar: 2205.75, builders: 2399 }
        },
        {
            category: "Taps & mixers",
            description: "Sink mixer - 15mm",
            checked: CHECKED_DEFAULT,
            prices: { bathroombizaar: 2205.75, builders: 2299 }
        },
        {
            category: "Building materials",
            description: "Cement - 50kg PPC",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 122.9, chamberlains: 119.9, builders: 124.9 }
        },
        {
            category: "Building materials",
            description: "Cement stock brick - 7 MPa",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 3.49, chamberlains: 3.29, builders: 3.79 }
        },
        {
            category: "Building materials",
            description: "Cement block - M190 190 x 190 x 390mm",
            checked: CHECKED_DEFAULT,
            prices: { leroymerlin: 19.9, chamberlains: 18.5, builders: 20.9 }
        }
    ];

    var STORAGE_KEY = "aga_price_check_list";
    var OVERRIDES_KEY = "aga_price_check_overrides";
    var FAVORITES_KEY = "aga_price_check_favorites";
    var CUSTOM_ITEMS_KEY = "aga_price_check_custom_items";

    /* =========================================================
       MODEL - pure, no DOM. Everything below is testable in node.
       ========================================================= */

    function supplierByKey(key) {
        return SUPPLIERS.find(function (store) { return store.key === key; }) || null;
    }

    function supplierName(key) {
        var store = supplierByKey(key);
        return store ? store.name : "Reference price";
    }

    /*
       Normalise a stored/edited price: a positive finite number or
       nothing. A stray "" or "R 349" must not become NaN and win
       the "cheapest" comparison, which is exactly what a naive
       Math.min over parsed strings does.
    */
    function toPrice(value) {
        var number = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    /*
       The catalogue with the user's edits applied.

       Overrides are keyed by product description so a price the
       office corrected survives a reload, and so an edit to the
       built-in list does not need the list itself rewritten.
    */
    function applyOverrides(catalogue, overrides) {
        var edits = overrides || {};
        return catalogue.map(function (product) {
            var edited = edits[product.description];
            if (!edited) return product;
            var prices = {};
            Object.keys(product.prices).forEach(function (key) { prices[key] = product.prices[key]; });
            Object.keys(edited.prices || {}).forEach(function (key) {
                var price = toPrice(edited.prices[key]);
                if (price === null) delete prices[key];
                else prices[key] = price;
            });
            return {
                category: product.category,
                description: product.description,
                checked: edited.checked || product.checked,
                prices: prices
            };
        });
    }

    /*
       Record one store's price for one product.

       A cleared price is stored as an explicit null rather than by
       deleting the key: the override is merged ON TOP of the
       built-in prices, so a missing key would simply leave the
       original figure in place and the user's deletion would appear
       to do nothing. null is the instruction "remove this store".
    */
    function recordOverride(overrides, description, supplierKey, price, date) {
        var next = Object.assign({}, overrides || {});
        var entry = next[description] ? Object.assign({}, next[description]) : { prices: {} };
        entry.prices = Object.assign({}, entry.prices);
        entry.prices[supplierKey] = toPrice(price);
        entry.checked = date;
        next[description] = entry;
        return next;
    }

    /*
       What each store charges for one product, cheapest first.

       Stores without a saved usable price are omitted from the
       ranking, but remain visible in the comparison table.
    */
    function pricesFor(product) {
        return SUPPLIERS.map(function (store) {
            return { supplier: store.key, name: store.name, price: toPrice(product.prices[store.key]) };
        }).filter(function (row) { return row.price !== null; })
            .sort(function (a, b) { return a.price - b.price; });
    }

    /*
       The cheapest store for a product, with every store that ties
       on that price - a quote must not name one shop when two are
       the same price, because the buyer may be standing in either.
    */
    function bestPrice(product) {
        var rows = pricesFor(product);
        if (!rows.length) return { price: null, suppliers: [] };
        var price = rows[0].price;
        return {
            price: price,
            suppliers: rows.filter(function (row) { return row.price === price; }).map(function (row) { return row.supplier; })
        };
    }

    function search(catalogue, query) {
        var needle = String(query || "").trim().toLowerCase();
        if (!needle) return catalogue.slice();
        return catalogue.filter(function (product) {
            return (product.description + " " + product.category).toLowerCase().indexOf(needle) > -1;
        });
    }

    /* Group the rows by category, preserving the catalogue order. */
    function groupByCategory(products) {
        var order = [];
        var groups = {};
        products.forEach(function (product) {
            if (!groups[product.category]) {
                groups[product.category] = [];
                order.push(product.category);
            }
            groups[product.category].push(product);
        });
        return order.map(function (category) { return { category: category, products: groups[category] }; });
    }

    function toggleFavorite(favorites, description) {
        var next = Array.isArray(favorites) ? favorites.filter(function (item) { return typeof item === "string"; }) : [];
        return next.indexOf(description) === -1
            ? next.concat(description)
            : next.filter(function (item) { return item !== description; });
    }

    function addCustomItem(items, description, category, checked) {
        var name = String(description || "").trim();
        if (!name) return { items: Array.isArray(items) ? items : [], added: false };
        var current = Array.isArray(items) ? items : [];
        if (current.some(function (item) {
            return item && typeof item.description === "string" &&
                item.description.toLowerCase() === name.toLowerCase();
        })) {
            return { items: current, added: false };
        }
        return {
            items: current.concat({
                category: String(category || "").trim() || "My items",
                description: name,
                checked: checked,
                prices: {}
            }),
            added: true
        };
    }

    /* =========================================================
       SHOPPING LIST - pure model
       ========================================================= */

    function normaliseList(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(function (line) {
            return line && typeof line === "object" && typeof line.description === "string" && line.description;
        }).map(function (line) {
            return {
                description: line.description,
                category: String(line.category || ""),
                supplier: String(line.supplier || ""),
                price: toPrice(line.price) || 0,
                quantity: Math.max(1, Math.floor(Number(line.quantity)) || 1),
                done: Boolean(line.done)
            };
        });
    }

    /*
       Adding the same product twice increases the quantity rather
       than appending a duplicate line: a shopping list with two
       "Geyser - 150L" rows is a list the buyer has to add up by
       hand, which is the job the list exists to avoid.
    */
    function addLine(list, product, supplierKey, quantity) {
        var lines = normaliseList(list);
        var best = supplierKey ? { supplier: supplierKey, price: toPrice(product.prices[supplierKey]) } : null;
        var chosen = best && best.price !== null ? best : (function () {
            var top = bestPrice(product);
            return { supplier: top.suppliers[0] || "", price: top.price || 0 };
        })();
        var description = product.description;
        var existing = lines.find(function (line) { return line.description === description; });
        if (existing) {
            existing.quantity += Math.max(1, Math.floor(Number(quantity)) || 1);
            return lines;
        }
        lines.push({
            description: description,
            category: product.category,
            supplier: chosen.supplier,
            price: chosen.price || 0,
            quantity: Math.max(1, Math.floor(Number(quantity)) || 1),
            done: false
        });
        return lines;
    }

    function removeLine(list, description) {
        return normaliseList(list).filter(function (line) { return line.description !== description; });
    }

    function setQuantity(list, description, quantity) {
        return normaliseList(list).map(function (line) {
            if (line.description !== description) return line;
            return Object.assign({}, line, { quantity: Math.max(1, Math.floor(Number(quantity)) || 1) });
        });
    }

    function toggleDone(list, description) {
        return normaliseList(list).map(function (line) {
            if (line.description !== description) return line;
            return Object.assign({}, line, { done: !line.done });
        });
    }

    /*
       The running total for the list: what is left to buy, priced
       at the store chosen for each line. Tick-off lines are
       excluded, because the total is the answer to "what will this
       cost me now".
    */
    function listTotal(list) {
        return normaliseList(list).filter(function (line) { return !line.done; })
            .reduce(function (sum, line) { return sum + line.price * line.quantity; }, 0);
    }

    /*
       Buy the same line from two stores: split the list by store so
       the buyer walks into each shop with its own sheet.
    */
    function groupListBySupplier(list) {
        var order = [];
        var groups = {};
        normaliseList(list).forEach(function (line) {
            var key = line.supplier || "";
            if (!groups[key]) {
                groups[key] = [];
                order.push(key);
            }
            groups[key].push(line);
        });
        return order.map(function (key) {
            var lines = groups[key];
            return {
                supplier: key,
                name: supplierName(key),
                lines: lines,
                total: lines.filter(function (line) { return !line.done; })
                    .reduce(function (sum, line) { return sum + line.price * line.quantity; }, 0)
            };
        });
    }

    var model = {
        SUPPLIERS: SUPPLIERS,
        CATALOGUE: CATALOGUE,
        supplierName: supplierName,
        supplierByKey: supplierByKey,
        toPrice: toPrice,
        applyOverrides: applyOverrides,
        recordOverride: recordOverride,
        pricesFor: pricesFor,
        bestPrice: bestPrice,
        search: search,
        groupByCategory: groupByCategory,
        toggleFavorite: toggleFavorite,
        addCustomItem: addCustomItem,
        normaliseList: normaliseList,
        addLine: addLine,
        removeLine: removeLine,
        setQuantity: setQuantity,
        toggleDone: toggleDone,
        listTotal: listTotal,
        groupListBySupplier: groupListBySupplier
    };

    if (typeof module !== "undefined" && module.exports) module.exports = model;

    if (!root || !root.document) return;

    /* =========================================================
       VIEW
       ========================================================= */

    var doc = root.document;
    var el = function (id) { return doc.getElementById(id); };

    var money = function (value) {
        return "R" + (Number(value) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    };

    var today = function () {
        var date = new Date();
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    };

    function readJSON(key, fallback) {
        try {
            var value = JSON.parse(root.localStorage.getItem(key) || "null");
            return value === null ? fallback : value;
        } catch (_) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            root.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error("Could not save local price-check data:", error);
            return false;
        }
    }

    function currentCatalogue() {
        var customItems = readJSON(CUSTOM_ITEMS_KEY, []);
        if (!Array.isArray(customItems)) customItems = [];
        return applyOverrides(CATALOGUE.concat(customItems), readJSON(OVERRIDES_KEY, {}));
    }

    function currentFavorites() {
        var favorites = readJSON(FAVORITES_KEY, []);
        return Array.isArray(favorites) ? favorites.filter(function (item) { return typeof item === "string"; }) : [];
    }

    function currentList() {
        return normaliseList(readJSON(STORAGE_KEY, []));
    }

    function saveList(lines) {
        writeJSON(STORAGE_KEY, lines);
    }

    function normaliseProductName(value) {
        return String(value || "").normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    async function refreshPrices() {
        var button = el("priceCheckRefreshButton");
        var status = el("priceCheckRefreshStatus");
        if (!button || !status || button.disabled) return;

        var products = currentCatalogue();
        var overrides = readJSON(OVERRIDES_KEY, {});
        var updated = 0;
        var unmatched = 0;
        var ambiguous = 0;
        var errors = [];
        var nextIndex = 0;
        var refreshDate = today();

        button.disabled = true;
        status.textContent = "Refreshing Bathroom Bizaar prices for " + products.length +
            " listed products. Prices from the other stores will remain unchanged.";

        async function refreshNext() {
            while (nextIndex < products.length) {
                var product = products[nextIndex++];
                try {
                    var response = await root.fetch("/api/price-check-refresh?search=" + encodeURIComponent(product.description), {
                        headers: { Accept: "application/json" },
                        cache: "no-store"
                    });
                    var result = await response.json();
                    if (!response.ok) {
                        throw new Error(result && result.error || "HTTP " + response.status);
                    }
                    if (!Array.isArray(result)) {
                        throw new Error("The price service returned an invalid product list.");
                    }

                    var expectedName = normaliseProductName(product.description);
                    var exactMatches = result.filter(function (candidate) {
                        return candidate && candidate.currency === "ZAR" &&
                            normaliseProductName(candidate.name) === expectedName &&
                            toPrice(candidate.price) !== null;
                    });
                    if (!exactMatches.length) {
                        unmatched++;
                        continue;
                    }
                    if (exactMatches.length !== 1) {
                        ambiguous++;
                        continue;
                    }
                    overrides = recordOverride(
                        overrides,
                        product.description,
                        "bathroombizaar",
                        exactMatches[0].price,
                        refreshDate
                    );
                    updated++;
                } catch (error) {
                    errors.push(product.description + ": " + error.message);
                    console.error("Could not refresh Bathroom Bizaar price for " + product.description + ":", error);
                }
            }
        }

        try {
            await Promise.all([refreshNext(), refreshNext(), refreshNext()]);
            if (updated && !writeJSON(OVERRIDES_KEY, overrides)) {
                status.textContent = "Prices were fetched, but this browser could not save them. Existing prices were left unchanged.";
                return;
            }
            if (updated) renderTable();

            var summary = "Bathroom Bizaar: updated " + updated + " of " + products.length +
                " listed products; " + unmatched + " had no exact product-name match";
            if (ambiguous) summary += "; " + ambiguous + " had multiple exact matches";
            if (errors.length) summary += "; " + errors.length + " could not be checked (" + errors[0] + ")";
            status.textContent = summary + ". Leroy Merlin, Plumblink, Chamberlains and Builders Warehouse have no verified public price feeds, so their saved prices were left unchanged.";
        } finally {
            button.disabled = false;
        }
    }

    function node(tag, className, value) {
        var element = doc.createElement(tag);
        if (className) element.className = className;
        if (value !== undefined) element.textContent = value;
        return element;
    }

    /* The store's own search, so a figure can be checked at source. */
    function storeLink(key, query, label) {
        var store = supplierByKey(key);
        if (!store) return null;
        var link = doc.createElement("a");
        link.href = store.url + encodeURIComponent(query);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "price-store-link";
        link.textContent = label || "Open ↗";
        return link;
    }

    function renderTable() {
        var body = el("priceCheckBody");
        if (!body) return;

        var query = el("priceCheckSearch") ? el("priceCheckSearch").value : "";
        var products = search(currentCatalogue(), query);
        if (el("priceCheckFavoritesOnly") && el("priceCheckFavoritesOnly").checked) {
            var favorites = currentFavorites();
            products = products.filter(function (product) { return favorites.indexOf(product.description) !== -1; });
        }
        body.replaceChildren();

        if (!products.length) {
            body.append(node("tr", "price-empty-row"));
            body.lastChild.append(node("td", "price-empty", el("priceCheckFavoritesOnly") && el("priceCheckFavoritesOnly").checked
                ? "No favourites match. Add an item or star one from the table."
                : "No product matches that search."));
            body.lastChild.firstChild.colSpan = SUPPLIERS.length + 3;
            return;
        }

        var favorites = currentFavorites();
        groupByCategory(products).forEach(function (group) {
            var heading = node("tr", "price-group");
            var cell = node("th", null, group.category);
            cell.colSpan = SUPPLIERS.length + 3;
            heading.append(cell);
            body.append(heading);

            group.products.forEach(function (product) {
                var row = node("tr", "price-row");
                if (product.checked && product.checked < today()) row.classList.add("price-stale");

                var name = node("td", "price-name");
                var nameHeading = node("div", "price-name-heading");
                nameHeading.append(node("strong", null, product.description));
                var favorite = node("button", "price-favorite-button" + (favorites.indexOf(product.description) !== -1 ? " is-favorite" : ""),
                    favorites.indexOf(product.description) !== -1 ? "★" : "☆");
                favorite.type = "button";
                favorite.dataset.favorite = product.description;
                favorite.setAttribute("aria-pressed", String(favorites.indexOf(product.description) !== -1));
                favorite.setAttribute("aria-label", (favorites.indexOf(product.description) !== -1 ? "Remove " : "Add ") + product.description + (favorites.indexOf(product.description) !== -1 ? " from" : " to") + " favourites");
                nameHeading.append(favorite);
                name.append(nameHeading);
                name.append(node("small", "price-checked", "Checked " + (product.checked || "—")));
                row.append(name);

                /*
                   data-label carries the column heading into the cell
                   so the mobile layout can stack each row into a card
                   without a second renderer: on a wide screen the table
                   header supplies the label, on a narrow one the cell
                   has to say what it is.
                */
                var best = bestPrice(product);
                SUPPLIERS.forEach(function (store) {
                    var price = toPrice(product.prices[store.key]);
                    var cell = node("td", "price-cell" + (price !== null && price === best.price ? " is-best" : ""));
                    cell.dataset.label = store.name;
                    var value = node("div", "price-cell-value");
                    var input = doc.createElement("input");
                    input.type = "text";
                    input.className = "price-input";
                    input.value = price === null ? "" : String(price);
                    input.placeholder = price === null ? "Add price" : "";
                    input.setAttribute("aria-label", store.name + " price for " + product.description);
                    input.dataset.description = product.description;
                    input.dataset.supplier = store.key;
                    value.append(input);
                    if (price === null) {
                        value.append(node("span", "price-none", "No price recorded"));
                    }
                    value.append(storeLink(store.key, product.description, "Search store ↗"));
                    cell.append(value);
                    row.append(cell);
                });

                var bestCell = node("td", "price-best");
                bestCell.dataset.label = "Best price";
                bestCell.append(node("span", null, best.price === null ? "No price" : money(best.price)));
                var bestStore = node("small", null, best.suppliers.length ? best.suppliers.map(supplierName).join(", ") : "—");
                bestCell.append(bestStore);
                if (best.suppliers.length) {
                    bestCell.append(storeLink(best.suppliers[0], product.description));
                }
                row.append(bestCell);

                var actions = node("td", "price-actions");
                var add = node("button", "secondary-button price-add-button", "Add to list");
                add.type = "button";
                add.dataset.description = product.description;
                add.dataset.supplier = best.suppliers[0] || "";
                actions.append(add);
                row.append(actions);

                body.append(row);
            });
        });
    }

    function renderList() {
        var host = el("priceCheckList");
        if (!host) return;

        var lines = currentList();
        host.replaceChildren();

        if (!lines.length) {
            host.append(node("p", "price-empty", "Nothing on the list yet. Add a product from Store prices below."));
            el("priceCheckTotal").textContent = money(0);
            return;
        }

        groupListBySupplier(lines).forEach(function (group) {
            var block = node("div", "shopping-group");
            var heading = node("div", "shopping-group-heading");
            heading.append(node("strong", null, group.name));
            heading.append(node("span", null, money(group.total)));
            block.append(heading);

            group.lines.forEach(function (line) {
                var row = node("div", "shopping-line" + (line.done ? " is-done" : ""));

                var tick = doc.createElement("input");
                tick.type = "checkbox";
                tick.checked = line.done;
                tick.dataset.done = line.description;
                tick.setAttribute("aria-label", "Mark " + line.description + " as bought");
                row.append(tick);

                var label = node("span", "shopping-description", line.description);
                row.append(label);

                var quantity = doc.createElement("input");
                quantity.type = "number";
                quantity.min = "1";
                quantity.step = "1";
                quantity.value = String(line.quantity);
                quantity.className = "shopping-quantity";
                quantity.dataset.quantity = line.description;
                quantity.setAttribute("aria-label", "Quantity for " + line.description);
                row.append(quantity);

                row.append(node("span", "shopping-price", money(line.price * line.quantity)));

                var remove = node("button", "shopping-remove", "✕");
                remove.type = "button";
                remove.dataset.remove = line.description;
                remove.setAttribute("aria-label", "Remove " + line.description + " from the list");
                row.append(remove);

                block.append(row);
            });

            host.append(block);
        });

        el("priceCheckTotal").textContent = money(listTotal(lines));
    }

    function render() {
        renderTable();
        renderList();
    }

    root.renderPriceCheck = render;

    function init() {
        var searchInput = el("priceCheckSearch");
        if (searchInput) searchInput.addEventListener("input", renderTable);
        var refreshButton = el("priceCheckRefreshButton");
        if (refreshButton) refreshButton.addEventListener("click", refreshPrices);
        var favoritesOnly = el("priceCheckFavoritesOnly");
        if (favoritesOnly) favoritesOnly.addEventListener("change", renderTable);

        var addFavoriteButton = el("priceCheckAddFavoriteButton");
        var favoriteDialog = el("priceCheckFavoriteDialog");
        var favoriteForm = el("priceCheckFavoriteForm");
        if (addFavoriteButton && favoriteDialog) {
            addFavoriteButton.addEventListener("click", function () {
                favoriteDialog.showModal();
                el("priceCheckFavoriteName").focus();
            });
        }
        if (favoriteForm) {
            favoriteForm.addEventListener("submit", function (event) {
                event.preventDefault();
                var result = addCustomItem(
                    readJSON(CUSTOM_ITEMS_KEY, []),
                    el("priceCheckFavoriteName").value,
                    el("priceCheckFavoriteCategory").value,
                    today()
                );
                if (!result.added) {
                    el("priceCheckFavoriteError").textContent = "Enter a new product name; that item may already be in the table.";
                    return;
                }
                var name = el("priceCheckFavoriteName").value.trim();
                var previousFavorites = currentFavorites();
                if (!writeJSON(FAVORITES_KEY, toggleFavorite(previousFavorites, name))) {
                    el("priceCheckFavoriteError").textContent = "This browser could not save the favourite. Check available storage and try again.";
                    return;
                }
                if (!writeJSON(CUSTOM_ITEMS_KEY, result.items)) {
                    writeJSON(FAVORITES_KEY, previousFavorites);
                    el("priceCheckFavoriteError").textContent = "This browser could not save the item. Check available storage and try again.";
                    return;
                }
                favoriteForm.reset();
                el("priceCheckFavoriteError").textContent = "";
                favoriteDialog.close();
                renderTable();
            });
        }
        var cancelFavoriteButton = el("priceCheckFavoriteCancelButton");
        if (cancelFavoriteButton && favoriteDialog) {
            cancelFavoriteButton.addEventListener("click", function () { favoriteDialog.close(); });
        }

        var addButton = el("priceCheckAddButton");
        if (addButton) {
            addButton.addEventListener("click", function () {
                var query = el("priceCheckSearch").value.trim().toLowerCase();
                if (!query) return;
                var match = currentCatalogue().find(function (product) {
                    return product.description.toLowerCase().indexOf(query) > -1;
                });
                if (!match) return;
                saveList(addLine(currentList(), match, "", 1));
                renderList();
            });
        }

        var clearButton = el("priceCheckClearButton");
        if (clearButton) {
            clearButton.addEventListener("click", function () {
                saveList([]);
                renderList();
            });
        }

        var printButton = el("priceCheckPrintButton");
        if (printButton) {
            printButton.addEventListener("click", function () { root.print(); });
        }

        /*
           One delegated handler for the whole view. The rows are
           rebuilt on every render, so per-element listeners would
           be re-bound a dozen times per keystroke and leak.
        */
        doc.addEventListener("change", function (event) {
            var target = event.target;

            if (target && target.dataset && target.dataset.done !== undefined) {
                saveList(toggleDone(currentList(), target.dataset.done));
                renderList();
                return;
            }

            if (target && target.dataset && target.dataset.quantity !== undefined) {
                saveList(setQuantity(currentList(), target.dataset.quantity, target.value));
                renderList();
                return;
            }

            if (target && target.dataset && target.dataset.description !== undefined) {
                var overrides = recordOverride(readJSON(OVERRIDES_KEY, {}), target.dataset.description, target.dataset.supplier, target.value, today());
                if (!writeJSON(OVERRIDES_KEY, overrides)) {
                    el("priceCheckRefreshStatus").textContent = "This browser could not save the edited price. The previous saved value was kept.";
                    return;
                }
                renderTable();
            }
        });

        doc.addEventListener("click", function (event) {
            var target = event.target && event.target.closest
                ? event.target.closest("[data-remove], [data-favorite], .price-add-button")
                : null;
            if (!target) return;

            if (target.dataset.favorite !== undefined) {
                if (!writeJSON(FAVORITES_KEY, toggleFavorite(currentFavorites(), target.dataset.favorite))) {
                    el("priceCheckRefreshStatus").textContent = "This browser could not save the favourite. Check available storage and try again.";
                    return;
                }
                renderTable();
                return;
            }

            if (target.dataset.remove !== undefined) {
                saveList(removeLine(currentList(), target.dataset.remove));
                renderList();
                return;
            }

            if (target.classList.contains("price-add-button")) {
                var product = currentCatalogue().find(function (item) { return item.description === target.dataset.description; });
                if (!product) return;
                saveList(addLine(currentList(), product, target.dataset.supplier, 1));
                renderList();
            }
        });

        render();
    }

    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
    else init();

})(typeof window !== "undefined" ? window : null);
