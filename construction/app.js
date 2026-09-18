/* =========================================================
   STORAGE KEYS
   ---------------------------------------------------------
   The business was previously quoted under a different name,
   so the old keys were prefixed "pipewise-". migrateLegacyStorage()
   copies anything found under an old key to its new key ONCE, so
   saved quotes, settings and price lists carry over to the new
   company instead of silently disappearing.
   ========================================================= */
const STORAGE_PREFIX = 'apc-';
const LEGACY_PREFIX = 'pipewise-';

function migrateLegacyStorage() {
    try {
        Object.keys(localStorage).forEach(key => {
            if (!key.startsWith(LEGACY_PREFIX)) return;
            const newKey = STORAGE_PREFIX + key.slice(LEGACY_PREFIX.length);
            if (localStorage.getItem(newKey) === null) {
                localStorage.setItem(newKey, localStorage.getItem(key));
            }
        });
    } catch {
        /* Private mode or a full quota: start clean rather than break the app. */
    }
}

function storageKey(name) {
    return STORAGE_PREFIX + name;
}

migrateLegacyStorage();

const VAT_DEFAULT = 15;
const MATERIAL_MARKUP = 45;
let selectedSupplier = 'builders';
const currency = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value) || 0);
const $ = id => document.getElementById(id);
let materials = [];
let services = [];
let sitePhotos = [];
let loadedQuoteIndex = null;
let isAmended = false;
const defaultLabourItems = () => [
    { description: 'Call-out fee', unit: 'Each', quantity: 1, rate: 650, type: 'callout' },
    { description: 'Inspection & evaluation', unit: 'Day', quantity: 0, rate: 500, type: 'labour' },
    { description: 'Additional labour', unit: 'Day', quantity: 0, rate: 500, type: 'labour' }
];
let labourItems = defaultLabourItems();
let importedServiceRates = {};
let settings = JSON.parse(localStorage.getItem(storageKey('settings')) || '{}');
settings.name ||= 'APS Architectural Performance Coatings';
settings.preparedBy ||= 'Cheyenne';
settings.phone ||= '010 597 6616';
settings.email ||= 'info@agasouthafrica.co.za';
settings.taxNumber ||= '105 976 616';
let quotes = JSON.parse(localStorage.getItem(storageKey('quotes')) || '[]');
/* =========================================================
   MATERIAL CATALOGUE
   ---------------------------------------------------------
   Three levels deep so a quote can be built quickly:

     Category  -> Sub-group (sub-subcategory) -> Type -> Size
   Costs below are internal reference costs used when no
   supplier price is found for an item; a live supplier price
   always wins. Verify against a supplier invoice before
   quoting.

   IMPORTANT: every leaf keeps the { sizes, markup } shape, and
   materialItem()/materialTypes() below resolve a type whether
   it sits under a sub-group or directly under a category, so
   older saved quotes (category + type + size, no sub-group)
   keep resolving.
   ========================================================= */
