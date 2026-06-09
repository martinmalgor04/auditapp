import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'build'), { recursive: true });

const externals = ['postgres', '@node-rs/argon2', 'csv-parse'];

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  external: externals
};

await esbuild.build({
  ...common,
  entryPoints: [resolve(root, 'src/lib/server/db/client.ts')],
  outfile: resolve(root, 'build/migrate-deps.js')
});

await esbuild.build({
  ...common,
  entryPoints: [resolve(root, 'src/lib/server/db/migrate.ts')],
  outfile: resolve(root, 'build/migrate.js')
});

await esbuild.build({
  ...common,
  entryPoints: [resolve(root, 'src/lib/server/db/seed/index.ts')],
  outfile: resolve(root, 'build/seed.js')
});
