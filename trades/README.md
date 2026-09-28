# Trades

AGA is one application covering three trades. This folder holds the two
that are not the main app.

| Folder | Trade | What it is |
|---|---|---|
| *(the app root)* | Architectural Glass & Aluminium | The production tracker, measurement system and window quote builder. This is the app `index.html` loads. |
| `plumbing/` | Plumbing | The **APS** (Architectural Plumbing Services) quotation and pricing system: materials, labour, scenarios, suppliers and project planning. |
| `coatings/` | Construction | The **APC** (Architectural Performance Coatings) construction quotation system: coatings, handyman, building, electrical, plastering and construction site works. Works on the same basis as APS - quote a job, then plan it. |

## How they are connected

The header carries a trade switcher. Glass & Aluminium shows the production
app; choosing Plumbing or Coatings reveals a full-height panel with that
trade's app inside an `<iframe>`.

The frame is built the first time a trade is opened and then reused, so
switching back and forth does not reload the app or lose work in progress.

`trades.js` at the app root drives this. It hides the production navigation
and views while a quoting trade is open and restores them afterwards.

## Why an iframe, not a merge

Both quoting apps were built and tested standalone. Each brings its own
stylesheet, its own storage keys and hundreds of element ids, several of
which collide with ids in the production app (both have a view called
`quotes-view`, for example). Loading them into the same document would mean
renaming every id, rewriting their CSS so it cannot reach the production
screens, and re-testing a system that already works. An iframe gives each
app its own document, so nothing leaks either way.

## Editing a trade

Work on `plumbing/` and `coatings/` exactly as before. Each folder is a
complete app: open its `index.html` in a browser, or serve the folder
directly. Nothing in the production app depends on their internals.

Each folder keeps its own `.gitignore`, which blocks credentials and
recovery codes from ever being committed from inside a trade.

### What the two quoting apps share

APC works on the same basis as APS, so the two apps share their logic
and differ only in trade content:

| | Shared? |
|---|---|
| Quoting: lines, labour, materials, VAT, PDF | yes |
| Scenarios and the Price list | yes |
| Project planning: durations, auto-scheduler, timeline | yes |
| Stores, reference price catalogues and the best-price label | yes, **but each trade lists its own stores** |
| Working-day and date maths | yes, but **APS is a 7-hour day and APC is 8** |
| Per-task time table | **no** - plumbing jobs vs construction jobs |
| Work-sequence order | **no** - what follows what differs by trade |
| Cloud sync and sign-in | yes, each with its own project |

Both keep their own storage prefix, so nothing crosses over. The shared
parts are deliberately shared rather than copied: two copies of the
date maths would drift, and a quote would then be scheduled two
different ways depending on which trade opened it.

### Stores and the best price

Both apps price a material the same way. For every material row the
app collects the catalogue cost plus every store that lists the item,
takes the **lowest**, and shows that number together with the name of
the store it came from - `R 119,90 · Chamberlains` - so a figure on a
quote can always be traced back to a shop. The column is headed
"Best price (store)" in both apps.

The catalogue's own cost is filed against a `REFERENCE_SUPPLIER`, so
it too is attributed to a store rather than floating free: APS uses
`plumblink`, APC uses `builders`. Each trade lists the stores that
sell what it buys:

| Store | APS (plumbing) | APC (construction) |
|---|---|---|
| Leroy Merlin | yes | yes |
| Plumblink | yes | - |
| Builders | yes | yes |
| Bathroom Bizarre | yes | - |
| Chamberlains | - | yes |
| Build it | - | yes |

Leroy Merlin, https://leroymerlin.co.za/, stocks both plumbing (pipes,
geysers, taps) and building supplies (cement, bricks, blocks), which is
why it appears in both lists. Its reference prices here are starting
points taken from the store's own catalogue, not live prices; the
"Check prices now" control is where live figures are set.

### Brand marks

Each trade has its own logo, and the file type must match the bytes:

- `plumbing/APSlogo.png` - **PNG** (blue, the plumbing mark)
- `coatings/APClogo.jpg` - **JPEG** (navy, the construction mark)

The two trades shared one file until the APC branding was settled, which
meant the plumbing app displayed the coatings brand. Serving PNG bytes
under a `.jpg` name is a second trap: the service worker caches them as
`image/jpeg` and the image renders broken. `tools/trades.test.js` checks
both the filename and the magic bytes, so a swap fails the suite.

## Storage

Each app keeps its data under its own keys, so the three trades do not
overwrite one another:

- Glass & Aluminium - `aga_*`
- Plumbing (APS) - `pipewise-*`
- Construction (APC) - `apc-*`

The prefixes must stay distinct. AGA serves all three trades from one
origin, so a shared prefix would let one trade read and overwrite
another's saved quotes and company settings.

## Tests

`tools/trades.test.js` asserts the wiring between the switcher and these
folders. `tools/qa-trades.mjs` drives the real switcher in a browser and
reports what each trade rendered.