// Unit tests for the AGA VS Code debug launch configuration (.vscode/launch.json).
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test
// or run just this file:
//     node --test tools/verify-launch-config.test.js
//
// Structure follows Arrange-Act-Assert with one logical assertion per test.
// Coverage: positive (real file + valid fixtures), negative (each rule
// violated) and edge cases (unknown keys, comment tolerance, malformed input).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    EXPECTED_PORT,
    EXPECTED_PRELAUNCH_TASK,
    EXPECTED_LIVE_HOST,
    EXPECTED_LIVE_PATH,
    isLocalConfig,
    stripLineComments,
    parseLaunchConfig,
    readLaunchConfig,
    getConfiguration,
    validateLaunchConfiguration,
    isValidLaunchConfiguration,
} = require('./verify-launch-config');

const LAUNCH_PATH = path.join(__dirname, '..', '.vscode', 'launch.json');

// A known-good configuration, cloned before each mutation so tests don't leak
// state into one another.
function validFixture() {
    return {
        version: '0.2.0',
        configurations: [
            {
                type: 'msedge',
                request: 'launch',
                name: 'Run AGA (preview server)',
                preLaunchTask: 'AGA: start preview server',
                url: 'http://127.0.0.1:8800/',
                webRoot: '${workspaceFolder}',
            },
        ],
    };
}

