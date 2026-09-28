const VAT_DEFAULT = 15;
const MATERIAL_MARKUP = 45;
let selectedSupplier = 'plumblink';
const currency = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value) || 0);
const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
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
let settings = JSON.parse(localStorage.getItem('pipewise-settings') || '{}');
settings.name ||= 'APS Architectural Plumbing Services';
settings.preparedBy ||= 'Cheyenne';
settings.phone ||= '076 705 8718';
settings.email ||= 'architecturalplumbingservices@gmail.com';
settings.taxNumber ||= '105 976 616';
let quotes = JSON.parse(localStorage.getItem('pipewise-quotes') || '[]');

/* ---- project planning ----
   Projects are the "how and when" layer on top of a quote: a quote
   says what the job costs, a project says who does which item, on
   which day, and how far along it is. Kept in localStorage beside
   quotes and settings; no cloud sync for projects yet. */
let projects = JSON.parse(localStorage.getItem('pipewise-projects') || '[]');
let loadedProjectIndex = null;
const PROJECT_STAGES = ['Not started', 'Scheduled', 'In progress', 'Blocked', 'Done'];
const PROJECT_STATUS_LABELS = {
    planning: 'Planning',
    scheduled: 'Scheduled',
    'in-progress': 'In progress',
    'on-hold': 'On hold',
    complete: 'Complete'
};
const planningTasks = () => [];
const plumbingCatalogue = {
    Pipes: {
        'PVC pressure pipe': { sizes: { '15mm x 6m': 120, '22mm x 6m': 180, '28mm x 6m': 260, '50mm x 6m': 205, '110mm x 6m': 349 }, markup: MATERIAL_MARKUP },
        'Copper pipe': { sizes: { '15mm x 5.5m': 450, '22mm x 5.5m': 680 }, markup: MATERIAL_MARKUP },
        'PEX pipe': { sizes: { '16mm x 100m': 1800, '20mm x 100m': 2500 }, markup: 30 },
        'HDPE drainage pipe': { sizes: { '110mm x 5m': 985.94 }, markup: MATERIAL_MARKUP },
    },
    Fittings: {
        'PVC elbow': { sizes: { '15mm': 35, '22mm': 45, '28mm': 65 }, markup: 30 },
        'PVC tee': { sizes: { '15mm': 45, '22mm': 60, '28mm': 85 }, markup: 30 },
        'PVC coupling': { sizes: { '15mm': 30, '22mm': 40, '28mm': 55, '110mm': 150 }, markup: 30 },
        'Copper repair coupling': { sizes: { '15mm': 97.62, '22mm': 124.26 }, markup: MATERIAL_MARKUP },
        'Copper elbow': { sizes: { '15mm': 6 }, markup: MATERIAL_MARKUP },
        'Copper tee': { sizes: { '15mm': 13 }, markup: MATERIAL_MARKUP },
        'HDPE bend': { sizes: { '40mm 90deg': 42.61 }, markup: MATERIAL_MARKUP }
    },
    Valves: {
        'Ball valve': { sizes: { '15mm': 350, '22mm': 450 }, markup: 30 },
        'Stopcock': { sizes: { '15mm': 220, '22mm': 280 }, markup: 30 },
        'Tank float valve kit': { sizes: { '20mm': 296.01 }, markup: 30 },
        'Geyser safety valve': { sizes: { '15mm': 350, '22mm': 450 }, markup: 30 }
    },
    'Sanitary ware': {
        Tap: { sizes: { Standard: 850 }, markup: MATERIAL_MARKUP },
        'Mixer tap': { sizes: { Standard: 1200 }, markup: MATERIAL_MARKUP },
        Basin: { sizes: { Standard: 950 }, markup: MATERIAL_MARKUP },
        Toilet: { sizes: { Standard: 1800 }, markup: MATERIAL_MARKUP },
        'Shower screen': { sizes: { '900 x 2000mm': 2295 }, markup: MATERIAL_MARKUP },
        'Vanity cabinet': { sizes: { '600mm': 3195 }, markup: MATERIAL_MARKUP }
    },
    'Brass tapware': {
        'Basin mixer': { sizes: { '15mm': 1372.26 }, markup: MATERIAL_MARKUP },
        'Bath/shower mixer': { sizes: { '15mm': 1372.26 }, markup: MATERIAL_MARKUP },
        'Pillar tap': { sizes: { '15mm': 650 }, markup: MATERIAL_MARKUP },
        'Sink mixer': { sizes: { '15mm': 950 }, markup: MATERIAL_MARKUP }
    },
    'Waste & traps': {
        'P-trap': { sizes: { '40mm': 140, '50mm': 180 }, markup: MATERIAL_MARKUP },
        'Bottle trap': { sizes: { '32mm': 190, '40mm': 220 }, markup: MATERIAL_MARKUP },
        'Floor drain': { sizes: { '50mm 100x100mm': 221.27 }, markup: MATERIAL_MARKUP },
        'Waste fitting': { sizes: { '40mm': 120, '50mm': 150 }, markup: MATERIAL_MARKUP }
    },
    'Water heating': {
        Geyser: { sizes: { '100L': 4799, '150L': 6200, '200L': 7800 }, markup: MATERIAL_MARKUP },
        'Geyser element': { sizes: { '2kW': 550, '3kW': 650 }, markup: MATERIAL_MARKUP },
        'Geyser thermostat': { sizes: { Standard: 350 }, markup: MATERIAL_MARKUP }
    },
    'Solar water heating': {
        'Solar geyser system': { sizes: { '150L': 12000, '200L': 15000 }, markup: MATERIAL_MARKUP },
        'Solar controller kit': { sizes: { Standard: 3979 }, markup: MATERIAL_MARKUP },
        'Solar collector': { sizes: { Standard: 4500 }, markup: MATERIAL_MARKUP }
    },
    'Storage tanks & pumps': {
        'Water storage tank': { sizes: { '500L': 3500, '1000L': 6200, '2500L': 13500 }, markup: MATERIAL_MARKUP },
        'Pressure pump': { sizes: { '0.75kW': 3200, '1.1kW': 4800 }, markup: MATERIAL_MARKUP },
        'Booster pump': { sizes: { Standard: 2800 }, markup: MATERIAL_MARKUP },
        'Float valve': { sizes: { '20mm': 296.01 }, markup: MATERIAL_MARKUP }
    },
    'HDPE drainage & water supply': {
        'HDPE drainage pipe': { sizes: { '110mm x 5m': 985.94 }, markup: MATERIAL_MARKUP },
        'HDPE bend': { sizes: { '40mm 90deg': 42.61 }, markup: MATERIAL_MARKUP },
        'HDPE coupling': { sizes: { '40mm': 85, '50mm': 110 }, markup: MATERIAL_MARKUP },
        'HDPE water pipe': { sizes: { '25mm x 100m': 1800, '32mm x 100m': 2600 }, markup: MATERIAL_MARKUP }
    },
    'Water supply': {
        'Multilayer pipe': { sizes: { '16mm x 100m': 1800, '20mm x 100m': 2500, '25mm x 100m': 3200 }, markup: MATERIAL_MARKUP },
        'Poly pipe': { sizes: { '20mm x 100m': 950, '25mm x 100m': 1400, '32mm x 100m': 2200 }, markup: MATERIAL_MARKUP },
        'Galvanised pipe': { sizes: { '15mm x 6m': 350, '22mm x 6m': 500, '28mm x 6m': 700 }, markup: MATERIAL_MARKUP },
        'Compression fitting': { sizes: { '15mm': 45, '22mm': 65, '28mm': 90 }, markup: MATERIAL_MARKUP }
    },
    'Drainage & sewer': {
        'Underground PVC pipe': { sizes: { '50mm x 6m': 205, '110mm x 6m': 349, '160mm x 6m': 850 }, markup: MATERIAL_MARKUP },
        'Waste pipe': { sizes: { '40mm x 3m': 95, '50mm x 3m': 120 }, markup: MATERIAL_MARKUP },
        'Sewer bend': { sizes: { '110mm 45deg': 75, '110mm 87.5deg': 95, '160mm 45deg': 180 }, markup: MATERIAL_MARKUP },
        'Inspection eye': { sizes: { '110mm': 85, '160mm': 190 }, markup: MATERIAL_MARKUP },
        'Gully trap': { sizes: { '110mm': 220, '160mm': 380 }, markup: MATERIAL_MARKUP },
        'Pan connector': { sizes: { '110mm': 180 }, markup: MATERIAL_MARKUP }
    },
    Guttering: {
        'Gutter length': { sizes: { '100mm x 3m': 180, '125mm x 3m': 240 }, markup: MATERIAL_MARKUP },
        'Downpipe': { sizes: { '75mm x 3m': 150, '110mm x 3m': 220 }, markup: MATERIAL_MARKUP },
        'Gutter outlet': { sizes: { '75mm': 80, '110mm': 110 }, markup: MATERIAL_MARKUP },
        'Gutter bracket': { sizes: { '100mm': 19, '125mm': 25 }, markup: MATERIAL_MARKUP },
        'Gutter end cap': { sizes: { '100mm': 35, '125mm': 45 }, markup: MATERIAL_MARKUP }
    },
    'Geyser accessories': {
        'Vacuum breaker': { sizes: { '20mm': 105 }, markup: MATERIAL_MARKUP },
        'Geyser tray': { sizes: { '100L': 450, '150L': 550, '200L': 650 }, markup: MATERIAL_MARKUP },
        'Geyser drip tray': { sizes: { '580mm': 450, '660mm': 550 }, markup: MATERIAL_MARKUP },
        'Geyser overflow pipe': { sizes: { '22mm x 3m': 90 }, markup: MATERIAL_MARKUP },
        'Geyser installation kit': { sizes: { Standard: 950 }, markup: MATERIAL_MARKUP }
    },
    'Bathroom accessories': {
        'Shower rail': { sizes: { '600mm': 350, '900mm': 550 }, markup: MATERIAL_MARKUP },
        'Towel rail': { sizes: { '600mm': 450, '800mm': 650 }, markup: MATERIAL_MARKUP },
        'Toilet roll holder': { sizes: { Standard: 250 }, markup: MATERIAL_MARKUP },
        'Robe hook': { sizes: { Standard: 180 }, markup: MATERIAL_MARKUP },
        'Bathroom mirror': { sizes: { '600 x 600mm': 650, '1000 x 460mm': 1450 }, markup: MATERIAL_MARKUP }
    },
    Kitchen: {
        'Kitchen sink': { sizes: { '1 bowl': 1200, '1.5 bowl': 1800, '2 bowl': 2400 }, markup: MATERIAL_MARKUP },
        'Sink mixer': { sizes: { Standard: 950 }, markup: MATERIAL_MARKUP },
        'Sink waste': { sizes: { '90mm': 180 }, markup: MATERIAL_MARKUP },
        'Waste disposal connector': { sizes: { Standard: 350 }, markup: MATERIAL_MARKUP }
    },
    'Consumables & tools': {
        'PTFE thread tape': { sizes: { '12mm x 12m': 18, '19mm x 15m': 28 }, markup: MATERIAL_MARKUP },
        'Pipe jointing compound': { sizes: { '100g': 55, '250g': 95 }, markup: MATERIAL_MARKUP },
        'Silicone sealant': { sizes: { '280ml': 95 }, markup: MATERIAL_MARKUP },
        'Pipe insulation': { sizes: { '15mm x 1m': 35, '22mm x 1m': 45 }, markup: MATERIAL_MARKUP },
        'Pipe clips': { sizes: { '15mm': 8, '22mm': 10, '28mm': 12 }, markup: MATERIAL_MARKUP }
    },
    'Other': {
        'Solvent cement': { sizes: { '250ml': 85 }, markup: 30 },
        'Flexible connector': { sizes: { Standard: 90 }, markup: 30 },
        'Pipe clips': { sizes: { Standard: 8 }, markup: 30 }
    }
};
const catalogueCategories = Object.keys(plumbingCatalogue);
const serviceCatalogue = {
    'Plumbing work': ['Repair leaking pipes', 'Install new water pipes', 'Replace damaged pipes', 'Repair or replace taps', 'Install toilet, basin, bath or shower', 'Install geyser', 'Repair geyser', 'Install pressure valve or water meter', 'Install drainage or sewer pipes', 'Unblock drain or sewer line', 'Repair burst pipe', 'Leak detection'],
    'Excavation & ground work': ['Dig trench for water or sewer pipe', 'Excavate to access underground pipe', 'Remove soil and rubble', 'Backfill trench', 'Compact or stamp ground', 'Level ground'],
    'Breaking & access': ['Break and remove concrete', 'Remove paving', 'Cut trench through paving or concrete', 'Core drill through wall', 'Chase wall for new pipe'],
    'Restoration': ['Replace paving', 'Relay paving', 'Repair concrete', 'Fill and cement hole', 'Plaster wall', 'Repair tiles', 'Reinstall cupboard or panel', 'Make good damaged area'],
    'Additional labour': ['Sift soil and remove rubble', 'Move soil', 'Remove building rubble', 'Load or unload materials', 'Clean work area', 'Install sleeves and pipe protection'],
    Equipment: ['Jackhammer hire', 'Ground compactor hire', 'Excavator hire', 'Core drill hire']
};
serviceCatalogue['Plumbing work'].push('Call-out and inspection', 'Locate leak', 'Protect surrounding area', 'Mark affected area', 'Isolate water', 'Disconnect old toilet', 'Remove old toilet', 'Supply toilet', 'Install new toilet', 'Connect water supply', 'Connect waste pipe', 'Seal toilet', 'Test flushing', 'Check for leaks', 'Site inspection', 'Measure location', 'Mark pipe positions', 'Install toilet', 'Connect water', 'Seal installation', 'Disconnect water', 'Disconnect waste pipe', 'Remove old basin', 'Supply basin', 'Install basin', 'Install taps', 'Install waste fitting', 'Connect waste', 'Seal basin', 'Remove old bath', 'Supply new bath', 'Install bath', 'Connect taps', 'Test drainage', 'Seal bath', 'Remove shower enclosure', 'Remove old shower tray', 'Repair plumbing', 'Supply new shower', 'Install shower tray', 'Install mixer', 'Install shower enclosure', 'Seal shower', 'Test water pressure', 'Inspect toilet', 'Attempt manual blockage removal', 'Use drain rods', 'Use drain machine', 'Remove blockage', 'Flush toilet', 'Inspect sewer line', 'Open inspection point', 'Locate blockage', 'High-pressure jetting', 'CCTV inspection', 'Test sewer flow', 'Close inspection point', 'Locate damaged section', 'Remove damaged pipe', 'Supply new pipe', 'Install sewer pipe', 'Install fittings', 'Check pipe gradient', 'Test water flow', 'Shut off main water', 'Locate existing pipe', 'Remove old pipe', 'Install new pipe', 'Install shut-off valve', 'Connect to municipal supply', 'Pressure test', 'Flush pipe', 'Inspect installation point', 'Install pipe', 'Drill through wall', 'Install isolation valve', 'Record meter reading', 'Inspect geyser', 'Isolate electricity', 'Drain geyser', 'Replace valve', 'Replace pipe', 'Replace fittings', 'Refill geyser', 'Restore electricity', 'Test operation', 'Remove old element', 'Supply new element', 'Install new element', 'Replace gasket', 'Test geyser', 'Prepare installation area', 'Supply pump', 'Install pump', 'Install inlet pipe', 'Install outlet pipe', 'Connect electrical supply', 'Prime pump', 'Test water pressure');
serviceCatalogue['Excavation & ground work'].push('Excavate trench', 'Excavate soil', 'Sift soil', 'Remove excess soil', 'Load rubble', 'Carefully remove paving', 'Store paving for reuse', 'Prepare concrete area', 'Pour new concrete', 'Finish concrete');
serviceCatalogue['Breaking & access'].push('Remove tiles', 'Open or chase wall', 'Expose pipe', 'Cut damaged pipe', 'Break concrete or floor', 'Remove concrete rubble');
serviceCatalogue.Restoration.push('Close wall', 'Plaster wall', 'Replace tiles', 'Paint touch-up', 'Reinstate paving or concrete', 'Reinstall paving', 'Level paving');
serviceCatalogue['Additional labour'].push('Mark excavation area', 'Protect surrounding area', 'Remove old toilet', 'Remove rubble', 'Clean area', 'Seal wall opening', 'Restore water supply');
const serviceRates = { 'Repair leaking pipes': 450, 'Install new water pipes': 650, 'Dig trench for water or sewer pipe': 550, 'Backfill trench': 400, 'Compact or stamp ground': 350, 'Remove paving': 450, 'Repair concrete': 550, 'Repair tiles': 450, 'Clean work area': 250, 'Jackhammer hire': 750, 'Ground compactor hire': 650, 'Excavator hire': 1800 };
const storedServiceRates = JSON.parse(localStorage.getItem('pipewise-service-rates') || '{}');
Object.assign(serviceRates, storedServiceRates);
const serviceUnits = JSON.parse(localStorage.getItem('pipewise-service-units') || '{}');
const scenarios = {
    'underground-pipe': { services: [{ category: 'Plumbing work', task: 'Replace damaged pipes', quantity: 1, rate: 650 }, { category: 'Excavation & ground work', task: 'Dig trench for water or sewer pipe', quantity: 1, rate: 550 }, { category: 'Excavation & ground work', task: 'Backfill trench', quantity: 1, rate: 400 }, { category: 'Restoration', task: 'Make good damaged area', quantity: 1, rate: 550 }], materials: [{ category: 'Pipes', type: 'PVC pressure pipe', size: '110mm x 6m', quantity: 1, description: 'PVC pressure pipe - 110mm x 6m', cost: 349, markup: MATERIAL_MARKUP }, { category: 'Fittings', type: 'PVC coupling', size: '110mm', quantity: 2, description: 'PVC coupling - 110mm', cost: 0, markup: MATERIAL_MARKUP }] },
    'blocked-drain': { services: [{ category: 'Plumbing work', task: 'Unblock drain or sewer line', quantity: 1, rate: 650 }, { category: 'Additional labour', task: 'Clean work area', quantity: 1, rate: 250 }], materials: [{ category: 'Waste & traps', type: 'Waste fitting', size: '110mm', quantity: 1, description: 'Waste fitting - 110mm', cost: 150, markup: MATERIAL_MARKUP }] },
    'geyser-install': { services: [{ category: 'Plumbing work', task: 'Install geyser', quantity: 1, rate: 1200 }], materials: [{ category: 'Water heating', type: 'Geyser', size: '100L', quantity: 1, description: 'Geyser - 100L', cost: 4799, markup: MATERIAL_MARKUP }, { category: 'Geyser accessories', type: 'Geyser installation kit', size: 'Standard', quantity: 1, description: 'Geyser installation kit - Standard', cost: 950, markup: MATERIAL_MARKUP }] },
    'bathroom-install': { services: [{ category: 'Plumbing work', task: 'Install toilet, basin, bath or shower', quantity: 1, rate: 950 }, { category: 'Restoration', task: 'Make good damaged area', quantity: 1, rate: 550 }], materials: [{ category: 'Sanitary ware', type: 'Toilet', size: 'Standard', quantity: 1, description: 'Toilet - Standard', cost: 1800, markup: MATERIAL_MARKUP }, { category: 'Sanitary ware', type: 'Basin', size: 'Standard', quantity: 1, description: 'Basin - Standard', cost: 950, markup: MATERIAL_MARKUP }] },
    'leak-repair': { services: [{ category: 'Plumbing work', task: 'Repair leaking pipes', quantity: 1, rate: 450 }, { category: 'Plumbing work', task: 'Leak detection', quantity: 1, rate: 350 }], materials: [{ category: 'Consumables & tools', type: 'PTFE thread tape', size: '12mm x 12m', quantity: 1, description: 'PTFE thread tape - 12mm x 12m', cost: 18, markup: MATERIAL_MARKUP }] }
};
const scenarioEntries = {
    'wall-leak': [['Plumbing work', 'Call-out and inspection'], ['Plumbing work', 'Locate leak'], ['Plumbing work', 'Protect surrounding area'], ['Breaking & access', 'Remove tiles'], ['Breaking & access', 'Open or chase wall'], ['Plumbing work', 'Expose pipe'], ['Plumbing work', 'Repair burst pipe'], ['Plumbing work', 'Pressure test'], ['Restoration', 'Close wall'], ['Restoration', 'Plaster wall'], ['Restoration', 'Replace tiles'], ['Additional labour', 'Remove rubble'], ['Additional labour', 'Clean work area']],
    'floor-leak': [['Plumbing work', 'Call-out and inspection'], ['Plumbing work', 'Leak detection'], ['Plumbing work', 'Mark affected area'], ['Additional labour', 'Remove paving'], ['Breaking & access', 'Break concrete or floor'], ['Excavation & ground work', 'Excavate soil'], ['Plumbing work', 'Expose pipe'], ['Plumbing work', 'Repair burst pipe'], ['Plumbing work', 'Install fittings'], ['Plumbing work', 'Pressure test'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Repair concrete'], ['Restoration', 'Replace tiles'], ['Additional labour', 'Remove rubble'], ['Additional labour', 'Clean area']],
    'replace-toilet': [['Plumbing work', 'Call-out and inspection'], ['Plumbing work', 'Isolate water'], ['Plumbing work', 'Disconnect old toilet'], ['Plumbing work', 'Remove old toilet'], ['Plumbing work', 'Supply toilet'], ['Plumbing work', 'Install new toilet'], ['Plumbing work', 'Connect water supply'], ['Plumbing work', 'Connect waste pipe'], ['Plumbing work', 'Seal toilet'], ['Plumbing work', 'Test flushing'], ['Plumbing work', 'Check for leaks'], ['Additional labour', 'Clean work area']],
    'install-toilet': [['Plumbing work', 'Site inspection'], ['Plumbing work', 'Measure location'], ['Plumbing work', 'Mark pipe positions'], ['Plumbing work', 'Install water supply'], ['Plumbing work', 'Install waste pipe'], ['Plumbing work', 'Install toilet'], ['Plumbing work', 'Connect water'], ['Plumbing work', 'Test flushing'], ['Plumbing work', 'Seal installation'], ['Additional labour', 'Clean work area']],
    'replace-basin': [['Plumbing work', 'Disconnect water'], ['Plumbing work', 'Disconnect waste pipe'], ['Plumbing work', 'Remove old basin'], ['Plumbing work', 'Supply basin'], ['Plumbing work', 'Install basin'], ['Plumbing work', 'Install taps'], ['Plumbing work', 'Install waste fitting'], ['Plumbing work', 'Connect water'], ['Plumbing work', 'Connect waste'], ['Plumbing work', 'Seal basin'], ['Plumbing work', 'Check for leaks'], ['Additional labour', 'Remove rubble'], ['Additional labour', 'Clean area']],
    'replace-bath': [['Plumbing work', 'Disconnect water'], ['Plumbing work', 'Disconnect waste pipe'], ['Breaking & access', 'Remove tiles'], ['Plumbing work', 'Remove old bath'], ['Plumbing work', 'Supply new bath'], ['Plumbing work', 'Install bath'], ['Plumbing work', 'Connect taps'], ['Plumbing work', 'Connect waste pipe'], ['Plumbing work', 'Test drainage'], ['Plumbing work', 'Seal bath'], ['Restoration', 'Replace tiles'], ['Additional labour', 'Remove rubble'], ['Additional labour', 'Clean area']],
    'replace-shower': [['Plumbing work', 'Disconnect water'], ['Plumbing work', 'Remove shower enclosure'], ['Plumbing work', 'Remove old shower tray'], ['Breaking & access', 'Remove tiles'], ['Plumbing work', 'Repair plumbing'], ['Plumbing work', 'Supply new shower'], ['Plumbing work', 'Install shower tray'], ['Plumbing work', 'Install mixer'], ['Plumbing work', 'Install shower enclosure'], ['Plumbing work', 'Seal shower'], ['Plumbing work', 'Test drainage'], ['Plumbing work', 'Test water pressure'], ['Additional labour', 'Clean work area']],
    'unblock-toilet': [['Plumbing work', 'Call-out and inspection'], ['Plumbing work', 'Inspect toilet'], ['Plumbing work', 'Attempt manual blockage removal'], ['Plumbing work', 'Use drain rods'], ['Equipment', 'Use drain machine'], ['Plumbing work', 'Remove blockage'], ['Plumbing work', 'Flush toilet'], ['Plumbing work', 'Test drainage'], ['Additional labour', 'Clean area']],
    'unblock-sewer': [['Plumbing work', 'Call-out and inspection'], ['Plumbing work', 'Inspect sewer line'], ['Plumbing work', 'Open inspection point'], ['Plumbing work', 'Locate blockage'], ['Plumbing work', 'Use drain rods'], ['Equipment', 'Use drain machine'], ['Plumbing work', 'High-pressure jetting'], ['Plumbing work', 'CCTV inspection'], ['Plumbing work', 'Test sewer flow'], ['Plumbing work', 'Close inspection point'], ['Additional labour', 'Clean work area']],
    'collapsed-sewer': [['Plumbing work', 'Site inspection'], ['Plumbing work', 'CCTV inspection'], ['Plumbing work', 'Locate damaged section'], ['Breaking & access', 'Remove paving'], ['Breaking & access', 'Break concrete or floor'], ['Excavation & ground work', 'Excavate trench'], ['Plumbing work', 'Expose pipe'], ['Plumbing work', 'Remove damaged pipe'], ['Plumbing work', 'Supply new pipe'], ['Plumbing work', 'Install sewer pipe'], ['Plumbing work', 'Install fittings'], ['Plumbing work', 'Check pipe gradient'], ['Plumbing work', 'Test water flow'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Reinstate paving or concrete'], ['Additional labour', 'Remove rubble'], ['Additional labour', 'Clean site']],
    'main-water-pipe': [['Plumbing work', 'Site inspection'], ['Plumbing work', 'Shut off main water'], ['Plumbing work', 'Locate existing pipe'], ['Breaking & access', 'Remove paving'], ['Excavation & ground work', 'Dig trench for water or sewer pipe'], ['Plumbing work', 'Remove old pipe'], ['Plumbing work', 'Supply new pipe'], ['Plumbing work', 'Install new pipe'], ['Plumbing work', 'Install fittings'], ['Plumbing work', 'Install shut-off valve'], ['Plumbing work', 'Connect to municipal supply'], ['Plumbing work', 'Pressure test'], ['Plumbing work', 'Flush pipe'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Reinstall paving'], ['Additional labour', 'Clean area']],
    'outside-tap': [['Plumbing work', 'Inspect installation point'], ['Plumbing work', 'Install pipe'], ['Breaking & access', 'Chase wall for new pipe'], ['Plumbing work', 'Drill through wall'], ['Plumbing work', 'Install tap'], ['Plumbing work', 'Install isolation valve'], ['Plumbing work', 'Connect to water supply'], ['Plumbing work', 'Test water flow'], ['Plumbing work', 'Check for leaks'], ['Additional labour', 'Seal wall opening'], ['Additional labour', 'Clean work area']],
    'water-meter': [['Plumbing work', 'Shut off main water'], ['Plumbing work', 'Remove old pipe'], ['Plumbing work', 'Supply new meter'], ['Plumbing work', 'Install new meter'], ['Plumbing work', 'Install fittings'], ['Plumbing work', 'Check for leaks'], ['Plumbing work', 'Restore water supply'], ['Plumbing work', 'Record meter reading']],
    'geyser-leak': [['Plumbing work', 'Inspect geyser'], ['Plumbing work', 'Isolate water'], ['Plumbing work', 'Isolate electricity'], ['Plumbing work', 'Locate leak'], ['Plumbing work', 'Drain geyser'], ['Plumbing work', 'Replace valve'], ['Plumbing work', 'Replace pipe'], ['Plumbing work', 'Replace fittings'], ['Plumbing work', 'Refill geyser'], ['Plumbing work', 'Check for leaks'], ['Plumbing work', 'Restore electricity'], ['Plumbing work', 'Test operation']],
    'geyser-element': [['Plumbing work', 'Isolate electricity'], ['Plumbing work', 'Isolate water'], ['Plumbing work', 'Drain geyser'], ['Plumbing work', 'Remove old element'], ['Plumbing work', 'Supply new element'], ['Plumbing work', 'Install new element'], ['Plumbing work', 'Replace gasket'], ['Plumbing work', 'Refill geyser'], ['Plumbing work', 'Check for leaks'], ['Plumbing work', 'Restore electricity'], ['Plumbing work', 'Test geyser']],
    'pressure-pump': [['Plumbing work', 'Site inspection'], ['Plumbing work', 'Prepare installation area'], ['Plumbing work', 'Supply pump'], ['Plumbing work', 'Install pump'], ['Plumbing work', 'Install inlet pipe'], ['Plumbing work', 'Install outlet pipe'], ['Plumbing work', 'Install valves'], ['Plumbing work', 'Connect electrical supply'], ['Plumbing work', 'Prime pump'], ['Plumbing work', 'Test water pressure'], ['Plumbing work', 'Check for leaks'], ['Additional labour', 'Clean work area']],
    'excavation-only': [['Excavation & ground work', 'Mark excavation area'], ['Breaking & access', 'Remove paving'], ['Breaking & access', 'Break concrete'], ['Excavation & ground work', 'Dig trench for water or sewer pipe'], ['Excavation & ground work', 'Excavate soil'], ['Excavation & ground work', 'Sift soil'], ['Excavation & ground work', 'Remove excess soil'], ['Excavation & ground work', 'Load rubble'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Reinstate paving or concrete'], ['Additional labour', 'Clean work area']],
    'paving-access': [['Excavation & ground work', 'Mark excavation area'], ['Excavation & ground work', 'Carefully remove paving'], ['Excavation & ground work', 'Store paving for reuse'], ['Excavation & ground work', 'Dig trench for water or sewer pipe'], ['Plumbing work', 'Expose pipe'], ['Plumbing work', 'Repair plumbing'], ['Plumbing work', 'Pressure test'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Reinstall paving'], ['Restoration', 'Level paving'], ['Additional labour', 'Clean area']],
    'concrete-access': [['Breaking & access', 'Cut concrete'], ['Breaking & access', 'Break concrete'], ['Breaking & access', 'Remove concrete rubble'], ['Excavation & ground work', 'Excavate soil'], ['Plumbing work', 'Expose pipe'], ['Plumbing work', 'Repair plumbing'], ['Plumbing work', 'Pressure test'], ['Excavation & ground work', 'Backfill trench'], ['Excavation & ground work', 'Compact or stamp ground'], ['Restoration', 'Prepare concrete area'], ['Restoration', 'Pour new concrete'], ['Restoration', 'Finish concrete'], ['Additional labour', 'Clean area']]
};
Object.entries(scenarioEntries).forEach(([id, entries]) => { scenarios[id] = { services: entries.map(([category, task]) => ({ category, task, quantity: 1, rate: serviceRates[task] || 350 })), materials: [] }; });
const masterScenarioLibrary = [
    ['Leak Detection & Investigation', 'Suspected water leak', 'Call-out and inspection|Leak detection|Acoustic leak detection|Pressure test|Water meter monitoring|Thermal imaging inspection|Moisture meter inspection|Trace water pipe route|Locate underground leak|Locate concealed pipe leak|Mark leak location|Repair leaking pipe|Replace damaged section|Pressure test after repair|Final inspection'],
    ['Water Supply & Pipe Repairs', 'Burst underground water pipe', 'Site inspection|Leak detection|Locate pipe|Mark excavation area|Protect work area|Excavate soil|Hand excavation around services|Expose damaged pipe|Cut out damaged section|Supply replacement pipe|Supply couplings|Install new pipe|Connect to existing pipe|Pressure test|Flush pipe|Backfill excavation|Compact soil|Remove excess soil|Reinstate surface'],
    ['Water Supply & Pipe Repairs', 'Underground pipe replacement', 'Site inspection|Determine pipe route|Leak detection if required|Excavation|Trenching|Temporary water isolation|Remove existing pipe|Dispose of old pipe|Supply replacement pipe|Pipe fittings|Valves|Pipe bedding|Install new pipe|Connect existing services|Pressure test|Flush system|Backfill|Compact trench|Surface reinstatement'],
    ['Water Supply & Pipe Repairs', 'Water main / supply line replacement', 'Site inspection|Locate main water supply|Shut-off isolation|Excavation|Remove existing main|Supply new main pipe|Install isolation valve|Install pressure reducing valve|Install fittings|Connect to municipal supply|Pressure test|Flush system|Backfill|Compact|Reinstate surface'],
    ['Water Supply & Pipe Repairs', 'Burst pipe inside building', 'Emergency call-out|Locate leak|Isolate water supply|Break open wall floor or ceiling|Remove damaged pipe|Supply replacement pipe|Supply fittings|Install new section|Pressure test|Restore water supply|Leak inspection|Close opening|Plaster repair|Tile replacement|Paint touch-up|Remove rubble'],
    ['Leak Detection & Investigation', 'Bathroom pipe leak', 'Inspection|Leak detection|Isolate water|Remove access tiles|Remove damaged pipe|Supply pipe|Supply fittings|Repair pipework|Pressure test|Replace insulation|Replace tiles|Grouting|Silicone sealing|Clean work area'],
    ['Leak Detection & Investigation', 'Kitchen pipe leak', 'Inspection|Leak detection|Isolate water|Remove cabinet or access panel|Repair water pipe|Replace flexible hose|Replace isolation valve|Replace fittings|Pressure test|Cabinet reinstatement|Clean area'],
    ['Sanitaryware', 'Toilet leak', 'Toilet inspection|Leak detection|Replace inlet valve|Replace flush valve|Replace cistern washer|Replace flush button|Replace toilet connector|Replace isolation valve|Replace pan connector|Replace toilet seal|Repair water supply|Repair waste connection|Remove and reinstall toilet|Silicone seal|Test toilet'],
    ['Sanitaryware', 'Toilet replacement', 'Remove existing toilet|Disconnect water supply|Disconnect waste|Dispose of old toilet|Supply new toilet|Supply toilet seat|Supply cistern fittings|Install toilet|Connect water supply|Connect waste|Level toilet|Seal toilet|Test flush|Clean area'],
    ['Sanitaryware', 'Basin replacement', 'Remove existing basin|Disconnect water|Disconnect waste|Remove taps|Supply basin|Supply basin mixer or taps|Supply waste|Supply bottle trap|Supply flexible connectors|Install basin|Install taps|Connect waste|Connect water|Silicone seal|Test'],
    ['Sanitaryware', 'Shower installation or replacement', 'Remove existing shower fittings|Remove shower mixer|Install shower mixer|Install shower head|Install shower arm|Install handheld shower|Install shower rail|Install shower waste|Repair waste pipe|Repair water pipe|Waterproofing|Tile removal|Tile reinstatement|Silicone sealing|Pressure test|Water testing'],
    ['Sanitaryware', 'Bath installation or replacement', 'Remove existing bath|Disconnect waste|Disconnect water|Supply bath|Install bath|Install bath taps|Install waste|Install overflow|Connect water|Connect waste|Level bath|Seal bath|Test drainage'],
    ['Sanitaryware', 'Bathroom renovation plumbing', 'Site inspection|Plumbing layout|Strip-out|Remove existing sanitaryware|Remove old pipework|New hot-water pipework|New cold-water pipework|New waste pipework|Install shower|Install bath|Install basin|Install toilet|Install washing machine point|Install floor drain|Install valves|Pressure test|Drain test|Waterproofing interface|Final connections|Commissioning'],
    ['Geysers & Hot Water', 'Geyser replacement', 'Inspection|Isolate water|Isolate electrical supply|Drain geyser|Disconnect plumbing|Remove existing geyser|Remove old valves|Supply new geyser|Supply geyser valves|Supply pressure control equipment|Supply expansion vessel|Supply drip tray|Supply discharge pipe|Install geyser|Connect hot water|Connect cold water|Connect overflow|Pressure test|Fill geyser|Check for leaks|Commission system'],
    ['Geysers & Hot Water', 'Geyser leak', 'Emergency call-out|Leak inspection|Isolate water|Isolate electrical supply|Identify leaking component|Replace valve|Replace pressure relief valve|Replace temperature pressure valve|Replace pipe fitting|Replace geyser|Test system|Clean water damage'],
    ['Geysers & Hot Water', 'Geyser pressure or valve problem', 'Inspection|Pressure test|Check pressure reducing valve|Check expansion control|Replace pressure reducing valve|Replace expansion valve|Replace safety valve|Replace isolation valve|Replace non-return valve|Adjust pressure|Test system'],
    ['Drainage & Sewer', 'Drain blockage', 'Call-out|Drain inspection|Identify blockage|Open drain or manhole|Manual clearing|Plunger|Drain snake|Mechanical drain cleaning|Chemical treatment|Water testing|Clean drain|Remove waste'],
    ['Jetting & Drain Cleaning', 'Drain jetting', 'Call-out|Drain inspection|Locate access point|Open manhole|High-pressure drain jetting|Clear blockage|Grease removal|Scale removal|Root removal|Flush drainage line|Test flow|CCTV inspection|Clean work area|Dispose of removed material'],
    ['CCTV / Camera Inspections', 'CCTV camera drain inspection', 'Call-out|Locate drain access|Open manhole|Camera inspection|Record inspection|Identify blockage|Identify cracked pipe|Identify collapsed pipe|Identify displaced joint|Identify root ingress|Measure approximate location|Mark problem location|Provide inspection report|Provide video footage'],
    ['Drainage & Sewer', 'Blocked sewer', 'Emergency call-out|Sewer inspection|Locate blockage|Open manhole|Manual clearing|Drain snake|High-pressure jetting|CCTV inspection|Remove blockage|Flush sewer|Flow test|Clean manhole|Replace damaged section'],
    ['Drainage & Sewer', 'Sewer pipe replacement', 'CCTV inspection|Locate damaged section|Mark pipe route|Excavation|Trenching|Remove existing sewer pipe|Dispose of old pipe|Supply sewer pipe|Supply bends|Supply junctions|Install new pipe|Connect to existing sewer|Pipe bedding|Test drainage|Backfill|Compact|Surface reinstatement'],
    ['Drainage & Sewer', 'Collapsed drain or sewer', 'CCTV inspection|Locate collapse|Excavation|Remove collapsed pipe|Remove soil and debris|Supply replacement pipe|Supply fittings|Install new pipe|Connect existing drainage|Test flow|Backfill|Compact|Reinstatement'],
    ['Jetting & Drain Cleaning', 'Root intrusion into drain', 'CCTV inspection|Locate root intrusion|Drain jetting|Mechanical root cutting|Remove roots|Flush drainage line|CCTV confirmation|Repair pipe|Replace damaged section|Backfill|Reinstatement'],
    ['CCTV / Camera Inspections', 'Drain investigation and clearance', 'Call-out|CCTV camera inspection|Identify blockage|High-pressure jetting|Flush drainage system|Final camera inspection|Basic report|Video recording|Recommendations'],
    ['Drainage & Sewer', 'Blocked kitchen drain', 'Inspection|Remove trap|Clean trap|Drain snake|Jetting|Grease removal|Waste pipe cleaning|Replace trap|Replace waste pipe|Flow test'],
    ['Drainage & Sewer', 'Blocked bathroom drain', 'Inspection|Remove waste cover|Clear blockage|Snake drain|Jet drain|Clean trap|Replace waste fitting|Flow test|Clean area'],
    ['Drainage & Sewer', 'Blocked shower drain', 'Remove grate|Remove hair and debris|Clean trap|Snake drain|Jet drain|Replace waste|Replace grate|Test drainage'],
    ['Stormwater', 'Blocked stormwater drain', 'Inspect stormwater system|Open drain|Remove leaves and debris|Manual clearing|Drain jetting|CCTV inspection|Root removal|Repair stormwater pipe|Replace damaged grate|Clean catch pit|Test flow'],
    ['Stormwater', 'Stormwater pipe replacement', 'Inspection|Locate pipe|Excavation|Remove existing pipe|Supply stormwater pipe|Supply bends|Supply junctions|Install pipe|Connect existing system|Test flow|Backfill|Compact|Reinstate paving or soil'],
    ['Drainage & Sewer', 'Manhole repair or replacement', 'Inspect manhole|Open manhole|Clean manhole|Remove debris|Repair benching|Repair walls|Replace manhole cover|Replace frame|Raise or lower manhole|Reconnect pipes|Seal joints|Test drainage'],
    ['Water Supply & Pipe Repairs', 'Water pressure problem', 'Site inspection|Pressure test|Check municipal supply|Check pressure reducing valve|Check isolation valves|Check filters|Check blocked pipes|Check geyser|Replace pressure reducing valve|Replace valve|Clean filter|Repair pipe|Retest pressure'],
    ['Water Supply & Pipe Repairs', 'Low water pressure', 'Pressure test|Flow test|Inspect supply pipe|Inspect valves|Inspect pressure reducing valve|Inspect filters|Inspect geyser|Clear restriction|Replace valve|Replace section of pipe|Test system'],
    ['Water Supply & Pipe Repairs', 'High water pressure', 'Pressure test|Install pressure reducing valve|Replace pressure reducing valve|Install pressure gauge|Adjust pressure|Install expansion control|Test system'],
    ['Water Supply & Pipe Repairs', 'Water hammer', 'Investigation|Pressure test|Check valves|Check pipe supports|Check pressure|Install water hammer arrestor|Secure pipework|Replace faulty valve|Install pressure reducing valve|Test system'],
    ['Sanitaryware', 'Tap replacement', 'Remove existing tap|Isolate water|Supply tap|Supply flexible connectors|Supply isolation valves|Install tap|Connect water|Test|Silicone seal'],
    ['Sanitaryware', 'Tap repair', 'Inspection|Replace washer|Replace cartridge|Replace spindle|Replace O-rings|Replace flexible hose|Replace valve|Test tap'],
    ['Sanitaryware', 'Washing machine installation', 'Inspect connection|Install washing machine valve|Install waste connection|Install trap|Supply flexible hose|Connect machine|Test inlet|Test drainage|Check leaks'],
    ['Sanitaryware', 'Dishwasher installation', 'Water connection|Isolation valve|Flexible hose|Waste connection|Dishwasher trap connection|Install unit connection|Leak test|Drain test'],
    ['Geysers & Hot Water', 'Hot water pipe repair', 'Locate leak|Isolate water|Drain system|Remove damaged pipe|Supply hot-water pipe|Insulation|Fittings|Install pipe|Pressure test|Restore supply|Check temperature|Check leaks'],
    ['Water Supply & Pipe Repairs', 'Complete house plumbing installation', 'Plumbing layout|Site establishment|Underground drainage|Sewer connections|Stormwater drainage|Underground water supply|Hot-water pipework|Cold-water pipework|Waste pipework|Vent pipes|Floor drains|Toilets|Basins|Baths|Showers|Kitchen sink|Washing machine points|Dishwasher points|Geyser installation|Valves|Testing|Commissioning'],
    ['Water Supply & Pipe Repairs', 'Plumbing alterations', 'Site inspection|Identify existing services|Isolate water|Remove existing pipe|Alter water pipe|Alter waste pipe|Add new pipe|Add new valve|Add new connection|Pressure test|Drain test|Reconnect fixtures|Reinstatement'],
    ['Water Supply & Pipe Repairs', 'Additional water point', 'Locate water supply|Cut into existing pipe|Supply pipe|Supply tee|Supply valve|Supply tap|Install pipe|Install washing machine point|Water connection|Waste connection|Trap|Testing'],
    ['Water Supply & Pipe Repairs', 'Outside tap or garden tap', 'Remove old tap|Supply tap|Supply isolation valve|Supply pipe|Fittings|Install tap|Test'],
    ['Water Supply & Pipe Repairs', 'Irrigation plumbing repair', 'Inspection|Leak detection|Locate damaged pipe|Excavation|Replace irrigation pipe|Replace fittings|Replace valve|Repair sprinkler|Replace sprinkler|Test zones|Backfill'],
    ['Leak Detection & Investigation', 'Swimming pool plumbing leak', 'Inspection|Pressure test|Leak detection|Camera inspection|Locate leak|Expose pipe|Repair pipe|Replace fittings|Pressure test|Backfill|Surface reinstatement'],
    ['Emergency Plumbing', 'Emergency plumbing call-out', 'Emergency call-out|After-hours surcharge|Initial inspection|Isolate water|Temporary repair|Leak containment|Emergency drain clearing|Emergency pipe repair|Testing|Permanent repair quotation'],
    ['Water Supply & Pipe Repairs', 'Water main isolation or valve replacement', 'Locate valve|Isolate supply|Excavate|Remove valve|Supply replacement valve|Install valve|Connect pipe|Pressure test|Backfill|Reinstate'],
    ['Excavation & Civil Works', 'Paving removal and reinstatement', 'Mark work area|Remove paving|Number and store pavers|Excavation|Pipe repair|Backfill|Compact|Sand bedding|Replace paving|Cut replacement pavers|Joint sand|Clean area'],
    ['Excavation & Civil Works', 'Concrete breaking and reinstatement', 'Mark work area|Concrete cutting|Concrete breaking|Remove concrete|Excavation|Pipe repair|Backfill|Compaction|Reinforcement|Concrete supply|Concrete reinstatement|Finishing|Curing'],
    ['Excavation & Civil Works', 'Tiling removal and reinstatement', 'Protect work area|Remove tiles|Remove adhesive|Plumbing repair|Waterproofing repair|Tile adhesive|Replacement tiles|Grouting|Silicone|Cleaning'],
    ['Excavation & Civil Works', 'Excavation and earthworks', 'Site setup|Mark excavation|Hand excavation|Machine excavation|Trenching|Soil removal|Spoil handling|Sand bedding|Pipe installation|Backfill|Compaction|Excess soil removal'],
    ['Excavation & Civil Works', 'Wall chasing and pipe installation', 'Mark pipe route|Chase wall|Remove rubble|Install pipe|Install fittings|Pressure test|Close chase|Plaster|Tile|Paint'],
    ['Water Supply & Pipe Repairs', 'Ceiling access and repair', 'Protect area|Open ceiling|Locate pipe|Repair pipe|Pressure test|Close ceiling|Replace board|Skim|Paint|Clean area'],
    ['Maintenance & Inspections', 'Drainage maintenance', 'Drain inspection|CCTV inspection|Drain cleaning|Jetting|Manhole cleaning|Root removal|Trap cleaning|Flow testing|Preventative maintenance report'],
    ['Maintenance & Inspections', 'Plumbing maintenance contract', 'Scheduled inspection|Water pressure testing|Leak inspection|Geyser inspection|Valve inspection|Toilet inspection|Tap inspection|Drain inspection|Manhole inspection|CCTV inspection|Drain jetting|Preventative repairs|Maintenance report'],
    ['Maintenance & Inspections', 'Commercial plumbing inspection', 'Site inspection|Plumbing survey|Water pressure testing|Leak detection|Drain inspection|CCTV inspection|Geyser inspection|Valve inspection|Sanitaryware inspection|Pump inspection|Backflow inspection|Maintenance report|Repair recommendations'],
    ['Jetting & Drain Cleaning', 'Commercial drain cleaning', 'Call-out|Drain inspection|Manhole inspection|CCTV inspection|High-pressure jetting|Mechanical cleaning|Root cutting|Grease removal|Flow test|Final camera inspection|Report'],
    ['Jetting & Drain Cleaning', 'Restaurant or commercial kitchen drain', 'Inspection|Grease trap inspection|Grease trap cleaning|Drain jetting|High-pressure cleaning|Waste pipe cleaning|CCTV inspection|Replace trap|Replace waste pipe|Flow testing|Cleaning report'],
    ['Jetting & Drain Cleaning', 'Grease trap cleaning', 'Call-out|Isolate area|Open grease trap|Remove grease|Pump out waste|Clean trap|High-pressure wash|Inspect inlet and outlet|Flow test|Dispose of waste'],
    ['Water Supply & Pipe Repairs', 'Backflow or reverse flow problem', 'Inspection|Identify source|Test flow|Check non-return valve|Replace non-return valve|Install backflow prevention|Clean system|Test'],
    ['Pumps & Water Tanks', 'Water tank installation', 'Site inspection|Tank supply|Tank base preparation|Tank installation|Float valve|Isolation valve|Overflow|Inlet pipe|Outlet pipe|Pump|Pressure control|Electrical connection|Testing'],
    ['Pumps & Water Tanks', 'Booster pump installation', 'Site inspection|Pump selection|Pump supply|Isolation valves|Non-return valve|Pressure controller|Pipework|Electrical connection|Commissioning|Pressure test'],
    ['Pumps & Water Tanks', 'Sump or drainage pump', 'Site inspection|Supply pump|Pump installation|Float switch|Discharge pipe|Non-return valve|Isolation valve|Electrical connection|Test pump|Test discharge'],
    ['Water Supply & Pipe Repairs', 'Burst flexible hose', 'Isolate water|Remove hose|Supply flexible hose|Install hose|Pressure test|Check fittings|Clean water'],
    ['Water Supply & Pipe Repairs', 'Valve replacement', 'Locate valve|Isolate water|Drain section|Remove valve|Supply replacement valve|Install valve|Seal threaded connection|Pressure test|Restore supply'],
    ['Water Supply & Pipe Repairs', 'Plumbing reconnection after building work', 'Inspect existing plumbing|Locate services|Reconnect water|Reconnect waste|Reconnect fixtures|Replace damaged fittings|Pressure test|Drain test|Commission'],
    ['Emergency Plumbing', 'Water damage emergency make-safe', 'Emergency call-out|Isolate water|Locate leak|Stop leak|Drain affected system|Temporary pipe repair|Remove damaged plumbing|Make safe|Final repair quotation'],
    ['Maintenance & Inspections', 'Final plumbing inspection', 'Water pressure test|Leak inspection|Hot-water inspection|Cold-water inspection|Drainage inspection|Toilet testing|Basin testing|Shower testing|Kitchen testing|Geyser inspection|Valve inspection|Final commissioning report']
];
const libraryCategoryMap = { 'Leak Detection & Investigation': 'Plumbing work', 'Water Supply & Pipe Repairs': 'Plumbing work', 'Drainage & Sewer': 'Drainage & sewer', 'Jetting & Drain Cleaning': 'Drainage & sewer', 'CCTV / Camera Inspections': 'Drainage & sewer', Sanitaryware: 'Fixtures & appliances', 'Geysers & Hot Water': 'Geysers & hot water', 'Pumps & Water Tanks': 'Fixtures & appliances', Stormwater: 'Drainage & sewer', 'Excavation & Civil Works': 'Excavation & ground work', 'Emergency Plumbing': 'Plumbing work', 'Maintenance & Inspections': 'Compliance & testing' };
masterScenarioLibrary.forEach(([libraryCategory, name, tasks], index) => { scenarios[`library-${index + 1}`] = { services: tasks.split('|').map(task => ({ category: libraryCategoryMap[libraryCategory], task, quantity: 1, rate: serviceRates[task] || 350 })), materials: [] }; });
const storedScenarioServices = JSON.parse(localStorage.getItem('pipewise-scenario-services') || '{}');
Object.entries(storedScenarioServices).forEach(([id, services]) => { if (scenarios[id] && Array.isArray(services)) scenarios[id].services = services; });
const customScenarios = JSON.parse(localStorage.getItem('pipewise-custom-scenarios') || '[]').filter(scenario => scenario && typeof scenario.id === 'string' && typeof scenario.name === 'string' && Array.isArray(scenario.services));
customScenarios.forEach(scenario => { scenarios[scenario.id] = { services: scenario.services, materials: [] }; });
Object.values(scenarios).forEach(scenario => scenario.services.forEach(({ category, task, rate }) => { if (!serviceCatalogue[category]) serviceCatalogue[category] = []; if (!serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); if (serviceRates[task] === undefined && Number.isFinite(Number(rate))) serviceRates[task] = Number(rate); }));
serviceCatalogue['Plumbing work'] = serviceCatalogue['Plumbing work'].filter(task => task !== 'Use drain machine');
const standardPlumbingServices = {
    'Plumbing work': ['Install shower mixer', 'Repair shower mixer', 'Replace basin tap', 'Replace bath tap', 'Install kitchen sink', 'Install washing machine connection', 'Install dishwasher connection', 'Install fridge water point', 'Install water filter', 'Install pressure reducing valve', 'Install non-return valve', 'Install water hammer arrestor', 'Replace flexible connectors', 'Replace stopcock', 'Replace ball valve', 'Repair toilet cistern', 'Replace toilet flush valve', 'Replace toilet inlet valve', 'Replace toilet seat', 'Repair leaking tap', 'Repair leaking mixer', 'Install external tap', 'Install hose bib tap'],
    'Drainage & sewer': ['Clear blocked basin waste', 'Clear blocked bath waste', 'Clear blocked shower waste', 'Clear blocked kitchen drain', 'Clear stormwater drain', 'Repair sewer pipe', 'Replace sewer pipe', 'Install inspection chamber', 'Install gully trap', 'Install floor drain', 'Install grease trap', 'Repair manhole cover', 'Camera inspection of drain', 'Hydro jet drain cleaning'],
    'Geysers & hot water': ['Install geyser tray', 'Install geyser drip tray', 'Install geyser safety valve', 'Install geyser vacuum breakers', 'Install geyser expansion valve', 'Replace geyser thermostat', 'Replace geyser anode', 'Repair geyser overflow', 'Install solar geyser', 'Service solar geyser', 'Install heat pump', 'Service heat pump'],
    'Fixtures & appliances': ['Install basin', 'Install bath', 'Install shower', 'Install toilet', 'Install bidet', 'Install urinal', 'Install kitchen mixer', 'Install basin mixer', 'Install bath mixer', 'Replace shower head', 'Install garbage disposal', 'Install water tank'],
    'Compliance & testing': ['Issue plumbing COC', 'Geyser COC inspection', 'Pressure test water line', 'Drainage flow test', 'Leak detection report', 'Water quality test', 'Backflow prevention test', 'Site assessment and quotation']
};
Object.entries(standardPlumbingServices).forEach(([category, tasks]) => { if (!serviceCatalogue[category]) serviceCatalogue[category] = []; tasks.forEach(task => { if (!serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); }); });
const storedServiceCatalogue = JSON.parse(localStorage.getItem('pipewise-service-catalogue') || '{}');
Object.entries(storedServiceCatalogue).forEach(([category, tasks]) => { if (!Array.isArray(tasks)) return; if (!serviceCatalogue[category]) serviceCatalogue[category] = []; tasks.forEach(task => { if (typeof task === 'string' && !serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); }); });
const serviceCategories = Object.keys(serviceCatalogue);
const supplierInfo = {
    plumblink: { name: 'Plumblink', url: 'https://www.plumblink.co.za/all-products' },
    builders: { name: 'Builders', url: 'https://www.builders.co.za/Plumbing-Bathroom-and-Kitchen/c/13' },
    bathroom: { name: 'Bathroom Bizarre', url: 'https://bathroom.co.za/' }
};
const supplierOptions = Object.keys(supplierInfo);
const supplierPrices = {
    builders: {
        'HDPE drainage pipe - 110mm x 5m': 349,
        'HDPE water pipe - 25mm x 100m': 29,
        'HDPE water pipe - 32mm x 100m': 35,
        'Copper pipe - 15mm x 5.5m': 445,
        'PVC pressure pipe - 50mm x 6m': 205,
        'PVC pressure pipe - 110mm x 6m': 349,
        'Copper elbow - 15mm': 6,
        'Copper tee - 15mm': 13,
        'Geyser - 150L': 4699,
        'Toilet - Standard': 1589
    },
    bathroom: {
        'Basin mixer - 15mm': 2205.75,
        'Basin - Standard': 995,
        'Toilet - Standard': 1999,
        'Shower screen - 900 x 2000mm': 2295,
        'Vanity cabinet - 600mm': 3195,
        'Sink mixer - 15mm': 2205.75
    }
};
const supplierAvailability = {
    plumblink: new Set([
        'HDPE drainage pipe - 110mm x 5m',
        'HDPE water pipe - 25mm x 100m',
        'HDPE water pipe - 32mm x 100m',
        'Copper pipe - 15mm x 5.5m',
        'PVC pressure pipe - 50mm x 6m',
        'PVC pressure pipe - 110mm x 6m',
        'Copper elbow - 15mm',
        'Copper tee - 15mm',
        'Geyser - 150L',
        'Toilet - Standard'
    ]),
    builders: new Set(Object.keys(supplierPrices.builders)),
    bathroom: new Set(Object.keys(supplierPrices.bathroom))
};
const priceCheckKey = 'pipewise-last-price-check';
function getBestMaterialPrice(material) {
    if (!material.description) return { cost: getValue(material.cost), suppliers: [] };
    const baseCost = plumbingCatalogue[material.category]?.[material.type]?.sizes[material.size] ?? getValue(material.cost);
    const prices = [{ supplier: 'plumblink', cost: baseCost }, ...Object.entries(supplierPrices).filter(([, catalogue]) => catalogue[material.description] !== undefined).map(([supplier, catalogue]) => ({ supplier, cost: catalogue[material.description] }))].filter(({ cost }) => Number.isFinite(cost) && cost > 0);
    if (!prices.length) return { cost: 0, suppliers: [] };
    const cost = Math.min(...prices.map(price => price.cost));
    return { cost, suppliers: prices.filter(price => price.cost === cost).map(price => price.supplier) };
}
function getSupplierCost(material) { return getBestMaterialPrice(material).cost; }
function getMaterialSuppliers(material) {
    if (!material.description) return 'Select material';
    const bestPrice = getBestMaterialPrice(material);
    if (!bestPrice.suppliers.length) return 'No price match';
    return `${currency(bestPrice.cost)} - ${bestPrice.suppliers.map(supplier => supplierInfo[supplier].name).join(', ')}`;
}
function getQuantity(material) { return Math.max(1, Number(material.quantity) || 1); }
function getMaterialArea(material) {
    const w = getValue(material.width), h = getValue(material.height);
    if (!(w > 0 && h > 0)) return 0;
    return (w * h) / 1e6; // mm² → m²
}
function isAreaPriced(material) {
    const item = plumbingCatalogue[material.category]?.[material.type];
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
function getServiceQuantity(service) { return Math.max(1, Number(service.quantity) || 1); }
function getServiceRate(service) { const priceListRate = serviceRates[service.task]; return priceListRate === undefined ? Number(service.rate) || 350 : priceListRate; }
function getServiceUnit(service) { return service.unit || serviceUnits[service.task] || 'Each'; }
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
        localStorage.setItem('pipewise-service-rates', JSON.stringify(serviceRates));
        localStorage.setItem('pipewise-service-units', JSON.stringify(serviceUnits));
        $('price-list-status').textContent = `${count} Excel prices loaded from ${file.name}`;
        renderServices();
        if ($('price-list-body')) renderPriceList();
        showToast(`${count} master prices loaded`);
    };
    reader.readAsArrayBuffer(file);
}
function getServiceTasks(service) { const tasks = serviceCatalogue[service.category] || []; return service.task && !tasks.includes(service.task) ? [...tasks, service.task] : tasks; }
function categoryOptions(selected) { return `<option value="">Select category</option>${serviceCategories.map(category => `<option value="${escapeHtml(category)}" ${selected === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}`; }
function persistServiceCatalogue() { localStorage.setItem('pipewise-service-catalogue', JSON.stringify(serviceCatalogue)); }
const unitOptions = ['Each', 'Hour', 'Day', 'Metre', 'm²', 'm³', 'Job', 'Connection', 'Load', 'Hole'];
function unitSelect(selected, label) { const options = unitOptions.includes(selected) ? unitOptions : [selected, ...unitOptions]; return `<select class="price-unit" aria-label="${label}">${options.map(unit => `<option value="${escapeHtml(unit)}" ${unit === selected ? 'selected' : ''}>${escapeHtml(unit)}</option>`).join('')}</select>`; }
function renderPriceList() {
    const query = ($('price-list-search')?.value || '').toLowerCase();
    const rows = Object.entries(serviceCatalogue).flatMap(([category, tasks]) => tasks.map(task => ({ category, task, unit: serviceUnits[task] || 'Each', rate: getServiceRate({ task }) }))).filter(row => `${row.category} ${row.unit} ${row.task}`.toLowerCase().includes(query));
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
    localStorage.setItem('pipewise-service-rates', JSON.stringify(serviceRates));
    localStorage.setItem('pipewise-service-units', JSON.stringify(serviceUnits));
    renderPriceList();
    renderServices();
    showToast('Price removed');
}
function savePriceList() {
    document.querySelectorAll('.price-entry').forEach(row => { const oldTask = row.dataset.task; const task = row.querySelector('.price-line-item').value.trim(); const category = row.querySelector('.price-category').value; if (!task || !category) return; if (oldTask && oldTask !== task) { Object.values(serviceCatalogue).forEach(tasks => { const oldIndex = tasks.indexOf(oldTask); if (oldIndex >= 0) tasks.splice(oldIndex, 1); }); delete serviceRates[oldTask]; delete serviceUnits[oldTask]; } if (!serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task); serviceRates[task] = getValue(row.querySelector('.price-rate').value); serviceUnits[task] = row.querySelector('.price-unit').value || 'Each'; });
    persistServiceCatalogue();
    localStorage.setItem('pipewise-service-rates', JSON.stringify(serviceRates));
    localStorage.setItem('pipewise-service-units', JSON.stringify(serviceUnits));
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
function nextQuoteNumber() { return `PW-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(3, '0')}`; }
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
    $('service-list').innerHTML = services.map((service, index) => { const group = service.scenario || 'Additional services'; const previousGroup = index ? services[index - 1].scenario || 'Additional services' : ''; const heading = group === previousGroup ? '' : `<div class="service-group-label">${escapeHtml(group)}</div>`; return `${heading}<div class="material-row service-row" data-index="${index}"><select class="service-category" aria-label="Service category"><option value="">Select category</option>${serviceCategories.map(category => `<option ${service.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select><select class="service-task" aria-label="Service task"><option value="">Select task</option>${getServiceTasks(service).map(task => `<option ${service.task === task ? 'selected' : ''}>${escapeHtml(task)}</option>`).join('')}</select>${unitSelect(getServiceUnit(service), `Unit for ${service.task || 'service'}`).replace('class="price-unit"', 'class="service-unit"')}<input class="service-quantity" type="number" min="1" step="1" value="${getServiceQuantity(service)}" aria-label="Service quantity"><span class="service-rate">${currency(getServiceRate(service))}</span><span class="service-total">${currency(getServiceRate(service) * getServiceQuantity(service))}</span><button class="remove-material" type="button" aria-label="Remove service">×</button></div>`; }).join('');
    $('service-empty').style.display = services.length ? 'none' : 'block';
    document.querySelectorAll('.service-row').forEach(row => { const index = Number(row.dataset.index); row.querySelector('.service-category').addEventListener('change', event => { services[index] = { ...services[index], category: event.target.value, task: '', unit: 'Each', quantity: 1, rate: 350 }; renderServices(); }); row.querySelector('.service-task').addEventListener('change', event => { services[index].task = event.target.value; services[index].unit = serviceUnits[event.target.value] || 'Each'; services[index].rate = serviceRates[event.target.value] || 350; renderServices(); }); row.querySelector('.service-unit').addEventListener('change', event => { services[index].unit = event.target.value; }); row.querySelector('.service-quantity').addEventListener('input', event => { services[index].quantity = getServiceQuantity({ quantity: event.target.value }); renderServices(); calculate(); }); row.querySelector('.remove-material').addEventListener('click', () => { services.splice(index, 1); renderServices(); calculate(); }); });
}
function syncMasterScenarioOptions() { ['scenario-select'].forEach(selectId => { const select = $(selectId); select.querySelectorAll('[data-master-scenario]').forEach(optionGroup => optionGroup.remove()); const categories = [...new Set(masterScenarioLibrary.map(([category]) => category))]; categories.forEach(category => { const group = document.createElement('optgroup'); group.label = category; group.dataset.masterScenario = 'true'; masterScenarioLibrary.filter(([libraryCategory]) => libraryCategory === category).forEach(([, name], index) => { const option = document.createElement('option'); option.value = `library-${masterScenarioLibrary.findIndex(([, scenarioName]) => scenarioName === name) + 1}`; option.textContent = name; group.append(option); }); select.append(group); }); }); }
function syncCustomScenarioOptions() { ['scenario-select'].forEach(selectId => { const select = $(selectId); select.querySelectorAll('[data-custom-scenario]').forEach(option => option.remove()); let group = [...select.querySelectorAll('optgroup')].find(optionGroup => optionGroup.label === 'Custom scenarios'); if (!group) { group = document.createElement('optgroup'); group.label = 'Custom scenarios'; select.append(group); } customScenarios.forEach(scenario => { const option = document.createElement('option'); option.value = scenario.id; option.textContent = scenario.name; option.dataset.customScenario = 'true'; group.append(option); }); }); }
function renderLabourItems() {
    $('labour-list').innerHTML = labourItems.map((item, index) => `<div class="labour-row" data-index="${index}"><span>${escapeHtml(item.description)}</span><span>${escapeHtml(item.unit)}</span><input class="labour-quantity" type="number" min="0" step="1" value="${getValue(item.quantity)}" aria-label="Quantity for ${escapeHtml(item.description)}"><input class="labour-rate" type="number" min="0" step="0.01" value="${getValue(item.rate)}" aria-label="Cost per day for ${escapeHtml(item.description)}"><strong>${currency(getValue(item.quantity) * getValue(item.rate))}</strong></div>`).join('');
    document.querySelectorAll('.labour-row').forEach(row => { const index = Number(row.dataset.index); row.querySelector('.labour-quantity').addEventListener('input', event => { labourItems[index].quantity = getValue(event.target.value); renderLabourItems(); calculate(); }); row.querySelector('.labour-rate').addEventListener('input', event => { labourItems[index].rate = getValue(event.target.value); renderLabourItems(); calculate(); }); });
}
function addScenario() { const scenario = scenarios[$('scenario-select').value]; if (!scenario) { showToast('Select a job scenario first'); return; } const scenarioName = $('scenario-select').selectedOptions[0].textContent.trim(); services.push(...scenario.services.map(service => ({ ...service, scenario: scenarioName }))); materials.push(...scenario.materials.map(material => ({ ...material }))); renderMaterials(); renderServices(); calculate(); showToast('Scenario added. Remove any items you do not need.'); }
function renderMaterials() {
    $('material-list').innerHTML = materials.map((material, index) => `
    <div class="material-row" data-index="${index}">
                <select class="material-category" aria-label="Material category"><option value="">Select category</option>${catalogueCategories.map(category => `<option ${material.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select>
            <select class="material-type" aria-label="Material type"><option value="">Select type</option>${material.category && plumbingCatalogue[material.category] ? Object.keys(plumbingCatalogue[material.category]).map(type => `<option ${material.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('') : ''}</select>
            <select class="material-size" aria-label="Material size"><option value="">Select size</option>${material.category && material.type && plumbingCatalogue[material.category]?.[material.type] ? Object.keys(plumbingCatalogue[material.category][material.type].sizes).map(size => `<option ${material.size === size ? 'selected' : ''}>${escapeHtml(size)}</option>`).join('') : ''}</select>
            <input class="material-quantity" type="number" min="1" step="1" value="${getQuantity(material)}" aria-label="Material quantity">
            <input class="material-width" type="number" min="0" step="1" value="${Number(material.width) || 0}" placeholder="W mm" aria-label="Width (mm)">
            <input class="material-height" type="number" min="0" step="1" value="${Number(material.height) || 0}" placeholder="H mm" aria-label="Height (mm)">
        <span class="material-best-price">${material.description ? currency(getSupplierCost(material)) : '—'}</span>
    <input class="material-markup" type="number" value="${MATERIAL_MARKUP}" aria-label="Material markup percentage" readonly>
    <span class="material-total">${currency(getEffectiveCost(material) * (1 + MATERIAL_MARKUP / 100))}</span>
      <button class="remove-material" type="button" aria-label="Remove material">×</button>
    </div>`).join('');
    $('material-empty').style.display = materials.length ? 'none' : 'block';
    document.querySelectorAll('#material-list .material-row').forEach(row => {
        const index = Number(row.dataset.index);
        row.querySelector('.material-category').addEventListener('change', event => { materials[index] = { category: event.target.value, type: '', size: '', description: '', cost: 0, markup: MATERIAL_MARKUP }; renderMaterials(); });
        row.querySelector('.material-type').addEventListener('change', event => { materials[index].type = event.target.value; materials[index].size = ''; materials[index].markup = MATERIAL_MARKUP; renderMaterials(); });
        row.querySelector('.material-size').addEventListener('change', event => { const item = plumbingCatalogue[materials[index].category]?.[materials[index].type]; if (!item || !event.target.value) return; materials[index].size = event.target.value; materials[index].description = `${materials[index].type} - ${event.target.value}`; materials[index].cost = item.sizes[event.target.value]; materials[index].markup = MATERIAL_MARKUP; renderMaterials(); });
        row.querySelector('.material-quantity').addEventListener('input', event => { materials[index].quantity = Math.max(1, Math.floor(getValue(event.target.value))); renderMaterials(); calculate(); });
        row.querySelector('.material-width').addEventListener('input', event => { materials[index].width = getValue(event.target.value); renderMaterials(); calculate(); });
        row.querySelector('.material-height').addEventListener('input', event => { materials[index].height = getValue(event.target.value); renderMaterials(); calculate(); });
        materials[index].markup = MATERIAL_MARKUP;
        row.querySelector('.remove-material').addEventListener('click', () => { materials.splice(index, 1); renderMaterials(); calculate(); });
    });
    calculate();
}
function getValue(value) { return Math.max(0, Number(value) || 0); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
function updateSummary() { $('summary-customer').textContent = $('customer-name').value.trim() || 'New customer'; $('summary-address').textContent = $('customer-address').value.trim() || 'Add a service address'; }
function updateSitePhotoPreview() { $('site-photo-preview').innerHTML = sitePhotos.map((photo, index) => `<div class="site-photo-card"><img src="${photo.data}" alt="Site photo ${index + 1}"><label>Photo description<input class="site-photo-description" data-photo-index="${index}" type="text" value="${escapeHtml(photo.description || '')}" placeholder="e.g. Existing leak under basin"></label><button class="remove-photo" type="button" data-photo-index="${index}" aria-label="Remove site photo ${index + 1}">×</button></div>`).join(''); $('site-photo-status').textContent = sitePhotos.length ? `${sitePhotos.length} photo${sitePhotos.length === 1 ? '' : 's'} attached` : 'No photos selected'; document.querySelectorAll('[data-photo-index]').forEach(button => button.addEventListener('click', () => { sitePhotos.splice(Number(button.dataset.photoIndex), 1); updateSitePhotoPreview(); })); document.querySelectorAll('.site-photo-description').forEach(input => input.addEventListener('input', event => { sitePhotos[Number(event.target.dataset.photoIndex)].description = event.target.value; updatePrintDetails(); })); updatePrintDetails(); }
function compressSitePhoto(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Photo could not be read')); reader.onload = () => { const image = new Image(); image.onerror = () => reject(new Error('Photo could not be opened')); image.onload = () => { const scale = Math.min(1, 1600 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .82)); }; image.src = reader.result; }; reader.readAsDataURL(file); }); }
function markQuoteAmended() { if (loadedQuoteIndex === null || isAmended) return; isAmended = true; $('quote-status').textContent = 'AMENDED'; $('amendment-panel').hidden = false; updatePrintDetails(); }
function resetForm() { loadedQuoteIndex = null; isAmended = false; $('quote-status').textContent = 'NEW'; $('amendment-panel').hidden = true;['customer-name', 'customer-phone', 'customer-address', 'service-description', 'amendment-reason'].forEach(id => { $(id).value = ''; }); sitePhotos = []; $('site-photo').value = ''; updateSitePhotoPreview(); labourItems = defaultLabourItems(); $('vat-enabled').checked = true; materials = []; services = []; $('quote-number').textContent = nextQuoteNumber(); updateSummary(); renderLabourItems(); renderMaterials(); renderServices(); }
function saveQuote() {
    const name = $('customer-name').value.trim();
    if (!name) { $('customer-name').focus(); showToast('Add the customer name first'); return; }
    const totals = calculate();
    const quote = { id: $('quote-number').textContent, date: new Date().toISOString(), customer: { name, phone: $('customer-phone').value.trim(), address: $('customer-address').value.trim(), serviceDescription: $('service-description').value.trim(), sitePhotos }, labour: { items: labourItems.map(item => ({ ...item })) }, materials: [...materials], services: [...services], totals, amended: isAmended, amendmentReason: $('amendment-reason').value.trim() };
    if (loadedQuoteIndex === null) quotes.unshift(quote); else quotes[loadedQuoteIndex] = quote;
    localStorage.setItem('pipewise-quotes', JSON.stringify(quotes)); pushQuote(quote); $('quote-count').textContent = quotes.length; showToast(isAmended ? `Amended quote ${quote.id} saved` : `Quote ${quote.id} saved`); resetForm(); renderSavedQuotes();
}
function renderSavedQuotes() {
    $('quote-count').textContent = quotes.length;
    $('saved-quotes').innerHTML = quotes.length ? quotes.map((quote, index) => `<article class="saved-quote"><div><strong>${escapeHtml(quote.customer.name)}</strong><small>${escapeHtml(quote.id)} · ${new Date(quote.date).toLocaleDateString('en-ZA')}</small></div><div><small>Service address</small><span>${escapeHtml(quote.customer.address || 'Not provided')}</span></div><div class="saved-quote-total">${currency(quote.totals.total)}<small>${quote.materials.length} material${quote.materials.length === 1 ? '' : 's'}</small></div><div class="quote-actions"><button data-load="${index}">Open</button><button data-pdf="${index}" title="View quote as PDF" aria-label="View ${escapeHtml(quote.id)} as PDF">PDF</button><button data-delete="${index}" aria-label="Delete quote">×</button></div></article>`).join('') : '<div class="material-empty">Saved quotes will appear here.</div>';
    document.querySelectorAll('[data-load]').forEach(button => button.addEventListener('click', () => loadQuote(Number(button.dataset.load))));
    document.querySelectorAll('[data-pdf]').forEach(button => button.addEventListener('click', () => viewSavedQuotePdf(Number(button.dataset.pdf))));
    document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => { const removing = quotes[Number(button.dataset.delete)]; const removedId = removing && removing.id; quotes.splice(Number(button.dataset.delete), 1); localStorage.setItem('pipewise-quotes', JSON.stringify(quotes)); if (removedId) { clearOutboxEntry(removedId); if (cloudAvailable && currentUser) cloudRequest('delete', { method: 'POST', body: { id: removedId } }).catch(() => { }); } renderSavedQuotes(); showToast('Quote deleted'); }));
}
function loadQuote(index) { const quote = quotes[index]; loadedQuoteIndex = index; isAmended = Boolean(quote.amended); $('quote-status').textContent = isAmended ? 'AMENDED' : 'SAVED'; $('amendment-panel').hidden = !isAmended; $('customer-name').value = quote.customer.name; $('customer-phone').value = quote.customer.phone; $('customer-address').value = quote.customer.address; $('service-description').value = quote.customer.serviceDescription || ''; $('amendment-reason').value = quote.amendmentReason || ''; sitePhotos = (quote.customer.sitePhotos || (quote.customer.sitePhoto ? [quote.customer.sitePhoto] : [])).map(photo => typeof photo === 'string' ? { data: photo, description: '' } : photo); updateSitePhotoPreview(); labourItems = quote.labour.items ? quote.labour.items.map(item => ({ ...item })) : [{ description: 'Call-out fee', unit: 'Each', quantity: 1, rate: quote.labour.callout ?? 650, type: 'callout' }, { description: 'Inspection & evaluation', unit: 'Day', quantity: quote.labour.hours ?? 0, rate: quote.labour.plumberHourlyRate ?? quote.labour.hourlyRate ?? 500, type: 'labour' }, { description: 'Additional labour', unit: 'Day', quantity: quote.labour.extraWorkers ?? 0, rate: quote.labour.extraWorkerHourlyRate ?? 500, type: 'labour' }]; materials = quote.materials; services = quote.services || []; $('quote-number').textContent = quote.id; updateSummary(); renderLabourItems(); renderMaterials(); renderServices(); switchView('new-quote'); }
// ============================ CLOUD SYNC ============================
/*
   Quotes, company settings and the price list live in a shared
   Supabase database so that every device sees the same data.

   THE SHAPE OF THIS, AND WHY
   The app is OFFLINE-FIRST. localStorage is the working copy; the
   cloud is a sync target. That is deliberate — a plumber quoting on
   site with no signal must not be locked out of the tool. So:

     - Saving a quote always writes to localStorage first and returns
       immediately. The browser never waits on the network to let you
       save your own work.
     - If the cloud is reachable it is updated straight after.
     - If it is not, the quote is added to an outbox and pushed when
       a sync next succeeds.
     - The outbox only ever holds quotes this device created. We never
       try to replay someone else's edits, which is how sync bugs turn
       into lost work.

   Conflict rule: newest write wins, by the server's clock. The
   server stamps updated_at (see supabase/schema.sql), so a device
   with a wrong clock cannot claim its copy is the fresh one.
*/
const CLOUD_FUNCTION_URL = (typeof window !== 'undefined' && window.APS_CLOUD_FUNCTION_URL) || '';
const CLOUD_ANON_KEY = (typeof window !== 'undefined' && window.APS_SUPABASE_ANON_KEY) || '';
const OUTBOX_KEY = 'pipewise-outbox';

let cloudAvailable = false;   /* server reachable AND we are signed in */
let cloudBusy = false;
let currentUser = null;
let outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');

function cloudConfigured() { return Boolean(CLOUD_FUNCTION_URL && CLOUD_ANON_KEY); }

function updateCloudStatus(message) { const el = $('cloud-status'); if (el) el.textContent = message; }

/*
   Which controls to show. Before sign-in we offer "Sign in"; after it,
   sync and sign-out. Nothing is shown at all when the cloud has not
   been configured, so a half-finished setup never presents dead
   buttons to staff.
*/
function updateCloudButtons() {
    const show = cloudConfigured();
    const signedIn = Boolean(currentUser);
    const toggle = (id, visible) => { const el = $(id); if (el) el.hidden = !visible; };

    toggle('cloud-signin-button', show && !signedIn);
    toggle('cloud-sync-button', show && signedIn);
    toggle('cloud-save-button', show && signedIn);
    toggle('cloud-signout-button', show && signedIn);
}

/*
   Every call goes through here, so the server being missing,
   unreachable, or not yet configured is handled in exactly one place.
*/
async function cloudRequest(action, options = {}) {
    if (!cloudConfigured()) throw new Error('not-configured');

    const url = CLOUD_FUNCTION_URL + (CLOUD_FUNCTION_URL.includes('?') ? '&' : '?') + 'action=' + encodeURIComponent(action);

    const headers = { 'Content-Type': 'application/json', apikey: CLOUD_ANON_KEY };
    if (currentUser && currentUser.accessToken) headers.Authorization = 'Bearer ' + currentUser.accessToken;

    let response;
    try {
        response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
    } catch {
        /* Poor signal on site is normal, not exceptional. */
        throw new Error('offline');
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!response.ok) {
        const error = new Error((data && data.error) || ('Cloud request failed (' + response.status + ')'));
        error.status = response.status;
        error.code = data && data.code;
        throw error;
    }
    return data;
}

/*
   Sign in. The password is exchanged directly with Supabase's auth
   endpoint; it is never stored and never sent to our own function.
   Only the short-lived access token is kept.
*/
async function cloudSignIn(email, password) {
    const base = CLOUD_FUNCTION_URL.replace(/\/functions\/v1\/.*$/, '');
    const response = await fetch(base + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CLOUD_ANON_KEY },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error((data && (data.error_description || data.msg || data.error)) || 'Sign-in failed');
    }

    currentUser = {
        email: (data.user && data.user.email) || email,
        id: data.user && data.user.id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60000
    };
    saveSession();
}

function saveSession() {
    try {
        if (currentUser) localStorage.setItem('pipewise-session', JSON.stringify(currentUser));
        else localStorage.removeItem('pipewise-session');
    } catch { /* private mode: staying signed in is a convenience, not a requirement. */ }
}

function restoreSession() {
    try {
        const raw = localStorage.getItem('pipewise-session');
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved && saved.accessToken && saved.expiresAt > Date.now()) currentUser = saved;
    } catch { currentUser = null; }
}

/*
   A token that quietly expires mid-job would look like the cloud
   "not working". Refresh it before it lapses.
*/
async function refreshSessionIfNeeded() {
    if (!currentUser || !currentUser.refreshToken) return;
    if (currentUser.expiresAt > Date.now()) return;

    const base = CLOUD_FUNCTION_URL.replace(/\/functions\/v1\/.*$/, '');
    try {
        const response = await fetch(base + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: CLOUD_ANON_KEY },
            body: JSON.stringify({ refresh_token: currentUser.refreshToken })
        });
        if (!response.ok) throw new Error('refresh failed');
        const data = await response.json();
        currentUser.accessToken = data.access_token;
        currentUser.refreshToken = data.refresh_token || currentUser.refreshToken;
        currentUser.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60000;
        saveSession();
    } catch {
        /* Expired beyond saving: drop back to signed-out rather than
           looping on failures. */
        currentUser = null;
        saveSession();
    }
}

/*
   Work out whether the cloud is usable, and say so plainly in the
   status line. Staff should never have to guess why a button is
   missing.
*/
async function initCloud() {
    if (!cloudConfigured()) {
        cloudAvailable = false;
        updateCloudButtons();
        updateCloudStatus('');
        return;
    }

    restoreSession();
    await refreshSessionIfNeeded();
    updateCloudButtons();

    try {
        const data = await cloudRequest('status');
        cloudAvailable = Boolean(data && data.configured);
        if (!currentUser) {
            updateCloudStatus('Cloud is ready — sign in to share quotes between devices.');
        } else {
            updateCloudStatus('Signed in as ' + currentUser.email);
        }
    } catch (error) {
        cloudAvailable = false;
        updateCloudStatus(error.message === 'offline'
            ? 'Cloud unreachable — quotes are safe on this device.'
            : 'Cloud is not set up yet — quotes are saved on this device only.');
    }

    updateCloudButtons();
}

/* ---------------------------------------------------------
   The outbox
   --------------------------------------------------------- */
function addToOutbox(quote) {
    outbox = outbox.filter(item => item.id !== quote.id);
    outbox.push(quote);
    /*
       A cap, so a device that has been offline for months does not
       fill its storage quota and start failing to save real work.
       Oldest goes first; the local copy is still the full record.
    */
    if (outbox.length > 200) outbox = outbox.slice(outbox.length - 200);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
}

function clearOutboxEntry(id) {
    outbox = outbox.filter(item => item.id !== id);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
}

async function flushOutbox() {
    if (!outbox.length) return 0;
    let sent = 0;
    /* Copy first: we mutate the outbox as items succeed. */
    for (const quote of [...outbox]) {
        try {
            await cloudRequest('save', { method: 'POST', body: quote });
            clearOutboxEntry(quote.id);
            sent++;
        } catch {
            break;  /* still offline — keep the rest queued */
        }
    }
    return sent;
}

/* ---------------------------------------------------------
   Push
   --------------------------------------------------------- */

/*
   Push one quote. Called after a save or delete, but never awaited
   by the caller, so the UI stays instant.
*/
async function pushQuote(quote, silent = true) {
    if (!quote || !quote.id) return;

    if (!cloudAvailable || !currentUser) {
        /*
           Not an error — this is the expected state on site. Queue it
           so it goes up as soon as we are next able.
        */
        addToOutbox(quote);
        if (!silent && cloudConfigured() && currentUser) updateCloudStatus('Saved on this device — will sync when back online.');
        return;
    }

    try {
        await cloudRequest('save', { method: 'POST', body: quote });
        clearOutboxEntry(quote.id);
        if (!silent) showToast('Quote synced to cloud');
        updateCloudStatus('Synced · ' + new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
    } catch {
        addToOutbox(quote);
        if (!silent) showToast('Saved on this device — will sync later');
    }
}

/* Kept for the call sites that pushed the whole list at once. */
async function pushAllQuotes(silent = false) {
    if (!cloudAvailable || !currentUser) { quotes.forEach(addToOutbox); return; }
    let sent = 0;
    for (const quote of quotes) {
        if (!quote || !quote.id) continue;
        try {
            await cloudRequest('save', { method: 'POST', body: quote });
            clearOutboxEntry(quote.id);
            sent++;
        } catch {
            addToOutbox(quote);
        }
    }
    if (!silent) showToast(sent ? sent + ' quote' + (sent === 1 ? '' : 's') + ' synced' : 'Nothing synced — check your connection');
}

/* ---------------------------------------------------------
   Pull
   --------------------------------------------------------- */

/*
   Pull the shared quotes and merge them into what is on this
   device. Merging by id means a quote taken on another phone shows
   up here without wiping anything saved locally.
*/
async function pullQuotes() {
    if (!currentUser) { updateCloudStatus('Sign in first.'); return; }
    if (cloudBusy) return;
    cloudBusy = true;

    try {
        await refreshSessionIfNeeded();
        const queued = await flushOutbox();

        const data = await cloudRequest('list');
        const incoming = (data && data.quotes) || [];
        const pendingIds = new Set(outbox.map(item => item.id));

        const byId = new Map(quotes.filter(q => q && q.id).map(q => [q.id, q]));
        let added = 0;
        let updated = 0;

        for (const row of incoming) {
            const quote = row && row.body;
            if (!quote || !quote.id) continue;

            /*
               A quote still in the outbox is newer than the server
               copy by definition — it has not been sent yet. Do not
               let the server's older version overwrite it.
            */
            if (pendingIds.has(quote.id)) continue;

            const existing = byId.get(quote.id);
            if (!existing) {
                added++;
                byId.set(quote.id, { ...quote, updatedAt: row.updated_at });
            } else {
                const mine = Date.parse(existing.updatedAt || existing.date || 0) || 0;
                const theirs = Date.parse(row.updated_at || quote.updatedAt || quote.date || 0) || 0;
                if (theirs > mine) { updated++; byId.set(quote.id, { ...quote, updatedAt: row.updated_at }); }
            }
        }

        quotes = [...byId.values()];
        localStorage.setItem('pipewise-quotes', JSON.stringify(quotes));
        $('quote-count').textContent = quotes.length;
        renderSavedQuotes();

        const parts = [];
        if (added) parts.push(added + ' new');
        if (updated) parts.push(updated + ' updated');
        if (queued) parts.push(queued + ' sent');

        showToast(parts.length ? 'Cloud: ' + parts.join(', ') : 'Already up to date');
        updateCloudStatus('Synced · ' + quotes.length + ' quote' + (quotes.length === 1 ? '' : 's'));
    } catch (error) {
        if (error.message === 'offline') showToast('No connection — quotes are safe on this device');
        else if (error.status === 401) { currentUser = null; saveSession(); updateCloudButtons(); updateCloudStatus('Session expired — please sign in again.'); }
        else showToast(error.message || 'Could not reach the cloud');
    } finally {
        cloudBusy = false;
    }
}

/*
   Company settings and the price list are shared, not per-user, so
   that two staff cannot quote the same job at different rates.
*/
async function pushSettingsAndPrices(silent = true) {
    if (!cloudAvailable || !currentUser) return;
    try {
        await cloudRequest('settings', { method: 'POST', body: settings });
        await cloudRequest('price-list', {
            method: 'POST',
            body: { serviceCatalogue, serviceRates, serviceUnits }
        });
        if (!silent) showToast('Settings and price list shared');
    } catch {
        if (!silent) showToast('Could not share settings — they are saved on this device');
    }
}

/*
   Adopt shared settings and prices. Called once at startup when the
   cloud is reachable, so a new phone immediately quotes from the
   company's real price list rather than its built-in defaults.
*/
async function pullSettingsAndPrices() {
    if (!currentUser) return;
    try {
        const [sharedSettings, sharedPrices] = await Promise.all([
            cloudRequest('settings'),
            cloudRequest('price-list')
        ]);

        const incomingSettings = sharedSettings && sharedSettings.body;
        if (incomingSettings && Object.keys(incomingSettings).length) {
            settings = { ...settings, ...incomingSettings };
            localStorage.setItem('pipewise-settings', JSON.stringify(settings));
            loadSettings();
        }

        const prices = sharedPrices && sharedPrices.body;
        if (prices && prices.serviceRates && Object.keys(prices.serviceRates).length) {
            Object.assign(serviceRates, prices.serviceRates);
            Object.assign(serviceUnits, prices.serviceUnits || {});

            Object.entries(prices.serviceCatalogue || {}).forEach(([category, tasks]) => {
                if (!Array.isArray(tasks)) return;
                if (!serviceCatalogue[category]) serviceCatalogue[category] = [];
                tasks.forEach(task => {
                    if (typeof task === 'string' && !serviceCatalogue[category].includes(task)) serviceCatalogue[category].push(task);
                });
            });

            localStorage.setItem('pipewise-service-rates', JSON.stringify(serviceRates));
            localStorage.setItem('pipewise-service-units', JSON.stringify(serviceUnits));
            persistServiceCatalogue();
            serviceCategories.splice(0, serviceCategories.length, ...Object.keys(serviceCatalogue));
            renderServices();
        }

        calculate();
    } catch {
        /* Local data is authoritative when the cloud cannot be reached. */
    }
}

/*
   First sign-in on a new device: offer this device's existing quotes
   to the cloud. Without this, a phone that has been quoting for
   months would sign in and appear to have lost everything.
*/
async function offerLocalQuotesToCloud() {
    const unsynced = quotes.filter(q => q && q.id && !outbox.some(item => item.id === q.id));
    if (!unsynced.length) return 0;
    unsynced.forEach(addToOutbox);
    return await flushOutbox();
}

/* ---------------------------------------------------------
   Sign-in dialog
   --------------------------------------------------------- */
function openSignInDialog() {
    const dialog = $('cloud-dialog');
    if (!dialog) return;
    const status = $('cloud-dialog-status');
    if (status) status.textContent = '';
    dialog.showModal();
    const email = $('cloud-email');
    if (email) email.focus();
}

async function submitSignIn(event) {
    event.preventDefault();
    const email = $('cloud-email').value.trim();
    const password = $('cloud-password').value;
    const status = $('cloud-dialog-status');
    const button = $('cloud-submit');

    if (!email || !password) { if (status) status.textContent = 'Enter your email and password.'; return; }

    button.disabled = true;
    if (status) status.textContent = 'Signing in...';

    try {
        await cloudSignIn(email, password);
        cloudAvailable = true;

        /*
           Close the dialog as soon as the credentials are accepted.
           Holding it open through the first sync would leave staff
           staring at a modal on a slow connection — the sync below is
           deliberately fire-and-forget for exactly that reason.
        */
        $('cloud-dialog').close();
        $('cloud-password').value = '';
        updateCloudButtons();
        updateCloudStatus('Signed in as ' + currentUser.email + ' — syncing...');

        /*
           A device that has been quoting offline for months must not
           look empty after signing in. Offer its quotes up first,
           then pull the shared set and merge.
        */
        const offered = await offerLocalQuotesToCloud();
        await pullSettingsAndPrices();
        await pullQuotes();

        if (offered) showToast('Signed in — ' + offered + ' local quote' + (offered === 1 ? '' : 's') + ' shared to the cloud');
        else showToast('Signed in as ' + currentUser.email);
    } catch (error) {
        if (status) status.textContent = error.message === 'offline'
            ? 'No connection. You can keep working — quotes are saved on this device.'
            : error.message;
    } finally {
        button.disabled = false;
    }
}

function signOut() {
    currentUser = null;
    saveSession();
    cloudAvailable = false;
    updateCloudButtons();
    updateCloudStatus('Signed out — quotes are saved on this device only.');
    showToast('Signed out');
}
// ========================= END CLOUD SYNC =========================

function exportQuotes() {
    if (!quotes.length) { showToast('No saved quotes to export'); return; }
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), quotes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pipewise-quotes-${new Date().toISOString().slice(0, 10)}.json`;
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
            localStorage.setItem('pipewise-quotes', JSON.stringify(quotes));
            renderSavedQuotes();
            showToast(`${added.length} quote${added.length === 1 ? '' : 's'} imported`);
        } catch { showToast('That file is not a valid quotes file'); }
    };
    reader.readAsText(file);
}

function viewSavedQuotePdf(index) { loadQuote(index); requestAnimationFrame(() => window.print()); }

// ============================ PROJECT PLANNING ============================
/*
   A project is a flat list of planned tasks. Each task knows where it
   came from (a quote item, a service, or typed in by hand) so the plan
   can be traced back to what was quoted. Deadlines are plain ISO dates
   entered by hand - no calendar maths, so a plan written on site
   against a paper programme still matches what the app shows.
*/

function persistProjects() {
    projects.forEach(project => { project.updatedAt = new Date().toISOString(); });
    localStorage.setItem('pipewise-projects', JSON.stringify(projects));
}

function nextProjectNumber() { return `PR-${new Date().getFullYear()}-${String(projects.length + 1).padStart(3, '0')}`; }

function emptyPlanningTask(source = 'Manual') {
    return { source, task: '', quantity: 1, duration: 0, days: 0, daysOverridden: false, quoteId: '', start: '', startPinned: false, finish: '', owner: '', stage: 'Not started' };
}

/* ============================ TASK DURATIONS ============================
   "How long will it take" needs a time per task, and nothing in the app held
   one - serviceRates is money. So times live in their own table, editable on
   the Price list page exactly like the rates, keyed by task name.

   Values are MINUTES for one unit of the task. They are starting estimates to
   be corrected against real jobs, not authoritative figures.
*/
const DEFAULT_TASK_MINUTES = {
    /* call-out, inspection, diagnostics */
    'Call-out and inspection': 60, 'Emergency call-out': 60,
    'Site inspection': 30, 'Inspection': 20, 'Inspection & evaluation': 45,
    'Toilet inspection': 15, 'Inspect toilet': 15, 'Inspect geyser': 15,
    'Inspect sewer line': 30, 'Inspect installation point': 20, 'Leak inspection': 30,
    'Leak detection': 60, 'Pressure test': 30,
    'Pressure test after repair': 20, 'Flow test': 20, 'Test drainage': 20,
    'Water testing': 30, 'Test operation': 20, 'Test geyser': 20, 'Test system': 20,
    'Test toilet': 10, 'Test flushing': 10, 'Test water flow': 15, 'Test water pressure': 15,

    /* locating and marking */
    'Locate leak': 30, 'Locate blockage': 30, 'Locate damaged section': 45,
    'Locate existing pipe': 30, 'Locate pipe': 30, 'Locate drain access': 20,
    'Locate collapse': 45, 'Mark leak location': 10, 'Mark pipe route': 15,
    'Mark excavation area': 15, 'Mark affected area': 10, 'Mark pipe positions': 20,
    'Mark problem location': 15, 'Mark pipe location': 15, 'Measure location': 15,
    'Trace water pipe route': 45, 'Determine pipe route': 30,

    /* isolation and making safe */
    'Isolate water': 10, 'Isolate electricity': 10, 'Isolate electrical supply': 15,
    'Shut off main water': 10, 'Shut-off isolation': 15, 'Temporary water isolation': 20,
    'Restore water supply': 10, 'Restore electricity': 15, 'Protect surrounding area': 10,
    'Protect work area': 15, 'Close inspection point': 10, 'Open inspection point': 10,
    'Open manhole': 15, 'Open drain or manhole': 15, 'Open inspection point ': 10,

    /* pipework */
    'Repair leaking pipes': 60, 'Repair leaking pipe': 60, 'Repair burst pipe': 90,
    'Repair pipe': 45, 'Repair plumbing': 60, 'Repair water pipe': 45,
    'Repair pipework': 60, 'Repair waste pipe': 45, 'Install pipe': 45,
    'Install new pipe': 60, 'Install new water pipes': 90, 'Install new section': 45,
    'Install new pipe section': 45, 'Remove damaged pipe': 30,
    'Remove existing pipe': 30, 'Replace damaged pipes': 60, 'Replace pipe': 45,
    'Replace fittings': 20, 'Replace valve': 30, 'Replace leaking pipe': 60,
    'Supply new pipe': 15, 'Supply replacement pipe': 15, 'Supply pipe': 15,
    'Install fittings': 20, 'Install isolation valve': 25, 'Install shut-off valve': 25,
    'Install drain valve': 25, 'Install non-return valve': 25, 'Install sleeves and pipe protection': 20,
    'Disconnect water': 10, 'Disconnect waste pipe': 10, 'Disconnect waste': 10,
    'Disconnect water supply': 10, 'Disconnect plumbing': 15, 'Connect water': 15,
    'Connect water supply': 15, 'Connect waste': 15, 'Connect waste pipe': 15,
    'Connect hot water': 20, 'Connect cold water': 20, 'Connect to existing pipe': 25,
    'Connect to municipal supply': 45, 'Connect to water supply': 20,
    'Flush pipe': 20, 'Flush system': 25, 'Flush toilet': 5, 'Check for leaks': 15,
    'Check pipe gradient': 20, 'Install pipe bedding': 20, 'Pipe bedding': 20,

    /* drainage, sewer, jetting */
    'Unblock drain or sewer line': 90, 'Remove blockage': 45, 'Manual clearing': 30,
    'Use drain rods': 45, 'Use drain machine': 60, 'High-pressure jetting': 90,
    'Drain snake': 45, 'Mechanical drain cleaning': 60, 'Chemical treatment': 30,
    'Root removal': 60, 'Grease removal': 45, 'Scale removal': 45,
    'CCTV inspection': 60, 'Camera inspection': 60, 'Record inspection': 15,
    'Provide inspection report': 30, 'Identify blockage': 20, 'Identify cracked pipe': 20,
    'Dispose of removed material': 20, 'Dispose of old pipe': 20, 'Dispose of old toilet': 15,

    /* excavation and breaking */
    'Dig trench for water or sewer pipe': 240, 'Excavate trench': 240, 'Excavation': 240,
    'Trenching': 240, 'Excavate soil': 180, 'Excavate to access underground pipe': 240,
    'Hand excavation around services': 120, 'Backfill trench': 120, 'Backfill excavation': 120,
    'Backfill': 120, 'Compact or stamp ground': 60, 'Compact soil': 60, 'Compact trench': 60,
    'Compact': 60, 'Level ground': 60, 'Sift soil': 90, 'Sift soil and remove rubble': 90,
    'Remove excess soil': 60, 'Remove soil and rubble': 90, 'Remove soil and debris': 90,
    'Remove rubble': 45, 'Remove building rubble': 60, 'Load rubble': 30,
    'Break concrete': 120, 'Break concrete or floor': 120, 'Break and remove concrete': 180,
    'Cut concrete': 90, 'Remove concrete rubble': 90, 'Cut trench through paving or concrete': 180,
    'Remove paving': 60, 'Carefully remove paving': 90, 'Store paving for reuse': 20,
    'Reinstate paving or concrete': 120, 'Reinstall paving': 90, 'Level paving': 45,
    'Repair concrete': 90, 'Fill and cement hole': 60, 'Prepare concrete area': 45,
    'Pour new concrete': 90, 'Finish concrete': 45,

    /* sanitaryware */
    'Remove old toilet': 30, 'Remove existing toilet': 30, 'Disconnect old toilet': 15,
    'Supply toilet': 5, 'Install new toilet': 60, 'Install toilet': 60, 'Seal toilet': 15,
    'Level toilet': 15, 'Remove old basin': 30, 'Remove existing basin': 30,
    'Install basin': 60, 'Install taps': 30, 'Install basin mixer or taps': 30,
    'Replace basin': 90, 'Remove old bath': 45, 'Remove existing bath': 45,
    'Install bath': 90, 'Seal bath': 20, 'Level bath': 20, 'Install bath taps': 30,
    'Remove old shower tray': 45, 'Remove shower enclosure': 30,
    'Install shower tray': 90, 'Install shower enclosure': 90, 'Install mixer': 45,
    'Install shower mixer': 45, 'Install shower head': 20, 'Install shower arm': 20,
    'Seal shower': 20, 'Silicone seal': 15, 'Seal basin': 15, 'Seal installation': 15,
    'Grouting': 45, 'Replace tiles': 180, 'Remove tiles': 90, 'Tile replacement': 120,
    'Tile removal': 90, 'Waterproofing': 120, 'Plaster wall': 90, 'Plaster repair': 90,
    'Paint touch-up': 30, 'Close wall': 60, 'Close opening': 60,

    /* geysers */
    'Drain geyser': 30, 'Refill geyser': 30, 'Fill geyser': 30, 'Install geyser': 120,
    'Remove existing geyser': 60, 'Supply new geyser': 15, 'Supply new element': 5,
    'Remove old element': 20, 'Install new element': 20, 'Replace element': 30,
    'Replace gasket': 15, 'Replace pressure relief valve': 30,
    'Replace temperature pressure valve': 30, 'Supply pump': 10, 'Install pump': 90,
    'Install inlet pipe': 45, 'Install outlet pipe': 45, 'Install valves': 45,
    'Prime pump': 20, 'Commission system': 30,

    /* clean-up */
    'Clean area': 20, 'Clean work area': 20, 'Clean site': 25, 'Clean water damage': 45,
    'Clean manhole': 20, 'Remove waste': 20, 'Move soil': 30, 'Load or unload materials': 30,
    'Reinstall cupboard or panel': 45, 'Make good damaged area': 45,
    'Seal wall opening': 20, 'Reinstate surface': 45, 'Surface reinstatement': 45,

    /* materials handling */
    'Collect materials': 30, 'Materials procurement': 30, 'Deliver materials to site': 30,
    'Collect hire equipment': 30,

        /* equipment */
        'Jackhammer hire': 120, 'Ground compactor hire': 60, 'Excavator hire': 240, 'Core drill hire': 60, 'Core drill through wall': 45,
        'Chase wall for new pipe': 90, 'Chase wall': 90, 'Drill through wall': 30,

        /* ---- wording used by the master scenario library ---- */
        'Call-out': 60, 'Investigation': 60, 'Plumbing survey': 90, 'Scheduled inspection': 30,
        'Initial inspection': 30, 'Sanitaryware inspection': 20, 'Drainage inspection': 30,
        'Drain inspection': 30, 'Geyser inspection': 20, 'Valve inspection': 20, 'Tap inspection': 15,
        'Pump inspection': 30, 'Backflow inspection': 30, 'Stormwater drainage': 60,
        'Cold-water inspection': 30, 'Hot-water inspection': 30, 'Grease trap inspection': 30,
        'Inspect existing plumbing': 45, 'Inspect supply pipe': 30, 'Inspect inlet and outlet': 20,
        'Inspect valves': 20, 'Inspect filters': 20, 'Inspect manhole': 20, 'Inspect stormwater system': 45,
        'Inspect connection': 20, 'Inspect pressure reducing valve': 20, 'Geyser installation': 120,
        'Pump installation': 90, 'Pump supply': 10, 'Pump selection': 20, 'Pump': 20, 'Pump out waste': 45,
        'Tank installation': 120, 'Tank supply': 15, 'Tank base preparation': 120,
        'Thermal imaging inspection': 45, 'Moisture meter inspection': 30, 'Water meter monitoring': 30,
        'Acoustic leak detection': 45, 'CCTV camera inspection': 60, 'Final camera inspection': 45,
        'CCTV confirmation': 30, 'Video recording': 15, 'Provide video footage': 15,
        'Measure approximate location': 15,

        /* locating */
        'Locate underground leak': 60, 'Locate concealed pipe leak': 45, 'Locate damaged pipe': 45,
        'Locate main water supply': 30, 'Locate root intrusion': 45, 'Locate services': 30,
        'Locate valve': 20, 'Locate water supply': 30, 'Locate access point': 20,
        'Identify existing services': 30, 'Identify leaking component': 20, 'Identify source': 20,
        'Identify collapsed pipe': 20, 'Identify displaced joint': 20, 'Identify root ingress': 20,

        /* isolation / making safe */
        'Isolate area': 10, 'Isolate supply': 10, 'Isolate water supply': 10,
        'Make safe': 15, 'Protect area': 10, 'Mark work area': 10, 'Mark excavation': 15,
        'Site setup': 45, 'Site establishment': 60, 'Leak containment': 20, 'Stop leak': 30,

        /* pipe and fitting work */
        'Add new connection': 45, 'Add new pipe': 60, 'Add new valve': 30, 'Alter waste pipe': 45,
        'Alter water pipe': 45, 'Connect pipe': 25, 'Connect taps': 30, 'Connect overflow': 15,
        'Connect electrical supply': 30, 'Electrical connection': 30, 'Connect machine': 20,
        'Connect existing drainage': 30, 'Connect existing services': 30, 'Connect existing system': 30,
        'Connect to existing sewer': 30, 'Cut damaged pipe': 20, 'Cut into existing pipe': 30,
        'Cut out damaged section': 30, 'Expose pipe': 30, 'Expose damaged pipe': 30,
        'Install sewer pipe': 60, 'Install valve': 30, 'Install floor drain': 60,
        'Install overflow': 20, 'Install trap': 30, 'Install waste': 20, 'Install waste connection': 20,
        'Install waste fitting': 25, 'Install waste pipe': 45, 'Install water supply': 45,
        'Install hose': 15, 'Install shower': 90, 'Install shower rail': 30, 'Install shower waste': 30,
        'Install handheld shower': 20, 'Install new meter': 45, 'Install pressure gauge': 20,
        'Install pressure reducing valve': 30, 'Install pressure controller': 30,
        'Install backflow prevention': 60, 'Install expansion control': 30,
        'Install unit connection': 30, 'Install washing machine point': 45,
        'Install washing machine valve': 25, 'Install water hammer arrestor': 30,
        'Non-return valve': 25, 'Isolation valve': 25, 'Isolation valves': 40, 'Valves': 40,
        'Pipe fittings': 20, 'Pipe installation': 60, 'Pipe repair': 60, 'Pipework': 45,
        'Plumbing repair': 60, 'Plumbing layout': 60, 'Inlet pipe': 45, 'Outlet pipe': 45,
        'Discharge pipe': 30, 'Vent pipes': 45, 'Overflow': 20, 'Flexible hose': 20,
        'Float switch': 20, 'Float valve': 25, 'Fittings': 20, 'Trap': 20, 'Valve': 25,
        'Replace O-rings': 15, 'Replace washer': 15, 'Replace board': 30, 'Replace cartridge': 30,
        'Replace spindle': 30, 'Replace frame': 30, 'Replace flush valve': 30, 'Replace flush button': 20,
        'Replace cistern washer': 20, 'Replace inlet valve': 30, 'Replace toilet connector': 25,
        'Replace toilet seal': 25, 'Replace pan connector': 25, 'Replace isolation valve': 30,
        'Replace non-return valve': 30, 'Replace safety valve': 30, 'Replace expansion valve': 30,
        'Replace pressure reducing valve': 30, 'Replace faulty valve': 30, 'Replace damaged fittings': 25,
        'Replace pipe fitting': 30, 'Replace section of pipe': 45, 'Replace geyser': 120,
        'Replace waste': 25, 'Replace waste fitting': 25, 'Replace waste pipe': 45,
        'Replace trap': 30, 'Replace paving': 90, 'Replace grate': 20, 'Replace manhole cover': 25,
        'Replace insulation': 20, 'Replace flexible hose': 20, 'Replace sprinkler': 30,
        'Replace irrigation pipe': 45, 'Replace damaged grate': 25, 'Replace damaged section': 60,
        'Replace damaged plumbing': 45, 'Replace toilet': 90, 'Supply fittings': 15, 'Supply valve': 10,
        'Supply tap': 10, 'Supply tee': 10, 'Supply waste': 10, 'Supply basin': 10, 'Supply bath': 15,
        'Supply basin mixer or taps': 10, 'Supply bottle trap': 10, 'Supply cistern fittings': 10,
        'Supply couplings': 10, 'Supply bends': 10, 'Supply junctions': 10, 'Supply sewer pipe': 15,
        'Supply stormwater pipe': 15, 'Supply hot-water pipe': 15, 'Supply new bath': 15,
        'Supply new main pipe': 15, 'Supply new meter': 10, 'Supply new shower': 15,
        'Supply new toilet': 10, 'Supply toilet seat': 10, 'Supply flexible connectors': 10,
        'Supply flexible hose': 10, 'Supply isolation valve': 10, 'Supply isolation valves': 15,
        'Supply geyser valves': 10, 'Supply pressure control equipment': 15,
        'Supply drip tray': 15, 'Supply expansion vessel': 10, 'Supply discharge pipe': 10,
        'Supply replacement valve': 10, 'Pressure control': 20, 'Pressure controller': 20,
        'Seal joints': 15, 'Seal threaded connection': 10, 'Secure pipework': 20,
        'Reconnect fixtures': 30, 'Reconnect pipes': 30, 'Reconnect waste': 15, 'Reconnect water': 15,
        'Adjust pressure': 15, 'Check pressure': 15, 'Retest pressure': 20, 'Water pressure test': 30,
        'Water pressure testing': 30, 'Leak test': 20, 'Testing': 30, 'Test': 20, 'Test flow': 20,
        'Test flush': 10, 'Test inlet': 15, 'Test pump': 20, 'Test tap': 15, 'Test zones': 20,
        'Test discharge': 20, 'Test sewer flow': 20, 'Flow testing': 20, 'Drain test': 20,
        'Check leaks': 15, 'Check valves': 20, 'Check filters': 15, 'Check fittings': 15,
        'Check geyser': 15, 'Check isolation valves': 20, 'Check municipal supply': 20,
        'Check non-return valve': 20, 'Check pipe supports': 20, 'Check pressure reducing valve': 20,
        'Check temperature': 15, 'Check blocked pipes': 30, 'Check expansion control': 20,

        /* drainage / sewer / jetting */
        'Clear blockage': 45, 'Clear restriction': 45, 'Remove roots': 60, 'Remove grease': 45,
        'Root cutting': 60, 'Mechanical root cutting': 60, 'Mechanical cleaning': 60,
        'High-pressure cleaning': 90, 'High-pressure drain jetting': 90, 'High-pressure wash': 45,
        'Jetting': 90, 'Jet drain': 90, 'Drain jetting': 90, 'Drain cleaning': 60,
        'Drainage': 45, 'Snake drain': 45, 'Plunger': 15, 'Drain section': 45, 'Drain system': 45,
        'Clear drain': 45, 'Clean drain': 45, 'Open drain': 20, 'Open grease trap': 20,
        'Trap cleaning': 30, 'Grease trap cleaning': 45, 'Waste pipe cleaning': 45,
        'Manhole cleaning': 30, 'Clean catch pit': 30, 'Remove grate': 15, 'Remove leaves and debris': 20,
        'Remove hair and debris': 20, 'Remove adhesive': 30, 'Flush drainage line': 25,
        'Flush drainage system': 30, 'Flush sewer': 25, 'Emergency drain clearing': 90,
        'Emergency pipe repair': 90, 'Drain affected system': 30, 'Sewer inspection': 30,
        'Sewer connections': 45, 'Underground drainage': 90, 'Underground water supply': 90,
        'Attempt manual blockage removal': 30, 'Remove old pipework': 45, 'Remove existing sewer pipe': 45,
        'Remove collapsed pipe': 30, 'Remove existing main': 45, 'Remove old valves': 30,
        'Remove old tap': 20, 'Remove existing tap': 20, 'Remove tap': 20, 'Remove valve': 25,
        'Remove trap': 25, 'Remove debris': 30, 'Remove concrete': 90, 'Remove access tiles': 60,
        'Remove and reinstall toilet': 90, 'Remove existing sanitaryware': 90, 'Remove old pipe': 30,
        'Remove cabinet or access panel': 30, 'Remove shower mixer': 30, 'Remove existing shower fittings': 45,
        'Remove waste cover': 15, 'Remove soil': 90, 'Excess soil removal': 60, 'Soil removal': 90,
        'Spoil handling': 45, 'Excavate': 180, 'Machine excavation': 240, 'Hand excavation': 120,
        'Break open wall floor or ceiling': 90, 'Open ceiling': 60, 'Close ceiling': 60,
        'Open or chase wall': 90, 'Open chase': 60, 'Close chase': 60, 'Concrete breaking': 120,
        'Concrete cutting': 90, 'Concrete reinstatement': 120, 'Concrete supply': 30,
        'Reinforcement': 30, 'Curing': 60, 'Reinstatement': 90, 'Reinstate': 90,
        'Reinstate paving or soil': 90, 'Compaction': 45, 'Sand bedding': 20, 'Joint sand': 20,
        'Number and store pavers': 20, 'Cut replacement pavers': 30, 'Replacement tiles': 120,
        'Tile': 90, 'Tile adhesive': 20, 'Tile reinstatement': 120, 'Plaster': 90, 'Skim': 60,
        'Paint': 30, 'Repair tiles': 120, 'Repair walls': 90, 'Repair benching': 45,
        'Repair sprinkler': 45, 'Repair stormwater pipe': 60, 'Repair waste connection': 30,
        'Raise or lower manhole': 60, 'Insulation': 30, 'Waterproofing repair': 90,
        'Waterproofing interface': 60,

        /* cleanup and admin */
        'Cleaning': 30, 'Cleaning report': 15, 'Dispose of waste': 20,
        'Basin testing': 15, 'Bath testing': 15, 'Kitchen testing': 15, 'Shower testing': 15,
        'Toilet testing': 15, 'Basins': 15, 'Baths': 15, 'Toilets': 15, 'Showers': 15,
        'Kitchen sink': 60, 'Floor drains': 60, 'Dishwasher points': 45, 'Dishwasher trap connection': 20,
        'Washing machine points': 45, 'Floor drain': 45,
        'Strip-out': 120, 'Report': 15, 'Basic report': 15,
        'Maintenance report': 15, 'Recommendations': 15, 'Repair recommendations': 15,
        'Final commissioning report': 30, 'Preventative maintenance report': 20,
        'Preventative repairs': 60, 'Before and after photos': 15, 'Final inspection': 20,
        'Final connections': 30, 'Final repair quotation': 30, 'Permanent repair quotation': 30,
        'After-hours surcharge': 0, 'Call-out fee': 60, 'Commission': 30, 'Commissioning': 30,
        'Finishing': 30, 'New cold-water pipework': 120,
            'New hot-water pipework': 120, 'New waste pipework': 90, 'Cold-water pipework': 90,
            'Hot-water pipework': 90, 'Waste pipework': 90,

            /* remaining tail */
            'Cabinet reinstatement': 45, 'Clean filter': 20, 'Clean system': 45, 'Clean trap': 30,
            'Clean water': 20, 'Install tap': 30, 'Leak detection if required': 60,
            'Manhole inspection': 20, 'Prepare installation area': 30, 'Record meter reading': 10,
            'Remove damaged plumbing': 45, 'Remove hose': 15, 'Remove taps': 20,
            'Repair water supply': 45, 'Restore supply': 10, 'Silicone': 15, 'Silicone sealing': 15,
            'Temporary pipe repair': 30, 'Temporary repair': 30, 'Waste connection': 25,
            'Water connection': 25
        };
const taskMinutes = JSON.parse(localStorage.getItem('pipewise-task-minutes') || '{}');
const storedTaskMinutes = { ...DEFAULT_TASK_MINUTES, ...taskMinutes };

/* Case/whitespace-insensitive lookup, so 'Install Toilet' still finds a time. */
const taskMinuteIndex = {};
Object.entries(storedTaskMinutes).forEach(([name, minutes]) => { taskMinuteIndex[name.trim().toLowerCase()] = Number(minutes) || 0; });

function minutesForTask(task) {
    if (!task) return 0;
    const key = String(task).trim().toLowerCase();
    if (key in taskMinuteIndex) return taskMinuteIndex[key];
    /* Fall back on a keyword, so an unlisted task is not silently free. */
    const guesses = [
        [/excavat|trench|dig /, 180],
        [/jackhammer|break.*concrete|cut concrete/, 120],
        [/cctv|camera/, 60],
        [/jetting|jet /, 90],
        [/unblock|rod|snake|blockage/, 60],
        [/geyser/, 60],
        [/install/, 45],
        [/remove|strip|disconnect|dismantle/, 30],
        [/replace/, 45],
        [/connect|coupl/, 20],
        [/test|check|inspect|flush/, 20],
        [/seal|silicone|level/, 15],
        [/clean|rubble|debris|waste/, 20],
        [/supply|collect|deliver/, 20]
    ];
    const match = guesses.find(([pattern]) => pattern.test(key));
    return match ? match[1] : 30;
}

/*
   Minutes <-> days <-> hours. A day is 7 working hours, so this is the one
   place the conversion happens and everything else asks these helpers.
*/
function minutesToHours(minutes) { return Math.round((Math.max(0, Number(minutes) || 0) / 60) * 100) / 100; }
function hoursToMinutes(hours) { return Math.round((Math.max(0, Number(hours) || 0)) * 60); }

/*
   Working days as a decimal: 840 minutes is 2, 210 minutes is 0.5.
   Round to 2dp so half-days and quarter-days read cleanly.
*/
function minutesToWorkingDays(minutes) {
    const value = Math.max(0, Number(minutes) || 0) / WORKING_MINUTES_PER_DAY;
    return Math.round(value * 100) / 100;
}

function workingDaysToMinutes(days) {
    return Math.round((Math.max(0, Number(days) || 0) * WORKING_MINUTES_PER_DAY));
}

/*
   "1 d 4 h" / "3 h 30 m" - the label under the day box, so a typed 1.5
   reads back as "1 d 3 h 30 m" and there is no doubt what it means.
*/
function describeDays(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    if (!total) return '-';
    const days = Math.floor(total / WORKING_MINUTES_PER_DAY);
    const rest = total % WORKING_MINUTES_PER_DAY;
    const hours = Math.floor(rest / 60);
    const mins = rest % 60;
    const parts = [];
    if (days) parts.push(`${days} d`);
    if (hours) parts.push(`${hours} h`);
    /* Show the leftover minutes too, or a 7h30m task would read as "1 d". */
    if (mins) parts.push(`${mins} m`);
    return parts.join(' ');
}

function taskDuration(item) {
    /*
       Priority: a duration typed on the row, then a day count the user typed
       for this task, then the time table for the task name.

       daysOverridden matters. The day box is populated for display, so
       accepting any non-zero `days` would switch the source of truth to a
       2dp-rounded figure and shift the task's time by up to 2 minutes. The
       flag means only a day count the user actually entered takes over.
    */
    const explicit = Number(item && item.duration);
    if (explicit > 0) return explicit;
    if (item && item.daysOverridden) {
        const days = Number(item.days);
        if (days > 0) return workingDaysToMinutes(days);
    }
    return minutesForTask(item && item.task) * Math.max(1, Number(item && item.quantity) || 1);
}

/*
   The day count a task implies. Calculated, not stored - so a task is always
   described by its duration, and the days figure can never drift out of step
   with the minutes it represents.
*/
function taskDays(item) { return minutesToWorkingDays(taskDuration(item)); }

/* ---- date maths ----
   A working day is 8 hours. Weekends are skipped, so a long job does not
   appear to finish on a Sunday. Dates are handled as local time to avoid
   the off-by-one that UTC parsing causes in South Africa (UTC+2).
*/
/* A plumbing day on site is 7 hours, not 8. One working day is therefore
   420 minutes, and every duration, finish date and day count derives from
   this single number. */
const WORKING_HOURS_PER_DAY = 7;
const WORKING_MINUTES_PER_DAY = WORKING_HOURS_PER_DAY * 60;

function parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return isNaN(date.getTime()) ? null : date;
}

function formatLocalDate(date) {
    if (!date) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isWeekend(date) { const day = date.getDay(); return day === 0 || day === 6; }

/*
   Working minutes between two dates, weekends excluded. The count is
   inclusive of both days: Mon to Mon is one working day, Mon to Tue is two.
   This is the reverse of addWorkingMinutes, so a start and finish that the
   user types produce the duration rather than the other way round.
*/
function workingMinutesBetween(startValue, endValue) {
    const start = parseLocalDate(startValue);
    const end = parseLocalDate(endValue);
    if (!start || !end) return 0;
    /* If the dates are the wrong way round, read them the sensible way. */
    const from = start <= end ? start : end;
    const to = start <= end ? end : start;
    let workingDays = 0;
    const cursor = new Date(from.getTime());
    const guard = 1000;
    let steps = 0;
    while (cursor <= to && steps < guard) {
        if (!isWeekend(cursor)) workingDays++;
        cursor.setDate(cursor.getDate() + 1);
        steps++;
    }
    return workingDays * WORKING_MINUTES_PER_DAY;
}

/*
   Add working minutes to a start date and return the finish date.
   A task that runs past a working day rolls into the next working day; the
   remainder is carried, so 10 hours of work starting Monday ends Tuesday.
*/
function addWorkingMinutes(startValue, minutes) {
    const start = parseLocalDate(startValue);
    if (!start) return '';
    /*
       Work is planned in whole working days, so a task finishes on the last
       day it occupies and never part-way through one. The day count comes from
       workingDaysFor() rather than being worked out again here, so the finish
       date and the "days" figure in the row can never disagree.

       This used to roll over only when the work EXCEED a day, so 1 day +
       1 minute finished a day later than exactly 1 day - one stray minute
       costing a whole extra day on site.
    */
    const days = workingDaysFor(minutes);
    const date = new Date(start.getTime());
    for (let i = 1; i < days; i++) {
        date.setDate(date.getDate() + 1);
        while (isWeekend(date)) date.setDate(date.getDate() + 1);
    }
    return formatLocalDate(date);
}

/* Working days a duration spans, so 240 min reads as "1 day", 480 as "2 days". */
function workingDaysFor(minutes) {
    const total = Math.max(0, Number(minutes) || 0);
    if (!total) return 0;
    return Math.max(1, Math.ceil(total / WORKING_MINUTES_PER_DAY));
}

/* "2 d 3 h", "5 h 30 m", "45 m" - short form for dense table cells. */
function formatDuration(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    if (!total) return '-';
    const days = Math.floor(total / WORKING_MINUTES_PER_DAY);
    const hours = Math.floor((total % WORKING_MINUTES_PER_DAY) / 60);
    const mins = total % 60;
    const parts = [];
    if (days) parts.push(`${days} d`);
    if (hours) parts.push(`${hours} h`);
    if (mins && !days) parts.push(`${mins} m`);
    return parts.join(' ') || '-';
}

function newProject() {
    const project = {
        id: nextProjectNumber(),
        name: '',
        customer: '',
        address: '',
        start: '',
        end: '',
        status: 'planning',
        lead: '',
        createdAt: new Date().toISOString(),
        items: []
    };
    /* Keep the edits on the project being left behind before switching. */
    if (loadedProjectIndex !== null && projects[loadedProjectIndex]) {
        Object.assign(projects[loadedProjectIndex], collectProjectForm());
    }
    projects.unshift(project);
    loadedProjectIndex = 0;
    persistProjects();
    if (planningView !== 'single') setPlanningView('single'); else renderProjects();
    $('project-name').focus();
    showToast('New project started. Give it a name, then add tasks.');
}

function deleteProject() {
    if (loadedProjectIndex === null || !projects[loadedProjectIndex]) { showToast('Open a project first, then delete it'); return; }
    const removing = projects[loadedProjectIndex];
    const label = removing.name ? `${removing.id} - ${removing.name}` : removing.id;
    /* Deleting a plan cannot be undone, so confirm before it goes. */
    if (!window.confirm(`Delete project ${label}? This cannot be undone.`)) return;
    projects.splice(loadedProjectIndex, 1);
    loadedProjectIndex = projects.length ? 0 : null;
    persistProjects();
    renderProjects();
    showToast(`Project ${label} deleted`);
}

/* Reads the project header fields currently on screen. */
function collectProjectForm() {
    return {
        name: $('project-name').value.trim(),
        /* Only report a customer the user actually typed, so a blank field
           never overwrites a name that was auto-filled from a quote. */
        customer: $('project-customer').value.trim() || undefined,
        address: $('project-address').value.trim(),
        start: $('project-start').value,
        end: $('project-end').value,
        status: $('project-status').value,
        lead: $('project-lead').value.trim()
    };
}

function saveProject() {
    if (loadedProjectIndex === null || !projects[loadedProjectIndex]) {
        if (!projects.length) newProject();
        if (loadedProjectIndex === null) return;
    }
    if (!$('project-name').value.trim()) { $('project-name').focus(); showToast('Give the project a name first'); return; }
    collectPlanningList();
    /* Header fields and task rows both live on screen - write both back
       before persisting, or the name you just typed is discarded. */
    Object.assign(projects[loadedProjectIndex], collectProjectForm());
    persistProjects();
    renderProjects();
    showToast(`Project ${projects[loadedProjectIndex].id} saved`);
}

/*
   The form fields and the task rows are the source of truth only while
   the plan is open. Everything is written back into the project object
   before it is persisted or re-rendered, so a page reload cannot lose
   half an edit.
*/
function collectPlanningList() {
    const project = projects[loadedProjectIndex];
    if (!project) return;
    project.items = [...document.querySelectorAll('#planning-list .planning-row')].map(row => ({
        source: row.dataset.source || 'Manual',
        task: row.querySelector('.planning-task').value.trim(),
        quantity: Math.max(1, Number(row.querySelector('.planning-quantity').value) || 1),
        /* Time is stored in minutes - the single source of truth. The day
           box is a view of it, so nothing here can drift from the minutes. */
        duration: row.dataset.overridden === 'true'
            ? workingDaysToMinutes(row.querySelector('.planning-days').value)
            : (Number(row.dataset.minutes) || 0),
        days: Number(row.querySelector('.planning-days').value) || 0,
        daysOverridden: row.dataset.overridden === 'true',
        quoteId: row.querySelector('.planning-quote').value.trim(),
        start: row.querySelector('.planning-start').value,
        /* Whether the user set the start or auto-schedule calculated it - see
           autoScheduleItems. Kept on the row so it survives a re-render. */
        startPinned: row.dataset.startPinned === 'true',
        finish: row.querySelector('.planning-finish').value,
        owner: row.querySelector('.planning-owner').value.trim(),
        stage: row.querySelector('.planning-stage').value
    }));
    /*
       A completely empty row is dropped, but only if EVERY field is blank -
       including time. Keeping rows that hold just a date or a time matters
       because a half-filled plan must survive a re-render.
    */
    project.items = project.items.filter(item => item.task || item.owner || item.start || item.finish || item.duration);
}

/*
   The order work actually happens on site. Quote items arrive in whatever
   order they were quoted, which is rarely the order they are done - a plan
   that lists "clean up" before "dig trench" is no use to anybody.

   Lower sorts earlier. Anything unmatched lands in the middle, since
   plumbing work sits between access and restoration.
*/
/*
   Order matters: the FIRST matching pattern wins, so a specific rule has to be
   tested before a broad one that would otherwise swallow it. "Backfill trench"
   and "Remove rubble" both contain "trench"/"remove", so with the excavation
   rule first they ranked 40 - before the pipe was even laid - and the plan put
   the clean-up ahead of the work. The late-stage rules therefore sit above the
   broad excavation rule, not after it.
*/
const WORK_SEQUENCE = [
    [/call-out|callout|inspection|inspect|site visit|assessment/i, 10],
    [/leak detection|locate|diagnos|trace|cctv|camera|survey/i, 20],
    [/isolate|shut off|shut-off|drain (the )?geyser|make safe|disconnect/i, 30],
    /* Restoration and clean-up are later stages, but read as demolition -
       tested early so the broad patterns below cannot claim them. */
    [/backfill|compact|reinstate|reinstatement|plaster|tile|paving|concrete|make good|seal|silicone/i, 100],
    [/clean|clear away|remove rubble|debris|dispose|cart away|site tidy/i, 110],
    [/strip|remove|demolish|break|cut out|excavat|dig|trench|chase|core drill/i, 40],
    [/supply|collect|order|deliver|procure/i, 45],
    [/lay pipe|install pipe|new pipework|install drain|sewer pipe|pipework/i, 50],
    [/install|fit|connect|mount|assembly|erect/i, 60],
    [/repair|replace|fix|refit|reconnect/i, 70],
    [/wire|electric|prime|commission|charging|pressure test/i, 80],
    [/test|check|flush|verify|balance|calibrat/i, 90],
    [/report|certificate|handover|sign off|photograph|invoice/i, 120]
];

function workOrder(task, fallbackIndex) {
    const name = String(task || '');
    for (const [pattern, rank] of WORK_SEQUENCE) {
        if (pattern.test(name)) return rank;
    }
    return 65 + fallbackIndex / 1000;
}

/*
   Put a whole task list into the order the work is actually done, keeping the
   current position as the tie-break so tasks that rank the same keep the order
   they were added in. Mutates and returns the array.
*/
function sequenceItems(items) {
    return items
        .map((item, index) => ({ item, rank: workOrder(item.task, index), index }))
        .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
        .map(entry => entry.item);
}

/*
   Auto-schedule: fill each working day before starting the next one.

   A day holds WORKING_MINUTES_PER_DAY (7 hours) of work. Tasks run
   back-to-back into the SAME day until it is full, then the next task starts
   on the following working day. A task that needs more than a day occupies
   whole days, so it finishes on the last day it uses.

   This replaced a rule that gave every task a whole day to itself and rolled
   the cursor on unconditionally. Five short jobs - a call-out, an install, a
   clean-up - are five hours of work between them and belong on ONE day, but
   were being spread across five, which made a day's work look like a week's.

   The project's start date (or the first task's own date) is the anchor, so the
   user still only supplies the day they start on site.
*/
function autoScheduleItems(items, anchorStart) {
    /*
       One cursor: `day` is the day the next task starts on, and `left` is the
       room remaining on it. A task is placed on `day` if it fits in `left`;
       otherwise `day` moves to the next working day first.

       After placing a task, the cursor becomes that task's FINISH day, and
       `left` becomes what is still free there - which is what lets a short job
       follow a long one onto the same day, and what stops a second task being
       stacked onto a day an over-long job has already swallowed whole.
    */
    let day = anchorStart || '';
    let left = WORKING_MINUTES_PER_DAY;
    items.forEach(item => {
        const minutes = taskDuration(item);
        /*
           A start the user typed is a fixture the chain has to honour - the
           crew is on site that day whatever the maths says. A start this
           function wrote on a previous run is NOT a fixture: it is a result,
           and treating it as one would re-anchor every task back to its own
           last calculated date and quietly break the chain.
        */
        if (item.startPinned && item.start) {
            day = item.start;
            left = WORKING_MINUTES_PER_DAY;
        }
        if (!day || !minutes) return;
        /*
           Start the next working day when this task will not fit in what is
           left of the current one.

           `left < WORKING_MINUTES_PER_DAY` is what keeps an over-long job on
           the day it reached: a 12-hour task against a completely empty day
           starts there and runs over, rather than being pushed to tomorrow for
           being bigger than a day - which would leave today with nothing on it
           and start every long job a day late.
        */
        if (left <= 0 || (minutes > left && left < WORKING_MINUTES_PER_DAY)) {
            day = nextWorkingDay(day);
            left = WORKING_MINUTES_PER_DAY;
        }
        item.start = day;
        item.finish = addWorkingMinutes(day, minutes);
        /*
           Move the cursor to the finish day and work out what is left on it.
           Whole days consumed are 420 each, so a 900-minute job finishes with
           480 - 420 = 60 minutes of that day still free.
        */
        const whole = Math.floor(minutes / WORKING_MINUTES_PER_DAY);
        const over = minutes % WORKING_MINUTES_PER_DAY;
        if (whole) {
            day = item.finish;
            left = over ? WORKING_MINUTES_PER_DAY - over : 0;
        } else {
            left -= minutes;
        }
    });
    return items;
}

/* The next day that is not a weekend - a Saturday never becomes a start date. */
function nextWorkingDay(value) {
    const date = parseLocalDate(value);
    if (!date) return '';
    do { date.setDate(date.getDate() + 1); } while (isWeekend(date));
    return formatLocalDate(date);
}

/*
   One button does the whole plan: put the tasks in site order, then chain the
   dates from the project start. This is what makes the plan "automated" -
   the schedule is calculated, not typed.
*/
function autoPlanProject() {
    if (loadedProjectIndex === null || !projects[loadedProjectIndex]) { showToast('Open a project first'); return; }
    collectPlanningList();
    const project = projects[loadedProjectIndex];
    Object.assign(project, collectProjectForm());
    const anchor = project.start || $('project-start').value || new Date().toISOString().slice(0, 10);
    project.items = sequenceItems(project.items);
    autoScheduleItems(project.items, anchor);
    const span = projectSpan(project);
    project.start = anchor;
    project.end = span.last || '';
    persistProjects();
    renderProjects();
    showToast(`Plan sequenced and scheduled from ${anchor}`);
}

/* Quote items -> planned tasks, sorted into the order the work happens.
   Labour is listed per line item, materials and services are summarised
   into one procurement item each, which is how they are actually ordered
   and carried to site. */
function tasksFromQuote(quote) {
    const source = quote.id || 'Saved quote';
    const labour = quote.labour && quote.labour.items ? quote.labour.items : [];
    const labourTasks = labour.map(item => {
        const quantity = Number(item.quantity) || 1;
        /* Labour is quoted in days, so a day means a working day here. */
        const perUnit = /day/i.test(item.unit || '') ? WORKING_MINUTES_PER_DAY : minutesForTask(item.description);
        return {
            ...emptyPlanningTask('Quote labour'),
            task: item.description || 'Labour',
            quantity,
            duration: perUnit * Math.max(1, quantity),
            quoteId: source
        };
    });
    const materials = Array.isArray(quote.materials) ? quote.materials : [];
    const materialTasks = materials.length ? [{
        ...emptyPlanningTask('Quote materials'),
        task: `${materials.length} material item${materials.length === 1 ? '' : 's'} to order and deliver`,
        quantity: materials.length,
        duration: minutesForTask('Materials procurement'),
        quoteId: source
    }] : [];
    const services = Array.isArray(quote.services) ? quote.services : [];
    const serviceTasks = services.map(service => {
        const quantity = Number(service.quantity) || 1;
        return {
            ...emptyPlanningTask('Quote service'),
            task: service.task || 'Site work',
            quantity,
            duration: minutesForTask(service.task) * Math.max(1, quantity),
            quoteId: source
        };
    });
    /* Sort into site order, keeping the original position as the tie-break so
       tasks with the same rank stay in the order they were quoted. */
    return sequenceItems([...labourTasks, ...materialTasks, ...serviceTasks]);
}

function addQuoteItemsToProject() {
    if (loadedProjectIndex === null) { showToast('Create or open a project first'); return; }
    const select = $('planning-quote-select');
    const quote = quotes[Number(select.value)];
    if (!quote) { showToast('Choose a saved quote to pull items from'); return; }
    collectPlanningList();
    const tasks = tasksFromQuote(quote);
    if (!tasks.length) { showToast('That quote has no items to plan yet'); return; }
    /*
       Fold whatever is on screen into the project first: renderProjects()
       below rebuilds the header fields from the stored project, so without
       this step a name typed a second ago would be painted away by the
       re-render.
    */
    const project = projects[loadedProjectIndex];
    Object.assign(project, collectProjectForm());
    project.items.push(...tasks);
    /* Re-sequence the WHOLE list, not just the new items, so an added quote
       slots into the right place among tasks already on the plan. Then chain
       the dates so the schedule stays continuous. */
    project.items = sequenceItems(project.items);
    const anchor = project.start || new Date().toISOString().slice(0, 10);
    autoScheduleItems(project.items, anchor);
    const span = projectSpan(project);
    project.start = anchor;
    project.end = span.last || '';
    /* Fill the blanks from the quote - the project's own values win. */
    if (!project.customer && quote.customer && quote.customer.name) project.customer = quote.customer.name;
    if (!project.address && quote.customer && quote.customer.address) project.address = quote.customer.address;
    persistProjects();
    renderProjects();
    showToast(`${tasks.length} item${tasks.length === 1 ? '' : 's'} added from ${quote.id} and sequenced`);
}

function planningQuoteOptions(selectedQuoteId) {
    const options = quotes.map((quote, index) => `<option value="${index}" ${quote.id === selectedQuoteId ? 'selected' : ''}>${escapeHtml(quote.id)} - ${escapeHtml(quote.customer && quote.customer.name ? quote.customer.name : 'Unnamed customer')}</option>`);
    return `<option value="">Select a saved quote</option>${options.join('')}`;
}

function stageOptions(selected, source) {
    return `<select class="planning-stage" aria-label="Stage for ${escapeHtml(source)} task">${PROJECT_STAGES.map(stage => `<option ${stage === selected ? 'selected' : ''}>${stage}</option>`).join('')}</select>`;
}

let planningView = 'overview';
/* The timeline opens on every project; a specific index narrows it down. */
let timelineProjectIndex = 'all';

function setPlanningView(view) {
    planningView = ['single', 'timeline'].includes(view) ? view : 'overview';
    document.querySelectorAll('.planning-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.planningView === planningView));
    $('planning-overview').hidden = planningView !== 'overview';
    $('planning-single').hidden = planningView !== 'single';
    $('planning-timeline').hidden = planningView !== 'timeline';
    if (planningView === 'single' && loadedProjectIndex === null && projects.length) loadedProjectIndex = 0;
    if (planningView === 'timeline' && timelineProjectIndex !== 'all' && !projects[timelineProjectIndex]) timelineProjectIndex = 'all';
    renderProjects();
    if (planningView === 'timeline') renderTimeline();
}

/* ============================ TIMELINE ============================
   A Gantt-style view: one row per task, a bar per task placed by its
   start-to-finish span, on a day grid. Weekends are shaded so a bar that
   spans one is obviously straddling the break.

   The point of putting tasks side by side is to SEE OVERLAP. Tasks that
   run over the same dates and share an owner are flagged as a clash,
   because that usually means one crew has been double-booked.
*/

function dayCountBetween(startValue, endValue) {
    const a = parseLocalDate(startValue);
    const b = parseLocalDate(endValue);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
}

function addCalendarDays(value, days) {
    const date = parseLocalDate(value);
    if (!date) return '';
    date.setDate(date.getDate() + days);
    return formatLocalDate(date);
}

/*
   Every calendar day from the first start to the last finish, inclusive.
   Takes a {first, last} range (from projectSpan or timelineRange), not a
   project - the all-projects chart spans several projects at once.
*/
function timelineDays(range) {
    if (!range || !range.first || !range.last) return [];
    const days = [];
    let cursor = range.first;
    const guard = 400;
    for (let i = 0; i < guard && cursor && cursor <= range.last; i++) {
        days.push(cursor);
        cursor = addCalendarDays(cursor, 1);
    }
    return days;
}

/*
   A bar's day span, as an offset from the project's first day and a length
   in days. The offset must be measured against the timeline's own first day,
   not the task's own start, or every bar lands at zero and the whole chart
   collapses into a single column.
*/
function taskSpan(item, timelineStart) {
    const start = item.start;
    if (!start) return null;
    const finish = item.finish || autoFinish(item) || start;
    const offset = Math.max(0, dayCountBetween(timelineStart, start));
    const length = Math.max(1, dayCountBetween(start, finish) + 1);
    return { start, finish, offset, length };
}

/* Sentinel value for the "all projects" option in the timeline select. */
const TIMELINE_ALL = 'all';

/*
   Which projects the timeline is showing. TIMELINE_ALL draws every
   project's dated tasks on one chart; any other value is the index of a
   single project. Returns the list of {project, isAll} to draw.
*/
function timelineProjects() {
    if (timelineProjectIndex === TIMELINE_ALL) return projects.filter(project => projectSpan(project).first);
    const project = projects[timelineProjectIndex];
    return project ? [project] : [];
}

/* A single project's timeline range, or the widest range across several. */
function timelineRange(selected) {
    const spans = selected.map(project => projectSpan(project)).filter(span => span.first && span.last);
    if (!spans.length) return { first: '', last: '', calendarDays: 0 };
    const first = spans.map(span => span.first).sort()[0];
    const last = spans.map(span => span.last).sort().slice(-1)[0];
    const a = parseLocalDate(first);
    const b = parseLocalDate(last);
    const calendarDays = a && b ? Math.round((b - a) / 86400000) + 1 : 0;
    return { first, last, calendarDays };
}

function renderTimeline() {
    const select = $('timeline-project-select');
    /* The all-projects option always comes first, then one entry per project. */
    const options = [];
    if (projects.length) {
        options.push(`<option value="${TIMELINE_ALL}" ${timelineProjectIndex === TIMELINE_ALL ? 'selected' : ''}>All projects (${projects.length})</option>`);
        projects.forEach((p, index) => {
            options.push(`<option value="${index}" ${index === timelineProjectIndex ? 'selected' : ''}>${escapeHtml(p.id)} - ${escapeHtml(p.name || 'Untitled project')}</option>`);
        });
    }
    select.innerHTML = options.length ? options.join('') : '<option value="">No projects yet</option>';

    const grid = $('timeline-grid');
    const conflicts = $('timeline-conflicts');
    const selected = timelineProjects();
    const range = timelineRange(selected);
    const isAll = timelineProjectIndex === TIMELINE_ALL;

    /* Each row knows its project, so several projects can share one chart. */
    const dated = [];
    selected.forEach(project => {
        const items = Array.isArray(project.items) ? project.items : [];
        items.forEach(item => {
            const span = taskSpan(item, range.first);
            if (span) dated.push({ item, span, project });
        });
    });

    if (!projects.length || !dated.length) {
        grid.innerHTML = '';
        conflicts.innerHTML = '';
        $('timeline-empty').hidden = false;
        $('timeline-empty').textContent = !projects.length
            ? 'No projects yet. Create one to plan the work.'
            : (isAll
                ? 'Add start dates to the projects\' tasks to see them on the timeline.'
                : 'Add a start date to this project\'s tasks to see the timeline.');
        return;
    }
    $('timeline-empty').hidden = true;

    const days = timelineDays(range);
    /* Sort by start so the chart reads top-to-bottom in time order. */
    dated.sort((a, b) => (a.span.start < b.span.start ? -1 : a.span.start > b.span.start ? 1 : 0));

    /* Conflict pass: overlapping dates that share an owner. */
    const clashes = [];
    for (let i = 0; i < dated.length; i++) {
        for (let j = i + 1; j < dated.length; j++) {
            const a = dated[i], b = dated[j];
            if (!a.item.owner || !b.item.owner) continue;
            if (a.item.owner.toLowerCase() !== b.item.owner.toLowerCase()) continue;
            const aEnd = a.span.finish, bEnd = b.span.finish;
            if (a.span.start <= bEnd && b.span.start <= aEnd) {
                clashes.push({ owner: a.item.owner, a: a.item.task, b: b.item.task, from: a.span.start > b.span.start ? a.span.start : b.span.start, to: aEnd < bEnd ? aEnd : bEnd });
            }
        }
    }
    conflicts.innerHTML = clashes.length
        ? `<div class="timeline-conflict-title">${clashes.length} clash${clashes.length === 1 ? '' : 'es'} - the same person is on two tasks at once</div>` +
          clashes.map(c => `<div class="timeline-conflict"><strong>${escapeHtml(c.owner)}</strong> ${escapeHtml(c.a)} <span>overlaps</span> ${escapeHtml(c.b)} <small>(${escapeHtml(c.from)} to ${escapeHtml(c.to)})</small></div>`).join('')
        : (dated.some(entry => entry.item.owner) ? '<div class="timeline-ok">No clashing assignments.</div>' : '');

    const dayWidth = 34;
    /*
       Wide enough to read a task description, not just a clipped stub. The
       label column was 220px and every task name was ellipsised; 340px shows
       a typical plumbing description whole. The label sticks to the left so
       it stays readable while the chart scrolls sideways.
    */
    const labelWidth = 340;
    const totalWidth = labelWidth + days.length * dayWidth;

    /* Header: month labels and day numbers. */
    let header = '<div class="timeline-row timeline-header">';
    header += `<div class="timeline-label timeline-corner" style="width:${labelWidth}px">Task</div>`;
    header += `<div class="timeline-track" style="width:${days.length * dayWidth}px">`;
    days.forEach(day => {
        const date = parseLocalDate(day);
        const weekend = isWeekend(date);
        header += `<div class="timeline-day${weekend ? ' is-weekend' : ''}" style="width:${dayWidth}px"><span>${date.getDate()}</span><small>${date.toLocaleDateString('en-ZA', { month: 'short' })}</small></div>`;
    });
    header += '</div></div>';

    /* Rows: label + bar. */
    const rows = dated.map((entry, index) => {
        const item = entry.item;
        const span = entry.span;
        const stageKey = String(item.stage || 'Not started').toLowerCase().replace(/\s+/g, '');
        const minutes = taskDuration(item);
        let track = '<div class="timeline-track">';
        days.forEach(day => {
            const date = parseLocalDate(day);
            track += `<div class="timeline-cell${isWeekend(date) ? ' is-weekend' : ''}" style="width:${dayWidth}px"></div>`;
        });
        /* The bar is absolutely positioned inside the track. */
        track += `<div class="timeline-bar stage-${escapeHtml(stageKey)}" style="left:${span.offset * dayWidth + 2}px;width:${span.length * dayWidth - 4}px" title="${escapeHtml(item.task || 'Task')}: ${escapeHtml(span.start)} to ${escapeHtml(span.finish)} (${formatDuration(minutes)})"><span>${escapeHtml(item.task || 'Task')}</span></div>`;
        track += '</div>';
        /* On the all-projects chart each row names its project so tasks can
           be told apart; on a single project the row is already scoped. */
        const projectTag = isAll ? `<small class="timeline-label-project">${escapeHtml(entry.project.name || entry.project.id || 'Untitled project')}</small>` : '';
        return `<div class="timeline-row" data-index="${index}">
            <div class="timeline-label" style="width:${labelWidth}px">
                <strong title="${escapeHtml(item.task || 'Task')}">${escapeHtml(item.task || 'Task')}</strong>
                <small>${escapeHtml(span.start)} &rarr; ${escapeHtml(span.finish)} · ${formatDuration(minutes)}${item.owner ? ' · ' + escapeHtml(item.owner) : ''}</small>
                ${projectTag}
            </div>
            ${track}
        </div>`;
    }).join('');

    grid.innerHTML = `<div class="timeline-inner" style="min-width:${totalWidth}px">${header}${rows}</div>`;
}

function renderProjects() {
    const select = $('planning-project-select');
    select.innerHTML = projects.length
        ? projects.map((project, index) => `<option value="${index}">${escapeHtml(project.id)} - ${escapeHtml(project.name || 'Untitled project')}</option>`).join('')
        : '<option value="">No projects yet</option>';
    if (loadedProjectIndex !== null && projects[loadedProjectIndex]) select.value = String(loadedProjectIndex);
    $('planning-count').textContent = projects.length;
    $('planning-quote-select').innerHTML = planningQuoteOptions('');
    renderPlanningOverview();
    renderPlanningProject();
    if (planningView === 'timeline') renderTimeline();
}

function statusLabel(status) { return PROJECT_STATUS_LABELS[status] || 'Planning'; }

function renderPlanningOverview() {
    const list = $('planning-overview-list');
    const totals = $('planning-overview-totals');
    if (!projects.length) {
        list.innerHTML = '';
        totals.innerHTML = '';
        $('planning-overview-empty').hidden = false;
        return;
    }
    $('planning-overview-empty').hidden = true;

    list.innerHTML = projects.map((project, index) => {
        const items = Array.isArray(project.items) ? project.items : [];
        const minutes = projectTotalMinutes(project);
        const span = projectSpan(project);
        const done = items.filter(item => item.stage === 'Done').length;
        const percent = items.length ? Math.round((done / items.length) * 100) : 0;
        return `
        <div class="planning-overview-row${index === loadedProjectIndex ? ' is-open' : ''}" data-project-index="${index}">
            <span class="overview-project"><strong>${escapeHtml(project.name || 'Untitled project')}</strong><small>${escapeHtml(project.id)}</small></span>
            <span>${escapeHtml(project.customer || '-')}</span>
            <span><b class="overview-status status-${escapeHtml(project.status || 'planning')}">${escapeHtml(statusLabel(project.status))}</b></span>
            <span>${escapeHtml(project.start || span.first || '-')}</span>
            <span>${escapeHtml(project.end || span.last || '-')}</span>
            <span>${items.length}</span>
            <span>${formatDuration(minutes)}</span>
            <span>${minutesToWorkingDays(minutes) || 0}</span>
            <span>${done}/${items.length} (${percent}%)</span>
            <button class="overview-open" type="button" data-open-project="${index}">Open</button>
        </div>`;
    }).join('');

    /* Portfolio totals - what the whole book of work looks like. */
    const allMinutes = projects.reduce((sum, project) => sum + projectTotalMinutes(project), 0);
    const active = projects.filter(project => project.status !== 'complete').length;
    const taskCount = projects.reduce((sum, project) => sum + (Array.isArray(project.items) ? project.items.length : 0), 0);
    totals.innerHTML = `
        <div><span>Projects</span><strong>${projects.length}</strong></div>
        <div><span>Active</span><strong>${active}</strong></div>
        <div><span>Total tasks</span><strong>${taskCount}</strong></div>
        <div><span>Total work</span><strong>${formatDuration(allMinutes)}</strong></div>
        <div><span>Working days</span><strong>${minutesToWorkingDays(allMinutes) || 0}</strong></div>`;

    document.querySelectorAll('[data-open-project]').forEach(button => button.addEventListener('click', () => {
        switchPlanningProject(Number(button.dataset.openProject));
        setPlanningView('single');
    }));
}

function renderPlanningProject() {
    const project = loadedProjectIndex !== null ? projects[loadedProjectIndex] : null;
    if (!project) {
        $('project-name').value = '';
        $('project-customer').value = '';
        $('project-address').value = '';
        $('project-start').value = '';
        $('project-end').value = '';
        $('project-status').value = 'planning';
        $('project-lead').value = '';
        $('planning-list').innerHTML = '';
        $('planning-empty').hidden = false;
        $('planning-progress').innerHTML = '';
        return;
    }
    $('project-name').value = project.name || '';
    $('project-customer').value = project.customer || project.customerName || '';
    $('project-address').value = project.address || '';
    $('project-start').value = project.start || '';
    $('project-end').value = project.end || '';
    $('project-status').value = PROJECT_STATUS_LABELS[project.status] ? project.status : 'planning';
    $('project-lead').value = project.lead || '';
    renderPlanningList();
}

function renderPlanningList() {
    const project = loadedProjectIndex !== null ? projects[loadedProjectIndex] : null;
    const items = project && Array.isArray(project.items) ? project.items : [];
    $('planning-list').innerHTML = items.map((item, index) => {
        const minutes = taskDuration(item);
        const days = minutesToWorkingDays(minutes);
        const finish = autoFinish(item);
        const last = index === items.length - 1;
        return `
        <div class="planning-row" data-index="${index}" data-source="${escapeHtml(item.source || 'Manual')}" data-minutes="${minutes}" data-overridden="${item.daysOverridden ? 'true' : 'false'}" data-start-pinned="${item.startPinned ? 'true' : 'false'}">
            <span class="planning-order">
                <span class="planning-seq">${index + 1}</span>
                <button class="planning-move move-up" type="button" data-move="up" data-index="${index}" aria-label="Move task ${index + 1} up" title="Move up" ${index === 0 ? 'disabled' : ''}>&uarr;</button>
                <button class="planning-move move-down" type="button" data-move="down" data-index="${index}" aria-label="Move task ${index + 1} down" title="Move down" ${last ? 'disabled' : ''}>&darr;</button>
            </span>
            <span class="planning-source">${escapeHtml(item.source || 'Manual')}</span>
            <input class="planning-task" type="text" value="${escapeHtml(item.task || '')}" placeholder="What needs doing" aria-label="Task ${index + 1}">
            <input class="planning-quantity" type="number" min="1" step="1" value="${Math.max(1, Number(item.quantity) || 1)}" aria-label="Quantity for task ${index + 1}">
            <input class="planning-quote" type="text" value="${escapeHtml(item.quoteId || '')}" placeholder="Quote ref" aria-label="Quote reference for task ${index + 1}">
            <input class="planning-start" type="date" value="${escapeHtml(item.start || '')}" aria-label="Start date for task ${index + 1}">
            <input class="planning-days" type="number" min="0" step="0.5" value="${days || ''}" placeholder="auto" aria-label="Working days for task ${index + 1}" title="Working days at ${WORKING_HOURS_PER_DAY} hours a day. Leave blank to use the time for this task from the price list.">
            <span class="planning-duration-label" title="${minutes} minutes">${describeDays(minutes)}</span>
            <input class="planning-finish" type="date" value="${escapeHtml(item.finish || finish || '')}" aria-label="Finish date for task ${index + 1}" title="Calculated from the start date and duration">
            <input class="planning-owner" type="text" value="${escapeHtml(item.owner || '')}" placeholder="Who / crew" aria-label="Owner for task ${index + 1}">
            ${stageOptions(item.stage || 'Not started', item.task || 'task')}
            <button class="remove-material planning-remove" type="button" aria-label="Remove task ${index + 1}">×</button>
        </div>`;
    }).join('');
    $('planning-empty').hidden = items.length > 0;
    /* Reordering swaps two adjacent items, so the plan reads in the order the
       work will actually happen. */
    document.querySelectorAll('.planning-move').forEach(button => button.addEventListener('click', () => {
        const index = Number(button.dataset.index);
        const target = button.dataset.move === 'up' ? index - 1 : index + 1;
        const items2 = projects[loadedProjectIndex].items;
        if (target < 0 || target >= items2.length) return;
        collectPlanningList();
        const list = projects[loadedProjectIndex].items;
        [list[index], list[target]] = [list[target], list[index]];
        persistProjects();
        renderPlanningList();
    }));
    document.querySelectorAll('.planning-remove').forEach(button => button.addEventListener('click', () => {
        collectPlanningList();
        projects[loadedProjectIndex].items.splice(Number(button.closest('.planning-row').dataset.index), 1);
        persistProjects();
        renderPlanningList();
        renderPlanningProgress();
    }));
    /*
       Editing a field updates the stored row and the derived cells IN PLACE.
       A full re-render here would rebuild every row from stored state and
       throw away edits made to other rows in the same pass.
    */
    document.querySelectorAll('#planning-list input, #planning-list select').forEach(input => input.addEventListener('change', event => {
        const row = event.target.closest('.planning-row');
        if (!row || loadedProjectIndex === null) return;
        const index = Number(row.dataset.index);
        const item = projects[loadedProjectIndex].items[index];
        if (!item) return;
        const className = event.target.className;

        collectPlanningList();

        const daysField = row.querySelector('.planning-days');
        const startField = row.querySelector('.planning-start');
        const finishField = row.querySelector('.planning-finish');

        /*
           Dates and time work BOTH ways, and the pair the user gave last is
           the one that wins:

             start + days    -> finish is calculated forwards
             start + finish  -> days is calculated backwards from the dates
           Typing in the day box is an explicit override; clearing it hands
           control back to the time table.
        */
        const typedFinish = className === 'planning-finish' && finishField.value;
        if (typedFinish) {
            /* Dates given, so the span between them is the time. */
            item.start = startField.value;
            item.finish = finishField.value;
            item.duration = workingMinutesBetween(startField.value, finishField.value);
            item.daysOverridden = true;
            row.dataset.overridden = 'true';
        } else if (className === 'planning-start') {
            /* A start date on its own just moves the task. If a finish date is
               already there, the two dates still govern the duration. */
            item.start = startField.value;
            /* Typing a start pins it, so auto-plan chains around it instead of
               moving the task back. Clearing it unpins. */
            item.startPinned = Boolean(startField.value);
            row.dataset.startPinned = item.startPinned ? 'true' : 'false';
            if (finishField.value) {
                item.duration = workingMinutesBetween(startField.value, finishField.value);
            } else if (startField.value && taskDuration(item)) {
                item.finish = addWorkingMinutes(startField.value, taskDuration(item));
            }
            item.daysOverridden = true;
            row.dataset.overridden = 'true';
        } else if (className === 'planning-days') {
            item.daysOverridden = Number(daysField.value) > 0;
            row.dataset.overridden = item.daysOverridden ? 'true' : 'false';
        } else if (['planning-task', 'planning-quantity'].includes(className)) {
            /* A task or quantity change re-derives from the table, dropping
               any earlier override so the two figures cannot disagree. */
            item.duration = minutesForTask(item.task) * Math.max(1, Number(item.quantity) || 1);
            item.daysOverridden = false;
            row.dataset.overridden = 'false';
        }

        /* Repaint the derived cells: the day box, the plain label and the
           finish date are all views of the task's minutes. */
        const minutes = taskDuration(item);
        row.dataset.minutes = minutes;
        daysField.value = minutesToWorkingDays(minutes) || '';
        row.querySelector('.planning-duration-label').textContent = describeDays(minutes);
        if (item.start && minutes) {
            const calculated = addWorkingMinutes(item.start, minutes);
            /* Only overwrite the finish when the user has not set one. */
            if (!finishField.value) finishField.value = calculated;
            item.finish = finishField.value;
        } else {
            item.finish = finishField.value;
        }

        persistProjects();
        renderPlanningProgress();
    }));
    renderPlanningProgress();
}

/* The finish a duration implies, used when the user has not set one. */
function autoFinish(item) {
    const minutes = taskDuration(item);
    if (!item || !item.start || !minutes) return '';
    /* A finish typed by the user beats one calculated from the duration. */
    return item.finish || addWorkingMinutes(item.start, minutes);
}

function renderPlanningProgress() {
    const project = loadedProjectIndex !== null ? projects[loadedProjectIndex] : null;
    const items = project && Array.isArray(project.items) ? project.items : [];
    const container = $('planning-progress');
    if (!items.length) { container.innerHTML = ''; return; }
    const done = items.filter(item => item.stage === 'Done').length;
    const blocked = items.filter(item => item.stage === 'Blocked').length;
    const scheduled = items.filter(item => item.start || item.finish).length;
    const percent = Math.round((done / items.length) * 100);
    const totalMinutes = projectTotalMinutes(project);
    const span = projectSpan(project);
    container.innerHTML = `
        <div class="planning-progress-top">
            <span><strong>${done}</strong> of <strong>${items.length}</strong> tasks done (${percent}%)</span>
            <span>${scheduled} scheduled${blocked ? ` · <b class="planning-warn">${blocked} blocked</b>` : ''}</span>
        </div>
        <div class="planning-bar"><span style="width: ${percent}%"></span></div>
        <div class="planning-totals">
            <div><span>Total work</span><strong>${formatDuration(totalMinutes)}</strong></div>
            <div><span>Working days</span><strong>${minutesToWorkingDays(totalMinutes) || 0}</strong></div>
            <div><span>At ${WORKING_HOURS_PER_DAY} h / day</span><strong>${totalMinutes ? describeDays(totalMinutes) : '-'}</strong></div>
            <div><span>Start</span><strong>${span.first || '-'}</strong></div>
            <div><span>Est. finish</span><strong>${span.last || '-'}</strong></div>
            <div><span>Calendar span</span><strong>${span.calendarDays ? span.calendarDays + ' days' : '-'}</strong></div>
        </div>`;
}

/* Total planned minutes for a project. */
function projectTotalMinutes(project) {
    const items = project && Array.isArray(project.items) ? project.items : [];
    return items.reduce((sum, item) => sum + taskDuration(item), 0);
}

/*
   When a project runs, from the earliest start to the latest finish.
   Worst case across tasks, since tasks may overlap rather than queue.
*/
function projectSpan(project) {
    const items = project && Array.isArray(project.items) ? project.items : [];
    const starts = items.map(item => item.start).filter(Boolean).sort();
    const finishes = items.map(item => item.finish || autoFinish(item)).filter(Boolean).sort();
    const first = starts[0] || '';
    const last = finishes[finishes.length - 1] || '';
    let calendarDays = 0;
    const a = parseLocalDate(first);
    const b = parseLocalDate(last);
    if (a && b) calendarDays = Math.round((b - a) / 86400000) + 1;
    return { first, last, calendarDays };
}

function switchPlanningProject(index) {
    if (loadedProjectIndex !== null && projects[loadedProjectIndex] && !$('planning-single').hidden) {
        collectPlanningList();
        Object.assign(projects[loadedProjectIndex], collectProjectForm());
    }
    loadedProjectIndex = Number.isInteger(index) && projects[index] ? index : null;
    persistProjects();
    renderProjects();
}

function switchView(view) { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); document.querySelectorAll('.view').forEach(item => item.classList.remove('active-view')); $(`${view}-view`).classList.add('active-view'); const titles = { 'new-quote': 'Quote', quotes: 'Saved quotes', 'price-list': 'Price list', settings: 'Company settings', scenarios: 'Scenarios', planning: 'Project planning' }; $('page-title').textContent = titles[view] || 'Quote'; if (view === 'price-list') renderPriceList(); if (view === 'planning') renderProjects(); }
function loadSettings() { $('company-name').value = settings.name || ''; $('company-phone').value = settings.phone || ''; $('company-email').value = settings.email || ''; $('prepared-by').value = settings.preparedBy || ''; $('tax-number').value = settings.taxNumber || ''; $('print-prepared-by').textContent = settings.preparedBy || 'Cheyenne'; $('print-contact').textContent = settings.phone || '076 705 8718'; $('print-email').textContent = settings.email || 'architecturalplumbingservices@gmail.com'; $('print-tax-number').textContent = settings.taxNumber || '105 976 616'; $('vat-rate').value = settings.vatRate ?? VAT_DEFAULT; $('quote-date').textContent = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }); }

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
document.querySelectorAll('.supplier-tab').forEach(tab => tab.addEventListener('click', () => { selectedSupplier = tab.dataset.supplier; document.querySelectorAll('.supplier-tab').forEach(item => item.classList.toggle('active', item === tab)); $('supplier-source').innerHTML = `Prices shown from ${supplierInfo[selectedSupplier].name} reference catalogue · <a href="${supplierInfo[selectedSupplier].url}" target="_blank" rel="noopener">Open supplier ↗</a>`; renderMaterials(); }));
document.querySelectorAll('input, textarea').forEach(input => input.addEventListener('input', () => { updateSummary(); calculate(); }));
document.querySelector('#new-quote-view').addEventListener('input', event => { if (event.target.id !== 'amendment-reason') markQuoteAmended(); });
document.querySelector('#new-quote-view').addEventListener('change', event => { if (event.target.id !== 'amendment-reason') markQuoteAmended(); });
$('site-photo').addEventListener('change', async event => { const files = [...event.target.files]; if (!files.length) return; if (files.some(file => !file.type.startsWith('image/'))) { showToast('Choose image files only'); event.target.value = ''; return; } try { sitePhotos.push(...(await Promise.all(files.map(compressSitePhoto))).map(data => ({ data, description: '' }))); updateSitePhotoPreview(); } catch { showToast('One or more photos could not be added'); } finally { event.target.value = ''; } });
syncMasterScenarioOptions();
syncCustomScenarioOptions();
$('add-material').addEventListener('click', () => { materials.push({ category: '', type: '', size: '', quantity: 1, description: '', cost: 0, markup: MATERIAL_MARKUP }); renderMaterials(); document.querySelector('.material-category:last-of-type')?.focus(); });
$('add-service').addEventListener('click', () => { services.push({ category: '', task: '', quantity: 1, rate: 350, scenario: 'Additional services' }); renderServices(); document.querySelector('.service-category:last-of-type')?.focus(); });
$('add-scenario').addEventListener('click', addScenario);
function clearQuote() { resetForm(); showToast('Quote cleared'); }
$('save-quote').addEventListener('click', saveQuote); $('clear-quote').addEventListener('click', clearQuote); $('clear-quote-top').addEventListener('click', clearQuote); $('print-button').addEventListener('click', () => window.print()); $('pdf-button').addEventListener('click', () => window.print()); $('export-quotes-button').addEventListener('click', exportQuotes);
$('import-quotes-button').addEventListener('click', () => $('import-quotes-file').click());
$('import-quotes-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) importQuotes(file); event.target.value = ''; });
/* ---- cloud controls ---- */
const cloudSignInButton = $('cloud-signin-button');
if (cloudSignInButton) cloudSignInButton.addEventListener('click', openSignInDialog);

const cloudSyncButton = $('cloud-sync-button');
if (cloudSyncButton) cloudSyncButton.addEventListener('click', () => pullQuotes());

const cloudSaveButton = $('cloud-save-button');
if (cloudSaveButton) cloudSaveButton.addEventListener('click', () => pushAllQuotes(false));

const cloudSignOutButton = $('cloud-signout-button');
if (cloudSignOutButton) cloudSignOutButton.addEventListener('click', signOut);

const cloudDialog = $('cloud-dialog');
if (cloudDialog) {
    $('cloud-form').addEventListener('submit', submitSignIn);
    $('cloud-cancel').addEventListener('click', () => { $('cloud-dialog').close(); $('cloud-dialog-status').textContent = ''; });
}

updateCloudButtons();
initCloud().then(() => {
    /*
       Only after the cloud has been consulted: if we are signed in,
       adopt the shared settings and price list so the first quote of
       the day uses the company's real rates.
    */
    if (currentUser) return pullSettingsAndPrices();
});
/* ---- project planning controls ---- */
document.querySelectorAll('.planning-tab').forEach(tab => tab.addEventListener('click', () => setPlanningView(tab.dataset.planningView)));
$('new-project').addEventListener('click', newProject);
$('delete-project').addEventListener('click', () => {
    /* The delete acts on the project open in the One project view, so make
       sure that view is showing and its latest edits are kept. */
    if (planningView !== 'single' && projects.length) setPlanningView('single');
    deleteProject();
});
$('save-project').addEventListener('click', saveProject);
$('add-quote-items').addEventListener('click', addQuoteItemsToProject);
$('auto-plan-project').addEventListener('click', autoPlanProject);
$('add-planning-task').addEventListener('click', () => {
    if (loadedProjectIndex === null) { showToast('Create or open a project first'); return; }
    collectPlanningList();
    /*
       Append without sequencing. The new row is blank, so it has no place in
       the work order yet - sorting it now would move it away from the cursor
       and the user would type into whatever task happened to land last. Type
       the task, then Auto-plan puts it where it belongs along with the rest.
    */
    projects[loadedProjectIndex].items.push(emptyPlanningTask());
    persistProjects();
    renderPlanningList();
    $$('#planning-list .planning-row .planning-task').pop()?.focus();
});
$('planning-project-select').addEventListener('change', event => switchPlanningProject(Number(event.target.value)));
$('timeline-project-select').addEventListener('change', event => {
    const value = event.target.value;
    timelineProjectIndex = value === TIMELINE_ALL ? TIMELINE_ALL : (Number(value) || 0);
    renderTimeline();
});
$('new-quote-button').addEventListener('click', () => { resetForm(); switchView('new-quote'); });
$('check-prices-button').addEventListener('click', runPriceCheck);
$('price-list-file-page').addEventListener('change', importPriceList);
$('price-list-search').addEventListener('input', renderPriceList);
$('save-price-list').addEventListener('click', savePriceList);
$('add-price').addEventListener('click', () => { const row = document.createElement('tr'); row.className = 'price-entry new-price-entry'; row.dataset.task = ''; row.innerHTML = `<td><select class="price-category" aria-label="New price category">${categoryOptions('')}</select></td><td>${unitSelect('Each', 'New price type or unit')}</td><td><input class="price-line-item" placeholder="New line item" aria-label="New price line item"></td><td><input class="price-rate" type="number" min="0" step="0.01" value="0" aria-label="New price rate"></td><td></td>`; $('price-list-body').prepend(row); row.querySelector('.price-line-item').focus(); });
$('save-settings').addEventListener('click', () => { settings = { name: $('company-name').value.trim(), phone: $('company-phone').value.trim(), email: $('company-email').value.trim(), preparedBy: $('prepared-by').value.trim(), taxNumber: $('tax-number').value.trim(), vatRate: getNumber('vat-rate') }; localStorage.setItem('pipewise-settings', JSON.stringify(settings)); loadSettings(); calculate(); showToast('Company settings saved'); pushSettingsAndPrices(true); });
loadSettings(); resetForm(); renderSavedQuotes(); renderPriceList(); updatePriceCheckStatus();
if (projects.length) loadedProjectIndex = 0;
setPlanningView('overview');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => { });
