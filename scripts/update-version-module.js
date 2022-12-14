/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

// This script is automatically run before pack/publish to ensure that the
// src/shared/version.ts module contains the current NPM package version and
// service worker hash.
//
// We use the version number to generate a correct unpkg.com URL for the default
// sandbox location, and we use the service worker hash to determine when we
// need to force a service worker update.

/* eslint-env node */

const thisDir = dirname(fileURLToPath(import.meta.url));

const getNpmVersion = async () => {
  const path = join(thisDir, '..', 'package.json');
  const data = await fs.readFile(path, 'utf8');
  const parsed = JSON.parse(data);
  return parsed.version;
};

const getServiceWorkerHash = async () => {
  const path = join(thisDir, '..', 'playground-service-worker.js');
  const code = await fs.readFile(path, 'utf8');
  // Note in theory Terser could minimize the version code differently, but it
  // should be obvious because this script will start to fail.
  const versionPattern =
    /version:\s*(?<quote>["'`])(?<hex>[a-z0-9]+)\k<quote>/g;
  const matches = [...code.matchAll(versionPattern)];
  if (matches.length !== 1) {
    throw new Error(
      'Expected exactly one version string in playground-service-worker.js. ' +
        `Found ${matches.length}.`
    );
  }
  // We must remove the version string itself from the service worker code
  // before hashing, so that we get a stable hash.
  const oldHash = matches[0].groups.hex;
  if (!oldHash) {
    throw new Error('Could not find "hash" capture group in regexp match.');
  }
  const hashableCode = code.replace(oldHash, '');
  const hash = crypto
    .createHash('sha256')
    .update(hashableCode)
    // Hex is a little nicer than base64 because it doesn't use the _/=
    // charaters which makes copy/paste annoying (can't double click on it).
    .digest('hex')
    // 8 hex chars = 32 hash bits. Should be sufficient.
    .slice(0, 8);
  return hash;
};

const newVersionModuleCode = `/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

// DO NOT UPDATE MANUALLY.

// This file is automatically generated by scripts/update-version-module.js
// before publishing.
export const npmVersion = '${await getNpmVersion()}';
export const serviceWorkerHash = '${await getServiceWorkerHash()}';
`;

const versionModulePath = join(thisDir, '..', 'src', 'shared', 'version.ts');
const oldVersionModuleCode = await fs.readFile(versionModulePath, 'utf8');
if (oldVersionModuleCode !== newVersionModuleCode) {
  await fs.writeFile(versionModulePath, newVersionModuleCode, 'utf8');
  console.log(
    'Updated src/shared/version.ts, please commit this change and rebuild.'
  );
  // Fail to help the publisher remember to commit.
  process.exit(1);
} else {
  console.log('src/shared/version.ts already up to date.');
}