const materialCatalogue = {
    'Fasteners & fixings': {
        'Screws': {
            'Wood screw': { sizes: { '4 x 40mm (100)': 65, '5 x 60mm (100)': 95, '6 x 80mm (50)': 85 }, markup: MATERIAL_MARKUP },
            'Chipboard screw': { sizes: { '4 x 40mm (200)': 110, '5 x 50mm (100)': 95 }, markup: MATERIAL_MARKUP },
            'Self-drilling screw': { sizes: { '8 x 25mm (100)': 120, '10 x 50mm (50)': 140 }, markup: MATERIAL_MARKUP },
            'Coach screw': { sizes: { '8 x 75mm (10)': 95, '10 x 100mm (10)': 145 }, markup: MATERIAL_MARKUP },
            'Machine screw': { sizes: { 'M6 x 50mm (25)': 85, 'M8 x 50mm (25)': 105 }, markup: MATERIAL_MARKUP },
            'Roofing screw': { sizes: { '65mm (250)': 195, '75mm (250)': 235 }, markup: MATERIAL_MARKUP }
        },
        'Anchors & plugs': {
            'Masonry anchor': { sizes: { '8mm (25)': 180, '10mm (25)': 240 }, markup: MATERIAL_MARKUP },
            'Rawl plug': { sizes: { '6mm (100)': 55, '8mm (100)': 75 }, markup: MATERIAL_MARKUP },
            'Wall plug & screw set': { sizes: { 'Assorted (100)': 145 }, markup: MATERIAL_MARKUP },
            'Nylon anchor': { sizes: { '8mm (25)': 165, '10mm (25)': 215 }, markup: MATERIAL_MARKUP },
            'Concrete bolt': { sizes: { '10 x 100mm (10)': 185, '12 x 120mm (10)': 245 }, markup: MATERIAL_MARKUP },
            'Chemical anchor': { sizes: { '300ml': 285, '380ml': 345 }, markup: MATERIAL_MARKUP }
        },
        'Nuts, bolts & washers': {
            'Nut & bolt set': { sizes: { 'M8 (25)': 165, 'M10 (25)': 225 }, markup: MATERIAL_MARKUP },
            'Washer': { sizes: { 'M8 (100)': 65, 'M10 (100)': 85 }, markup: MATERIAL_MARKUP },
            'Threaded rod': { sizes: { 'M8 x 1m': 95, 'M10 x 1m': 145 }, markup: MATERIAL_MARKUP },
            'Spring washer': { sizes: { 'M8 (100)': 55, 'M10 (100)': 75 }, markup: MATERIAL_MARKUP }
        }
    },
    'Tools & consumables': {
        'Drill & cut': {
            'Drill bit set': { sizes: { 'HSS 1-10mm': 185, 'Masonry 4-10mm': 145, 'Wood 3-10mm': 165 }, markup: MATERIAL_MARKUP },
            'Hole saw': { sizes: { '25mm': 95, '50mm': 145, '75mm': 195 }, markup: MATERIAL_MARKUP },
            'Cutting disc': { sizes: { '115mm metal': 35, '230mm metal': 75, '115mm stone': 45 }, markup: MATERIAL_MARKUP },
            'Grinding disc': { sizes: { '115mm': 45, '230mm': 85 }, markup: MATERIAL_MARKUP },
            'Jigsaw blade': { sizes: { 'Wood (5)': 95, 'Metal (5)': 125 }, markup: MATERIAL_MARKUP },
            'Reciprocating blade': { sizes: { 'Wood (5)': 145, 'Metal (5)': 175 }, markup: MATERIAL_MARKUP }
        },
        'Sanding & finishing': {
            'Sanding paper': { sizes: { '80 grit (10)': 65, '120 grit (10)': 65, '180 grit (10)': 70 }, markup: MATERIAL_MARKUP },
            'Sandpaper roll': { sizes: { '115mm x 5m': 145 }, markup: MATERIAL_MARKUP },
            'Steel wool': { sizes: { 'Coarse (2)': 65, 'Fine (2)': 75 }, markup: MATERIAL_MARKUP },
            'Wood filler': { sizes: { '500g': 95, '1kg': 165 }, markup: MATERIAL_MARKUP },
            'Wall filler': { sizes: { '5kg': 185, '10kg': 325 }, markup: MATERIAL_MARKUP }
        },
        'Tapes & adhesives': {
            'Masking tape': { sizes: { '24mm x 50m': 45, '48mm x 50m': 75 }, markup: MATERIAL_MARKUP },
            'Duct tape': { sizes: { '48mm x 25m': 65 }, markup: MATERIAL_MARKUP },
            'Double-sided tape': { sizes: { '12mm x 20m': 55, '24mm x 20m': 85 }, markup: MATERIAL_MARKUP },
            'Glue & adhesive': { sizes: { 'Wood glue 500ml': 95, 'Contact adhesive 1L': 185, 'Construction adhesive 300ml': 125 }, markup: MATERIAL_MARKUP },
            'Silicone sealant': { sizes: { '280ml clear': 95, '280ml white': 95, '280ml black': 105 }, markup: MATERIAL_MARKUP },
            'Acrylic sealer': { sizes: { '280ml white': 75 }, markup: MATERIAL_MARKUP },
            'PU foam': { sizes: { '750ml': 125 }, markup: MATERIAL_MARKUP }
        },
        'Painting aids': {
            'Paint brush & roller set': { sizes: { Standard: 145 }, markup: MATERIAL_MARKUP },
            'Paint tray': { sizes: { Standard: 65 }, markup: MATERIAL_MARKUP },
            'Rags & cleaning cloth': { sizes: { 'Pack of 5': 55 }, markup: MATERIAL_MARKUP }
        }
    },
    'Electrical': {
        'Sockets & switches': {
            'Plug point / socket outlet': { sizes: { 'Single 16A': 185, 'Double 16A': 265 }, markup: MATERIAL_MARKUP },
            'Light switch': { sizes: { 'Single 1-way': 95, 'Double 2-way': 165 }, markup: MATERIAL_MARKUP },
            'Dimmer switch': { sizes: { 'Single': 245, 'Double': 385 }, markup: MATERIAL_MARKUP },
            'Two-way switch': { sizes: { 'Single': 145 }, markup: MATERIAL_MARKUP },
            'USB socket outlet': { sizes: { 'Double 16A': 385 }, markup: MATERIAL_MARKUP },
            'Cover plate': { sizes: { 'Single': 45, 'Double': 65 }, markup: MATERIAL_MARKUP }
        },
        'Lighting': {
            'Light fitting': { sizes: { 'Ceiling batten': 185, 'LED downlight': 145, 'Bulkhead': 265 }, markup: MATERIAL_MARKUP },
            'LED lamp': { sizes: { '9W bayonet': 65, '12W screw': 75, '20W flood': 295 }, markup: MATERIAL_MARKUP },
            'LED panel': { sizes: { '600 x 600mm': 385, '1200 x 300mm': 425 }, markup: MATERIAL_MARKUP },
            'Fluorescent fitting': { sizes: { 'Single 1.2m': 285, 'Double 1.2m': 385 }, markup: MATERIAL_MARKUP },
            'Flood light': { sizes: { '20W': 185, '50W': 345, '100W': 585 }, markup: MATERIAL_MARKUP },
            'Garden spike light': { sizes: { '5W': 165 }, markup: MATERIAL_MARKUP }
        },
        'Cable & accessories': {
            'Electrical cable': { sizes: { '1.5mm x 100m': 850, '2.5mm x 100m': 1450, '4mm x 100m': 2200 }, markup: MATERIAL_MARKUP },
            'Cable trunking': { sizes: { '20 x 12mm x 2m': 45, '40 x 25mm x 2m': 95 }, markup: MATERIAL_MARKUP },
            'Cable gland': { sizes: { '20mm (10)': 75, '25mm (10)': 95 }, markup: MATERIAL_MARKUP },
            'Circular box': { sizes: { Standard: 35 }, markup: MATERIAL_MARKUP },
            'Mounting board': { sizes: { '3 x 3': 85, '4 x 4': 110 }, markup: MATERIAL_MARKUP },
            'Conduit & fittings': { sizes: { '20mm x 4m': 65, '25mm x 4m': 95 }, markup: MATERIAL_MARKUP },
            'Cable clips': { sizes: { '6mm (100)': 55, '8mm (100)': 65 }, markup: MATERIAL_MARKUP }
        },
        'Distribution & protection': {
            'Circuit breaker': { sizes: { '20A': 145, '32A': 185, '63A': 265 }, markup: MATERIAL_MARKUP },
            'Earth leakage unit': { sizes: { '2-pole 63A': 685 }, markup: MATERIAL_MARKUP },
            'Distribution board': { sizes: { '6-way': 485, '12-way': 685 }, markup: MATERIAL_MARKUP },
            'Surge protector': { sizes: { 'Single phase': 585 }, markup: MATERIAL_MARKUP },
            'Float switch': { sizes: { '2m': 850, '5m': 1450 }, markup: MATERIAL_MARKUP }
        }
    },
    'Building & masonry': {
        'Cement & sand': {
            'Cement': { sizes: { '50kg PPC': 125, '50kg rapid': 165 }, markup: MATERIAL_MARKUP },
            'Building sand': { sizes: { '1 tonne': 450, '10 tonne load': 3800 }, markup: MATERIAL_MARKUP },
            'Plaster sand': { sizes: { '1 tonne': 480, '10 tonne load': 4200 }, markup: MATERIAL_MARKUP },
            'Stone / aggregate': { sizes: { '19mm 1 tonne': 550, '13mm 1 tonne': 580 }, markup: MATERIAL_MARKUP },
            'Concrete mix': { sizes: { '40kg bag': 105 }, markup: MATERIAL_MARKUP }
        },
        'Bricks & blocks': {
            'Brick': { sizes: { 'Clay stock (1000)': 3200, 'Cement stock (1000)': 2800, 'Face brick (1000)': 4500 }, markup: MATERIAL_MARKUP },
            'Concrete block': { sizes: { '140mm (100)': 1850, '190mm (100)': 2450 }, markup: MATERIAL_MARKUP },
            'Paving brick': { sizes: { '60mm Interlock (1000)': 4500 }, markup: MATERIAL_MARKUP },
            'Maxi brick': { sizes: { '290 x 140 x 90mm (1000)': 3200 }, markup: MATERIAL_MARKUP }
        },
        'Reinforcement': {
            'Steel reinforcing': { sizes: { '8mm x 6m': 95, '10mm x 6m': 145, '12mm x 6m': 205 }, markup: MATERIAL_MARKUP },
            'Mesh reinforcement': { sizes: { 'A142 2.4 x 6m': 950 }, markup: MATERIAL_MARKUP },
            'Binding wire': { sizes: { '1.6mm x 25m': 85 }, markup: MATERIAL_MARKUP }
        },
        'Lintels & damp course': {
            'Concrete lintel': { sizes: { '110 x 75 x 1200mm': 285, '110 x 75 x 1800mm': 420 }, markup: MATERIAL_MARKUP },
            'Damp-proof course': { sizes: { '112mm x 30m': 385 }, markup: MATERIAL_MARKUP }
        },
        'Boards & ceilings': {
            'Plasterboard': { sizes: { '1.2 x 2.4m x 9.5mm': 265, '1.2 x 2.4m x 12.5mm': 345 }, markup: MATERIAL_MARKUP },
            'Ceiling board': { sizes: { '1.2 x 2.4m x 6.4mm': 195 }, markup: MATERIAL_MARKUP },
            'Corner bead': { sizes: { '2.4m': 45 }, markup: MATERIAL_MARKUP }
        },
        'Roofing': {
            'Roofing sheet': { sizes: { '0.47mm x 3m': 425, '0.53mm x 3m': 520 }, markup: MATERIAL_MARKUP },
            'Roof timber': { sizes: { '38 x 50 x 3m': 145, '50 x 76 x 3m': 245 }, markup: MATERIAL_MARKUP },
            'Roof tile': { sizes: { 'Concrete (per m2)': 285 }, markup: MATERIAL_MARKUP },
            'Ridge tile': { sizes: { 'Standard': 85 }, markup: MATERIAL_MARKUP }
        }
    },
    'Plaster & coatings': {
        'Plaster & skim': {
            'Plaster skim': { sizes: { '25kg': 195, '40kg': 285 }, markup: MATERIAL_MARKUP },
            'Wall plaster': { sizes: { '40kg undercoat': 225 }, markup: MATERIAL_MARKUP },
            'Bonding liquid': { sizes: { '5L': 285, '20L': 850 }, markup: MATERIAL_MARKUP },
            'Cement screed': { sizes: { '40kg': 195 }, markup: MATERIAL_MARKUP }
        },
        'Paint': {
            'Interior paint': { sizes: { '20L white': 1150, '20L tint': 1350, '5L white': 385 }, markup: MATERIAL_MARKUP },
            'Exterior paint': { sizes: { '20L white': 1450, '20L tint': 1650 }, markup: MATERIAL_MARKUP },
            'Primer / sealer': { sizes: { '20L': 985, '5L': 325 }, markup: MATERIAL_MARKUP },
            'Enamel paint': { sizes: { '5L': 485, '20L': 1650 }, markup: MATERIAL_MARKUP },
            'Roof paint': { sizes: { '20L': 1250 }, markup: MATERIAL_MARKUP },
            'Thinners': { sizes: { '5L': 185, '20L': 620 }, markup: MATERIAL_MARKUP }
        },
        'Waterproofing': {
            'Waterproofing membrane': { sizes: { '20kg cementitious': 885, '4kg liquid': 425 }, markup: MATERIAL_MARKUP },
            'Roof waterproofing': { sizes: { '20L acrylic': 1250, '20kg torch-on': 1450 }, markup: MATERIAL_MARKUP },
            'Damp-proof sealer': { sizes: { '20L': 985 }, markup: MATERIAL_MARKUP }
        },
        'Floor & tile': {
            'Epoxy floor coating': { sizes: { '5kg kit': 1450, '20kg kit': 4850 }, markup: MATERIAL_MARKUP },
            'Tile adhesive': { sizes: { '20kg standard': 145, '20kg flexible': 245 }, markup: MATERIAL_MARKUP },
            'Tile grout': { sizes: { '5kg': 95, '20kg': 285 }, markup: MATERIAL_MARKUP },
            'Floor sealer': { sizes: { '5L': 385, '20L': 1250 }, markup: MATERIAL_MARKUP }
        }
    },
    'Doors, windows & joinery': {
        'Doors': {
            'Door': { sizes: { 'Hollow core': 985, 'Solid core': 1850, 'External hardwood': 2650 }, markup: MATERIAL_MARKUP },
            'Trellis door': { sizes: { Standard: 1250 }, markup: MATERIAL_MARKUP },
            'Door frame': { sizes: { 'Single': 685, 'Double': 1250 }, markup: MATERIAL_MARKUP },
            'Door jamb': { sizes: { '2.1m': 245 }, markup: MATERIAL_MARKUP }
        },
        'Door hardware': {
            'Door handle': { sizes: { 'Lever set': 285, 'Round knob set': 225 }, markup: MATERIAL_MARKUP },
            'Door lock': { sizes: { 'Cylinder lock': 385, 'Mortice lock': 685, 'Padbolt': 145 }, markup: MATERIAL_MARKUP },
            'Hinge': { sizes: { '75mm (2)': 55, '100mm (2)': 85 }, markup: MATERIAL_MARKUP },
            'Door closer': { sizes: { Standard: 485 }, markup: MATERIAL_MARKUP },
            'Door stopper': { sizes: { Standard: 45 }, markup: MATERIAL_MARKUP }
        },
        'Windows & gates': {
            'Window frame': { sizes: { '900 x 1200mm': 1850 }, markup: MATERIAL_MARKUP },
            'Gate latch': { sizes: { Standard: 185 }, markup: MATERIAL_MARKUP },
            'Gate hinge': { sizes: { 'Pair': 165 }, markup: MATERIAL_MARKUP },
            'Window glass': { sizes: { '4mm (per m2)': 385 }, markup: MATERIAL_MARKUP },
            'Insect screen': { sizes: { '900 x 1200mm': 285 }, markup: MATERIAL_MARKUP }
        },
        'Trims & boards': {
            'Skirting board': { sizes: { '2.4m x 69mm': 145, '2.4m x 89mm': 185 }, markup: MATERIAL_MARKUP },
            'Architrave': { sizes: { '2.4m': 95 }, markup: MATERIAL_MARKUP },
            'Timber plank': { sizes: { '25 x 228 x 3m': 385, '38 x 228 x 3m': 545 }, markup: MATERIAL_MARKUP },
            'Quadrant moulding': { sizes: { '2.4m': 65 }, markup: MATERIAL_MARKUP },
            'Cornice': { sizes: { '2.4m': 95 }, markup: MATERIAL_MARKUP }
        }
    },
    'Shelving & hardware': {
        'Brackets & supports': {
            'Shelf bracket': { sizes: { '200mm (2)': 85, '250mm (2)': 105 }, markup: MATERIAL_MARKUP },
            'Corner brace': { sizes: { '50mm (4)': 65, '75mm (4)': 85 }, markup: MATERIAL_MARKUP },
            'Angle bracket': { sizes: { '40mm (10)': 95, '60mm (10)': 145 }, markup: MATERIAL_MARKUP },
            'Floating shelf support': { sizes: { 'Pair': 125 }, markup: MATERIAL_MARKUP },
            'Steel post': { sizes: { '1.8m': 385, '2.4m': 495 }, markup: MATERIAL_MARKUP }
        },
        'Shelves': {
            'Shelving board': { sizes: { '1.2m x 300mm': 245, '1.8m x 300mm': 345 }, markup: MATERIAL_MARKUP },
            'Plywood shelf': { sizes: { '18mm 1.2 x 0.3m': 285 }, markup: MATERIAL_MARKUP }
        },
        'Security & rope': {
            'Padlock': { sizes: { '40mm': 145, '50mm': 195 }, markup: MATERIAL_MARKUP },
            'Chain': { sizes: { '4mm x 10m': 285 }, markup: MATERIAL_MARKUP },
            'Rope & cord': { sizes: { '8mm x 10m': 145, '10mm x 10m': 195 }, markup: MATERIAL_MARKUP },
            'Wire & fencing': { sizes: { '1.6mm x 50m': 285, 'Diamond mesh 1.8m x 10m': 1250 }, markup: MATERIAL_MARKUP }
        }
    },
    'Kitchen & appliance fittings': {
        'Cabinet fittings': {
            'Cupboard hinge': { sizes: { 'Standard (2)': 95, 'Soft close (2)': 165 }, markup: MATERIAL_MARKUP },
            'Drawer runner': { sizes: { '450mm pair': 145, '500mm pair': 185 }, markup: MATERIAL_MARKUP },
            'Cupboard handle': { sizes: { Standard: 65, 'Long bar': 125 }, markup: MATERIAL_MARKUP },
            'Cabinet leg': { sizes: { '100mm (4)': 95, '150mm (4)': 125 }, markup: MATERIAL_MARKUP }
        },
        'Counter tops & sinks': {
            'Counter top': { sizes: { 'Postform 3m': 1250, 'Granite 3m': 4850 }, markup: MATERIAL_MARKUP },
            'Kitchen sink': { sizes: { '1 bowl': 895, '1.5 bowl': 1450, '2 bowl': 1950 }, markup: MATERIAL_MARKUP },
            'Sink tap': { sizes: { 'Pillar': 685, 'Mixer': 1150 }, markup: MATERIAL_MARKUP },
            'Waste & trap': { sizes: { Standard: 145 }, markup: MATERIAL_MARKUP }
        },
        'Appliances & plumbing': {
            'Extractor fan': { sizes: { 'Standard 100mm': 685, 'Bathroom 150mm': 895 }, markup: MATERIAL_MARKUP },
            'Appliance valve': { sizes: { Standard: 185 }, markup: MATERIAL_MARKUP },
            'Flexible connector': { sizes: { '300mm': 85, '500mm': 125 }, markup: MATERIAL_MARKUP },
            'Washing machine tap': { sizes: { Standard: 245 }, markup: MATERIAL_MARKUP }
        }
    },
    'Safety & site': {
        'Personal protection': {
            'Safety glasses': { sizes: { Standard: 85 }, markup: MATERIAL_MARKUP },
            'Work gloves': { sizes: { 'Leather pair': 125, 'Latex pair': 45 }, markup: MATERIAL_MARKUP },
            'Dust mask': { sizes: { 'FFP2 (10)': 185 }, markup: MATERIAL_MARKUP },
            'Ear plugs': { sizes: { 'Pack of 10': 65 }, markup: MATERIAL_MARKUP },
            'Safety helmet': { sizes: { Standard: 145 }, markup: MATERIAL_MARKUP },
            'Safety vest': { sizes: { Standard: 95 }, markup: MATERIAL_MARKUP }
        },
        'Site protection': {
            'Rubble bags': { sizes: { 'Pack of 10': 95 }, markup: MATERIAL_MARKUP },
            'Plastic sheeting': { sizes: { '4m x 25m': 285 }, markup: MATERIAL_MARKUP },
            'Drop sheet': { sizes: { '3.6 x 2.7m': 145 }, markup: MATERIAL_MARKUP },
            'Barrier tape': { sizes: { '500m': 95 }, markup: MATERIAL_MARKUP },
            'Warning sign': { sizes: { Standard: 125 }, markup: MATERIAL_MARKUP }
        },
        'Power & access': {
            'Extension lead': { sizes: { '10m': 485, '20m': 785 }, markup: MATERIAL_MARKUP },
            'Lead plug & socket': { sizes: { Standard: 185 }, markup: MATERIAL_MARKUP },
            'Access ladder': { sizes: { '2.4m': 1450, '3.6m': 2450 }, markup: MATERIAL_MARKUP },
            'Work light': { sizes: { 'LED 30W': 485 }, markup: MATERIAL_MARKUP }
        }
    },
    /* =================================================================
       CONSTRUCTION SITE MATERIALS
       ------------------------------------------------------------
       Supply items a general building contractor buys for site: mix
       and place concrete, formwork timber, rebar and mesh, structural
       steel, roofing, brickforce and DPC, wet-trade sundries and site
       consumables. Same Category -> Sub-group -> Type -> Size shape.
       ================================================================= */
    'Concrete & aggregates': {
        'Cement & mix': {
            'Cement': { sizes: { '50kg PPC': 125, '50kg rapid': 165 }, markup: MATERIAL_MARKUP },
            'Ready-mix concrete': { sizes: { '20MPa (per m3)': 1450, '25MPa (per m3)': 1580, '30MPa (per m3)': 1720 }, markup: MATERIAL_MARKUP },
            'Concrete mix': { sizes: { '40kg bag': 105 }, markup: MATERIAL_MARKUP }
        },
        'Aggregates': {
            'Building sand': { sizes: { '1 tonne': 450, '10 tonne load': 3800 }, markup: MATERIAL_MARKUP },
            'Plaster sand': { sizes: { '1 tonne': 480, '10 tonne load': 4200 }, markup: MATERIAL_MARKUP },
            'Stone / aggregate': { sizes: { '19mm 1 tonne': 550, '13mm 1 tonne': 580 }, markup: MATERIAL_MARKUP },
            'Crusher run': { sizes: { '1 tonne': 480, '10 tonne load': 3950 }, markup: MATERIAL_MARKUP }
        },
        'Concrete accessories': {
            'Concrete admixture': { sizes: { '5L': 285, '20L': 985 }, markup: MATERIAL_MARKUP },
            'Curing compound': { sizes: { '20L': 685 }, markup: MATERIAL_MARKUP },
            'Concrete release agent': { sizes: { '20L': 585 }, markup: MATERIAL_MARKUP },
            'Polyurethane sealant': { sizes: { '600ml': 185 }, markup: MATERIAL_MARKUP },
            'Expansion joint filler': { sizes: { '10mm x 10m': 245 }, markup: MATERIAL_MARKUP }
        }
    },
    'Formwork & reinforcement': {
        'Formwork timber': {
            'Shutter board': { sizes: { '18mm 1.2 x 2.4m': 485, '22mm 1.2 x 2.4m': 585 }, markup: MATERIAL_MARKUP },
            'Pine shutter plank': { sizes: { '38 x 152 x 4.8m': 245 }, markup: MATERIAL_MARKUP },
            'Brandering strip': { sizes: { '38 x 38 x 3m': 85 }, markup: MATERIAL_MARKUP },
            'Ply board (shutterply)': { sizes: { '18mm 1.2 x 2.4m': 685 }, markup: MATERIAL_MARKUP }
        },
        'Formwork props & clamps': {
            'Acrow prop': { sizes: { '2.0m': 385, '3.5m': 485 }, markup: MATERIAL_MARKUP },
            'Formwork clamp': { sizes: { 'Standard': 95, 'Heavy duty': 145 }, markup: MATERIAL_MARKUP },
            'Tie rod': { sizes: { 'M16 (10)': 385 }, markup: MATERIAL_MARKUP },
            'Prop foot plate': { sizes: { 'Standard': 85 }, markup: MATERIAL_MARKUP },
            'Scaffold tube': { sizes: { '48mm x 6m': 385 }, markup: MATERIAL_MARKUP }
        },
        'Reinforcement': {
            'Steel reinforcing': { sizes: { '8mm x 6m': 95, '10mm x 6m': 145, '12mm x 6m': 205, '16mm x 6m': 325 }, markup: MATERIAL_MARKUP },
            'Mesh reinforcement': { sizes: { 'A142 2.4 x 6m': 950, 'A193 2.4 x 6m': 1250 }, markup: MATERIAL_MARKUP },
            'Binding wire': { sizes: { '1.6mm x 25m': 85 }, markup: MATERIAL_MARKUP },
            'Starter bar / dowel': { sizes: { '12mm x 1m': 65, '16mm x 1m': 95 }, markup: MATERIAL_MARKUP },
            'Bar chair / spacer': { sizes: { '50mm (50)': 145 }, markup: MATERIAL_MARKUP }
        }
    },
    'Structural steel': {
        'Sections & beams': {
            'I-beam / universal beam': { sizes: { '152 x 89mm x 6m': 2450, '203 x 133mm x 6m': 3850 }, markup: MATERIAL_MARKUP },
            'Channel section': { sizes: { '100 x 50mm x 6m': 1250 }, markup: MATERIAL_MARKUP },
            'Angle iron': { sizes: { '50 x 50mm x 6m': 685, '75 x 75mm x 6m': 985 }, markup: MATERIAL_MARKUP },
            'Square tube': { sizes: { '50 x 50mm x 6m': 685, '75 x 75mm x 6m': 985 }, markup: MATERIAL_MARKUP },
            'Flat bar': { sizes: { '40 x 6mm x 6m': 285 }, markup: MATERIAL_MARKUP }
        },
        'Plates & bolts': {
            'Base plate': { sizes: { '200 x 200 x 10mm': 385 }, markup: MATERIAL_MARKUP },
            'Anchor bolt': { sizes: { 'M16 J-bolt (10)': 485, 'M20 J-bolt (10)': 685 }, markup: MATERIAL_MARKUP },
            'High-strength bolt set': { sizes: { 'M16 (10)': 385, 'M20 (10)': 545 }, markup: MATERIAL_MARKUP },
            'Welding rod': { sizes: { '3.15mm 5kg': 385 }, markup: MATERIAL_MARKUP },
            'Anti-corrosion paint': { sizes: { '5L': 485 }, markup: MATERIAL_MARKUP }
        }
    },
    'Roofing materials': {
        'Sheet & tile': {
            'Roofing sheet': { sizes: { '0.47mm x 3m': 425, '0.53mm x 3m': 520 }, markup: MATERIAL_MARKUP },
            'Roof tile': { sizes: { 'Concrete (per m2)': 285 }, markup: MATERIAL_MARKUP },
            'Ridge tile': { sizes: { 'Standard': 85 }, markup: MATERIAL_MARKUP },
            'Barge board': { sizes: { '2.4m plastic': 285 }, markup: MATERIAL_MARKUP }
        },
        'Timber & fixings': {
            'Roof timber': { sizes: { '38 x 50 x 3m': 145, '50 x 76 x 3m': 245 }, markup: MATERIAL_MARKUP },
            'Roof truss': { sizes: { 'Standard gang-nail': 1450 }, markup: MATERIAL_MARKUP },
            'Purlin': { sizes: { '38 x 50 x 6m': 285 }, markup: MATERIAL_MARKUP },
            'Roofing screw': { sizes: { '65mm (250)': 195 }, markup: MATERIAL_MARKUP },
            'Fascia board': { sizes: { '2.4m': 285 }, markup: MATERIAL_MARKUP },
            'Roof insulation': { sizes: { '50mm (per m2)': 95, '100mm (per m2)': 145 }, markup: MATERIAL_MARKUP }
        },
        'Waterproofing': {
            'Torch-on membrane': { sizes: { '4mm x 10m roll': 1250 }, markup: MATERIAL_MARKUP },
            'Liquid waterproofing': { sizes: { '20kg': 985 }, markup: MATERIAL_MARKUP },
            'Flash band / flashing': { sizes: { '100mm x 10m': 245 }, markup: MATERIAL_MARKUP },
            'Roof paint': { sizes: { '20L': 1250 }, markup: MATERIAL_MARKUP }
        }
    },
    'Brickwork & blockwork': {
        'Units': {
            'Brick': { sizes: { 'Clay stock (1000)': 3200, 'Cement stock (1000)': 2800, 'Face brick (1000)': 4500 }, markup: MATERIAL_MARKUP },
            'Concrete block': { sizes: { '140mm (100)': 1850, '190mm (100)': 2450 }, markup: MATERIAL_MARKUP },
            'Maxi brick': { sizes: { '290 x 140 x 90mm (1000)': 3200 }, markup: MATERIAL_MARKUP }
        },
        'Mortar & accessories': {
            'Masonry cement': { sizes: { '50kg': 135 }, markup: MATERIAL_MARKUP },
            'Mortar plasticiser': { sizes: { '5L': 185 }, markup: MATERIAL_MARKUP },
            'Brickforce / wall tie': { sizes: { 'Roll 30m': 185 }, markup: MATERIAL_MARKUP },
            'Damp-proof course': { sizes: { '112mm x 30m': 385 }, markup: MATERIAL_MARKUP },
            'Wall starter tie': { sizes: { 'Pack': 285 }, markup: MATERIAL_MARKUP },
            'Concrete lintel': { sizes: { '110 x 75 x 1200mm': 285, '110 x 75 x 1800mm': 420 }, markup: MATERIAL_MARKUP }
        }
    },
    'Wet trades & tiling': {
        'Tiling': {
            'Tile adhesive': { sizes: { '20kg standard': 145, '20kg flexible': 245 }, markup: MATERIAL_MARKUP },
            'Tile grout': { sizes: { '5kg': 95, '20kg': 285 }, markup: MATERIAL_MARKUP },
            'Floor tile': { sizes: { '300 x 300mm (per m2)': 145 }, markup: MATERIAL_MARKUP },
            'Wall tile': { sizes: { '250 x 400mm (per m2)': 165 }, markup: MATERIAL_MARKUP },
            'Tile spacers': { sizes: { 'Pack of 250': 55 }, markup: MATERIAL_MARKUP },
            'Silicone sanitary sealant': { sizes: { '280ml': 95 }, markup: MATERIAL_MARKUP }
        },
        'Screeds & waterproofing': {
            'Floor screed': { sizes: { '40kg': 195 }, markup: MATERIAL_MARKUP },
            'Self-levelling compound': { sizes: { '20kg': 385 }, markup: MATERIAL_MARKUP },
            'Wet-area waterproofing': { sizes: { '20kg cementitious': 885 }, markup: MATERIAL_MARKUP },
            'Priming slurry': { sizes: { '20kg': 585 }, markup: MATERIAL_MARKUP }
        }
    },
    'Hard landscaping': {
        'Paving': {
            'Paving brick': { sizes: { '60mm Interlock (1000)': 4500 }, markup: MATERIAL_MARKUP },
            'Concrete paver': { sizes: { '50mm (per m2)': 145 }, markup: MATERIAL_MARKUP },
            'Clay paver': { sizes: { '50mm (per m2)': 285 }, markup: MATERIAL_MARKUP },
            'Kerb stone': { sizes: { '1m concrete': 145 }, markup: MATERIAL_MARKUP },
            'Garden edging': { sizes: { '2.4m': 145 }, markup: MATERIAL_MARKUP }
        },
        'Bedding & finishes': {
            'Bedding sand': { sizes: { '1 tonne': 480 }, markup: MATERIAL_MARKUP },
            'Jointing sand': { sizes: { '25kg': 85 }, markup: MATERIAL_MARKUP },
            'Topsoil': { sizes: { '1 m3': 385 }, markup: MATERIAL_MARKUP },
            'Grass seed': { sizes: { '1kg': 145 }, markup: MATERIAL_MARKUP },
            'Gabion basket': { sizes: { '1 x 1 x 1m': 685 }, markup: MATERIAL_MARKUP }
        }
    },
    'Site & safety consumables': {
        'Site consumables': {
            'Wheelbarrow': { sizes: { Standard: 785 }, markup: MATERIAL_MARKUP },
            'Spade & shovel': { sizes: { Standard: 185 }, markup: MATERIAL_MARKUP },
            'Brick trowel': { sizes: { Standard: 145 }, markup: MATERIAL_MARKUP },
            'Plumb line & level': { sizes: { Standard: 285 }, markup: MATERIAL_MARKUP },
            'Spirit level': { sizes: { '600mm': 245, '1200mm': 385 }, markup: MATERIAL_MARKUP },
            'Builders line & pins': { sizes: { 'Roll': 85 }, markup: MATERIAL_MARKUP },
            'Wheelbarrow wheel': { sizes: { Standard: 245 }, markup: MATERIAL_MARKUP }
        },
        'Site protection & waste': {
            'Rubble bags': { sizes: { 'Pack of 10': 95 }, markup: MATERIAL_MARKUP },
            'Skip bin hire': { sizes: { '6m3': 1850, '9m3': 2450 }, markup: MATERIAL_MARKUP },
            'Barrier mesh / fencing': { sizes: { '1.8m x 10m': 1250 }, markup: MATERIAL_MARKUP },
            'Silt fence': { sizes: { 'Roll 50m': 1450 }, markup: MATERIAL_MARKUP },
            'Warning signs & cones': { sizes: { 'Set': 385 }, markup: MATERIAL_MARKUP }
        },
        'PPE': {
            'Safety helmet': { sizes: { Standard: 145 }, markup: MATERIAL_MARKUP },
            'Safety boots': { sizes: { 'Size 6-12': 785 }, markup: MATERIAL_MARKUP },
            'High-vis vest': { sizes: { Standard: 95 }, markup: MATERIAL_MARKUP },
            'Safety harness': { sizes: { Standard: 1850 }, markup: MATERIAL_MARKUP },
            'Work gloves': { sizes: { 'Leather pair': 125, 'Latex pair': 45 }, markup: MATERIAL_MARKUP },
            'Dust mask': { sizes: { 'FFP2 (10)': 185 }, markup: MATERIAL_MARKUP }
        }
    }
};
const catalogueCategories = Object.keys(materialCatalogue);
/* =========================================================
   MATERIAL CATALOGUE HELPERS
   ---------------------------------------------------------
   The catalogue is nested Category -> Sub-group -> Type.
   These helpers flatten that back to (category, type) so the
   rest of the app does not care how deep the tree is, and so
   quotes saved before the sub-group existed still resolve.
   ========================================================= */
