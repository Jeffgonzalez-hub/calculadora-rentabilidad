// Regenera el snapshot de regresión a propósito:
//   npm run snapshot     (o  node scripts/generar-snapshot.mjs)
// Vive fuera de test/ a propósito: así `node --test` NO lo ejecuta y el
// snapshot test de test/identidades.test.js es un guard real, no auto-satisfecho.
import { writeFileSync } from 'node:fs';
import { analizar } from '../src/index.js';
import { ENTRADA_SNAPSHOT, redondearProfundo } from '../test/identidades.snapshot-util.mjs';

const destino = new URL('../test/fixtures/snapshot-defaults-html.json', import.meta.url);
const r = analizar(ENTRADA_SNAPSHOT, { conEscenarios: false });
writeFileSync(destino, JSON.stringify(redondearProfundo(r, 2), null, 2) + '\n');
console.log('snapshot regenerado:', destino.pathname);
