import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Emits bilingual GitHub Release notes for a given version, sourced from
// src/changelog.json (the same single source the in-app About panel reads).
// Usage: node scripts/release-notes.mjs <version>
// Prints to stdout; CI redirects it into a body file for action-gh-release.
// If no matching entry exists, prints nothing and exits 0 so CI can fall
// back to auto-generated notes.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const version = (process.argv[2] || '').replace(/^v/, '').trim();
if (!version) {
  console.error('release-notes: no version argument provided');
  process.exit(0);
}

const changelogPath = path.join(rootDir, 'src', 'changelog.json');
const data = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
const entry = data.find((e) => e.version === version);

if (!entry) {
  console.error(`release-notes: no changelog entry for v${version}`);
  process.exit(0);
}

const lines = [];
lines.push('## 🇨🇳 更新内容');
for (const c of entry.zh) lines.push(`- ${c}`);
lines.push('');
lines.push("## 🌐 What's New");
for (const c of entry.en) lines.push(`- ${c}`);
lines.push('');

process.stdout.write(lines.join('\n'));
