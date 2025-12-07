#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const moduleDir = path.join(ROOT, 'node_modules', 'better-sqlite3');
const releasePath = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');

function log(msg) {
  console.log(`[better-sqlite3] ${msg}`);
}

if (!fs.existsSync(moduleDir)) {
  log('package not installed yet; skipping ensure step');
  process.exit(0);
}

if (fs.existsSync(releasePath)) {
  log('native binding already present');
  process.exit(0);
}

const prebuildBin = (() => {
  try {
    return require.resolve('prebuild-install/bin.js');
  } catch (err) {
    console.error('[better-sqlite3] prebuild-install is missing. Re-run npm install.');
    process.exit(1);
  }
})();

const preferredPortableNode = process.platform === 'win32'
  ? path.join(ROOT, 'node-portable', 'node.exe')
  : null;

let targetNodeVersion = process.version.replace(/^v/, '');
let spawnBinary = process.execPath;

if (preferredPortableNode && fs.existsSync(preferredPortableNode)) {
  const versionResult = spawnSync(preferredPortableNode, ['-p', 'process.version'], { encoding: 'utf8' });
  if (versionResult.status === 0) {
    targetNodeVersion = versionResult.stdout.trim().replace(/^v/, '') || targetNodeVersion;
    spawnBinary = preferredPortableNode;
    log(`using portable Node ${targetNodeVersion} for native download`);
  }
}

log(`native binding missing; downloading prebuild for Node ${targetNodeVersion} (${process.platform}/${process.arch})`);
const installArgs = [
  prebuildBin,
  '--target', targetNodeVersion,
  '--runtime', 'node',
  '--platform', process.platform,
  '--arch', process.arch,
  '--tag-prefix', 'v',
  '--verbose'
];
const result = spawnSync(spawnBinary, installArgs, { cwd: moduleDir, stdio: 'inherit' });
if (result.status !== 0) {
  console.error('[better-sqlite3] failed to download prebuilt binary. Install Visual Studio Build Tools and retry.');
  process.exit(result.status || 1);
}

if (!fs.existsSync(releasePath)) {
  console.error('[better-sqlite3] prebuild step completed but binding file is still missing.');
  process.exit(1);
}

log('native binding installed successfully');
