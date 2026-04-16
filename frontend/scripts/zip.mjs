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

// Read version from manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;

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
