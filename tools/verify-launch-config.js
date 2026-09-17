// Pure, dependency-free validator + readers for the AGA VS Code debug launch
// configuration (.vscode/launch.json).
//
// Keeping the reading and validation logic here (rather than inside the test
// file) lets the unit tests exercise the rules directly against synthetic
// input, and lets us re-check the real, checked-in launch.json. The module is
// side-effect free and intentionally tolerant of partial/fixture objects so it
// can validate both the real file and test doubles.

'use strict';

const fs = require('fs');
const path = require('path');

// --- Expected shape of the AGA launch target -------------------------------
// These mirror the values the preview server actually listens on (see
// preview-server.js: PORT 8800 on 127.0.0.1) and the tasks.json preLaunchTask
// label used to boot that server.
const EXPECTED_PORT = '8800';
const EXPECTED_PRELAUNCH_TASK = 'AGA: start preview server';
const EXPECTED_HOSTS = ['127.0.0.1', 'localhost'];
const SUPPORTED_VERSIONS = ['0.2.0'];

// Two kinds of configuration are allowed, told apart by whether the entry
// chains to the preview server via `preLaunchTask`:
//
//   * a LOCAL config starts preview-server.js and talks to 127.0.0.1:8800.
//     Every strict rule below applies to it.
//   * a LIVE config points Edge at the deployed GitHub Pages build. It has no
//     preLaunchTask (nothing local to boot) and no debugging webRoot worth
//     pinning, so it is only allowed to target the one known Pages origin.
//
// Anything matching neither shape is reported, so the file can still only
// drift in the two directions we intend.
const EXPECTED_LIVE_HOST = 'architecturalglassandaluminium-crypto.github.io';
const EXPECTED_LIVE_PATH = '/AGA/';

function isLocalConfig(cfg) {
    return typeof cfg.preLaunchTask === 'string' && cfg.preLaunchTask.trim() !== '';
}

// Strip a single `//` line comment (not preceded by `:` so it will not eat the
// `//` inside `http://`). VS Code's launch.json dialect allows these, so we
// tolerate them when parsing.
function stripLineComments(text) {
    return text
        .split(/\r?\n/)
        .map(line => line.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n');
}

// Parse launch.json text into an object, falling back to a permissive parse so
// that values like `${workspaceFolder}` (not valid strict JSON) still load.
function parseLaunchConfig(text) {
    const cleaned = stripLineComments(text);
    try {
        return JSON.parse(cleaned);
    } catch (_) {
        // eslint-disable-next-line no-new-func
        return Function('"use strict";return (' + cleaned + ');')();
    }
}

function readLaunchConfig(filePath) {
    const resolved = filePath || path.join(__dirname, '..', '.vscode', 'launch.json');
    return parseLaunchConfig(fs.readFileSync(resolved, 'utf8'));
}

function getConfiguration(config, name) {
    const configurations = (config && config.configurations) || [];
    if (name === undefined) return configurations[0];
    return configurations.find(cfg => cfg && cfg.name === name);
}

// Returns a list of human-readable problems. Empty array === valid.
function validateLaunchConfiguration(config) {
    const errors = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return ['launch configuration must be a JSON object'];
    }

    if (!SUPPORTED_VERSIONS.includes(config.version)) {
        errors.push(`version must be one of ${SUPPORTED_VERSIONS.join(', ')}`);
    }

    if (!Array.isArray(config.configurations) || config.configurations.length === 0) {
        errors.push('configurations must be a non-empty array');
        return errors;
    }

    config.configurations.forEach((cfg, index) => {
        const label = `configurations[${index}]`;

        if (!cfg || typeof cfg !== 'object') {
            errors.push(`${label} must be an object`);
            return;
        }

        if (cfg.type !== 'msedge') {
            errors.push(`${label}.type must be "msedge"`);
        }
        if (cfg.request !== 'launch') {
            errors.push(`${label}.request must be "launch"`);
        }
        if (typeof cfg.name !== 'string' || cfg.name.trim() === '') {
            errors.push(`${label}.name must be a non-empty string`);
        }

        // A LIVE config is the URL-only shortcut to the deployed build. It is
        // deliberately shallow: no preLaunchTask to boot, no webRoot to map.
        if (!isLocalConfig(cfg)) {
            try {
                const liveUrl = new URL(cfg.url);
                if (liveUrl.hostname !== EXPECTED_LIVE_HOST) {
                    errors.push(
                        `${label} is neither a local config (no "${EXPECTED_PRELAUNCH_TASK}" ` +
                        `preLaunchTask) nor a live one: url host must be ${EXPECTED_LIVE_HOST}`
                    );
                }
                if (liveUrl.pathname !== EXPECTED_LIVE_PATH) {
                    errors.push(`${label}.url path must be "${EXPECTED_LIVE_PATH}"`);
                }
            } catch (_) {
                errors.push(`${label}.url must be an absolute http(s) URL`);
            }
            return;
        }

        if (cfg.preLaunchTask !== EXPECTED_PRELAUNCH_TASK) {
            errors.push(`${label}.preLaunchTask must be "${EXPECTED_PRELAUNCH_TASK}"`);
        }

        try {
            const url = new URL(cfg.url);
            if (!EXPECTED_HOSTS.includes(url.hostname)) {
                errors.push(`${label}.url host must be one of ${EXPECTED_HOSTS.join(', ')}`);
            }
            if (url.port !== EXPECTED_PORT) {
                errors.push(`${label}.url port must be ${EXPECTED_PORT}`);
            }
            if (url.pathname !== '/' && url.pathname !== '') {
                errors.push(`${label}.url path must be "/"`);
            }
        } catch (_) {
            errors.push(`${label}.url must be an absolute http(s) URL`);
        }

        if (cfg.webRoot !== '${workspaceFolder}') {
            errors.push(`${label}.webRoot must be "\${workspaceFolder}"`);
        }
    });

    return errors;
}

function isValidLaunchConfiguration(config) {
    return validateLaunchConfiguration(config).length === 0;
}

module.exports = {
    EXPECTED_PORT,
    EXPECTED_PRELAUNCH_TASK,
    EXPECTED_HOSTS,
    EXPECTED_LIVE_HOST,
    EXPECTED_LIVE_PATH,
    isLocalConfig,
    stripLineComments,
    parseLaunchConfig,
    readLaunchConfig,
    getConfiguration,
    validateLaunchConfiguration,
    isValidLaunchConfiguration,
};