function materialSubGroups(category) {
    return materialCatalogue[category] ? Object.keys(materialCatalogue[category]) : [];
}
function materialCategoryScaffold(category, type, subGroup) {
    const groups = materialSubGroups(category);
    const hasType = type && typeof materialCatalogue[category]?.[type]?.sizes === 'object';
    if (hasType) return { subGroup: '', type };
    const group = subGroup || groups.find(name => materialCatalogue[category]?.[name]?.[type]);
    return { subGroup: group || groups[0] || '', type: type || '' };
}
function materialTypes(category, subGroup) {
    const group = materialCatalogue[category]?.[subGroup];
    return group && typeof group === 'object' ? Object.keys(group) : [];
}
function materialItem({ category, subGroup, type }) {
    if (!category || !type) return null;
    // Legacy flat shape: the type sat directly under the category.
    const direct = materialCatalogue[category]?.[type];
    if (direct?.sizes) return direct;
    // Named sub-group first, then any sub-group that holds this type, so a
    // quote saved before the sub-group level existed still resolves.
    const named = materialCatalogue[category]?.[subGroup]?.[type];
    if (named?.sizes) return named;
    const groupName = materialSubGroups(category).find(name => materialCatalogue[category]?.[name]?.[type]?.sizes);
    return groupName ? materialCatalogue[category][groupName][type] : null;
}
function materialDescription(type, size) {
    return `${type} - ${size}`;
}
const serviceCatalogue = {
    'Excavation & ground work': ['Excavate soil', 'Remove soil and rubble', 'Backfill trench', 'Compact or stamp ground', 'Level ground', 'Lay bedding sand'],
    'Breaking & access': ['Break and remove concrete', 'Remove paving', 'Core drill through wall', 'Chase wall for cable or pipe', 'Cut opening in wall', 'Demolish and remove structure'],
    'Restoration': ['Replace paving', 'Relay paving', 'Repair concrete', 'Fill and cement hole', 'Plaster wall', 'Repair tiles', 'Reinstall cupboard or panel', 'Make good damaged area'],
    'Additional labour': ['Move soil', 'Remove building rubble', 'Load or unload materials', 'Clean work area', 'Protect work area', 'Cart away rubble'],
    Equipment: ['Jackhammer hire', 'Ground compactor hire', 'Excavator hire', 'Core drill hire', 'Scaffolding hire', 'Brick saw hire'],
    'General handyman': ['General repair work', 'Hang doors and fit hardware', 'Fit door locks and handles', 'Fit shelving and brackets', 'Assemble flat-pack furniture', 'Mount TV or wall bracket', 'Hang pictures and mirrors', 'Fit curtain rails and blinds', 'Fit skirtings and architraves', 'Fit cornices and trims', 'Repair cupboard doors and hinges', 'Fit cupboard and counter tops', 'Seal gaps and apply silicone', 'General maintenance inspection', 'Small repairs and odd jobs', 'Replace floor or wall boards', 'Make safe and secure premises'],
    'Electrical work': ['Electrical call-out and inspection', 'Issue electrical Certificate of Compliance (COC)', 'Test and certify installation', 'Install plug point or socket outlet', 'Move or replace plug point', 'Install light fitting', 'Install ceiling or downlight', 'Install light switch', 'Install dimmer switch', 'Install security or flood light', 'Install outdoor or garden light', 'Install electric fence energiser', 'Install distribution board', 'Replace circuit breaker', 'Install earth leakage unit', 'Replace faulty wiring', 'Install new wiring circuit', 'Trace and repair electrical fault', 'Install extractor fan', 'Install geyser electrical connection', 'Install stove or oven point', 'Install pool or gate motor connection', 'Install prepaid electricity meter', 'Bond and earth installation', 'Replace faulty light fitting', 'Repair doorbell or intercom', 'Inspect and repair DB board'],
    'Building work': ['Building call-out and inspection', 'Lay brickwork', 'Build new wall', 'Build half-brick wall', 'Build retaining wall', 'Build garden or boundary wall', 'Close up doorway or opening', 'Open up new doorway', 'Fit lintel or beam', 'Brick or block up window', 'Lay floor or wall screed', 'Cast concrete slab', 'Cast concrete lintel', 'Build foundation or footing', 'Install roof trusses', 'Fit roof sheeting or tiles', 'Fit ceilings', 'Install window or door frame', 'Fit window or door', 'Fit steel or wooden door', 'Fit garage door', 'Build braai or fireplace', 'Lay tiles or paving', 'Fit waterproofing membrane', 'Build tiled shower or recess'],
    'Coatings & painting': ['Coatings call-out and inspection', 'Prepare and clean surface', 'High-pressure cleaning', 'Sand and abrade surface', 'Apply primer or sealer coat', 'Apply first coat', 'Apply second or final coat', 'Apply waterproofing coating', 'Apply epoxy floor coating', 'Apply roof waterproofing coating', 'Apply damp-proof coating', 'Apply protective clear coat', 'Apply texture or decorative coating', 'Spray application of coating', 'Roller application of coating', 'Brush application of detail work', 'Repair cracks before coating', 'Treat mould or algae', 'Cure and protect new coating', 'Touch up damaged coating', 'Apply line marking or road marking', 'Apply anti-corrosion coating', 'Apply fire-retardant coating', 'Coating warranty inspection'],
    'Plastering & skimming': ['Plastering call-out and inspection', 'Plaster interior wall', 'Plaster exterior wall', 'Plaster new brickwork', 'Skim coat existing wall', 'Skim coat ceiling', 'Plaster ceiling', 'Patch and repair plaster', 'Crack repair and plastering', 'Fill and plaster chase', 'Plaster over old paint', 'Bag and paint wall finish', 'Fit plaster beading and corner beads', 'Plaster mouldings or cornice repairs', 'Re-plaster damaged wall section', 'Plaster around window or door', 'Plaster around electrical box', 'Prepare wall for painting', 'Screed wall for tiling', 'Rub down and smooth plaster']
};
serviceCatalogue['General handyman'].push('Call-out and inspection', 'Site inspection', 'Assess repair scope', 'Protect surrounding area', 'Mark affected area', 'Drill through wall', 'Seal wall opening', 'Test operation', 'Final walkthrough with customer');
serviceCatalogue['Excavation & ground work'].push('Excavate trench', 'Sift soil', 'Remove excess soil', 'Load rubble', 'Carefully remove paving', 'Store paving for reuse', 'Prepare concrete area', 'Pour new concrete', 'Finish concrete');
serviceCatalogue['Breaking & access'].push('Remove tiles', 'Open or chase wall', 'Break concrete or floor', 'Remove concrete rubble');
serviceCatalogue.Restoration.push('Close wall', 'Plaster wall', 'Replace tiles', 'Paint touch-up', 'Reinstate paving or concrete', 'Reinstall paving', 'Level paving');
serviceCatalogue['Additional labour'].push('Mark excavation area', 'Protect surrounding area', 'Remove rubble', 'Clean area', 'Seal wall opening');
serviceCatalogue['General handyman'].push('Install towel rail or accessory', 'Repair squeaky door or hinge', 'Replace door handle', 'Fix loose handle or fitting', 'Replace flyscreen', 'Fit gate latch or hinge', 'Weatherproof door or window', 'Fit floor trim or threshold', 'Seal and waterproof shower', 'Patch and repair drywall', 'Paint touch-up after repair', 'Fit and repair gate', 'Repair fence or paling', 'Clear and clean gutters');
serviceCatalogue['Building work'].push('Lay foundation', 'Set out and mark building lines', 'Mix and pour concrete', 'Erect brickwork to line', 'Build pillars and columns', 'Set window and door sills', 'Fit damp-proof course', 'Point and finish brickwork', 'Strip existing structure', 'Demolish and remove structure', 'Cart away building rubble');
serviceCatalogue['Coatings & painting'].push('Surface preparation', 'Fill and level surface', 'Mask and protect areas', 'Mix and prepare coating', 'Apply coating to wall', 'Apply coating to ceiling', 'Apply coating to floor', 'Apply coating to exterior', 'Apply coating to metal surface', 'Apply coating to concrete', 'Apply coating to plaster', 'Apply coating to wood', 'Apply intumescent coating', 'Apply membrane coating', 'Inspect coating thickness', 'Final coating inspection', 'Clean and demobilise site');
serviceCatalogue['Plastering & skimming'].push('Apply plaster to wall', 'Apply skim coat', 'Level and float plaster', 'Finish plaster edge', 'Wet and dry polish plaster', 'Repair plaster cracks', 'Repair plaster damp damage', 'Plaster around conduits', 'Apply bonding agent', 'Close chase and plaster');
const serviceRates = { 'Backfill trench': 400, 'Compact or stamp ground': 350, 'Remove paving': 450, 'Repair concrete': 550, 'Repair tiles': 450, 'Clean work area': 250, 'Jackhammer hire': 750, 'Ground compactor hire': 650, 'Excavator hire': 1800, 'General repair work': 450, 'General maintenance inspection': 550, 'Small repairs and odd jobs': 450, 'Hang doors and fit hardware': 550, 'Fit shelving and brackets': 450, 'Assemble flat-pack furniture': 500, 'Mount TV or wall bracket': 650, 'Fit curtain rails and blinds': 450, 'Fit skirtings and architraves': 550, 'Electrical call-out and inspection': 750, 'Issue electrical Certificate of Compliance (COC)': 2500, 'Test and certify installation': 1200, 'Install plug point or socket outlet': 550, 'Install light fitting': 450, 'Install ceiling or downlight': 500, 'Install light switch': 450, 'Install security or flood light': 650, 'Install distribution board': 1800, 'Replace circuit breaker': 550, 'Install earth leakage unit': 950, 'Replace faulty wiring': 650, 'Install new wiring circuit': 850, 'Trace and repair electrical fault': 750, 'Install extractor fan': 750, 'Install stove or oven point': 950, 'Install geyser electrical connection': 950, 'Building call-out and inspection': 750, 'Lay brickwork': 650, 'Build new wall': 950, 'Build half-brick wall': 750, 'Build retaining wall': 1200, 'Close up doorway or opening': 950, 'Open up new doorway': 1200, 'Cast concrete slab': 1500, 'Build foundation or footing': 1400, 'Fit ceilings': 850, 'Install window or door frame': 850, 'Fit window or door': 950, 'Plastering call-out and inspection': 650, 'Plaster interior wall': 550, 'Plaster exterior wall': 650, 'Skim coat existing wall': 500, 'Skim coat ceiling': 550, 'Plaster ceiling': 650, 'Patch and repair plaster': 550, 'Repair plaster cracks': 450, 'Re-plaster damaged wall section': 850, 'Prepare wall for painting': 450, 'Coatings call-out and inspection': 750, 'Prepare and clean surface': 450, 'High-pressure cleaning': 650, 'Sand and abrade surface': 500, 'Apply primer or sealer coat': 550, 'Apply first coat': 600, 'Apply second or final coat': 600, 'Apply waterproofing coating': 850, 'Apply epoxy floor coating': 1200, 'Apply roof waterproofing coating': 1400, 'Apply damp-proof coating': 900, 'Apply texture or decorative coating': 950, 'Spray application of coating': 750, 'Roller application of coating': 650, 'Touch up damaged coating': 450, 'Repair cracks before coating': 550, 'Treat mould or algae': 500,
    // Common planning/setup and completion tasks used across the scenario library.
    'Inspection': 450, 'Site inspection': 550, 'Call-out and inspection': 650, 'Assess repair scope': 450,
    'Measure opening': 250, 'Measure location': 250, 'Set out and mark building lines': 650, 'Mark work area': 250,
    'Mark fixing positions': 250, 'Mark bracket position': 250, 'Mark opening': 250, 'Mark excavation area': 450,
    'Mark pipe route': 250, 'Mark chase line': 250, 'Plan circuit route': 450, 'Determine pipe route': 450,
    'Protect work area': 250, 'Protect surrounding area': 250, 'Mask and protect areas': 350, 'Site setup': 350,
    'Set up access equipment': 450, 'Test operation': 250, 'Test circuit': 350, 'Test water flow': 250,
    'Test drainage': 250, 'Test flush': 250, 'Load test': 250, 'Level and secure': 250, 'Align doors': 250,
    'Adjust alignment': 250, 'Adjust cupboard doors': 250, 'Tighten and adjust fittings': 250,
    'Final walkthrough with customer': 250, 'Issue test report': 450, 'Issue completion report': 450,
    'Snag list': 250, 'Re-inspection after repairs': 350, 'Record findings': 250,
    'Check workmanship standard': 350, 'Identify defects': 250, 'Inspect completed work': 350,
    // Demolition and making good.
    'Remove existing door': 450, 'Remove old door': 450, 'Remove tiles': 550, 'Remove adhesive': 350,
    'Remove concrete': 750, 'Remove concrete rubble': 550, 'Remove loose plaster': 350, 'Open crack': 350,
    'Chase wall': 550, 'Cut opening in wall': 950, 'Concrete cutting': 750, 'Concrete breaking': 950,
    'Demolish and remove structure': 1800, 'Strip existing structure': 1500, 'Break concrete': 850,
    // Carpentry and fitting.
    'Supply new door': 985, 'Fit door frame': 550, 'Hang door': 650, 'Fit hinges': 350, 'Fit door handle': 250,
    'Fit door lock': 350, 'Fit lintel or beam': 950, 'Install roof truss': 850, 'Fit roof sheeting or tiles': 1200,
    'Fit roof sheet': 650, 'Fit ceiling board': 850, 'Install ceiling brandering': 850, 'Set out ceiling height': 350,
    'Install window frame': 750, 'Fit window or door': 950, 'Fit garage door': 1400, 'Fit damp-proof course': 450,
    'Point and finish brickwork': 550, 'Build brick pillar': 850, 'Build paving and edge': 750,
    'Cast concrete apron': 950, 'Lay floor screed': 750, 'Build garden step': 650, 'Repair cracked wall': 850,
    'Brick up opening': 950, 'Lay bedding sand': 350, 'Land bedding sand': 350, 'Install mesh reinforcement': 450,
    'Level and finish concrete': 650, 'Cure concrete': 250, 'Lay foundation': 950, 'Erect brickwork to line': 650,
    'Mix and pour concrete': 950, 'Build plastered wall': 950, 'Repair patio and deck boards': 550,
    'Repair fence or paling': 550, 'Clear and clean gutters': 750, 'Seal and waterproof shower': 650,
    'Fix loose tiles': 450, 'Fit gate latch or hinge': 450, 'Fit and repair gate': 650,
    'Fit floor trim or threshold': 450, 'Replace flyscreen': 350, 'Patch and repair drywall': 550,
    'Paint touch-up after repair': 350, 'Install towel rail or accessory': 350, 'Fit and repair cupboard doors': 450,
    'Fit kitchen cupboard handles': 350, 'Adjust cupboard and drawer fittings': 350, 'Fit door closer': 450,
    'Install window blinds': 450, 'Fit insect screen': 450, 'Replace hinges': 350, 'Replace drawer runners': 450,
    'Replace cupboard handles': 350, 'Replace worn hardware': 250, 'Replace damaged bracket': 350,
    // Electrical additions.
    'Isolate circuit': 250, 'Isolate supply': 250, 'Test circuit breaker': 350, 'Replace plug point': 550,
    'Install outdoor socket': 650, 'Install two-way switching': 750, 'Install dimmer switch': 550,
    'Install motion sensor light': 750, 'Install garden lighting': 750, 'Replace fluorescent fitting': 450,
    'Install LED panel': 650, 'Install earth leakage unit': 950, 'Replace earth leakage unit': 950,
    'Install surge protection': 850, 'Test earth leakage': 350, 'Install cable trunking': 450, 'Install conduit': 450,
    'Install geyser timer': 750, 'Install pool pump connection': 950, 'Test and issue COC': 2500,
    'Complete certificate of compliance': 450, 'Inspect distribution board': 450, 'Inspect socket outlets': 350,
    'Inspect light fittings': 350, 'Inspect circuits': 350, 'Test earth continuity': 450, 'Test bonding': 350,
    'Trace and repair electrical fault': 750, 'Restore supply': 250, 'Connect and terminate': 350,
    'Electrical COC inspection': 850, 'Electrical installation test': 950, 'Workmanship guarantee inspection': 550,
    'Building compliance inspection': 850 };
/* Reference day rates for the construction-site service categories above.
   These are starting points for a quote, not a rate card: edit them on the
   Price list screen and they are stored per device like any other rate. */
Object.assign(serviceRates, {
    // Site establishment
    'Site establishment and hoarding': 2500, 'Erect temporary fencing or hoarding': 45, 'Site clearance and levelling': 1800,
    'Set out and mark site boundary': 950, 'Establish site access and haul routes': 1500, 'Install site board and signage': 850,
    'Set up site office or store': 2200, 'Temporary water and power connection': 1650, 'Install temporary sanitation': 1250,
    'Establish material laydown area': 950, 'Protect existing services and trees': 750, 'Erect scaffolding and access platforms': 55,
    'Dismantle and demobilise site': 1800,
    // Demolition & strip-out
    'Demolition survey and make safe': 1200, 'Demolish building or structure': 350, 'Soft strip-out of interiors': 120,
    'Strip roof covering': 95, 'Remove structural steel': 850, 'Break out floor slabs and bases': 450,
    'Remove foundations and footings': 550, 'Cut and remove reinforced concrete': 750, 'Sort demolition waste for recycling': 450,
    'Load and cart away demolition rubble': 650, 'Backfill and level demolished area': 550, 'Provide demolition method statement': 950,
    // Structural & concrete
    'Structural setting out': 1250, 'Excavate and prepare footing': 650, 'Place blinding layer': 350,
    'Fix footing reinforcement': 550, 'Pour footing concrete': 950, 'Erect column and wall formwork': 85,
    'Fix column reinforcement': 650, 'Pour column concrete': 950, 'Cast suspended slab': 250,
    'Place slab reinforcement and mesh': 55, 'Strip formwork and prop': 450, 'Cure concrete elements': 250,
    'Cast concrete retaining structure': 1250, 'Fix anchor bolts and holding-down bolts': 450, 'Grout machine or column base': 650,
    'Apply concrete surface finish': 450,
    // Formwork & reinforcement
    'Design or check formwork': 1500, 'Erect formwork and props': 75, 'Strike and remove formwork': 45,
    'Cut, bend and fix rebar': 18, 'Fix mesh reinforcement': 35, 'Fix starters and dowels': 350,
    'Position spacers and chairs': 250, 'Fix lap and cover to specification': 350, 'Erect reinforcing cages': 750,
    'Fabricate and fix steel connectors': 850,
    // Roofing & waterproofing
    'Erect roof trusses or rafters': 65, 'Install purlins and battens': 45, 'Fit roof sheeting or tiles': 85,
    'Fit ridge and barge cappings': 65, 'Install fascia and gutters': 65, 'Fit roof insulation': 45,
    'Seal roof penetrations and flashings': 450, 'Install roof lights or vents': 650, 'Apply roof waterproofing system': 75,
    'Install valley and rainwater outlets': 550, 'Torch-on membrane installation': 120, 'Liquid waterproofing application': 65,
    'Roof inspection and repair': 750,
    // Plant & equipment hire (per day unless a task says otherwise)
    'Concrete mixer hire': 450, 'Concrete pump hire': 4500, 'Truck-mounted crane hire': 6500,
    'Mobile crane hire': 8500, 'Telehandler or forklift hire': 2800, 'Excavator hire': 3200,
    'TLB hire': 3800, 'Bobcat or skid-steer hire': 2200, 'Tipper truck hire': 2500,
    'Water bowser hire': 1800, 'Generator hire': 1200, 'Compressor and breaker hire': 1450,
    'Scaffolding hire': 850, 'Formwork and prop hire': 950, 'Vibrator and poker hire': 550,
    'Plate compactor hire': 650,
    // Site services & preliminaries
    'Site supervision and management': 3500, 'Site foreman day work': 1450, 'Setting out by engineer': 4500,
    'Quantity surveyor measurement': 3800, 'Health and safety officer attendance': 2800, 'Traffic accommodation and signage': 1650,
    'Temporary works design': 5500, 'De-watering and pumping': 950, 'Dust and noise control': 750,
    'Waste skips and disposal': 1850, 'Daily site cleaning and housekeeping': 650, 'As-built drawings and handover file': 2500,
    'Preliminaries and standing time': 1200,
    // Wet trades & tiling
    'Screed floors': 85, 'Lay floor tiling': 120, 'Lay wall tiling': 120,
    'Fix tiles to wet areas': 145, 'Waterproof wet area before tiling': 95, 'Fit skirting and trims': 55,
    'Grout and seal tiling': 45, 'Level and flatten substrate': 65, 'Build tiled shower or recess': 3500,
    'Install sanitaryware and fittings': 750, 'Fit kitchens and vanities': 1850,
    // Hard landscaping
    'Excavate and prepare kerb line': 65, 'Install kerbs and edgings': 85, 'Lay interlocking paving': 95,
    'Lay clay or concrete pavers': 110, 'Install drainage channels': 185, 'Build block paving driveway': 120,
    'Construct retaining planter': 1450, 'Lay topsoil and grass': 55, 'Install irrigation sleeves': 65,
    'Build gabion or stone wall': 1250
});
const storedServiceRates = JSON.parse(localStorage.getItem(storageKey('service-rates')) || '{}');
Object.assign(serviceRates, storedServiceRates);
const serviceUnits = JSON.parse(localStorage.getItem(storageKey('service-units')) || '{}');
/* =========================================================
   DEFAULT SERVICE UNITS
   ---------------------------------------------------------
   Most construction work is measured, not counted: m² for
   plaster, tiling, roofing, paving and screeds; m³ for
   concrete, excavation and backfill; m (linear) for kerbs,
   skirtings, pipes and flashings; tonne for aggregates and
   steel. Anything not listed here falls back to 'Each'.

   These are DEFAULTS only. A unit edited on the Price list
   screen is saved to localStorage and overrides the entry
   below, and any service line's unit can be changed on the
   quote itself.
   ========================================================= */
