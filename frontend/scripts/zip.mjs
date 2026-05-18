import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'dist');
const manifestPath = path.join(frontendDir, 'public', 'manifest.json');

// Read version from package.json
const packageJsonPath = path.join(frontendDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Auto-inject VITE_API_URL from .env.production.local into dist/manifest.json host_permissions
const envPath = path.join(frontendDir, '.env.production.local');
const distManifestPath = path.join(distDir, 'manifest.json');
const distAdminPath = path.join(distDir, 'admin.html');

if (fs.existsSync(distAdminPath)) {
  throw new Error('Refusing to package extension: dist/admin.html exists. Run vite build with --mode extension.');
}

// Sync version and inject VITE_API_URL host_permissions into dist/manifest.json
if (fs.existsSync(distManifestPath)) {
  const distManifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));
  
  // Always sync version from package.json
  const oldVersion = distManifest.version;
  distManifest.version = version;
  if (oldVersion !== version) {
    console.log(`\n=> Synced manifest version: ${oldVersion} -> ${version}`);
  }

  // Inject host permission from env if exists
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^VITE_API_URL\s*=\s*(.*)$/m);
    if (match) {
      const apiUrl = match[1].trim();
      try {
        const u = new URL(apiUrl);
        const originMatch = `${u.protocol}//${u.host}/*`;
        distManifest.host_permissions = distManifest.host_permissions || [];
        if (!distManifest.host_permissions.includes(originMatch)) {
          distManifest.host_permissions.push(originMatch);
          console.log(`=> Injected API host permission: ${originMatch}`);
        }
      } catch (e) {
        console.warn(`=> Failed to parse VITE_API_URL: ${apiUrl}`);
      }
    }
  }

  // Write back the updated manifest
  fs.writeFileSync(distManifestPath, JSON.stringify(distManifest, null, 2));
}

// Define output file
const outputFileName = `catheadtab-v${version}.zip`;
const outputPath = path.join(frontendDir, outputFileName);

console.log(`Starting to create zip file: ${outputFileName}...`);

// Create a file to stream archive data to
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Sets the compression level.
});

// Listen for all archive data to be written
output.on('close', function() {
  console.log(`Successfully created ${outputFileName} (${archive.pointer()} bytes)`);
  console.log('Ready to upload to Chrome Web Store!');
});

// Good practice to catch warnings
archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('Archive warning:', err);
  } else {
    throw err;
  }
});

// Good practice to catch this error explicitly
archive.on('error', function(err) {
  throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Append files from a sub-directory, putting its contents at the root of archive
archive.directory(distDir, false);

// Finalize the archive (ie we are done appending files but streams have to finish yet)
archive.finalize();
