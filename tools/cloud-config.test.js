// Unit tests for the AGA cloud configuration reader (tools/cloud-config.js).
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/cloud-config.test.js
//
// These are deliberately offline. The live probing lives in
// tools/check-cloud.js and is run by hand via `npm run check:cloud`, so the
// test suite stays deterministic and safe to run with no network.
//
// Structure follows Arrange-Act-Assert, with positive, negative and edge
// cases, matching tools/verify-launch-config.test.js.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
    EXPECTED_TABLES,
    CONFIG_PATH,
    readConfigFile,
    readStringConstant,
    readSupabaseConfig,
    isConfigured,
    validateSupabaseConfig,
    readDriveEnv,
    validateDriveEnv,
} = require('./cloud-config');

// ---------------------------------------------------------------------------
// The real, checked-in supabase-config.js
// ---------------------------------------------------------------------------

test('supabase-config.js exists on disk', () => {
    const source = readConfigFile(CONFIG_PATH);
    assert.equal(typeof source, 'string');
    assert.ok(source.length > 0);
});

test('the real config exposes a URL, a key, a workshop id and an access mode', () => {
    const config = readSupabaseConfig(CONFIG_PATH);
    assert.equal(typeof config.url, 'string');
    assert.equal(typeof config.anonKey, 'string');
    assert.equal(typeof config.workshopId, 'string');
    assert.equal(typeof config.accessMode, 'string');
});

test('the checked-in config passes every structural rule', () => {
    const config = readSupabaseConfig(CONFIG_PATH);
    assert.deepEqual(validateSupabaseConfig(config), []);
});

test('the checked-in config counts as configured', () => {
    const config = readSupabaseConfig(CONFIG_PATH);
    assert.equal(isConfigured(config), true);
});

test('the checked-in URL is https and points at supabase.co', () => {
    const config = readSupabaseConfig(CONFIG_PATH);
    const url = new URL(config.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname.endsWith('.supabase.co'), `host was ${url.hostname}`);
});

test('the checked-in key is publishable, never a secret', () => {
    const config = readSupabaseConfig(CONFIG_PATH);
    assert.equal(
        String(config.anonKey).startsWith('sb_secret_'),
        false,
        'supabase-config.js is served to every visitor; a secret key must never live here'
    );
});

test('the checked-in access mode is one of the two known values', () => {
    const config = readSupabaseConfig(CONFIG_PATH);
    assert.ok(['open', 'pin'].includes(config.accessMode), `mode was ${config.accessMode}`);
});

// ---------------------------------------------------------------------------
// readStringConstant
// ---------------------------------------------------------------------------

test('reads a double-quoted constant', () => {
    assert.equal(readStringConstant('const X = "hello";', 'X'), 'hello');
});

test('reads an empty-string constant as an empty string', () => {
    assert.equal(readStringConstant('const X = "";', 'X'), '');
});

test('tolerates loose spacing around the equals sign', () => {
    assert.equal(readStringConstant('const   X   =   "v"  ;', 'X'), 'v');
});

test('does not mistake a constant whose name is a prefix of another', () => {
    const source = 'const SUPABASE_URL_SETTING = "wrong";';
    assert.equal(readStringConstant(source, 'SUPABASE_URL'), undefined);
});

test('returns undefined when the constant is absent', () => {
    assert.equal(readStringConstant('const Y = "v";', 'X'), undefined);
});

test('reads the first match when a name appears twice', () => {
    assert.equal(readStringConstant('const X = "first";\nconst X = "second";', 'X'), 'first');
});

// ---------------------------------------------------------------------------
// isConfigured
// ---------------------------------------------------------------------------

test('configured when both url and key are non-blank', () => {
    assert.equal(isConfigured({ url: 'https://a.supabase.co', anonKey: 'sb_publishable_x' }), true);
});

test('not configured when the url is blank', () => {
    assert.equal(isConfigured({ url: '', anonKey: 'k' }), false);
});

test('not configured when the url is whitespace only', () => {
    assert.equal(isConfigured({ url: '   ', anonKey: 'k' }), false);
});

test('not configured when the key is blank', () => {
    assert.equal(isConfigured({ url: 'https://a.supabase.co', anonKey: '' }), false);
});

test('not configured for null', () => {
    assert.equal(isConfigured(null), false);
});

// ---------------------------------------------------------------------------
// validateSupabaseConfig - negative cases
// ---------------------------------------------------------------------------

test('reports a non-https url', () => {
    const errors = validateSupabaseConfig({ url: 'http://a.supabase.co', anonKey: 'k' });
    assert.ok(errors.some(e => e.includes('https')));
});

test('reports a url whose host is not supabase.co', () => {
    const errors = validateSupabaseConfig({ url: 'https://evil.example.com', anonKey: 'k' });
    assert.ok(errors.some(e => e.includes('.supabase.co')));
});

