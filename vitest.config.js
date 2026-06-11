import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Convention de tests du repo:
// - Les suites vitest sont listées explicitement dans tests/vitest.manifest.json.
// - Tout autre fichier *.test.mjs est un script node autonome (probe, garde,
//   contrat) exécuté via `node <fichier>` ou un script npm dédié; vitest ne
//   doit jamais les ramasser.
// La garde tests/governance/vitest_manifest_guard.test.mjs maintient le
// manifest exact dans les deux sens (suite manquante ou entrée périmée).
const manifest = JSON.parse(
    readFileSync(new URL('./tests/vitest.manifest.json', import.meta.url), 'utf8')
);

export default defineConfig({
    test: {
        include: manifest,
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            'platforms/**',
            'temp/**',
            'done/**',
            'todo/**',
            'Failed/**',
            'logs/**',
            'database_storage/**',
            'atome/renderers/**',
            '**/build/**',
            '**/target/**'
        ]
    }
});
