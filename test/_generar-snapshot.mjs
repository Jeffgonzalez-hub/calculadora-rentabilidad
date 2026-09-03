// Regenera el snapshot de regresión a propósito:  node test/_generar-snapshot.mjs
import { writeFileSync } from 'node:fs';
import { analizar } from '../src/index.js';
import { ENTRADA_SNAPSHOT, redondearProfundo } from './identidades.snapshot-util.mjs';

const r = analizar(ENTRADA_SNAPSHOT, { conEscenarios: false });
writeFileSync(new URL('./fixtures/snapshot-defaults-html.json', import.meta.url), JSON.stringify(redondearProfundo(r, 2), null, 2) + '\n');
console.log('snapshot regenerado');