test('reports a malformed url', () => {
    const errors = validateSupabaseConfig({ url: 'not a url', anonKey: 'k' });
    assert.ok(errors.some(e => e.includes('valid absolute URL')));
});

test('reports a missing SUPABASE_URL constant', () => {
    const errors = validateSupabaseConfig({ anonKey: 'k' });
    assert.ok(errors.some(e => e.includes('SUPABASE_URL constant not found')));
});

test('reports a missing SUPABASE_ANON_KEY constant', () => {
    const errors = validateSupabaseConfig({ url: 'https://a.supabase.co' });
    assert.ok(errors.some(e => e.includes('SUPABASE_ANON_KEY constant not found')));
});

test('reports a secret key with a loud message', () => {
    const errors = validateSupabaseConfig({ url: 'https://a.supabase.co', anonKey: 'sb_secret_abc' });
    assert.ok(errors.some(e => e.includes('SECRET')));
});

test('reports a service_role key', () => {
    const errors = validateSupabaseConfig({ url: 'https://a.supabase.co', anonKey: 'service_role_abc' });
    assert.ok(errors.some(e => e.includes('SECRET')));
});

test('reports an unknown access mode', () => {
    const errors = validateSupabaseConfig({
        url: 'https://a.supabase.co',
        anonKey: 'sb_publishable_x',
        accessMode: 'whatever',
    });
    assert.ok(errors.some(e => e.includes('ACCESS_MODE')));
});

test('rejects a non-object config', () => {
    assert.deepEqual(validateSupabaseConfig(null), ['supabase config could not be read']);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('a blank url is allowed structurally (unconfigured is valid, just offline)', () => {
    // Blank means "run offline on localStorage" - a supported state, not an error.
    const errors = validateSupabaseConfig({ url: '', anonKey: '' });
    assert.deepEqual(errors, []);
});

test('a trailing path on the url is not an error', () => {
    const errors = validateSupabaseConfig({ url: 'https://a.supabase.co/', anonKey: 'k' });
    assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------
// The Drive export environment
// ---------------------------------------------------------------------------

test('readDriveEnv defaults every value to an empty string', () => {
    const drive = readDriveEnv({});
    assert.equal(drive.keyPath, '');
    assert.equal(drive.folderId, '');
    assert.equal(drive.supabaseUrl, '');
    assert.equal(drive.supabaseAnonKey, '');
});

test('readDriveEnv reads and trims the four variables', () => {
    const drive = readDriveEnv({
        AGA_DRIVE_KEY: '  C:\\aga\\key.json  ',
        AGA_DRIVE_FOLDER_ID: '  folder1  ',
        AGA_SUPABASE_URL: '  https://a.supabase.co  ',
        AGA_SUPABASE_ANON_KEY: '  sb_publishable_x  ',
    });
    assert.equal(drive.keyPath, 'C:\\aga\\key.json');
    assert.equal(drive.folderId, 'folder1');
    assert.equal(drive.supabaseUrl, 'https://a.supabase.co');
    assert.equal(drive.supabaseAnonKey, 'sb_publishable_x');
});

test('validateDriveEnv reports all four missing variables', () => {
    const errors = validateDriveEnv(readDriveEnv({}));
    assert.equal(errors.length, 4);
    assert.ok(errors.some(e => e.includes('AGA_DRIVE_KEY')));
    assert.ok(errors.some(e => e.includes('AGA_DRIVE_FOLDER_ID')));
    assert.ok(errors.some(e => e.includes('AGA_SUPABASE_URL')));
    assert.ok(errors.some(e => e.includes('AGA_SUPABASE_ANON_KEY')));
});

test('validateDriveEnv is silent when everything is set', () => {
    const drive = readDriveEnv({
        AGA_DRIVE_KEY: 'k',
        AGA_DRIVE_FOLDER_ID: 'f',
        AGA_SUPABASE_URL: 'u',
        AGA_SUPABASE_ANON_KEY: 'a',
    });
    assert.deepEqual(validateDriveEnv(drive), []);
});

test('validateDriveEnv rejects a non-object', () => {
    assert.deepEqual(validateDriveEnv(null), ['drive environment could not be read']);
});

// ---------------------------------------------------------------------------
// The expected table list
// ---------------------------------------------------------------------------

test('the expected table list matches the six tables schema.sql creates', () => {
    // schema.sql creates exactly these; a seventh would need this updated.
    assert.deepEqual(EXPECTED_TABLES, [
        'workshops',
        'employees',
        'projects',
        'windows',
        'status_history',
        'activity',
    ]);
});

test('every expected table is named in supabase/schema.sql', () => {
    const fs = require('fs');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    for (const table of EXPECTED_TABLES) {
        assert.ok(
            schema.includes('create table if not exists ' + table),
            `schema.sql does not create "${table}"`
        );
    }
});
