import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Convention de tests du repo:
// - Tous les tests persistants vivent sous ./tests (plus aucun *.test.mjs
//   colocalise dans un dossier source: atome/src, eVe, server, database).
// - Les suites vitest sont listees explicitement dans tests/vitest.manifest.json.
// - Tout autre fichier *.test.mjs sous ./tests est un script node autonome
//   (probe, garde, contrat) execute via `node <fichier>` ou un script npm
//   dedie; vitest ne doit jamais les ramasser.
// La garde tests/governance/vitest_manifest_guard.test.mjs maintient le
// manifest exact dans les deux sens (suite manquante ou entree perimee) et
// bloque toute suite vitest reintroduite hors manifest.
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
