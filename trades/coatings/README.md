# APC Architectural Performance Coatings — Quotation & Pricing System
A quotation system for **Architectural Performance Coatings**, who also take on handyman, building and electrical work, and run **construction site works** as a general building contractor.

### Trades covered
* Architectural performance coatings
* General handyman work and small repairs
* Electrical work (plug points, lights, fault finding, COC testing)
* Building work (brickwork, walls, slabs, doorways, ceilings)
* Plastering & skimming
* Plumbing, drainage, geysers and excavation
### Construction site works
* Site establishment, hoarding, access and demobilisation
* Demolition, soft strip-out and structural breaking
* Structural concrete: footings, columns, suspended slabs, retaining structures
* Formwork and reinforcement (props, shutterply, rebar, mesh)
* Roofing and waterproofing (trusses, sheeting, tiling, torch-on)
* Plant and equipment hire (excavators, TLB, cranes, pumps, compactors)
* Site services and preliminaries (supervision, setting out, waste, standing time)
* Wet trades and tiling, and hard landscaping (kerbs, paving, retaining walls)
### Features
* Predefined services and job scenarios across all trades
* Automatic line items for common jobs
* Editable quantities and prices
* Labour, materials, equipment and site work costs
* Remove or add items as required
* Automatic quotation calculations
* Professional quotation generation
### Purpose
Make quotations **faster, easier and more consistent**.

### Run On This PC

Open `index.html` in a browser for offline use, or serve this folder through any static web server.

### Publish To The Web

Within AGA this app is not published on its own. It is served from the AGA
site at `trades/coatings/` and opened by the trade switcher, alongside the
Glass & Aluminium app and the plumbing (APS) app.

### Storage keys

Local data is stored under `apc-*` keys.

An earlier standalone copy of this app shared its storage with the plumbing
app (both used `pipewise-*`). That migration has been removed on purpose:
AGA serves all three trades from ONE origin, so copying those keys here
would have pulled the plumber's saved quotes and company settings into this
trade the first time it was opened. Each trade owning a distinct prefix is
what keeps them apart.
