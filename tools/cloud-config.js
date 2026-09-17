// Pure, dependency-free reader + checks for the AGA cloud configuration
// (supabase-config.js and the environment the Drive export needs).
//
// This module owns the *shape* of the cloud settings so the checks can be
// unit-tested without touching the network. tools/check-cloud.js does the
// live probing; everything here is offline and deterministic, which keeps
// `npm run test` safe to run on a plane.
//
// The Supabase URL and key are read out of supabase-config.js rather than
// duplicated here. That file is browser code, not a module, so it is parsed
// for its two constants instead of required.

'use strict';

const fs = require('fs');
const path = require('path');

// The tables supabase/schema.sql actually creates, in dependency order.
// Kept here as an explicit list so a live probe can prove each one exists;
// if schema.sql gains a table it belongs in this array too.
const EXPECTED_TABLES = [
    'workshops',
    'employees',
    'projects',
    'windows',
    'status_history',
    'activity',
];

// Keys that must never appear in supabase-config.js. That file is served to
// every visitor, so a secret there is a leaked secret.
const FORBIDDEN_KEY_PREFIXES = ['sb_secret_', 'service_role', 'eyJ'];

const CONFIG_PATH = path.join(__dirname, '..', 'supabase-config.js');

// Pull `const NAME = "value";` out of the browser config file.
function readConfigFile(filePath) {
    const resolved = filePath || CONFIG_PATH;
    return fs.readFileSync(resolved, 'utf8');
}

function readStringConstant(source, name) {
    const pattern = new RegExp(
        String.raw`const\s+` + name + String.raw`\s*=\s*"([^"]*)"`,
        'm'
    );
    const match = source.match(pattern);
    return match ? match[1] : undefined;
}

// Returns { url, anonKey, workshopId, accessMode }. Undefined means the
// constant was not found at all, which is different from an empty string.
function readSupabaseConfig(filePath) {
    const source = readConfigFile(filePath);

    return {
        url: readStringConstant(source, 'SUPABASE_URL'),
        anonKey: readStringConstant(source, 'SUPABASE_ANON_KEY'),
        workshopId: readStringConstant(source, 'SUPABASE_WORKSHOP_ID'),
        accessMode: readStringConstant(source, 'ACCESS_MODE'),
    };
}

function isConfigured(config) {
    return Boolean(
        config &&
        String(config.url || '').trim() &&
        String(config.anonKey || '').trim()
    );
}

// Cheap structural checks that need no network. Returns human-readable
// problems; an empty array means the file looks sane.
function validateSupabaseConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        return ['supabase config could not be read'];
    }

    if (typeof config.url === 'undefined') {
        errors.push('SUPABASE_URL constant not found in supabase-config.js');
    } else if (String(config.url).trim()) {
        try {
            const parsed = new URL(config.url);
            if (parsed.protocol !== 'https:') {
                errors.push('SUPABASE_URL must use https');
            }
            if (!parsed.hostname.endsWith('.supabase.co')) {
                errors.push('SUPABASE_URL host should end in .supabase.co');
            }
        } catch (_) {
            errors.push('SUPABASE_URL is not a valid absolute URL');
        }
    }

    if (typeof config.anonKey === 'undefined') {
        errors.push('SUPABASE_ANON_KEY constant not found in supabase-config.js');
    } else {
        const key = String(config.anonKey);
        for (const prefix of FORBIDDEN_KEY_PREFIXES) {
            // A JWT-style key starts with eyJ; the publishable sb_ key does not.
            if (prefix === 'eyJ') continue;
            if (key.startsWith(prefix)) {
                errors.push(
                    `SUPABASE_ANON_KEY looks like a SECRET ("${prefix}"); ` +
                    'this file is served to every visitor'
                );
            }
        }
    }

    if (config.accessMode && config.accessMode !== 'open' && config.accessMode !== 'pin') {
        errors.push('ACCESS_MODE must be "open" or "pin"');
    }

    return errors;
}

// The environment the Drive export reads. Values only; no network.
function readDriveEnv(env) {
    const source = env || process.env;

    return {
        keyPath: String(source.AGA_DRIVE_KEY || '').trim(),
        folderId: String(source.AGA_DRIVE_FOLDER_ID || '').trim(),
        supabaseUrl: String(source.AGA_SUPABASE_URL || '').trim(),
        supabaseAnonKey: String(source.AGA_SUPABASE_ANON_KEY || '').trim(),
    };
}

// The Drive job refuses to start without its key and folder, so report that
// up front rather than letting a nightly run fail silently.
function validateDriveEnv(drive) {
    const errors = [];

    if (!drive || typeof drive !== 'object') {
        return ['drive environment could not be read'];
    }

    if (!drive.keyPath) {
        errors.push('AGA_DRIVE_KEY is not set');
    }
    if (!drive.folderId) {
        errors.push('AGA_DRIVE_FOLDER_ID is not set');
    }
    if (!drive.supabaseUrl) {
        errors.push('AGA_SUPABASE_URL is not set (the export will not find live data)');
    }
    if (!drive.supabaseAnonKey) {
        errors.push('AGA_SUPABASE_ANON_KEY is not set (the export will not find live data)');
    }

    return errors;
}

module.exports = {
    EXPECTED_TABLES,
    FORBIDDEN_KEY_PREFIXES,
    CONFIG_PATH,
    readConfigFile,
    readStringConstant,
    readSupabaseConfig,
    isConfigured,
    validateSupabaseConfig,
    readDriveEnv,
    validateDriveEnv,
};
