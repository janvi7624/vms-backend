'use strict';

/**
 * One-off migration: uploads the local uploads/visitor-photos and
 * uploads/business-cards folders to a private S3 bucket, then rewrites the
 * matching visitors.photo_url / visitors.business_card_photo_url rows in the
 * DB from "/uploads/<sub>/<file>" to the object's S3 KEY (e.g.
 * "visitor-photos/<file>") — the bucket is private, so API responses sign a
 * fresh temporary URL on read (see middleware/signPhotoUrls.js) rather than
 * storing a permanent URL.
 *
 * Safe to re-run: uploading is idempotent (same key overwrites the same
 * object), and the DB update only touches rows still pointing at a local
 * "/uploads/..." path — rows already migrated (now holding a bare S3 key)
 * are left untouched.
 *
 * Usage:
 *   node src/scripts/migrate-uploads-to-s3.js            # do it
 *   node src/scripts/migrate-uploads-to-s3.js --dry-run   # list what would happen, no changes
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const s3   = require('../services/s3Service');

const DRY_RUN = process.argv.includes('--dry-run');

const FOLDERS = [
  { dir: path.join(__dirname, '../../uploads/visitor-photos'), prefix: 'visitor-photos', column: 'photo_url' },
  { dir: path.join(__dirname, '../../uploads/business-cards'), prefix: 'business-cards', column: 'business_card_photo_url' },
];

function contentTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
}

async function migrateFolder({ dir, prefix, column }) {
  if (!fs.existsSync(dir)) {
    console.log(`[skip] ${dir} does not exist`);
    return { uploaded: 0, updated: 0 };
  }

  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  console.log(`\n[${prefix}] ${files.length} file(s) found in ${dir}`);

  const { Visitor } = require('../models');
  let uploaded = 0;
  let updated  = 0;

  for (const filename of files) {
    const key = `${prefix}/${filename}`;
    const localPath = `/uploads/${prefix}/${filename}`;

    if (DRY_RUN) {
      console.log(`  would upload: ${filename} -> key=${key} (bucket: ${process.env.AWS_S3_BUCKET})`);
    } else {
      const buf = fs.readFileSync(path.join(dir, filename));
      const storedKey = await s3.uploadBuffer(key, buf, contentTypeFor(filename)); // returns the S3 key (private bucket; signed on read)
      uploaded++;

      const [count] = await Visitor.update(
        { [column]: storedKey },
        { where: { [column]: localPath } }
      );
      if (count > 0) updated += count;
      console.log(`  uploaded: ${filename} -> key=${storedKey} (${count} row(s) updated)`);
    }
  }

  return { uploaded, updated };
}

async function main() {
  if (!s3.ENABLED) {
    console.error('AWS_S3_BUCKET / AWS_REGION not set — aborting.');
    process.exit(1);
  }

  console.log(DRY_RUN ? 'DRY RUN — no uploads or DB writes will happen\n' : 'Starting migration to S3...\n');

  let totalUploaded = 0;
  let totalUpdated  = 0;
  for (const folder of FOLDERS) {
    const { uploaded, updated } = await migrateFolder(folder);
    totalUploaded += uploaded;
    totalUpdated  += updated;
  }

  console.log(`\nDone. Uploaded ${totalUploaded} file(s), updated ${totalUpdated} DB row(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
