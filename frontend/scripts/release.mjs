import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Cuts a release: bump version -> sync manifest -> commit -> tag -> push.
//
// We drive git ourselves instead of letting `npm version` do it, because this
// package lives in a subdirectory (frontend/) of the git repo. In that layout
// `npm version` decides it is "not a git repository" and silently skips the
// commit/tag while still running the version lifecycle scripts — leaving the
// bump uncommitted and untagged. Doing it explicitly here is reliable.
//
// Usage: node scripts/release.mjs [patch|minor|major]   (default: patch)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const type = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error(`Unknown release type "${type}". Use: patch | minor | major.`);
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
const capture = (cmd) => execSync(cmd, { cwd: rootDir }).toString().trim();

// 1. Require a clean working tree so the release commit contains exactly the
//    version bump and nothing else (and so we never half-release again).
const dirty = capture('git status --porcelain');
if (dirty) {
  console.error('Working tree is not clean. Commit or stash your changes first:\n' + dirty);
  process.exit(1);
}

// 2. Bump package.json + package-lock.json only (no git — we handle git below).
run(`npm version ${type} --no-git-tag-version`);

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

// 3. Mirror the version into manifest.json.
const manifestPath = path.join(rootDir, 'public', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// 4. Heads-up if no changelog entry exists — the GitHub release notes would
//    otherwise fall back to auto-generated commit notes.
const changelog = JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'changelog.json'), 'utf8'));
if (!changelog.some((e) => e.version === version)) {
  console.warn(`\n⚠️  changelog.json has no entry for ${version}. Add one before releasing for proper release notes.`);
}

// 5. Build the extension zip locally (release/catheadtab-v<version>.zip).
//    Building before commit/tag means a broken build aborts the release before
//    anything is published; roll back the bump so the tree is clean for a retry.
console.log(`\n📦 Building extension zip for ${tag}...\n`);
try {
  run('npm run build:ext');
} catch {
  run('git checkout -- package.json package-lock.json public/manifest.json');
  console.error('\n❌ build:ext failed — version bump rolled back, nothing committed or pushed.');
  process.exit(1);
}

// 6. Commit, tag, and push (pushing the tag triggers CI to build + release).
console.log(`\n🚀 Releasing ${tag}\n`);
run('git add package.json package-lock.json public/manifest.json');
run(`git commit -m "chore: release ${tag}"`);
run(`git tag -a ${tag} -m "chore: release ${tag}"`);
run('git push --follow-tags');

console.log(`\n🎉 Pushed ${tag}. Local zip: release/catheadtab-${tag.slice(1)}.zip — CI will build the same and create the GitHub Release.`);