// A known-good live-site config: URL only, no preLaunchTask.
function validLiveFixture() {
    return {
        version: '0.2.0',
        configurations: [
            {
                type: 'msedge',
                request: 'launch',
                name: 'Run AGA (live site)',
                url: `https://${EXPECTED_LIVE_HOST}${EXPECTED_LIVE_PATH}`,
                webRoot: '${workspaceFolder}',
            },
        ],
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// The real, checked-in launch.json
// ---------------------------------------------------------------------------

test('launch.json exists on disk', () => {
    assert.equal(fs.existsSync(LAUNCH_PATH), true, `${LAUNCH_PATH} should exist`);
});

test('launch.json is valid JSON/JSONC and parses to an object', () => {
    const config = readLaunchConfig(LAUNCH_PATH);
    assert.equal(typeof config, 'object');
    assert.notEqual(config, null);
    assert.equal(Array.isArray(config), false);
});

test('the checked-in launch.json passes every validation rule', () => {
    const config = readLaunchConfig(LAUNCH_PATH);
    assert.deepEqual(validateLaunchConfiguration(config), []);
});

test('declares the modern 0.2.0 schema version', () => {
    const config = readLaunchConfig(LAUNCH_PATH);
    assert.equal(config.version, '0.2.0');
});

test('defines exactly the two expected configurations, local first', () => {
    const config = readLaunchConfig(LAUNCH_PATH);
    assert.equal(config.configurations.length, 2);
    assert.equal(config.configurations[0].name, 'Run AGA (preview server)');
    assert.equal(config.configurations[1].name, 'Run AGA (live site)');
});

test('launches Microsoft Edge (msedge) in launch mode', () => {
    const config = getConfiguration(readLaunchConfig(LAUNCH_PATH));
    assert.equal(config.type, 'msedge');
    assert.equal(config.request, 'launch');
});

test('starts the preview server via the matching preLaunchTask', () => {
    const config = getConfiguration(readLaunchConfig(LAUNCH_PATH));
    assert.equal(config.preLaunchTask, EXPECTED_PRELAUNCH_TASK);
});

test('serves the same URL the preview server listens on', () => {
    const config = getConfiguration(readLaunchConfig(LAUNCH_PATH));
    const url = new URL(config.url);
    assert.equal(url.protocol, 'http:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, EXPECTED_PORT);
    assert.equal(url.pathname, '/');
});

test('maps the whole workspace as webRoot', () => {
    const config = getConfiguration(readLaunchConfig(LAUNCH_PATH));
    assert.equal(config.webRoot, '${workspaceFolder}');
});

test('the preLaunchTask references a label that exists in tasks.json', () => {
    const config = getConfiguration(readLaunchConfig(LAUNCH_PATH));
    const tasksPath = path.join(__dirname, '..', '.vscode', 'tasks.json');
    const tasks = parseLaunchConfig(fs.readFileSync(tasksPath, 'utf8'));
    const labels = tasks.tasks.map(task => task.label);
    assert.ok(
        labels.includes(config.preLaunchTask),
        `tasks.json should define "${config.preLaunchTask}", found: ${labels.join(', ')}`
    );
});

// ---------------------------------------------------------------------------
// Documented field values (contract tests)
// ---------------------------------------------------------------------------

test('every documented field matches the expected value', () => {
    // Locks in the exact contract so an accidental edit to any field fails
    // loudly rather than silently changing the debug experience.
    const expected = validFixture().configurations[0];
    const actual = getConfiguration(readLaunchConfig(LAUNCH_PATH));
    for (const key of Object.keys(expected)) {
        assert.equal(actual[key], expected[key], `field "${key}" changed`);
    }
});

// ---------------------------------------------------------------------------
// Positive cases
// ---------------------------------------------------------------------------

test('a fully valid configuration passes validation', () => {
    assert.equal(isValidLaunchConfiguration(validFixture()), true);
});

test('localhost is accepted as an alternative host', () => {
    const config = validFixture();
    config.configurations[0].url = 'http://localhost:8800/';
    assert.deepEqual(validateLaunchConfiguration(config), []);
});

test('multiple valid configurations are all validated without error', () => {
    const config = validFixture();
    const second = clone(config.configurations[0]);
    second.name = 'Run AGA (second browser)';
    config.configurations.push(second);
    assert.deepEqual(validateLaunchConfiguration(config), []);
});

// ---------------------------------------------------------------------------
// Live-site configurations (URL only, no preLaunchTask)
// ---------------------------------------------------------------------------

test('a live-site configuration is recognised as non-local', () => {
    assert.equal(isLocalConfig(validLiveFixture().configurations[0]), false);
});

test('a local configuration is recognised as local', () => {
    assert.equal(isLocalConfig(validFixture().configurations[0]), true);
});

test('a well-formed live-site configuration passes validation', () => {
    assert.deepEqual(validateLaunchConfiguration(validLiveFixture()), []);
});

test('a local and a live configuration can coexist in one file', () => {
    const config = validFixture();
    config.configurations.push(validLiveFixture().configurations[0]);
    assert.deepEqual(validateLaunchConfiguration(config), []);
});

test('rejects a live config pointing at an unknown host', () => {
    const config = validLiveFixture();
    config.configurations[0].url = 'https://evil.example.com/AGA/';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes(EXPECTED_LIVE_HOST)));
});

test('rejects a live config with the wrong Pages path', () => {
    const config = validLiveFixture();
    config.configurations[0].url = `https://${EXPECTED_LIVE_HOST}/`;
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.url path')));
});

test('rejects a config that is neither local nor live', () => {
    // No preLaunchTask and not the known Pages origin: matches no allowed shape.
    const config = validLiveFixture();
    config.configurations[0].url = 'http://127.0.0.1:9999/';
    assert.ok(validateLaunchConfiguration(config).length > 0);
});

test('a live url carrying a preLaunchTask is judged by the local rules', () => {
    // Adding a preLaunchTask reclassifies the entry as local, so it must then
    // satisfy the local host/port rules - and correctly fails them.
    const config = validLiveFixture();
    config.configurations[0].preLaunchTask = EXPECTED_PRELAUNCH_TASK;
    assert.equal(isLocalConfig(config.configurations[0]), true);
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.url host')));
});

// ---------------------------------------------------------------------------
// Negative cases - one rule violated at a time
// ---------------------------------------------------------------------------

test('rejects an unsupported schema version', () => {
    const config = validFixture();
    config.version = '0.1.0';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('version')));
});

test('rejects a configuration whose type is not msedge', () => {
    const config = validFixture();
    config.configurations[0].type = 'chrome';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.type')));
});

test('rejects a request mode other than launch', () => {
    const config = validFixture();
    config.configurations[0].request = 'attach';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.request')));
});

test('rejects a missing name', () => {
    const config = validFixture();
    delete config.configurations[0].name;
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.name')));
});

test('rejects a blank name', () => {
    const config = validFixture();
    config.configurations[0].name = '   ';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.name')));
});

test('rejects a mismatched preLaunchTask label', () => {
    const config = validFixture();
    config.configurations[0].preLaunchTask = 'Some other task';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.preLaunchTask')));
});

