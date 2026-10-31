#!/usr/bin/env node

/**
 * CLI Command: npm run avatars:sync
 *
 * Downloads all custom and replacement avatars from Supabase Storage into
 * public/avatars/optimized/, updates database paths to local paths,
 * regenerates avatar manifests, and purges Supabase Storage.
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("==================================================================");
console.log("STUDYROOM — AVATAR CLOUD-TO-LOCAL SYNCHRONIZER");
console.log("==================================================================\n");

try {
  // Execute via tsx to run our TypeScript sync engine directly
  execSync(`npx tsx -e "
    import { syncAvatarsFromCloud } from './lib/avatars/avatarSyncEngine.ts';
    async function main() {
      console.log('🔄 Connecting to Supabase and checking cloud-stored avatars...');
      const res = await syncAvatarsFromCloud();
      console.log('\\n✅ Sync complete!');
      console.log('  • Synced to local:', res.syncedCount, 'avatars');
      console.log('  • Storage objects cleaned:', res.cleanedStorageObjects.length);
      console.log('  • Supabase storage freed:', (res.freedBytes / 1024).toFixed(1), 'KB');
      console.log('  • Manifest files updated: public/avatars/manifest.json & lib/avatars/manifest.ts');
      if (res.syncedAvatars.length > 0) {
        console.log('\\nSynced files:');
        for (const a of res.syncedAvatars) {
          console.log('    ✓', a.id, '->', a.localPath, '(' + (a.sizeBytes / 1024).toFixed(1) + ' KB)');
        }
      }
    }
    main().catch(err => {
      console.error('❌ Sync failed:', err.message);
      process.exit(1);
    });
  "`, {
    cwd: rootDir,
    stdio: "inherit",
  });
} catch (err) {
  process.exit(1);
}
