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

// Read version from public manifest
const publicManifestPath = path.join(frontendDir, 'public', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));
const version = manifest.version;

// Auto-inject VITE_API_URL from .env.production.local into dist/manifest.json host_permissions
const envPath = path.join(frontendDir, '.env.production.local');
const distManifestPath = path.join(distDir, 'manifest.json');

if (fs.existsSync(envPath) && fs.existsSync(distManifestPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^VITE_API_URL\s*=\s*(.*)$/m);
  if (match) {
    const apiUrl = match[1].trim();
    try {
      const u = new URL(apiUrl);
      const originMatch = `${u.protocol}//${u.host}/*`;
      const distManifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));
      
      distManifest.host_permissions = distManifest.host_permissions || [];
      if (!distManifest.host_permissions.includes(originMatch)) {
        distManifest.host_permissions.push(originMatch);
        fs.writeFileSync(distManifestPath, JSON.stringify(distManifest, null, 2));
        console.log(`\n=> Injected API host permission into manifest: ${originMatch}`);
      }
    } catch (e) {
      console.warn(`\n=> Failed to parse VITE_API_URL from env for host_permissions: ${apiUrl}`);
    }
  }
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
