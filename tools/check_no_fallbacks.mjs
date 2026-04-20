import process from 'node:process';
import { checkMoleculeGuardrails } from './check_molecule_guardrails.mjs';

const parseTargets = (argv) => {
    const index = argv.indexOf('--paths');
    if (index < 0 || !argv[index + 1]) return undefined;
    return argv[index + 1].split(',').map((item) => item.trim()).filter(Boolean);
};

const main = () => {
    const targets = parseTargets(process.argv);
    const result = checkMoleculeGuardrails(targets ? { targets } : undefined);
    if (!result.ok) {
        console.error(`check_no_fallbacks failed with ${result.violations.length} violation(s):`);
        for (const violation of result.violations.slice(0, 80)) {
            console.error(`- [${violation.code}] ${violation.file}`);
            console.error(`  ${violation.message}`);
            console.error(`  ${violation.excerpt}`);
        }
        process.exit(1);
    }
    console.log(`check_no_fallbacks OK (${result.scanned_files.length} file(s))`);
};

main();