test('rejects a wrong port', () => {
    const config = validFixture();
    config.configurations[0].url = 'http://127.0.0.1:9999/';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.url port')));
});

test('rejects an unexpected host', () => {
    const config = validFixture();
    config.configurations[0].url = 'http://evil.example.com:8800/';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.url host')));
});

test('rejects a non-root path', () => {
    const config = validFixture();
    config.configurations[0].url = 'http://127.0.0.1:8800/dashboard';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.url path')));
});

test('rejects a relative url', () => {
    const config = validFixture();
    config.configurations[0].url = '/index.html';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.url')));
});

test('rejects a webRoot other than the workspace folder', () => {
    const config = validFixture();
    config.configurations[0].webRoot = '${workspaceFolder}/app';
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('.webRoot')));
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('reports an empty errors array for a valid configuration', () => {
    const errors = validateLaunchConfiguration(validFixture());
    assert.ok(Array.isArray(errors));
    assert.equal(errors.length, 0);
});

test('nodes with a null entry are reported, not thrown', () => {
    const config = validFixture();
    config.configurations.push(null);
    const errors = validateLaunchConfiguration(config);
    assert.ok(errors.some(e => e.includes('configurations[1]')));
});

test('an empty configurations array is invalid', () => {
    const config = validFixture();
    config.configurations = [];
    assert.ok(validateLaunchConfiguration(config).length > 0);
});

test('a configurations entry that is not an array is invalid', () => {
    const config = validFixture();
    config.configurations = { name: 'nope' };
    assert.ok(validateLaunchConfiguration(config).some(e => e.includes('non-empty array')));
});

test('a non-object top-level value is rejected', () => {
    assert.deepEqual(validateLaunchConfiguration(null), ['launch configuration must be a JSON object']);
    assert.deepEqual(validateLaunchConfiguration([]), ['launch configuration must be a JSON object']);
});

test('unknown extra keys do not cause validation to fail', () => {
    const config = validFixture();
    config.configurations[0].someFutureSetting = true;
    assert.equal(isValidLaunchConfiguration(config), true);
});

test('stripLineComments removes // comments but preserves http://', () => {
    const input = [
        '{',
        '  // a trailing comment',
        '  "url": "http://127.0.0.1:8800/"',
        '}',
    ].join('\n');
    const stripped = stripLineComments(input);
    assert.equal(stripped.includes('a trailing comment'), false);
    assert.equal(stripped.includes('http://127.0.0.1:8800/'), true);
});

test('parseLaunchConfig tolerates comments and non-strict JSON', () => {
    const text = [
        '{',
        '  // VS Code allows comments in launch.json',
        '  "url": "http://127.0.0.1:8800/",',
        '  // a template value, not valid strict JSON:',
        '  "webRoot": "${workspaceFolder}"', , // template literal, not valid strict JSON
        '}',
    ].join('\n');
    const parsed = parseLaunchConfig(text);
    assert.equal(parsed.url, 'http://127.0.0.1:8800/');
    assert.equal(parsed.webRoot, '${workspaceFolder}');
});

test('getConfiguration returns the first configuration when no name is given', () => {
    const config = validFixture();
    assert.equal(getConfiguration(config).name, 'Run AGA (preview server)');
});

test('getConfiguration finds a configuration by name', () => {
    const config = validFixture();
    config.configurations.push({ name: 'Second', type: 'msedge', request: 'launch' });
    assert.equal(getConfiguration(config, 'Second').type, 'msedge');
});

test('getConfiguration returns undefined for an unknown name', () => {
    assert.equal(getConfiguration(validFixture(), 'does-not-exist'), undefined);
});

test('readLaunchConfig falls back to the default path when none is given', () => {
    const viaDefault = readLaunchConfig();
    const viaExplicit = readLaunchConfig(LAUNCH_PATH);
    assert.deepEqual(viaDefault, viaExplicit);
});

test('an invalid trailing comment does not break the real file parse', () => {
    // Guard against regressions where someone adds a comment to launch.json.
    const text = fs.readFileSync(LAUNCH_PATH, 'utf8');
    assert.doesNotThrow(() => parseLaunchConfig(text));
});
