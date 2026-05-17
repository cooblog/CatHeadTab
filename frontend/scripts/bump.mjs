import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const projectRootDir = path.resolve(rootDir, '..');

// 1. 获取要升级的版本类型 (patch, minor, major) 默认是 patch
const type = process.argv[2] || 'patch';

// 2. 读取 package.json 获取当前版本
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

let [major, minor, patch] = currentVersion.split('.').map(Number);

if (type === 'major') {
  major++;
  minor = 0;
  patch = 0;
} else if (type === 'minor') {
  minor++;
  patch = 0;
} else {
  patch++;
}

const newVersion = `${major}.${minor}.${patch}`;
console.log(`\n🚀 Bumping version: ${currentVersion} -> ${newVersion}\n`);

// 3. 更新 package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅ Updated package.json`);

// 4. 更新 manifest.json
const manifestPath = path.join(rootDir, 'public', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✅ Updated public/manifest.json`);

console.log(`\n🎉 Version successfully bumped to ${newVersion} !`);
console.log(`👉 Next steps:`);
console.log(`   1. git commit -am "chore: bump version to v${newVersion}"`);
console.log(`   2. npm run build:ext\n`);
