'use strict';
/**
 * Downloads the face-api.js model weights required for local face recognition.
 * Run once: node scripts/download-face-models.js
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const MODELS_DIR = path.join(__dirname, '../models/face-api');
const BASE_URL   = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

async function main() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  for (const file of FILES) {
    const dest = path.join(MODELS_DIR, file);
    if (fs.existsSync(dest)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    process.stdout.write(`  get   ${file} ...`);
    await download(`${BASE_URL}/${file}`, dest);
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(` ${kb} KB`);
  }
  console.log('\nModels ready at', MODELS_DIR);
}

main().catch(e => { console.error(e.message); process.exit(1); });