const defaultServiceUnits = {
    // Structural concrete & reinforcement
    'Excavate and prepare footing': 'm³', 'Place blinding layer': 'm²', 'Fix footing reinforcement': 'kg',
    'Structural setting out': 'Job',
    'Pour footing concrete': 'm³', 'Erect column and wall formwork': 'm²', 'Fix column reinforcement': 'kg',
    'Pour column concrete': 'm³', 'Cast suspended slab': 'm²', 'Place slab reinforcement and mesh': 'kg',
    'Strip formwork and prop': 'm²', 'Cure concrete elements': 'm²', 'Cast concrete retaining structure': 'm³',
    'Apply concrete surface finish': 'm²',
    // Formwork & reinforcement
    'Design or check formwork': 'Job', 'Erect formwork and props': 'm²', 'Strike and remove formwork': 'm²',
    'Cut, bend and fix rebar': 'kg', 'Fix mesh reinforcement': 'm²', 'Fix starters and dowels': 'Each',
    'Position spacers and chairs': 'm²', 'Fix lap and cover to specification': 'm²', 'Erect reinforcing cages': 'Tonne',
    'Fabricate and fix steel connectors': 'Each',
    // Demolition
    'Demolish building or structure': 'm²', 'Soft strip-out of interiors': 'm²', 'Strip roof covering': 'm²',
    'Remove structural steel': 'Tonne', 'Break out floor slabs and bases': 'm³', 'Remove foundations and footings': 'm³',
    'Cut and remove reinforced concrete': 'm³', 'Sort demolition waste for recycling': 'Load',
    'Load and cart away demolition rubble': 'Load', 'Backfill and level demolished area': 'm³',
    'Provide demolition method statement': 'Job',
    // Site establishment
    'Site establishment and hoarding': 'Job', 'Erect temporary fencing or hoarding': 'm', 'Site clearance and levelling': 'm²',
    'Set out and mark site boundary': 'm', 'Establish site access and haul routes': 'm²', 'Install site board and signage': 'Each',
    'Set up site office or store': 'Job', 'Temporary water and power connection': 'Job', 'Install temporary sanitation': 'Each',
    'Establish material laydown area': 'm²', 'Protect existing services and trees': 'm', 'Erect scaffolding and access platforms': 'm²',
    'Dismantle and demobilise site': 'Job',
    // Roofing & waterproofing
    'Erect roof trusses or rafters': 'm²', 'Install purlins and battens': 'm²', 'Fit roof sheeting or tiles': 'm²',
    'Fit ridge and barge cappings': 'm', 'Install fascia and gutters': 'm', 'Fit roof insulation': 'm²',
    'Seal roof penetrations and flashings': 'm', 'Install roof lights or vents': 'Each', 'Apply roof waterproofing system': 'm²',
    'Install valley and rainwater outlets': 'Each', 'Torch-on membrane installation': 'm²', 'Liquid waterproofing application': 'm²',
    'Roof inspection and repair': 'Job',
    // Brickwork & blockwork
    'Lay brickwork': 'm²', 'Build new wall': 'm²', 'Build half-brick wall': 'm²', 'Build retaining wall': 'm²',
    'Build garden or boundary wall': 'm²', 'Erect brickwork to line': 'm²', 'Build pillars and columns': 'm',
    'Point and finish brickwork': 'm²', 'Close up doorway or opening': 'm²', 'Fit damp-proof course': 'm',
    'Cast concrete apron': 'm²', 'Build plastered wall': 'm²', 'Build brick pillar': 'm',
    // Plastering & screeds
    'Plaster interior wall': 'm²', 'Plaster exterior wall': 'm²', 'Plaster new brickwork': 'm²',
    'Skim coat existing wall': 'm²', 'Skim coat ceiling': 'm²', 'Plaster ceiling': 'm²',
    'Patch and repair plaster': 'm²', 'Crack repair and plastering': 'm²', 'Re-plaster damaged wall section': 'm²',
    'Plaster around window or door': 'm', 'Plaster around electrical box': 'Each', 'Screed wall for tiling': 'm²',
    'Lay floor screed': 'm²', 'Screed floors': 'm²', 'Prepare wall for painting': 'm²',
    // Coatings & painting
    'Prepare and clean surface': 'm²', 'High-pressure cleaning': 'm²', 'Sand and abrade surface': 'm²',
    'Apply primer or sealer coat': 'm²', 'Apply first coat': 'm²', 'Apply second or final coat': 'm²',
    'Apply waterproofing coating': 'm²', 'Apply epoxy floor coating': 'm²', 'Apply roof waterproofing coating': 'm²',
    'Apply damp-proof coating': 'm²', 'Apply texture or decorative coating': 'm²', 'Apply protective clear coat': 'm²',
    'Apply anti-corrosion coating': 'm²', 'Apply fire-retardant coating': 'm²', 'Apply coating to wall': 'm²',
    'Apply coating to ceiling': 'm²', 'Apply coating to floor': 'm²', 'Apply coating to exterior': 'm²',
    'Apply coating to metal surface': 'm²', 'Apply coating to concrete': 'm²', 'Apply coating to plaster': 'm²',
    'Apply coating to wood': 'm²', 'Spray application of coating': 'm²', 'Roller application of coating': 'm²',
    'Brush application of detail work': 'm', 'Apply line marking or road marking': 'm', 'Treat mould or algae': 'm²',
    'Prepare and prime new plaster': 'm²', 'Paint ceiling': 'm²', 'Paint interior walls': 'm²',
    'Paint exterior walls': 'm²', 'Paint trim and doors': 'm', 'Paint metalwork': 'm²',
    'Apply roof coating': 'm²', 'Apply waterproofing': 'm²', 'Apply line marking': 'm', 'Spray paint finish': 'm²',
    // Wet trades & tiling
    'Lay floor tiling': 'm²', 'Lay wall tiling': 'm²', 'Fix tiles to wet areas': 'm²',
    'Waterproof wet area before tiling': 'm²', 'Grout and seal tiling': 'm²', 'Level and flatten substrate': 'm²',
    'Fit skirting and trims': 'm', 'Build tiled shower or recess': 'Each', 'Install sanitaryware and fittings': 'Each',
    // Hard landscaping
    'Excavate and prepare kerb line': 'm', 'Install kerbs and edgings': 'm', 'Lay interlocking paving': 'm²',
    'Lay clay or concrete pavers': 'm²', 'Install drainage channels': 'm', 'Build block paving driveway': 'm²',
    'Construct retaining planter': 'm', 'Lay topsoil and grass': 'm²', 'Install irrigation sleeves': 'm',
    'Build gabion or stone wall': 'm²', 'Replace paving': 'm²', 'Relay paving': 'm²', 'Reinstall paving': 'm²',
    'Level paving': 'm²', 'Lay tiles or paving': 'm²',
    // Excavation & civil
    'Excavate soil': 'm³', 'Excavate trench': 'm³', 'Remove soil and rubble': 'm³', 'Backfill trench': 'm³',
    'Compact or stamp ground': 'm²', 'Level ground': 'm²', 'Lay bedding sand': 'm²', 'Land bedding sand': 'm²',
    'Break and remove concrete': 'm³', 'Break concrete or floor': 'm³', 'Core drill through wall': 'Each',
    'Chase wall for cable or pipe': 'm', 'Cut opening in wall': 'm²', 'Remove tiles': 'm²', 'Remove paving': 'm²',
    'Repair concrete': 'm²', 'Repair tiles': 'm²', 'Install kerbs': 'm'
};
function defaultServiceUnit(task) { return defaultServiceUnits[task] || 'Each'; }
const scenarios = {
    'handyman-odd-jobs': { services: [{ category: 'General handyman', task: 'General maintenance inspection', quantity: 1, rate: 550 }, { category: 'General handyman', task: 'Small repairs and odd jobs', quantity: 1, rate: 450 }, { category: 'Additional labour', task: 'Clean work area', quantity: 1, rate: 250 }], materials: [{ category: 'Fasteners & fixings', type: 'Wall plug & screw set', size: 'Assorted (100)', quantity: 1, description: 'Wall plug & screw set - Assorted (100)', cost: 145, markup: MATERIAL_MARKUP }] },
    'handyman-shelves': { services: [{ category: 'General handyman', task: 'General maintenance inspection', quantity: 1, rate: 550 }, { category: 'General handyman', task: 'Fit shelving and brackets', quantity: 1, rate: 450 }, { category: 'Additional labour', task: 'Clean work area', quantity: 1, rate: 250 }], materials: [{ category: 'Shelving & hardware', type: 'Shelf bracket', size: '200mm (2)', quantity: 2, description: 'Shelf bracket - 200mm (2)', cost: 85, markup: MATERIAL_MARKUP }, { category: 'Shelving & hardware', type: 'Shelving board', size: '1.2m x 300mm', quantity: 1, description: 'Shelving board - 1.2m x 300mm', cost: 245, markup: MATERIAL_MARKUP }] },
    'handyman-door': { services: [{ category: 'General handyman', task: 'General maintenance inspection', quantity: 1, rate: 550 }, { category: 'General handyman', task: 'Hang doors and fit hardware', quantity: 1, rate: 550 }], materials: [{ category: 'Doors, windows & joinery', type: 'Hinge', size: '75mm (2)', quantity: 2, description: 'Hinge - 75mm (2)', cost: 55, markup: MATERIAL_MARKUP }, { category: 'Doors, windows & joinery', type: 'Door handle', size: 'Lever set', quantity: 1, description: 'Door handle - Lever set', cost: 285, markup: MATERIAL_MARKUP }] },
    'handyman-tv-mount': { services: [{ category: 'General handyman', task: 'Mount TV or wall bracket', quantity: 1, rate: 650 }, { category: 'Additional labour', task: 'Clean work area', quantity: 1, rate: 250 }], materials: [{ category: 'Fasteners & fixings', type: 'Masonry anchor', size: '8mm (25)', quantity: 1, description: 'Masonry anchor - 8mm (25)', cost: 180, markup: MATERIAL_MARKUP }] },
    'electric-fault': { services: [{ category: 'Electrical work', task: 'Electrical call-out and inspection', quantity: 1, rate: 750 }, { category: 'Electrical work', task: 'Trace and repair electrical fault', quantity: 1, rate: 750 }, { category: 'Electrical work', task: 'Test and certify installation', quantity: 1, rate: 1200 }], materials: [{ category: 'Electrical', type: 'Electrical cable', size: '2.5mm x 100m', quantity: 1, description: 'Electrical cable - 2.5mm x 100m', cost: 1450, markup: MATERIAL_MARKUP }] },
    'electric-coc': { services: [{ category: 'Electrical work', task: 'Electrical call-out and inspection', quantity: 1, rate: 750 }, { category: 'Electrical work', task: 'Test and certify installation', quantity: 1, rate: 1200 }, { category: 'Electrical work', task: 'Issue electrical Certificate of Compliance (COC)', quantity: 1, rate: 2500 }], materials: [] },
    'electric-plug': { services: [{ category: 'Electrical work', task: 'Electrical call-out and inspection', quantity: 1, rate: 750 }, { category: 'Electrical work', task: 'Install plug point or socket outlet', quantity: 1, rate: 550 }], materials: [{ category: 'Electrical', type: 'Plug point / socket outlet', size: 'Double 16A', quantity: 1, description: 'Plug point / socket outlet - Double 16A', cost: 265, markup: MATERIAL_MARKUP }, { category: 'Electrical', type: 'Electrical cable', size: '2.5mm x 100m', quantity: 1, description: 'Electrical cable - 2.5mm x 100m', cost: 1450, markup: MATERIAL_MARKUP }] },
    'electric-light': { services: [{ category: 'Electrical work', task: 'Electrical call-out and inspection', quantity: 1, rate: 750 }, { category: 'Electrical work', task: 'Install ceiling or downlight', quantity: 1, rate: 500 }, { category: 'Electrical work', task: 'Install light switch', quantity: 1, rate: 450 }], materials: [{ category: 'Electrical', type: 'Light fitting', size: 'LED downlight', quantity: 1, description: 'Light fitting - LED downlight', cost: 145, markup: MATERIAL_MARKUP }] },
    'building-wall': { services: [{ category: 'Building work', task: 'Building call-out and inspection', quantity: 1, rate: 750 }, { category: 'Building work', task: 'Lay brickwork', quantity: 1, rate: 650 }, { category: 'Plastering & skimming', task: 'Plaster new brickwork', quantity: 1, rate: 550 }], materials: [{ category: 'Building & masonry', type: 'Brick', size: 'Clay stock (1000)', quantity: 1, description: 'Brick - Clay stock (1000)', cost: 3200, markup: MATERIAL_MARKUP }, { category: 'Building & masonry', type: 'Cement', size: '50kg PPC', quantity: 5, description: 'Cement - 50kg PPC', cost: 125, markup: MATERIAL_MARKUP }] },
    'building-slab': { services: [{ category: 'Building work', task: 'Building call-out and inspection', quantity: 1, rate: 750 }, { category: 'Building work', task: 'Cast concrete slab', quantity: 1, rate: 1500 }, { category: 'Excavation & ground work', task: 'Compact or stamp ground', quantity: 1, rate: 350 }], materials: [{ category: 'Building & masonry', type: 'Cement', size: '50kg PPC', quantity: 10, description: 'Cement - 50kg PPC', cost: 125, markup: MATERIAL_MARKUP }, { category: 'Building & masonry', type: 'Mesh reinforcement', size: 'A142 2.4 x 6m', quantity: 2, description: 'Mesh reinforcement - A142 2.4 x 6m', cost: 950, markup: MATERIAL_MARKUP }] },
    'plaster-wall': { services: [{ category: 'Plastering & skimming', task: 'Plastering call-out and inspection', quantity: 1, rate: 650 }, { category: 'Plastering & skimming', task: 'Plaster interior wall', quantity: 1, rate: 550 }, { category: 'Plastering & skimming', task: 'Prepare wall for painting', quantity: 1, rate: 450 }], materials: [{ category: 'Plaster & coatings', type: 'Plaster skim', size: '40kg', quantity: 3, description: 'Plaster skim - 40kg', cost: 285, markup: MATERIAL_MARKUP }, { category: 'Plaster & coatings', type: 'Bonding liquid', size: '5L', quantity: 1, description: 'Bonding liquid - 5L', cost: 285, markup: MATERIAL_MARKUP }] },
    'plaster-skim': { services: [{ category: 'Plastering & skimming', task: 'Plastering call-out and inspection', quantity: 1, rate: 650 }, { category: 'Plastering & skimming', task: 'Skim coat existing wall', quantity: 1, rate: 500 }], materials: [{ category: 'Plaster & coatings', type: 'Plaster skim', size: '25kg', quantity: 2, description: 'Plaster skim - 25kg', cost: 195, markup: MATERIAL_MARKUP }] },
    'coatings-waterproofing': { services: [{ category: 'Coatings & painting', task: 'Coatings call-out and inspection', quantity: 1, rate: 750 }, { category: 'Coatings & painting', task: 'Prepare and clean surface', quantity: 1, rate: 450 }, { category: 'Coatings & painting', task: 'Apply waterproofing coating', quantity: 1, rate: 850 }], materials: [{ category: 'Plaster & coatings', type: 'Waterproofing membrane', size: '20kg cementitious', quantity: 2, description: 'Waterproofing membrane - 20kg cementitious', cost: 885, markup: MATERIAL_MARKUP }] },
    'coatings-interior-paint': { services: [{ category: 'Coatings & painting', task: 'Coatings call-out and inspection', quantity: 1, rate: 750 }, { category: 'Coatings & painting', task: 'Apply primer or sealer coat', quantity: 1, rate: 550 }, { category: 'Coatings & painting', task: 'Apply first coat', quantity: 1, rate: 600 }, { category: 'Coatings & painting', task: 'Apply second or final coat', quantity: 1, rate: 600 }], materials: [{ category: 'Plaster & coatings', type: 'Interior paint', size: '20L white', quantity: 2, description: 'Interior paint - 20L white', cost: 1150, markup: MATERIAL_MARKUP }, { category: 'Plaster & coatings', type: 'Primer / sealer', size: '20L', quantity: 1, description: 'Primer / sealer - 20L', cost: 985, markup: MATERIAL_MARKUP }] }
};
const scenarioEntries = {
    'handyman-odd-jobs': [['General handyman', 'General maintenance inspection'], ['General handyman', 'General repair work'], ['General handyman', 'Small repairs and odd jobs'], ['General handyman', 'Replace door handle'], ['General handyman', 'Repair squeaky door or hinge'], ['General handyman', 'Seal gaps and apply silicone'], ['General handyman', 'Paint touch-up after repair'], ['Additional labour', 'Clean work area']],
    'handyman-shelves': [['General handyman', 'General maintenance inspection'], ['General handyman', 'Fit shelving and brackets'], ['General handyman', 'Assemble flat-pack furniture'], ['General handyman', 'Hang pictures and mirrors'], ['General handyman', 'Fit curtain rails and blinds'], ['Additional labour', 'Clean work area']],
    'handyman-door': [['General handyman', 'General maintenance inspection'], ['General handyman', 'Hang doors and fit hardware'], ['General handyman', 'Fit door locks and handles'], ['General handyman', 'Repair cupboard doors and hinges'], ['General handyman', 'Seal gaps and apply silicone'], ['Additional labour', 'Clean work area']],
    'handyman-tv-mount': [['General handyman', 'General maintenance inspection'], ['General handyman', 'Mount TV or wall bracket'], ['General handyman', 'Fit shelving and brackets'], ['General handyman', 'Seal gaps and apply silicone'], ['Additional labour', 'Clean work area']],
    'electric-fault': [['Electrical work', 'Electrical call-out and inspection'], ['Electrical work', 'Trace and repair electrical fault'], ['Electrical work', 'Replace faulty wiring'], ['Electrical work', 'Replace circuit breaker'], ['Electrical work', 'Test and certify installation'], ['Additional labour', 'Clean work area']],
    'electric-coc': [['Electrical work', 'Electrical call-out and inspection'], ['Electrical work', 'Test and certify installation'], ['Electrical work', 'Inspect and repair DB board'], ['Electrical work', 'Bond and earth installation'], ['Electrical work', 'Issue electrical Certificate of Compliance (COC)']],
    'electric-plug': [['Electrical work', 'Electrical call-out and inspection'], ['Breaking & access', 'Open or chase wall'], ['Electrical work', 'Install plug point or socket outlet'], ['Electrical work', 'Install new wiring circuit'], ['Restoration', 'Close wall'], ['Restoration', 'Plaster wall'], ['Additional labour', 'Clean work area']],
    'electric-light': [['Electrical work', 'Electrical call-out and inspection'], ['Electrical work', 'Install ceiling or downlight'], ['Electrical work', 'Install light switch'], ['Electrical work', 'Replace faulty light fitting'], ['Electrical work', 'Test and certify installation'], ['Additional labour', 'Clean work area']],
    'electric-outdoor-light': [['Electrical work', 'Electrical call-out and inspection'], ['Electrical work', 'Install security or flood light'], ['Electrical work', 'Install outdoor or garden light'], ['Electrical work', 'Install new wiring circuit'], ['Electrical work', 'Test and certify installation'], ['Additional labour', 'Clean work area']],
    'electric-db-board': [['Electrical work', 'Electrical call-out and inspection'], ['Electrical work', 'Install distribution board'], ['Electrical work', 'Replace circuit breaker'], ['Electrical work', 'Install earth leakage unit'], ['Electrical work', 'Bond and earth installation'], ['Electrical work', 'Test and certify installation']],
    'building-wall': [['Building work', 'Building call-out and inspection'], ['Building work', 'Set out and mark building lines'], ['Building work', 'Lay foundation'], ['Building work', 'Build new wall'], ['Building work', 'Point and finish brickwork'], ['Plastering & skimming', 'Plaster new brickwork'], ['Additional labour', 'Remove building rubble'], ['Additional labour', 'Clean work area']],
    'building-boundary-wall': [['Building work', 'Building call-out and inspection'], ['Building work', 'Set out and mark building lines'], ['Building work', 'Build foundation or footing'], ['Building work', 'Build garden or boundary wall'], ['Building work', 'Build pillars and columns'], ['Building work', 'Point and finish brickwork'], ['Additional labour', 'Remove building rubble'], ['Additional labour', 'Clean work area']],
    'building-retaining-wall': [['Building work', 'Building call-out and inspection'], ['Building work', 'Set out and mark building lines'], ['Excavation & ground work', 'Excavate trench'], ['Building work', 'Build foundation or footing'], ['Building work', 'Build retaining wall'], ['Building work', 'Fit damp-proof course'], ['Building work', 'Point and finish brickwork'], ['Additional labour', 'Remove building rubble'], ['Additional labour', 'Clean work area']],
    'building-doorway': [['Building work', 'Building call-out and inspection'], ['Building work', 'Open up new doorway'], ['Building work', 'Fit lintel or beam'], ['Building work', 'Fit steel or wooden door'], ['Plastering & skimming', 'Plaster around window or door'], ['Restoration', 'Make good damaged area'], ['Additional labour', 'Remove building rubble'], ['Additional labour', 'Clean work area']],
    'building-close-opening': [['Building work', 'Building call-out and inspection'], ['Building work', 'Close up doorway or opening'], ['Building work', 'Lay brickwork'], ['Building work', 'Point and finish brickwork'], ['Plastering & skimming', 'Plaster interior wall'], ['Restoration', 'Make good damaged area'], ['Additional labour', 'Remove building rubble'], ['Additional labour', 'Clean work area']],
    'building-slab': [['Building work', 'Building call-out and inspection'], ['Building work', 'Set out and mark building lines'], ['Excavation & ground work', 'Excavate soil'], ['Excavation & ground work', 'Compact or stamp ground'], ['Building work', 'Cast concrete slab'], ['Building work', 'Mix and pour concrete'], ['Additional labour', 'Remove building rubble'], ['Additional labour', 'Clean work area']],
    'building-ceiling': [['Building work', 'Building call-out and inspection'], ['Building work', 'Fit ceilings'], ['Plastering & skimming', 'Skim coat ceiling'], ['Plastering & skimming', 'Plaster ceiling'], ['Plastering & skimming', 'Prepare wall for painting'], ['Additional labour', 'Clean work area']],
    'plaster-wall': [['Plastering & skimming', 'Plastering call-out and inspection'], ['Plastering & skimming', 'Prepare wall for painting'], ['Plastering & skimming', 'Apply bonding agent'], ['Plastering & skimming', 'Plaster interior wall'], ['Plastering & skimming', 'Level and float plaster'], ['Plastering & skimming', 'Wet and dry polish plaster'], ['Additional labour', 'Clean work area']],
    'plaster-skim': [['Plastering & skimming', 'Plastering call-out and inspection'], ['Plastering & skimming', 'Skim coat existing wall'], ['Plastering & skimming', 'Level and float plaster'], ['Plastering & skimming', 'Rub down and smooth plaster'], ['Plastering & skimming', 'Prepare wall for painting'], ['Additional labour', 'Clean work area']],
    'plaster-repair': [['Plastering & skimming', 'Plastering call-out and inspection'], ['Breaking & access', 'Open or chase wall'], ['Plastering & skimming', 'Repair plaster cracks'], ['Plastering & skimming', 'Patch and repair plaster'], ['Plastering & skimming', 'Re-plaster damaged wall section'], ['Plastering & skimming', 'Rub down and smooth plaster'], ['Additional labour', 'Clean work area']],
    'plaster-ceiling': [['Plastering & skimming', 'Plastering call-out and inspection'], ['Plastering & skimming', 'Skim coat ceiling'], ['Plastering & skimming', 'Plaster ceiling'], ['Plastering & skimming', 'Level and float plaster'], ['Additional labour', 'Clean work area']],
    'coatings-interior-paint': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'Prepare and clean surface'], ['Coatings & painting', 'Mask and protect areas'], ['Coatings & painting', 'Repair cracks before coating'], ['Coatings & painting', 'Apply primer or sealer coat'], ['Coatings & painting', 'Apply first coat'], ['Coatings & painting', 'Apply second or final coat'], ['Coatings & painting', 'Touch up damaged coating'], ['Additional labour', 'Clean work area']],
    'coatings-exterior-paint': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'High-pressure cleaning'], ['Coatings & painting', 'Sand and abrade surface'], ['Coatings & painting', 'Treat mould or algae'], ['Coatings & painting', 'Repair cracks before coating'], ['Coatings & painting', 'Apply primer or sealer coat'], ['Coatings & painting', 'Apply first coat'], ['Coatings & painting', 'Apply second or final coat'], ['Additional labour', 'Clean work area']],
    'coatings-waterproofing': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'Prepare and clean surface'], ['Coatings & painting', 'Repair cracks before coating'], ['Coatings & painting', 'Apply primer or sealer coat'], ['Coatings & painting', 'Apply waterproofing coating'], ['Coatings & painting', 'Apply second or final coat'], ['Coatings & painting', 'Cure and protect new coating'], ['Additional labour', 'Clean work area']],
    'coatings-roof': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'High-pressure cleaning'], ['Coatings & painting', 'Treat mould or algae'], ['Coatings & painting', 'Apply primer or sealer coat'], ['Coatings & painting', 'Apply roof waterproofing coating'], ['Coatings & painting', 'Apply second or final coat'], ['Additional labour', 'Clean work area']],
    'coatings-epoxy-floor': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'Prepare and clean surface'], ['Coatings & painting', 'Sand and abrade surface'], ['Coatings & painting', 'Fill and level surface'], ['Coatings & painting', 'Apply epoxy floor coating'], ['Coatings & painting', 'Cure and protect new coating'], ['Additional labour', 'Clean work area']],
    'coatings-damp-proof': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'Prepare and clean surface'], ['Plastering & skimming', 'Repair plaster damp damage'], ['Coatings & painting', 'Apply damp-proof coating'], ['Coatings & painting', 'Apply second or final coat'], ['Additional labour', 'Clean work area']],
    'coatings-metal-anti-corrosion': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'Prepare and clean surface'], ['Coatings & painting', 'Sand and abrade surface'], ['Coatings & painting', 'Apply anti-corrosion coating'], ['Coatings & painting', 'Apply first coat'], ['Coatings & painting', 'Apply second or final coat'], ['Additional labour', 'Clean work area']],
    'coatings-line-marking': [['Coatings & painting', 'Coatings call-out and inspection'], ['Coatings & painting', 'Prepare and clean surface'], ['Coatings & painting', 'Mask and protect areas'], ['Coatings & painting', 'Apply line marking or road marking'], ['Coatings & painting', 'Cure and protect new coating'], ['Additional labour', 'Clean work area']],
    'plaster-after-chase': [['Breaking & access', 'Open or chase wall'], ['Plastering & skimming', 'Close chase and plaster'], ['Plastering & skimming', 'Fill and plaster chase'], ['Plastering & skimming', 'Prepare wall for painting'], ['Additional labour', 'Remove rubble'], ['Additional labour', 'Clean work area']],
    'excavation-only': [['Excavation & ground work', 'Mark excavation area'], ['Breaking & access', 'Remove paving'], ['Breaking & access', 'Break concrete'], ['Excavation & ground work', 'Excavate trench'], ['Excavation & ground work', 'Excavate soil'], ['Excavation & ground work', 'Remove excess soil'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Reinstate paving or concrete'], ['Additional labour', 'Clean work area']],
    'paving-access': [['Excavation & ground work', 'Mark excavation area'], ['Excavation & ground work', 'Carefully remove paving'], ['Excavation & ground work', 'Store paving for reuse'], ['Excavation & ground work', 'Excavate trench'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Reinstall paving'], ['Restoration', 'Level paving'], ['Additional labour', 'Clean area']],
    'concrete-access': [['Breaking & access', 'Cut opening in wall'], ['Breaking & access', 'Break concrete'], ['Breaking & access', 'Remove concrete rubble'], ['Excavation & ground work', 'Excavate soil'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Prepare concrete area'], ['Restoration', 'Pour new concrete'], ['Restoration', 'Finish concrete'], ['Additional labour', 'Clean area']]
};
Object.entries(scenarioEntries).forEach(([id, entries]) => { scenarios[id] = { services: entries.map(([category, task]) => ({ category, task, quantity: 1, rate: serviceRates[task] || 350 })), materials: [] }; });
const masterScenarioLibrary = [
    ['Handyman Repairs', 'General handyman odd jobs', 'Call-out and inspection|Assess repair scope|Small repairs and odd jobs|Tighten and adjust fittings|Replace worn hardware|Seal gaps and apply silicone|Paint touch-up after repair|Clean work area|Final walkthrough with customer'],
    ['Handyman Repairs', 'Door repair or replacement', 'Inspection|Measure opening|Remove existing door|Supply new door|Fit door frame|Hang door|Fit hinges|Fit door handle|Fit door lock|Adjust alignment|Test operation|Clean work area'],
    ['Handyman Repairs', 'Shelving and storage installation', 'Inspection|Mark fixing positions|Drill and plug wall|Fit brackets|Fit shelving board|Level and secure|Load test|Clean work area'],
    ['Handyman Repairs', 'TV or wall mounting', 'Inspection|Locate studs or solid wall|Mark bracket position|Drill and fix bracket|Mount unit|Level and secure|Check cable routing|Load test|Clean work area'],
    ['Handyman Repairs', 'Cupboard and drawer repairs', 'Inspection|Adjust cupboard doors|Replace hinges|Replace drawer runners|Replace cupboard handles|Align doors|Test operation|Clean work area'],
    ['Handyman Repairs', 'Gutter cleaning and repair', 'Inspection|Set up access equipment|Clear leaves and debris|Flush gutters|Check downpipe flow|Reseal gutter joints|Replace damaged bracket|Test water flow|Clean work area'],
    ['Handyman Repairs', 'Gate and fence repair', 'Inspection|Replace gate hinge|Fit gate latch|Repair fence panel|Replace paling|Treat timber|Adjust alignment|Test operation|Clean work area'],
    ['Electrical Work', 'Electrical fault finding', 'Electrical call-out and inspection|Isolate circuit|Test circuit|Trace and repair electrical fault|Replace faulty wiring|Replace faulty component|Test and certify installation|Restore supply|Complete certificate of compliance'],
    ['Electrical Work', 'Certificate of Compliance (COC)', 'Electrical call-out and inspection|Inspect distribution board|Test earth leakage unit|Test earth continuity|Test bonding|Inspect circuits|Inspect socket outlets|Inspect light fittings|Issue electrical Certificate of Compliance (COC)|Issue test report'],
    ['Electrical Work', 'Plug point installation', 'Electrical call-out and inspection|Plan circuit route|Chase wall or install trunking|Install new wiring circuit|Install plug point or socket outlet|Connect and terminate|Test circuit|Restore supply|Clean work area'],
    ['Electrical Work', 'Light fitting installation', 'Electrical call-out and inspection|Isolate circuit|Remove existing fitting|Install ceiling or downlight|Install light switch|Connect and terminate|Test operation|Restore supply|Clean work area'],
    ['Electrical Work', 'Distribution board installation', 'Electrical call-out and inspection|Isolate supply|Remove existing board|Install distribution board|Replace circuit breaker|Install earth leakage unit|Bond and earth installation|Restore supply|Test and certify installation'],
    ['Building Work', 'New wall construction', 'Building call-out and inspection|Set out and mark building lines|Excavate footing|Lay foundation|Lay brickwork|Build pillars and columns|Fit lintel or beam|Point and finish brickwork|Clean work area'],
    ['Building Work', 'Boundary or garden wall', 'Building call-out and inspection|Set out and mark building lines|Build foundation or footing|Build garden or boundary wall|Build pillars and columns|Fit damp-proof course|Point and finish brickwork|Clean work area'],
    ['Building Work', 'Retaining wall', 'Building call-out and inspection|Set out and mark building lines|Excavate trench|Build foundation or footing|Build retaining wall|Install drainage weep holes|Fit damp-proof course|Point and finish brickwork|Backfill and compact|Clean work area'],
    ['Building Work', 'New doorway or opening', 'Building call-out and inspection|Mark opening|Cut opening in wall|Fit lintel or beam|Fit steel or wooden door|Fit window or door frame|Plaster around window or door|Make good damaged area|Clean work area'],
    ['Building Work', 'Concrete slab casting', 'Building call-out and inspection|Set out and mark building lines|Excavate soil|Compact or stamp ground|Lay bedding sand|Install mesh reinforcement|Cast concrete slab|Level and finish concrete|Cure concrete|Clean work area'],
    ['Building Work', 'Ceiling installation', 'Building call-out and inspection|Set out ceiling height|Install ceiling brandering|Fit ceilings|Skim coat ceiling|Plaster ceiling|Clean work area'],
    ['Building Work', 'Roof repair', 'Building call-out and inspection|Inspect roof structure|Replace damaged roof timber|Fit roof sheeting or tiles|Replace roof sheet|Seal roof penetrations|Check gutter and downpipe|Clean work area'],
    ['Building Work', 'Window installation', 'Building call-out and inspection|Measure opening|Install window or door frame|Fit window or door|Seal window frame|Plaster around window or door|Make good damaged area|Clean work area'],
    ['Plastering & Skimming', 'Plaster interior wall', 'Plastering call-out and inspection|Prepare surface|Apply bonding agent|Measure and mix plaster|Plaster interior wall|Level and float plaster|Wet and dry polish plaster|Finish plaster edge|Clean work area'],
    ['Plastering & Skimming', 'Plaster exterior wall', 'Plastering call-out and inspection|Prepare surface|Apply bonding agent|Measure and mix plaster|Plaster exterior wall|Float and level plaster|Finish plaster edge|Apply exterior coat|Clean work area'],
    ['Plastering & Skimming', 'Skim coat existing wall', 'Plastering call-out and inspection|Prepare surface|Skim coat existing wall|Skim coat ceiling|Level and float plaster|Rub down and smooth plaster|Prepare wall for painting|Clean work area'],
    ['Plastering & Skimming', 'Plaster crack repair', 'Plastering call-out and inspection|Open crack|Remove loose plaster|Apply bonding agent|Patch and repair plaster|Re-plaster damaged wall section|Rub down and smooth plaster|Prepare wall for painting|Clean work area'],
    ['Plastering & Skimming', 'New brickwork plastering', 'Plastering call-out and inspection|Prepare surface|Apply bonding agent|Measure and mix plaster|Plaster new brickwork|Level and float plaster|Wet and dry polish plaster|Clean work area'],
    ['Plastering & Skimming', 'Plaster after pipe or cable chase', 'Mark chase line|Chase wall|Fit plaster beading and corner beads|Fill and plaster chase|Skim coat existing wall|Rub down and smooth plaster|Prepare wall for painting|Clean work area'],
    ['Coatings & Painting', 'Interior painting', 'Coatings call-out and inspection|Prepare and clean surface|Mask and protect areas|Fill and level surface|Apply primer or sealer coat|Apply first coat|Apply second or final coat|Touch up damaged coating|Clean work area'],
    ['Coatings & Painting', 'Exterior painting', 'Coatings call-out and inspection|High-pressure cleaning|Sand and abrade surface|Treat mould or algae|Repair cracks before coating|Apply primer or sealer coat|Apply first coat|Apply second or final coat|Clean work area'],
    ['Coatings & Painting', 'Waterproofing application', 'Coatings call-out and inspection|Prepare and clean surface|Repair cracks before coating|Apply primer or sealer coat|Apply waterproofing coating|Apply second or final coat|Cure and protect new coating|Clean work area'],
    ['Coatings & Painting', 'Roof waterproofing', 'Coatings call-out and inspection|High-pressure cleaning|Treat mould or algae|Repair cracks before coating|Apply primer or sealer coat|Apply roof waterproofing coating|Apply second or final coat|Clean work area'],
    ['Coatings & Painting', 'Epoxy floor coating', 'Coatings call-out and inspection|Prepare and clean surface|Sand and abrade surface|Fill and level surface|Mask and protect areas|Apply epoxy floor coating|Cure and protect new coating|Clean work area'],
    ['Coatings & Painting', 'Damp-proof coating', 'Coatings call-out and inspection|Prepare and clean surface|Repair plaster damp damage|Apply primer or sealer coat|Apply damp-proof coating|Apply second or final coat|Clean work area'],
    ['Coatings & Painting', 'Anti-corrosion metal coating', 'Coatings call-out and inspection|Prepare and clean surface|Sand and abrade surface|Apply anti-corrosion coating|Apply first coat|Apply second or final coat|Clean work area'],
    ['Compliance & Testing', 'Electrical compliance inspection', 'Electrical call-out and inspection|Inspect distribution board|Test earth leakage unit|Test earth continuity|Test bonding|Inspect circuits|Inspect socket outlets|Inspect light fittings|Issue test report|Issue electrical Certificate of Compliance (COC)'],
    ['Compliance & Testing', 'Workmanship inspection', 'Site inspection|Inspect completed work|Check workmanship standard|Identify defects|Record findings|Snag list|Re-inspection after repairs|Issue completion report'],
    ['Excavation & Civil Works', 'Paving removal and reinstatement', 'Mark work area|Remove paving|Number and store pavers|Excavation|Backfill|Compact|Sand bedding|Replace paving|Cut replacement pavers|Joint sand|Clean area'],
    ['Excavation & Civil Works', 'Concrete breaking and reinstatement', 'Mark work area|Concrete cutting|Concrete breaking|Remove concrete|Excavation|Backfill|Compaction|Reinforcement|Concrete supply|Concrete reinstatement|Finishing|Curing'],
    ['Excavation & Civil Works', 'Tiling removal and reinstatement', 'Protect work area|Remove tiles|Remove adhesive|Repair substrate|Waterproofing repair|Tile adhesive|Replacement tiles|Grouting|Silicone|Cleaning'],
    ['Excavation & Civil Works', 'Excavation and earthworks', 'Site setup|Mark excavation|Hand excavation|Machine excavation|Trenching|Soil removal|Spoil handling|Sand bedding|Backfill|Compaction|Excess soil removal'],
    /* =====================================================================
       CONSTRUCTION SITE SCENARIOS
       ------------------------------------------------------------
       Site-based jobs a general building contractor quotes: setting up
       the site, demolition, footings, columns and slabs, formwork and
       rebar, roofing, plant day-rates, wet trades and hard landscaping.
       ===================================================================== */
    ['Site Establishment', 'Set up a construction site', 'Site establishment and hoarding|Erect temporary fencing or hoarding|Set up site office or store|Temporary water and power connection|Install temporary sanitation|Establish material laydown area|Install site board and signage|Establish site access and haul routes|Protect existing services and trees|Site clearance and levelling'],
    ['Site Establishment', 'Establish site access and haul routes', 'Site establishment and hoarding|Establish site access and haul routes|Site clearance and levelling|Set out and mark site boundary|Traffic accommodation and signage|Protect existing services and trees'],
    ['Site Establishment', 'Demobilise and hand over site', 'Dismantle and demobilise site|Daily site cleaning and housekeeping|Waste skips and disposal|As-built drawings and handover file|Workmanship guarantee inspection'],
    ['Demolition & Strip-Out', 'Demolish a building or structure', 'Demolition survey and make safe|Provide demolition method statement|Soft strip-out of interiors|Strip roof covering|Remove structural steel|Demolish building or structure|Break out floor slabs and bases|Remove foundations and footings|Sort demolition waste for recycling|Load and cart away demolition rubble|Backfill and level demolished area'],
    ['Demolition & Strip-Out', 'Interior soft strip-out', 'Demolition survey and make safe|Soft strip-out of interiors|Remove existing door|Remove tiles|Protect work area|Load and cart away demolition rubble|Daily site cleaning and housekeeping'],
    ['Demolition & Strip-Out', 'Break out concrete and bases', 'Demolition survey and make safe|Cut and remove reinforced concrete|Break out floor slabs and bases|Remove foundations and footings|Load and cart away demolition rubble|Backfill and level demolished area'],
    ['Structural Concrete', 'Cast strip footings', 'Structural setting out|Excavate and prepare footing|Place blinding layer|Fix footing reinforcement|Pour footing concrete|Cure concrete elements|Backfill and level demolished area'],
    ['Structural Concrete', 'Cast columns and walls', 'Structural setting out|Erect column and wall formwork|Fix column reinforcement|Position spacers and chairs|Pour column concrete|Strip formwork and prop|Cure concrete elements'],
    ['Structural Concrete', 'Cast a suspended slab', 'Structural setting out|Erect column and wall formwork|Place slab reinforcement and mesh|Position spacers and chairs|Pour footing concrete|Vibrator and poker hire|Strip formwork and prop|Cure concrete elements|Apply concrete surface finish'],
    ['Structural Concrete', 'Cast a retaining structure', 'Structural setting out|Excavate and prepare footing|Fix footing reinforcement|Erect column and wall formwork|Fix column reinforcement|Cast concrete retaining structure|Strip formwork and prop|Cure concrete elements|Install drainage channels'],
    ['Formwork & Reinforcement', 'Erect and strike formwork', 'Design or check formwork|Erect formwork and props|Formwork and prop hire|Position spacers and chairs|Strip formwork and prop|Daily site cleaning and housekeeping'],
    ['Formwork & Reinforcement', 'Fix reinforcement and mesh', 'Cut, bend and fix rebar|Fix mesh reinforcement|Fix starters and dowels|Position spacers and chairs|Fix lap and cover to specification|Erect reinforcing cages'],
    ['Roofing', 'New roof construction', 'Erect roof trusses or rafters|Install purlins and battens|Fit roof insulation|Fit roof sheeting or tiles|Fit ridge and barge cappings|Install fascia and gutters|Seal roof penetrations and flashings|Check gutter and downpipe'],
    ['Roofing', 'Flat roof waterproofing', 'Prepare and clean surface|Liquid waterproofing application|Torch-on membrane installation|Apply roof waterproofing system|Install valley and rainwater outlets|Seal roof penetrations and flashings|Cure and protect new coating'],
    ['Roofing', 'Roof repair after storm damage', 'Roof inspection and repair|Remove damaged roof timber|Fit roof sheeting or tiles|Fit ridge and barge cappings|Seal roof penetrations and flashings|Clear and clean gutters'],
    ['Plant & Plant Hire', 'Excavator and earthmoving day rates', 'TLB hire|Excavator hire|Bobcat or skid-steer hire|Tipper truck hire|Water bowser hire'],
    ['Plant & Plant Hire', 'Concrete placing plant', 'Concrete mixer hire|Concrete pump hire|Vibrator and poker hire|Telehandler or forklift hire'],
    ['Plant & Plant Hire', 'Lifting and access plant', 'Mobile crane hire|Truck-mounted crane hire|Telehandler or forklift hire|Scaffolding hire'],
    ['Site Preliminaries', 'Site supervision and preliminaries', 'Site supervision and management|Site foreman day work|Health and safety officer attendance|Temporary works design|Preliminaries and standing time|Daily site cleaning and housekeeping'],
    ['Site Preliminaries', 'Setting out and measurement', 'Setting out by engineer|Structural setting out|Set out and mark site boundary|Quantity surveyor measurement|As-built drawings and handover file'],
    ['Wet Trades & Tiling', 'Tile a wet area', 'Waterproof wet area before tiling|Level and flatten substrate|Lay wall tiling|Lay floor tiling|Fix tiles to wet areas|Grout and seal tiling|Install sanitaryware and fittings'],
    ['Wet Trades & Tiling', 'Floor screed and tiling', 'Screed floors|Level and flatten substrate|Lay floor tiling|Grout and seal tiling|Fit skirting and trims'],
    ['Hard Landscaping', 'Paving and driveway construction', 'Excavate and prepare kerb line|Install kerbs and edgings|Lay interlocking paving|Build block paving driveway|Install drainage channels|Lay topsoil and grass'],
    ['Hard Landscaping', 'Retaining and garden walls', 'Excavate and prepare kerb line|Build gabion or stone wall|Construct retaining planter|Build block paving driveway|Lay topsoil and grass|Install irrigation sleeves']
];
const libraryCategoryMap = { 'Handyman Repairs': 'General handyman', 'Electrical Work': 'Electrical work', 'Building Work': 'Building work', 'Plastering & Skimming': 'Plastering & skimming', 'Coatings & Painting': 'Coatings & painting', 'Compliance & Testing': 'Compliance & testing', 'Excavation & Civil Works': 'Excavation & ground work', 'Site Establishment': 'Site establishment', 'Demolition & Strip-Out': 'Demolition & strip-out', 'Structural Concrete': 'Structural & concrete', 'Formwork & Reinforcement': 'Formwork & reinforcement', 'Roofing': 'Roofing & waterproofing', 'Plant & Plant Hire': 'Plant & equipment hire', 'Site Preliminaries': 'Site services & preliminaries', 'Wet Trades & Tiling': 'Wet trades & tiling', 'Hard Landscaping': 'Hard landscaping' };
masterScenarioLibrary.forEach(([libraryCategory, name, tasks], index) => { scenarios[`library-${index + 1}`] = { services: tasks.split('|').map(task => ({ category: libraryCategoryMap[libraryCategory], task, quantity: 1, rate: serviceRates[task] || 350 })), materials: [] }; });
const storedScenarioServices = JSON.parse(localStorage.getItem(storageKey('scenario-services')) || '{}');
Object.entries(storedScenarioServices).forEach(([id, services]) => { if (scenarios[id] && Array.isArray(services)) scenarios[id].services = services; });
const customScenarios = JSON.parse(localStorage.getItem(storageKey('custom-scenarios')) || '[]').filter(scenario => scenario && typeof scenario.id === 'string' && typeof scenario.name === 'string' && Array.isArray(scenario.services));
customScenarios.forEach(scenario => { scenarios[scenario.id] = { services: scenario.services, materials: [] }; });
Object.values(scenarios).forEach(scenario => scenario.services.forEach(({ category, task, rate }) => { if (!serviceCatalogue[category]) serviceCatalogue[category] = []; if (!serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); if (serviceRates[task] === undefined && Number.isFinite(Number(rate))) serviceRates[task] = Number(rate); }));
const standardServices = {
    'General handyman': ['Repair squeaky door or hinge', 'Replace door handle', 'Fit gate latch or hinge', 'Replace flyscreen', 'Fit floor trim or threshold', 'Fit and repair gate', 'Repair fence or paling', 'Clear and clean gutters', 'Patch and repair drywall', 'Paint touch-up after repair', 'Install towel rail or accessory', 'Fit and repair cupboard doors', 'Fit kitchen cupboard handles', 'Adjust cupboard and drawer fittings', 'Fit door closer', 'Install window blinds', 'Fit insect screen', 'Repair patio and deck boards', 'Seal and waterproof shower', 'Fix loose tiles'],
    'Electrical work': ['Replace plug point', 'Install outdoor socket', 'Replace light switch', 'Install dimmer switch', 'Install two-way switching', 'Install security light', 'Install motion sensor light', 'Install garden lighting', 'Replace fluorescent fitting', 'Install LED panel', 'Install distribution board', 'Replace earth leakage unit', 'Install surge protection', 'Test earth leakage', 'Install cable trunking', 'Install conduit', 'Install geyser timer', 'Install extractor fan', 'Install pool pump connection', 'Test and issue COC'],
    'Building work': ['Build plastered wall', 'Build paving and edge', 'Cast concrete apron', 'Install concrete lintel', 'Install roof truss', 'Fit roof sheeting', 'Fit ceiling board', 'Install window frame', 'Hang external door', 'Fit garage door', 'Build brick pillar', 'Point and finish brickwork', 'Install damp-proof course', 'Repair cracked wall', 'Brick up opening', 'Lay floor screed', 'Build garden step', 'Set out building lines'],
    'Plastering & skimming': ['Skim coat plasterboard', 'Skim coat existing walls', 'Plaster patch repair', 'Plaster crack repair', 'Plaster around door and window', 'Plaster around electrical box', 'Fit corner bead', 'Apply plaster bonding agent', 'Float and level plaster', 'Polish plaster finish', 'Plaster damp-damaged wall', 'Screed wall for tiling', 'Bag and paint wall finish', 'Repair cornice and moulding', 'Plaster ceiling', 'Plaster bagged exterior'],
    'Coatings & painting': ['Prepare and prime new plaster', 'Paint ceiling', 'Paint interior walls', 'Paint exterior walls', 'Paint trim and doors', 'Paint metalwork', 'Apply roof coating', 'Apply waterproofing', 'Apply epoxy floor coating', 'Apply damp-proof coating', 'Apply anti-corrosion coating', 'Apply line marking', 'Apply texture coating', 'Seal and varnish timber', 'Spray paint finish', 'Touch up painted surface', 'Minor paint repairs'],
    'Compliance & testing': ['Electrical COC inspection', 'Issue electrical COC', 'Electrical installation test', 'Earth leakage test', 'Site assessment and quotation', 'Workmanship guarantee inspection', 'Building compliance inspection'],
    /* =====================================================
       CONSTRUCTION SITE WORKS
       -----------------------------------------------------
       Activities a general building contractor runs on site:
       site establishment, demolition, structural concrete,
       formwork and reinforcement, roofing, plant hire, wet
       trades and hard landscaping. Added alongside the existing
       trades so the same quote page covers a building site.
       ===================================================== */
    'Site establishment': ['Site establishment and hoarding', 'Erect temporary fencing or hoarding', 'Site clearance and levelling', 'Set out and mark site boundary', 'Establish site access and haul routes', 'Install site board and signage', 'Set up site office or store', 'Temporary water and power connection', 'Install temporary sanitation', 'Establish material laydown area', 'Protect existing services and trees', 'Erect scaffolding and access platforms', 'Dismantle and demobilise site'],
    'Demolition & strip-out': ['Demolition survey and make safe', 'Demolish building or structure', 'Soft strip-out of interiors', 'Strip roof covering', 'Remove structural steel', 'Break out floor slabs and bases', 'Remove foundations and footings', 'Cut and remove reinforced concrete', 'Sort demolition waste for recycling', 'Load and cart away demolition rubble', 'Backfill and level demolished area', 'Provide demolition method statement'],
    'Structural & concrete': ['Structural setting out', 'Excavate and prepare footing', 'Place blinding layer', 'Fix footing reinforcement', 'Pour footing concrete', 'Erect column and wall formwork', 'Fix column reinforcement', 'Pour column concrete', 'Cast suspended slab', 'Place slab reinforcement and mesh', 'Strip formwork and prop', 'Cure concrete elements', 'Cast concrete retaining structure', 'Fix anchor bolts and holding-down bolts', 'Grout machine or column base', 'Apply concrete surface finish'], 'Formwork & reinforcement': ['Design or check formwork', 'Erect formwork and props', 'Strike and remove formwork', 'Cut, bend and fix rebar', 'Fix mesh reinforcement', 'Fix starters and dowels', 'Position spacers and chairs', 'Fix lap and cover to specification', 'Erect reinforcing cages', 'Fabricate and fix steel connectors'],
    'Roofing & waterproofing': ['Erect roof trusses or rafters', 'Install purlins and battens', 'Fit roof sheeting or tiles', 'Fit ridge and barge cappings', 'Install fascia and gutters', 'Fit roof insulation', 'Seal roof penetrations and flashings', 'Install roof lights or vents', 'Apply roof waterproofing system', 'Install valley and rainwater outlets', 'Torch-on membrane installation', 'Liquid waterproofing application', 'Roof inspection and repair'],
    'Plant & equipment hire': ['Concrete mixer hire', 'Concrete pump hire', 'Truck-mounted crane hire', 'Mobile crane hire', 'Telehandler or forklift hire', 'Excavator hire', 'TLB hire', 'Bobcat or skid-steer hire', 'Tipper truck hire', 'Water bowser hire', 'Generator hire', 'Compressor and breaker hire', 'Scaffolding hire', 'Formwork and prop hire', 'Vibrator and poker hire', 'Plate compactor hire'],
    'Site services & preliminaries': ['Site supervision and management', 'Site foreman day work', 'Setting out by engineer', 'Quantity surveyor measurement', 'Health and safety officer attendance', 'Traffic accommodation and signage', 'Temporary works design', 'De-watering and pumping', 'Dust and noise control', 'Waste skips and disposal', 'Daily site cleaning and housekeeping', 'As-built drawings and handover file', 'Preliminaries and standing time'],
    'Wet trades & tiling': ['Screed floors', 'Lay floor tiling', 'Lay wall tiling', 'Fix tiles to wet areas', 'Waterproof wet area before tiling', 'Fit skirting and trims', 'Grout and seal tiling', 'Level and flatten substrate', 'Build tiled shower or recess', 'Install sanitaryware and fittings', 'Fit kitchens and vanities'],
    'Hard landscaping': ['Excavate and prepare kerb line', 'Install kerbs and edgings', 'Lay interlocking paving', 'Lay clay or concrete pavers', 'Install drainage channels', 'Build block paving driveway', 'Construct retaining planter', 'Lay topsoil and grass', 'Install irrigation sleeves', 'Build gabion or stone wall']
};
Object.entries(standardServices).forEach(([category, tasks]) => { if (!serviceCatalogue[category]) serviceCatalogue[category] = []; tasks.forEach(task => { if (!serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); }); });
const storedServiceCatalogue = JSON.parse(localStorage.getItem(storageKey('service-catalogue')) || '{}');
Object.entries(storedServiceCatalogue).forEach(([category, tasks]) => { if (!Array.isArray(tasks)) return; if (!serviceCatalogue[category]) serviceCatalogue[category] = []; tasks.forEach(task => { if (typeof task === 'string' && !serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); }); });
const serviceCategories = Object.keys(serviceCatalogue);
/* =========================================================
   SUPPLIERS
   ---------------------------------------------------------
   Prices below are REFERENCE COSTS ONLY, used when no live
   supplier price has been loaded for an item. They are not
   scraped from the suppliers and change often.

   Confirm against a current supplier quote or invoice before
   sending a quotation to a customer. The "Check prices now"
   control on the quote screen is where live prices are set.
   ========================================================= */
const supplierInfo = {
    builders: { name: 'Builders', url: 'https://www.builders.co.za/' },
    chamberlains: { name: 'Chamberlains', url: 'https://www.chamberlains.co.za/' },
    buildit: { name: 'Build it', url: 'https://www.buildit.co.za/' }
};
const supplierOptions = Object.keys(supplierInfo);

// Reference price catalogue per supplier. Keys match the material
// description shown in the material row ("Type - Size").
const supplierPrices = {
    builders: {
        'Cement - 50kg PPC': 122.9,
        'Building sand - 1 tonne': 445,
        'Plaster sand - 1 tonne': 475,
        'Stone / aggregate - 19mm 1 tonne': 545,
        'Brick - Clay stock (1000)': 3180,
        'Concrete block - 140mm (100)': 1825,
        'Steel reinforcing - 8mm x 6m': 92,
        'Mesh reinforcement - A142 2.4 x 6m': 940,
        'Damp-proof course - 112mm x 30m': 380,
        'Plasterboard - 1.2 x 2.4m x 9.5mm': 259,
        'Ceiling board - 1.2 x 2.4m x 6.4mm': 189,
        'Roofing sheet - 0.47mm x 3m': 419,
        'Wood screw - 4 x 40mm (100)': 62,
        'Chipboard screw - 4 x 40mm (200)': 105,
        'Masonry anchor - 8mm (25)': 175,
        'Rawl plug - 6mm (100)': 52,
        'Silicone sealant - 280ml clear': 92,
        'Wood filler - 500g': 92,
        'Plug point / socket outlet - Double 16A': 259,
        'Light switch - Single 1-way': 92,
        'Light fitting - LED downlight': 139,
        'Electrical cable - 2.5mm x 100m': 1425,
        'Door - Hollow core': 975,
        'Door frame - Single': 675,
        'Door handle - Lever set': 279,
        'Door lock - Cylinder lock': 379,
        'Hinge - 75mm (2)': 52,
        'Skirting board - 2.4m x 69mm': 139,
        'Shelving board - 1.2m x 300mm': 239,
        'Shelf bracket - 200mm (2)': 82,
        'Cupboard hinge - Standard (2)': 92,
        'Drawer runner - 450mm pair': 139,
        'Kitchen sink - 1 bowl': 875,
        'Sink tap - Mixer': 1125,
        'Extractor fan - Standard 100mm': 675,
        'Interior paint - 20L white': 1125,
        'Exterior paint - 20L white': 1425,
        'Primer / sealer - 20L': 965,
        'Tile adhesive - 20kg standard': 139,
        'Tile grout - 5kg': 92,
        'Plaster skim - 25kg': 189,
        'Bonding liquid - 5L': 279,
        'Safety glasses - Standard': 82,
        'Work gloves - Leather pair': 119,
        'Rubble bags - Pack of 10': 92
    },
    chamberlains: {
        'Cement - 50kg PPC': 119.9,
        'Building sand - 1 tonne': 439,
        'Plaster sand - 1 tonne': 469,
        'Brick - Clay stock (1000)': 3149,
        'Concrete block - 140mm (100)': 1799,
        'Steel reinforcing - 10mm x 6m': 142,
        'Plasterboard - 1.2 x 2.4m x 12.5mm': 339,
        'Wood screw - 5 x 60mm (100)': 89,
        'Self-drilling screw - 8 x 25mm (100)': 115,
        'Wall plug & screw set - Assorted (100)': 139,
        'Coach screw - 8 x 75mm (10)': 89,
        'Nut & bolt set - M8 (25)': 159,
        'Silicone sealant - 280ml white': 92,
        'Glue & adhesive - Wood glue 500ml': 92,
        'Masking tape - 24mm x 50m': 42,
        'Cutting disc - 115mm metal': 32,
        'Drill bit set - HSS 1-10mm': 179,
        'Plug point / socket outlet - Single 16A': 179,
        'Light fitting - Ceiling batten': 179,
        'LED lamp - 9W bayonet': 62,
        'Cable trunking - 20 x 12mm x 2m': 42,
        'Door - Solid core': 1825,
        'Door handle - Round knob set': 219,
        'Door lock - Mortice lock': 675,
        'Gate latch - Standard': 179,
        'Gate hinge - Pair': 159,
        'Architrave - 2.4m': 92,
        'Timber plank - 25 x 228 x 3m': 379,
        'Shelving board - 1.8m x 300mm': 339,
        'Angle bracket - 40mm (10)': 92,
        'Padlock - 40mm': 139,
        'Chain - 4mm x 10m': 279,
        'Cupboard handle - Standard': 62,
        'Counter top - Postform 3m': 1225,
        'Sink tap - Pillar': 675,
        'Interior paint - 5L white': 379,
        'Waterproofing membrane - 4kg liquid': 419,
        'Roof waterproofing - 20L acrylic': 1225,
        'Epoxy floor coating - 5kg kit': 1425,
        'Thinners - 5L': 179,
        'Dust mask - FFP2 (10)': 179,
        'Drop sheet - 3.6 x 2.7m': 139
    },
    buildit: {
        'Cement - 50kg rapid': 162,
        'Building sand - 10 tonne load': 3750,
        'Plaster sand - 10 tonne load': 4150,
        'Stone / aggregate - 13mm 1 tonne': 575,
        'Brick - Cement stock (1000)': 2750,
        'Brick - Face brick (1000)': 4450,
        'Concrete block - 190mm (100)': 2420,
        'Steel reinforcing - 12mm x 6m': 199,
        'Concrete lintel - 110 x 75 x 1200mm': 279,
        'Corner bead - 2.4m': 42,
        'Roof timber - 38 x 50 x 3m': 139,
        'Roofing sheet - 0.53mm x 3m': 515,
        'Self-drilling screw - 10 x 50mm (50)': 135,
        'Washer - M8 (100)': 62,
        'Sanding paper - 120 grit (10)': 62,
        'Paint brush & roller set - Standard': 139,
        'Paint tray - Standard': 62,
        'Electrical cable - 1.5mm x 100m': 825,
        'Electrical cable - 4mm x 100m': 2150,
        'Mounting board - 4 x 4': 105,
        'Float switch - 2m': 825,
        'Door - External hardwood': 2590,
        'Window frame - 900 x 1200mm': 1799,
        'Trellis door - Standard': 1225,
        'Timber plank - 38 x 228 x 3m': 529,
        'Shelving board - 1.2m x 300mm': 239,
        'Wire & fencing - Diamond mesh 1.8m x 10m': 1225,
        'Steel post - 1.8m': 375,
        'Cupboard hinge - Soft close (2)': 159,
        'Drawer runner - 500mm pair': 179,
        'Kitchen sink - 1.5 bowl': 1425,
        'Extractor fan - Bathroom 150mm': 875,
        'Exterior paint - 20L tint': 1625,
        'Plaster skim - 40kg': 279,
        'Wall plaster - 40kg undercoat': 219,
        'Tile adhesive - 20kg flexible': 239,
        'Tile grout - 20kg': 279,
        'Work gloves - Latex pair': 42,
        'Ear plugs - Pack of 10': 62,
        'Safety glasses - Standard': 82
    }
};
const supplierAvailability = {
    builders: new Set(Object.keys(supplierPrices.builders)),
    chamberlains: new Set(Object.keys(supplierPrices.chamberlains)),
    buildit: new Set(Object.keys(supplierPrices.buildit))
};
const priceCheckKey = storageKey('last-price-check');
function getBestMaterialPrice(material) {
    if (!material.description) return { cost: getValue(material.cost), suppliers: [] };
    const baseCost = materialItem(material)?.sizes[material.size] ?? getValue(material.cost);
    const prices = [{ supplier: 'reference', cost: baseCost }, ...Object.entries(supplierPrices).filter(([, catalogue]) => catalogue[material.description] !== undefined).map(([supplier, catalogue]) => ({ supplier, cost: catalogue[material.description] }))].filter(({ cost }) => Number.isFinite(cost) && cost > 0);
    if (!prices.length) return { cost: 0, suppliers: [] };
    const cost = Math.min(...prices.map(price => price.cost));
    return { cost, suppliers: prices.filter(price => price.cost === cost).map(price => price.supplier) };
}
function getSupplierCost(material) { return getBestMaterialPrice(material).cost; }
function getMaterialSuppliers(material) {
    if (!material.description) return 'Select material';
    const bestPrice = getBestMaterialPrice(material);
    if (!bestPrice.suppliers.length) return 'No price match';
    return `${currency(bestPrice.cost)} - ${bestPrice.suppliers.map(supplier => supplierInfo[supplier]?.name || 'Reference price').join(', ')}`;
}
function getQuantity(material) { return Math.max(1, Number(material.quantity) || 1); }
function getMaterialArea(material) {
    const w = getValue(material.width), h = getValue(material.height);
    if (!(w > 0 && h > 0)) return 0;
    return (w * h) / 1e6; // mm² → m²
}
function isAreaPriced(material) {
    const item = materialItem(material);
    return Boolean(item && item.unit === 'm2');
}
function getEffectiveCost(material) {
    const area = getMaterialArea(material);
    const unitCost = getSupplierCost(material);
    if (!isAreaPriced(material) || !area) return unitCost * getQuantity(material);
    return unitCost * area * getQuantity(material);
}
function getMaterialQtyLabel(material) {
    const area = getMaterialArea(material);
    return area ? area.toFixed(2) : String(getQuantity(material));
}
function getServiceQuantity(service) { const value = Number(service.quantity); return value > 0 ? value : 1; }
/* Measured units are quoted by area, volume or linear length, so their
   quantities must allow decimals (e.g. 12.5 m², 4.2 m³, 8.6 m). */
const measuredUnits = ['m', 'm²', 'm³', 'Metre', 'Tonne', 'Ton', 'kg'];
function isMeasuredUnit(unit) { return measuredUnits.includes(String(unit || '').trim()); }
function getServiceRate(service) { const priceListRate = serviceRates[service.task]; return priceListRate === undefined ? Number(service.rate) || 350 : priceListRate; }
function getServiceUnit(service) { return service.unit || serviceUnits[service.task] || defaultServiceUnit(service.task); }
function importPriceList(event) {
    const file = event.target.files[0];
    if (!file || typeof XLSX === 'undefined') { showToast('Excel parser could not be loaded'); return; }
    const reader = new FileReader();
    reader.onload = () => {
        const workbook = XLSX.read(reader.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Master Price List'] || workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
        let count = 0;
        rows.forEach(row => {
            const category = String(row.Category || 'Imported price list').trim();
            const task = String(row.Item || '').trim();
            const rate = Number(row['Default Price (ZAR)']);
            if (!task || !Number.isFinite(rate)) return;
            if (!serviceCatalogue[category]) serviceCatalogue[category] = [];
            if (!serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task);
            importedServiceRates[task] = rate;
            serviceRates[task] = rate;
            serviceUnits[task] = String(row.Unit || 'Each').trim();
            count += 1;
        });
        serviceCategories.splice(0, serviceCategories.length, ...Object.keys(serviceCatalogue));
        persistServiceCatalogue();
        localStorage.setItem(storageKey('service-rates'), JSON.stringify(serviceRates));
        localStorage.setItem(storageKey('service-units'), JSON.stringify(serviceUnits));
        $('price-list-status').textContent = `${count} Excel prices loaded from ${file.name}`;
        renderServices();
        if ($('price-list-body')) renderPriceList();
        showToast(`${count} master prices loaded`);
    };
    reader.readAsArrayBuffer(file);
}
function getServiceTasks(service) { const tasks = serviceCatalogue[service.category] || []; return service.task && !tasks.includes(service.task) ? [...tasks, service.task] : tasks; }
function categoryOptions(selected) { return `<option value="">Select category</option>${serviceCategories.map(category => `<option value="${escapeHtml(category)}" ${selected === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}`; }
function persistServiceCatalogue() { localStorage.setItem(storageKey('service-catalogue'), JSON.stringify(serviceCatalogue)); }
const unitOptions = ['Each', 'Hour', 'Day', 'm', 'm²', 'm³', 'Metre', 'Tonne', 'kg', 'Job', 'Connection', 'Load', 'Hole'];
function unitSelect(selected, label) { const options = unitOptions.includes(selected) ? unitOptions : [selected, ...unitOptions]; return `<select class="price-unit" aria-label="${label}">${options.map(unit => `<option value="${escapeHtml(unit)}" ${unit === selected ? 'selected' : ''}>${escapeHtml(unit)}</option>`).join('')}</select>`; }
function renderPriceList() {
    const query = ($('price-list-search')?.value || '').toLowerCase();
    const rows = Object.entries(serviceCatalogue).flatMap(([category, tasks]) => tasks.map(task => ({ category, task, unit: serviceUnits[task] || defaultServiceUnit(task), rate: getServiceRate({ task }) }))).filter(row => `${row.category} ${row.unit} ${row.task}`.toLowerCase().includes(query));
    $('price-list-body').innerHTML = rows.map(row => `<tr class="price-entry" data-task="${escapeHtml(row.task)}"><td><select class="price-category" aria-label="Category for ${escapeHtml(row.task)}">${categoryOptions(row.category)}</select></td><td>${unitSelect(row.unit, `Type or unit for ${escapeHtml(row.task)}`)}</td><td><input class="price-line-item" value="${escapeHtml(row.task)}" aria-label="Line item ${escapeHtml(row.task)}"></td><td><input class="price-rate" data-task="${escapeHtml(row.task)}" type="number" min="0" step="0.01" value="${row.rate}" aria-label="Rate for ${escapeHtml(row.task)}"></td><td><button class="delete-price" type="button" aria-label="Delete ${escapeHtml(row.task)}">×</button></td></tr>`).join('');
    document.querySelectorAll('.delete-price').forEach(button => button.addEventListener('click', () => deletePrice(button.closest('.price-entry'))));
    $('price-list-count').textContent = `${rows.length} prices`;
}
function deletePrice(row) {
    const task = row.dataset.task;
    if (!task || !window.confirm(`Delete "${task}" from the price list?`)) return;
    Object.values(serviceCatalogue).forEach(tasks => { const index = tasks.indexOf(task); if (index >= 0) tasks.splice(index, 1); });
    delete serviceRates[task];
    delete serviceUnits[task];
    persistServiceCatalogue();
    localStorage.setItem(storageKey('service-rates'), JSON.stringify(serviceRates));
    localStorage.setItem(storageKey('service-units'), JSON.stringify(serviceUnits));
    renderPriceList();
    renderServices();
    showToast('Price removed');
}
function savePriceList() {
    document.querySelectorAll('.price-entry').forEach(row => { const oldTask = row.dataset.task; const task = row.querySelector('.price-line-item').value.trim(); const category = row.querySelector('.price-category').value; if (!task || !category) return; if (oldTask && oldTask !== task) { Object.values(serviceCatalogue).forEach(tasks => { const oldIndex = tasks.indexOf(oldTask); if (oldIndex >= 0) tasks.splice(oldIndex, 1); }); delete serviceRates[oldTask]; delete serviceUnits[oldTask]; } if (!serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); serviceRates[task] = getValue(row.querySelector('.price-rate').value); serviceUnits[task] = row.querySelector('.price-unit').value || 'Each'; });
    persistServiceCatalogue();
    localStorage.setItem(storageKey('service-rates'), JSON.stringify(serviceRates));
    localStorage.setItem(storageKey('service-units'), JSON.stringify(serviceUnits));
    renderServices();
    showToast('Price list saved');
}
function getLabourTotals() {
    const callout = labourItems.filter(item => item.type === 'callout').reduce((sum, item) => sum + getValue(item.quantity) * getValue(item.rate), 0);
    const labour = labourItems.filter(item => item.type !== 'callout').reduce((sum, item) => sum + getValue(item.quantity) * getValue(item.rate), 0);
    return { callout, labour, total: callout + labour };
}
function updatePriceCheckStatus() {
    const today = new Date().toISOString().slice(0, 10);
    const lastCheck = localStorage.getItem(priceCheckKey);
    $('price-check-status').textContent = lastCheck === today ? `Prices checked today · ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : 'Morning price check due';
}
function runPriceCheck() {
    localStorage.setItem(priceCheckKey, new Date().toISOString().slice(0, 10));
    materials.forEach(material => { if (material.description) material.cost = getBestMaterialPrice(material).cost; });
    updatePriceCheckStatus();
    renderMaterials();
    showToast('Current material prices updated');
}

function getNumber(id) { return Math.max(0, Number($(id).value) || 0); }
function nextQuoteNumber() { return `APC-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(3, '0')}`; }
function calculate() {
    const { callout, labour, total: labourTotal } = getLabourTotals();
    const materialsTotal = materials.reduce((sum, material) => sum + getEffectiveCost(material) * (1 + MATERIAL_MARKUP / 100), 0);
    const servicesTotal = services.reduce((sum, service) => sum + getServiceRate(service) * getServiceQuantity(service), 0);
    const subtotal = callout + labour + materialsTotal + servicesTotal;
    const vatRate = Number($('vat-rate').value || VAT_DEFAULT);
    const vat = $('vat-enabled').checked ? subtotal * vatRate / 100 : 0;
    $('labour-total').textContent = currency(labourTotal);
    $('summary-callout').textContent = currency(callout);
    $('summary-labour').textContent = currency(labour);
    $('summary-materials').textContent = currency(materialsTotal);
    $('summary-services').textContent = currency(servicesTotal);
    $('grand-total').textContent = currency(subtotal + vat);
    $('vat-rate-label').textContent = `${vatRate}%`;
    updatePrintDetails({ callout, labour, materialsTotal, servicesTotal, subtotal, vat, total: subtotal + vat, vatRate });
    return { callout, labour, materialsTotal, servicesTotal, subtotal, vat, total: subtotal + vat, vatRate };
}
function updatePrintDetails(totals = calculateTotals()) {
    const customer = $('customer-name').value.trim() || 'New customer';
    const phone = $('customer-phone').value.trim() || 'Not provided';
    const address = $('customer-address').value.trim() || 'Not provided';
    const description = $('service-description').value.trim();
    const amendmentReason = $('amendment-reason').value.trim() || 'Reason not provided';
    const labourRows = labourItems.map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.unit)}</td><td>${getValue(item.quantity)}</td><td>${currency(item.rate)}</td><td>${currency(getValue(item.quantity) * getValue(item.rate))}</td></tr>`).join('');
    const rows = materials.filter(material => material.description).map(material => `<tr><td>${escapeHtml(material.description)}</td><td>${getMaterialQtyLabel(material)}${getMaterialArea(material) ? ' m²' : ''}</td><td>${currency(getEffectiveCost(material) * (1 + MATERIAL_MARKUP / 100))}</td></tr>`).join('');
    const serviceRows = services.filter(service => service.task).map(service => `<tr><td>${escapeHtml(service.task)}</td><td>${escapeHtml(getServiceUnit(service))}</td><td>${getServiceQuantity(service)}</td><td>${currency(getServiceRate(service))}</td><td>${currency(getServiceRate(service) * getServiceQuantity(service))}</td></tr>`).join('');
    const supportingPhotos = sitePhotos.length ? `<section class="print-supporting-photos"><h3>Supporting photos</h3><div>${sitePhotos.map((photo, index) => `<figure><img src="${photo.data}" alt="Supporting photo ${index + 1}"><figcaption>${escapeHtml(photo.description || `Supporting photo ${index + 1}`)}</figcaption></figure>`).join('')}</div></section>` : '';
    $('print-details').innerHTML = `<div class="print-document-title"><span>${isAmended ? 'AMENDED QUOTATION' : 'QUOTATION'}</span><strong>${escapeHtml($('quote-number').textContent)}</strong></div><div class="print-customer"><strong>${escapeHtml(customer)}</strong><span>${escapeHtml(phone)}</span><span>${escapeHtml(address)}</span>${description ? `<span><b>Requested services:</b> ${escapeHtml(description)}</span>` : ''}</div><h3>Labour &amp; call-out</h3><table><thead><tr><th>Description</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>${labourRows}</tbody></table><h3>Materials</h3><table><thead><tr><th>Description</th><th>Qty</th><th>Selling price</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No materials added</td></tr>'}</tbody></table><h3>Services &amp; site work</h3><table><thead><tr><th>Task</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>${serviceRows || '<tr><td colspan="5">No additional services</td></tr>'}</tbody></table><div class="print-totals"><span>Subtotal: ${currency(totals.subtotal)}</span><span>VAT (${totals.vatRate}%): ${currency(totals.vat)}</span><strong>Total: ${currency(totals.total)}</strong></div>${isAmended ? `<div class="print-amendment"><strong>Reason for amended quote</strong><span>${escapeHtml(amendmentReason)}</span></div>` : ''}${supportingPhotos}`;
}
function calculateTotals() {
    const { callout, labour } = getLabourTotals();
    const materialsTotal = materials.reduce((sum, material) => sum + getEffectiveCost(material) * (1 + MATERIAL_MARKUP / 100), 0);
    const servicesTotal = services.reduce((sum, service) => sum + getServiceRate(service) * getServiceQuantity(service), 0);
    const subtotal = callout + labour + materialsTotal + servicesTotal;
    const vatRate = Number($('vat-rate').value || VAT_DEFAULT);
    const vat = $('vat-enabled').checked ? subtotal * vatRate / 100 : 0;
    return { callout, labour, materialsTotal, servicesTotal, subtotal, vat, total: subtotal + vat, vatRate };
}
function renderServices() {
    $('service-list').innerHTML = services.map((service, index) => { const group = service.scenario || 'Additional services'; const previousGroup = index ? services[index - 1].scenario || 'Additional services' : ''; const heading = group === previousGroup ? '' : `<div class="service-group-label">${escapeHtml(group)}</div>`; const serviceUnitValue = getServiceUnit(service); const measured = isMeasuredUnit(serviceUnitValue); return `${heading}<div class="material-row service-row" data-index="${index}"><select class="service-category" aria-label="Service category"><option value="">Select category</option>${serviceCategories.map(category => `<option ${service.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select><select class="service-task" aria-label="Service task"><option value="">Select task</option>${getServiceTasks(service).map(task => `<option ${service.task === task ? 'selected' : ''}>${escapeHtml(task)}</option>`).join('')}</select>${unitSelect(serviceUnitValue, `Unit for ${service.task || 'service'}`).replace('class="price-unit"', 'class="service-unit"')}<input class="service-quantity" type="number" min="${measured ? '0' : '1'}" step="${measured ? '0.01' : '1'}" value="${getServiceQuantity(service)}" aria-label="Service quantity (${escapeHtml(serviceUnitValue)})"><span class="service-rate">${currency(getServiceRate(service))}</span><span class="service-total">${currency(getServiceRate(service) * getServiceQuantity(service))}</span><button class="remove-material" type="button" aria-label="Remove service">×</button></div>`; }).join('');
    $('service-empty').style.display = services.length ? 'none' : 'block';
    document.querySelectorAll('.service-row').forEach(row => { const index = Number(row.dataset.index); row.querySelector('.service-category').addEventListener('change', event => { services[index] = { ...services[index], category: event.target.value, task: '', unit: 'Each', quantity: 1, rate: 350 }; renderServices(); }); row.querySelector('.service-task').addEventListener('change', event => { services[index].task = event.target.value; services[index].unit = serviceUnits[event.target.value] || defaultServiceUnit(event.target.value); services[index].rate = serviceRates[event.target.value] || 350; renderServices(); calculate(); }); row.querySelector('.service-unit').addEventListener('change', event => { services[index].unit = event.target.value; }); /* Update the model and this row's total as the user types, without
   re-rendering the list: a full re-render would wipe a half-typed
   decimal (e.g. "12." on the way to 12.5 m²). */
        row.querySelector('.service-quantity').addEventListener('input', event => {
            services[index].quantity = getServiceQuantity({ quantity: event.target.value });
            const totalCell = row.querySelector('.service-total');
            if (totalCell) totalCell.textContent = currency(getServiceRate(services[index]) * getServiceQuantity(services[index]));
            calculate();
        });
        row.querySelector('.remove-material').addEventListener('click', () => { services.splice(index, 1); renderServices(); calculate(); }); });
}
function syncMasterScenarioOptions() { ['scenario-select'].forEach(selectId => { const select = $(selectId); select.querySelectorAll('[data-master-scenario]').forEach(optionGroup => optionGroup.remove()); const categories = [...new Set(masterScenarioLibrary.map(([category]) => category))]; categories.forEach(category => { const group = document.createElement('optgroup'); group.label = category; group.dataset.masterScenario = 'true'; masterScenarioLibrary.filter(([libraryCategory]) => libraryCategory === category).forEach(([, name], index) => { const option = document.createElement('option'); option.value = `library-${masterScenarioLibrary.findIndex(([, scenarioName]) => scenarioName === name) + 1}`; option.textContent = name; group.append(option); }); select.append(group); }); }); }
function syncCustomScenarioOptions() { ['scenario-select'].forEach(selectId => { const select = $(selectId); select.querySelectorAll('[data-custom-scenario]').forEach(option => option.remove()); let group = [...select.querySelectorAll('optgroup')].find(optionGroup => optionGroup.label === 'Custom scenarios'); if (!group) { group = document.createElement('optgroup'); group.label = 'Custom scenarios'; select.append(group); } customScenarios.forEach(scenario => { const option = document.createElement('option'); option.value = scenario.id; option.textContent = scenario.name; option.dataset.customScenario = 'true'; group.append(option); }); }); }
function renderLabourItems() {
    $('labour-list').innerHTML = labourItems.map((item, index) => `<div class="labour-row" data-index="${index}"><span>${escapeHtml(item.description)}</span><span>${escapeHtml(item.unit)}</span><input class="labour-quantity" type="number" min="0" step="1" value="${getValue(item.quantity)}" aria-label="Quantity for ${escapeHtml(item.description)}"><input class="labour-rate" type="number" min="0" step="0.01" value="${getValue(item.rate)}" aria-label="Cost per day for ${escapeHtml(item.description)}"><strong>${currency(getValue(item.quantity) * getValue(item.rate))}</strong></div>`).join('');
    document.querySelectorAll('.labour-row').forEach(row => { const index = Number(row.dataset.index); row.querySelector('.labour-quantity').addEventListener('input', event => { labourItems[index].quantity = getValue(event.target.value); renderLabourItems(); calculate(); }); row.querySelector('.labour-rate').addEventListener('input', event => { labourItems[index].rate = getValue(event.target.value); renderLabourItems(); calculate(); }); });
}
function addScenario() { const scenario = scenarios[$('scenario-select').value]; if (!scenario) { showToast('Select a job scenario first'); return; } const scenarioName = $('scenario-select').selectedOptions[0].textContent.trim(); services.push(...scenario.services.map(service => ({ ...service, scenario: scenarioName }))); materials.push(...scenario.materials.map(material => ({ ...material }))); renderMaterials(); renderServices(); calculate(); showToast('Scenario added. Remove any items you do not need.'); }
function renderMaterials() {
    $('material-list').innerHTML = materials.map((material, index) => {
        const subGroups = materialSubGroups(material.category);
        const activeSubGroup = materialCategoryScaffold(material.category, material.type, material.subGroup).subGroup;
        const types = materialTypes(material.category, activeSubGroup);
        const item = material.type ? materialItem({ ...material, subGroup: activeSubGroup }) : null;
        return `
    <div class="material-row" data-index="${index}">
                <select class="material-category" aria-label="Material category"><option value="">Select category</option>${catalogueCategories.map(category => `<option ${material.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select>
            <select class="material-subgroup" aria-label="Material sub-group"><option value="">Select sub-group</option>${subGroups.map(group => `<option ${activeSubGroup === group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}</select>
            <select class="material-type" aria-label="Material type"><option value="">Select type</option>${types.map(type => `<option ${material.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select>
            <select class="material-size" aria-label="Material size"><option value="">Select size</option>${item ? Object.keys(item.sizes).map(size => `<option ${material.size === size ? 'selected' : ''}>${escapeHtml(size)}</option>`).join('') : ''}</select>
            <input class="material-quantity" type="number" min="1" step="1" value="${getQuantity(material)}" aria-label="Material quantity">
        <span class="material-best-price">${material.description ? currency(getSupplierCost(material)) : '—'}</span>
    <input class="material-markup" type="number" value="${MATERIAL_MARKUP}" aria-label="Material markup percentage" readonly>
    <span class="material-total">${currency(getEffectiveCost(material) * (1 + MATERIAL_MARKUP / 100))}</span>
      <button class="remove-material" type="button" aria-label="Remove material">×</button>
    </div>`;
    }).join('');
    $('material-empty').style.display = materials.length ? 'none' : 'block';
    document.querySelectorAll('#material-list .material-row').forEach(row => {
        const index = Number(row.dataset.index);
        row.querySelector('.material-category').addEventListener('change', event => { materials[index] = { category: event.target.value, subGroup: '', type: '', size: '', description: '', cost: 0, markup: MATERIAL_MARKUP }; renderMaterials(); });
        row.querySelector('.material-subgroup').addEventListener('change', event => { materials[index].subGroup = event.target.value; materials[index].type = ''; materials[index].size = ''; materials[index].description = ''; materials[index].cost = 0; materials[index].markup = MATERIAL_MARKUP; renderMaterials(); });
        row.querySelector('.material-type').addEventListener('change', event => { materials[index].type = event.target.value; materials[index].size = ''; materials[index].description = ''; materials[index].cost = 0; materials[index].markup = MATERIAL_MARKUP; renderMaterials(); });
        row.querySelector('.material-size').addEventListener('change', event => { const selected = materialItem({ ...materials[index], subGroup: materialCategoryScaffold(materials[index].category, materials[index].type, materials[index].subGroup).subGroup }); if (!selected || !event.target.value) return; materials[index].subGroup = materialCategoryScaffold(materials[index].category, materials[index].type, materials[index].subGroup).subGroup; materials[index].size = event.target.value; materials[index].description = materialDescription(materials[index].type, event.target.value); materials[index].cost = selected.sizes[event.target.value]; materials[index].markup = MATERIAL_MARKUP; renderMaterials(); });
        row.querySelector('.material-quantity').addEventListener('input', event => { materials[index].quantity = Math.max(1, Math.floor(getValue(event.target.value))); renderMaterials(); calculate(); });
        materials[index].markup = MATERIAL_MARKUP;
        row.querySelector('.remove-material').addEventListener('click', () => { materials.splice(index, 1); renderMaterials(); calculate(); });
    });
    calculate();
}
function getValue(value) { return Math.max(0, Number(value) || 0); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
function updateSummary() { $('summary-customer').textContent = $('customer-name').value.trim() || 'New customer'; $('summary-address').textContent = $('customer-address').value.trim() || 'Add a service address'; }
function updateSitePhotoPreview() { $('site-photo-preview').innerHTML = sitePhotos.map((photo, index) => `<div class="site-photo-card"><img src="${photo.data}" alt="Site photo ${index + 1}"><label>Photo description<input class="site-photo-description" data-photo-index="${index}" type="text" value="${escapeHtml(photo.description || '')}" placeholder="e.g. Damage found during inspection"></label><button class="remove-photo" type="button" data-photo-index="${index}" aria-label="Remove site photo ${index + 1}">×</button></div>`).join(''); $('site-photo-status').textContent = sitePhotos.length ? `${sitePhotos.length} photo${sitePhotos.length === 1 ? '' : 's'} attached` : 'No photos selected'; document.querySelectorAll('[data-photo-index]').forEach(button => button.addEventListener('click', () => { sitePhotos.splice(Number(button.dataset.photoIndex), 1); updateSitePhotoPreview(); })); document.querySelectorAll('.site-photo-description').forEach(input => input.addEventListener('input', event => { sitePhotos[Number(event.target.dataset.photoIndex)].description = event.target.value; updatePrintDetails(); })); updatePrintDetails(); }
function compressSitePhoto(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Photo could not be read')); reader.onload = () => { const image = new Image(); image.onerror = () => reject(new Error('Photo could not be opened')); image.onload = () => { const scale = Math.min(1, 1600 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .82)); }; image.src = reader.result; }; reader.readAsDataURL(file); }); }
function markQuoteAmended() { if (loadedQuoteIndex === null || isAmended) return; isAmended = true; $('quote-status').textContent = 'AMENDED'; $('amendment-panel').hidden = false; updatePrintDetails(); }
function resetForm() { loadedQuoteIndex = null; isAmended = false; $('quote-status').textContent = 'NEW'; $('amendment-panel').hidden = true;['customer-name', 'customer-phone', 'customer-address', 'service-description', 'amendment-reason'].forEach(id => { $(id).value = ''; }); sitePhotos = []; $('site-photo').value = ''; updateSitePhotoPreview(); labourItems = defaultLabourItems(); $('vat-enabled').checked = true; materials = []; services = []; $('quote-number').textContent = nextQuoteNumber(); updateSummary(); renderLabourItems(); renderMaterials(); renderServices(); }
function saveQuote() {
    const name = $('customer-name').value.trim();
    if (!name) { $('customer-name').focus(); showToast('Add the customer name first'); return; }
    const totals = calculate();
    const quote = { id: $('quote-number').textContent, date: new Date().toISOString(), customer: { name, phone: $('customer-phone').value.trim(), address: $('customer-address').value.trim(), serviceDescription: $('service-description').value.trim(), sitePhotos }, labour: { items: labourItems.map(item => ({ ...item })) }, materials: [...materials], services: [...services], totals, amended: isAmended, amendmentReason: $('amendment-reason').value.trim() };
    if (loadedQuoteIndex === null) quotes.unshift(quote); else quotes[loadedQuoteIndex] = quote;
    localStorage.setItem(storageKey('quotes'), JSON.stringify(quotes)); saveQuotesToDrive(true); $('quote-count').textContent = quotes.length; showToast(isAmended ? `Amended quote ${quote.id} saved` : `Quote ${quote.id} saved`); resetForm(); renderSavedQuotes();
}
function renderSavedQuotes() {
    $('quote-count').textContent = quotes.length;
    $('saved-quotes').innerHTML = quotes.length ? quotes.map((quote, index) => `<article class="saved-quote"><div><strong>${escapeHtml(quote.customer.name)}</strong><small>${escapeHtml(quote.id)} · ${new Date(quote.date).toLocaleDateString('en-ZA')}</small></div><div><small>Service address</small><span>${escapeHtml(quote.customer.address || 'Not provided')}</span></div><div class="saved-quote-total">${currency(quote.totals.total)}<small>${quote.materials.length} material${quote.materials.length === 1 ? '' : 's'}</small></div><div class="quote-actions"><button data-load="${index}">Open</button><button data-pdf="${index}" title="View quote as PDF" aria-label="View ${escapeHtml(quote.id)} as PDF">PDF</button><button data-delete="${index}" aria-label="Delete quote">×</button></div></article>`).join('') : '<div class="material-empty">Saved quotes will appear here.</div>';
    document.querySelectorAll('[data-load]').forEach(button => button.addEventListener('click', () => loadQuote(Number(button.dataset.load))));
    document.querySelectorAll('[data-pdf]').forEach(button => button.addEventListener('click', () => viewSavedQuotePdf(Number(button.dataset.pdf))));
    document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => { quotes.splice(Number(button.dataset.delete), 1); localStorage.setItem(storageKey('quotes'), JSON.stringify(quotes)); saveQuotesToDrive(true); renderSavedQuotes(); showToast('Quote deleted'); }));
}
function loadQuote(index) { const quote = quotes[index]; loadedQuoteIndex = index; isAmended = Boolean(quote.amended); $('quote-status').textContent = isAmended ? 'AMENDED' : 'SAVED'; $('amendment-panel').hidden = !isAmended; $('customer-name').value = quote.customer.name; $('customer-phone').value = quote.customer.phone; $('customer-address').value = quote.customer.address; $('service-description').value = quote.customer.serviceDescription || ''; $('amendment-reason').value = quote.amendmentReason || ''; sitePhotos = (quote.customer.sitePhotos || (quote.customer.sitePhoto ? [quote.customer.sitePhoto] : [])).map(photo => typeof photo === 'string' ? { data: photo, description: '' } : photo); updateSitePhotoPreview(); labourItems = quote.labour.items ? quote.labour.items.map(item => ({ ...item })) : [{ description: 'Call-out fee', unit: 'Each', quantity: 1, rate: quote.labour.callout ?? 650, type: 'callout' }, { description: 'Inspection & evaluation', unit: 'Day', quantity: quote.labour.hours ?? 0, rate: quote.labour.plumberHourlyRate ?? quote.labour.hourlyRate ?? 500, type: 'labour' }, { description: 'Additional labour', unit: 'Day', quantity: quote.labour.extraWorkers ?? 0, rate: quote.labour.extraWorkerHourlyRate ?? 500, type: 'labour' }]; materials = quote.materials; services = quote.services || []; $('quote-number').textContent = quote.id; updateSummary(); renderLabourItems(); renderMaterials(); renderServices(); switchView('new-quote'); }
// ===================== SHARED DRIVE SYNC (MULTI-USER) =====================
/*
   Quotes live in ONE Google Drive folder that the company owns,
   reached through a small backend function instead of from the
   browser directly.

   WHY NOT TALK TO DRIVE FROM THE BROWSER:
   A static site cannot keep an OAuth client secret, and Google only
   lets a browser see files that browser itself created. A browser-only
   version could therefore never show one person another person's
   quotes. The backend holds the credentials, so every user of this app
   sees the same shared set of quotes.

   The old "Sign in to Google" button is deliberately gone: there is
   nothing for an individual to sign in to. Its button is left in the
   markup but hidden, so an older cached page cannot show a dead control.

   WHERE THE SERVER IS
   APS_DRIVE_FUNCTION_URL is set in config.js (never a secret - just a
   URL). If it is blank the app stays fully usable offline and simply
   does not offer Drive, so the workshop is never left with a broken
   tool mid-setup.
*/
const DRIVE_FUNCTION_URL = (typeof window !== 'undefined' && window.APS_DRIVE_FUNCTION_URL) || '';
let driveAvailable = false;
let driveBusy = false;

function updateDriveStatus(message) { const el = $('drive-status'); if (el) el.textContent = message; }

function updateDriveButtons() {
    const save = $('drive-save-button');
    const load = $('drive-load-button');
    if (save) save.hidden = !driveAvailable;
    if (load) load.hidden = !driveAvailable;
}

/*
   Every call goes through here, so a single place handles the
   server being missing, unreachable, or not yet configured.
*/
async function driveRequest(action, options = {}) {
    if (!DRIVE_FUNCTION_URL) throw new Error('not-configured');
    const url = DRIVE_FUNCTION_URL + (DRIVE_FUNCTION_URL.includes('?') ? '&' : '?') + 'action=' + action;
    let response;
    try {
        response = await fetch(url, {
            method: options.method || 'GET',
            headers: { 'Content-Type': 'application/json' },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
    } catch (error) {
        /*
           A network failure here is normal in a workshop with poor
           signal, so it is reported plainly rather than thrown.
        */
        updateDriveStatus('Shared Drive unreachable — quotes are safe on this device');
        throw new Error('offline');
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
        const message = (data && data.error) || ('Shared Drive request failed (' + response.status + ')');
        updateDriveStatus(message);
        throw new Error(message);
    }
    return data;
}

/*
   Ask the server whether Drive is actually configured. Until the
   administrator finishes the Google setup this returns false, and the
   app quietly stays local-only.
*/
async function initDrive() {
    if (!DRIVE_FUNCTION_URL) {
        driveAvailable = false;
        updateDriveButtons();
        updateDriveStatus('');
        return;
    }
    try {
        const data = await driveRequest('status');
        driveAvailable = Boolean(data && data.configured);
        updateDriveButtons();
        updateDriveStatus(
            driveAvailable
                ? 'Shared Drive connected — quotes are shared with everyone using this app'
                : 'Shared Drive is not set up yet — quotes are saved on this device only'
        );
    } catch {
        driveAvailable = false;
        updateDriveButtons();
    }
}

/*
   The single place that pushes one quote. Called automatically after a
   save or delete, so the shared copy always tracks the local one.
*/
async function saveQuoteToDrive(quote, silent = true) {
    if (!driveAvailable || !quote || !quote.id) return;
    try {
        await driveRequest('save', { method: 'POST', body: quote });
        if (!silent) showToast('Quote shared to Drive');
        updateDriveStatus('Shared to Drive · ' + new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
        /* Offline is expected in the field; the local copy is authoritative. */
        if (error.message !== 'offline' && !silent) showToast('Could not share to Drive');
    }
}

/* Kept for the existing call sites that saved the whole list at once. */
async function saveQuotesToDrive(silent = false) {
    if (!driveAvailable) return;
    try {
        await driveRequest('save-all', { method: 'POST', body: { quotes } });
        if (!silent) showToast('Quotes shared to Drive');
        updateDriveStatus('Shared to Drive · ' + quotes.length + ' quote' + (quotes.length === 1 ? '' : 's'));
    } catch (error) {
        if (error.message !== 'offline' && !silent) showToast('Could not share to Drive');
    }
}

/*
   Pull the shared quotes down and merge them with what is on this
   device. Merging by id means a quote created on another phone appears
   here without wiping anything already saved locally.
*/
async function loadQuotesFromDrive() {
    if (!driveAvailable) { updateDriveStatus('Shared Drive is not set up yet'); return; }
    if (driveBusy) return;
    driveBusy = true;
    try {
        const data = await driveRequest('list');
        const incoming = (data && data.quotes) || [];
        if (!Array.isArray(incoming) || !incoming.length) {
            showToast('Nothing on the shared Drive yet');
            return;
        }
        const byId = new Map(quotes.filter(q => q && q.id).map(q => [q.id, q]));
        let added = 0;
        let updated = 0;
        for (const quote of incoming) {
            if (!quote || !quote.id) continue;
            const existing = byId.get(quote.id);
            if (!existing) { added++; byId.set(quote.id, quote); }
            else {
                /*
                   Newest wins. Without this, a re-loaded older copy
                   could silently roll back an edit made elsewhere.
                */
                const mine = Date.parse(existing.updatedAt || existing.createdAt || 0) || 0;
                const theirs = Date.parse(quote.updatedAt || quote.createdAt || 0) || 0;
                if (theirs > mine) { updated++; byId.set(quote.id, quote); }
            }
        }
        quotes = [...byId.values()];
        localStorage.setItem(storageKey('quotes'), JSON.stringify(quotes));
        $('quote-count').textContent = quotes.length;
        renderSavedQuotes();
        const parts = [];
        if (added) parts.push(added + ' new');
        if (updated) parts.push(updated + ' updated');
        showToast(parts.length ? 'Shared Drive: ' + parts.join(', ') : 'Already up to date with the shared Drive');
        updateDriveStatus('Synced · ' + quotes.length + ' quote' + (quotes.length === 1 ? '' : 's'));
    } catch (error) {
        if (error.message !== 'offline') showToast('Could not read the shared Drive');
    } finally {
        driveBusy = false;
    }
}
// =================== END SHARED DRIVE SYNC ===================

function exportQuotes() {
    if (!quotes.length) { showToast('No saved quotes to export'); return; }
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), quotes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `apc-quotes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${quotes.length} quote${quotes.length === 1 ? '' : 's'} saved to file`);
}

function importQuotes(file) {
    const reader = new FileReader();
    reader.onerror = () => showToast('File could not be read');
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const incoming = Array.isArray(data) ? data : data.quotes;
            if (!Array.isArray(incoming)) throw new Error('bad format');
            const existingIds = new Set(quotes.map(quote => quote.id));
            const added = incoming.filter(quote => quote && quote.id && !existingIds.has(quote.id));
            if (!added.length) { showToast('No new quotes found in file'); return; }
            quotes = [...added, ...quotes];
            localStorage.setItem(storageKey('quotes'), JSON.stringify(quotes));
            renderSavedQuotes();
            showToast(`${added.length} quote${added.length === 1 ? '' : 's'} imported`);
        } catch { showToast('That file is not a valid quotes file'); }
    };
    reader.readAsText(file);
}

function viewSavedQuotePdf(index) { loadQuote(index); requestAnimationFrame(() => window.print()); }
function switchView(view) { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); document.querySelectorAll('.view').forEach(item => item.classList.remove('active-view')); $(`${view}-view`).classList.add('active-view'); $('page-title').textContent = view === 'new-quote' ? 'Quote' : view === 'quotes' ? 'Saved quotes' : view === 'price-list' ? 'Price list' : 'Company settings'; if (view === 'price-list') renderPriceList(); }
function loadSettings() { $('company-name').value = settings.name || ''; $('company-phone').value = settings.phone || ''; $('company-email').value = settings.email || ''; $('prepared-by').value = settings.preparedBy || ''; $('tax-number').value = settings.taxNumber || ''; $('print-prepared-by').textContent = settings.preparedBy || 'Cheyenne'; $('print-contact').textContent = settings.phone || '010 597 6616';
    $('print-email').textContent = settings.email || 'info@agasouthafrica.co.za'; $('print-tax-number').textContent = settings.taxNumber || '105 976 616'; $('vat-rate').value = settings.vatRate ?? VAT_DEFAULT; $('quote-date').textContent = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }); }

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
document.querySelectorAll('.supplier-tab').forEach(tab => tab.addEventListener('click', () => { selectedSupplier = tab.dataset.supplier; document.querySelectorAll('.supplier-tab').forEach(item => item.classList.toggle('active', item === tab)); $('supplier-source').innerHTML = `Reference prices from ${supplierInfo[selectedSupplier].name} · <a href="${supplierInfo[selectedSupplier].url}" target="_blank" rel="noopener">Open supplier ↗</a>`; renderMaterials(); }));
document.querySelectorAll('input, textarea').forEach(input => input.addEventListener('input', () => { updateSummary(); calculate(); }));
document.querySelector('#new-quote-view').addEventListener('input', event => { if (event.target.id !== 'amendment-reason') markQuoteAmended(); });
document.querySelector('#new-quote-view').addEventListener('change', event => { if (event.target.id !== 'amendment-reason') markQuoteAmended(); });
$('site-photo').addEventListener('change', async event => { const files = [...event.target.files]; if (!files.length) return; if (files.some(file => !file.type.startsWith('image/'))) { showToast('Choose image files only'); event.target.value = ''; return; } try { sitePhotos.push(...(await Promise.all(files.map(compressSitePhoto))).map(data => ({ data, description: '' }))); updateSitePhotoPreview(); } catch { showToast('One or more photos could not be added'); } finally { event.target.value = ''; } });
syncMasterScenarioOptions();
syncCustomScenarioOptions();
$('add-material').addEventListener('click', () => { materials.push({ category: '', subGroup: '', type: '', size: '', quantity: 1, description: '', cost: 0, markup: MATERIAL_MARKUP }); renderMaterials(); document.querySelector('.material-category:last-of-type')?.focus(); });
$('add-service').addEventListener('click', () => { services.push({ category: '', task: '', quantity: 1, rate: 350, scenario: 'Additional services' }); renderServices(); document.querySelector('.service-category:last-of-type')?.focus(); });
$('add-scenario').addEventListener('click', addScenario);
function clearQuote() { resetForm(); showToast('Quote cleared'); }
$('save-quote').addEventListener('click', saveQuote); $('clear-quote').addEventListener('click', clearQuote); $('clear-quote-top').addEventListener('click', clearQuote); $('print-button').addEventListener('click', () => window.print()); $('pdf-button').addEventListener('click', () => window.print()); $('export-quotes-button').addEventListener('click', exportQuotes);
$('import-quotes-button').addEventListener('click', () => $('import-quotes-file').click());
$('import-quotes-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) importQuotes(file); event.target.value = ''; });
$('drive-save-button').addEventListener('click', () => saveQuotesToDrive(false));
$('drive-load-button').addEventListener('click', loadQuotesFromDrive);
updateDriveButtons();
initDrive();
$('new-quote-button').addEventListener('click', () => { resetForm(); switchView('new-quote'); });
$('check-prices-button').addEventListener('click', runPriceCheck);
$('price-list-file-page').addEventListener('change', importPriceList);
$('price-list-search').addEventListener('input', renderPriceList);
$('save-price-list').addEventListener('click', savePriceList);
$('add-price').addEventListener('click', () => { const row = document.createElement('tr'); row.className = 'price-entry new-price-entry'; row.dataset.task = ''; row.innerHTML = `<td><select class="price-category" aria-label="New price category">${categoryOptions('')}</select></td><td>${unitSelect('Each', 'New price type or unit')}</td><td><input class="price-line-item" placeholder="New line item" aria-label="New price line item"></td><td><input class="price-rate" type="number" min="0" step="0.01" value="0" aria-label="New price rate"></td><td></td>`; $('price-list-body').prepend(row); row.querySelector('.price-line-item').focus(); });
$('save-settings').addEventListener('click', () => { settings = { name: $('company-name').value.trim(), phone: $('company-phone').value.trim(), email: $('company-email').value.trim(), preparedBy: $('prepared-by').value.trim(), taxNumber: $('tax-number').value.trim(), vatRate: getNumber('vat-rate') }; localStorage.setItem(storageKey('settings'), JSON.stringify(settings)); loadSettings(); calculate(); showToast('Company settings saved'); });
loadSettings(); resetForm(); renderSavedQuotes(); renderPriceList(); updatePriceCheckStatus();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => { });
