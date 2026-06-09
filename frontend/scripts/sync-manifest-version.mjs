import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Runs as the npm `version` lifecycle hook: after `npm version` bumps
// package.json but BEFORE it creates the commit/tag. We mirror the new
// version into manifest.json and stage it so it lands in the same commit
// (and therefore the same tag) as package.json.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;

const manifestPath = path.join(rootDir, 'public', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== version) {
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`=> Synced manifest version -> ${version}`);
}

// Stage manifest so npm includes it in the release commit alongside package.json.
execSync(`git add "${manifestPath}"`, { stdio: 'inherit' });
