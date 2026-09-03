import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url)) + '/..';
const leer = (p) => readFileSync(join(raiz, p), 'utf8');
// walk recursivo: si src/ crece con subcarpetas, la guarda las cubre igual.
const jsDe = (dir) => {
  const out = [];
  for (const ent of readdirSync(join(raiz, dir), { withFileTypes: true })) {
    const rel = `${dir}/${ent.name}`;
    if (ent.isDirectory()) out.push(...jsDe(rel));
    else if (ent.name.endsWith('.js')) out.push(rel);
  }
  return out;
};

test('src/** no menciona ui/, document, window, localStorage', () => {
  for (const f of jsDe('src')) {
    const txt = leer(f);
    for (const prohibido of ['ui/', 'document', 'window', 'localStorage']) {
      assert.ok(!txt.includes(prohibido), `${f} menciona "${prohibido}"`);
    }
  }
});

test('ui/adapter.js y ui/formato.js son puros (sin DOM/red)', () => {
  for (const f of ['ui/adapter.js', 'ui/formato.js']) {
    const txt = leer(f);
    for (const prohibido of ['document', 'window', 'localStorage', 'fetch(']) {
      assert.ok(!txt.includes(prohibido), `${f} menciona "${prohibido}"`);
    }
  }
});

test('ui/render.js, ui/graficos.js y ui/formulario.js NO importan del motor', () => {
  for (const f of ['ui/render.js', 'ui/graficos.js', 'ui/formulario.js']) {
    const txt = leer(f);
    assert.ok(!/from ['"]\.\.\/src\//.test(txt), `${f} importa de ../src/`);
  }
});

test('ui/app.js solo importa lógica vía ./adapter.js (no ../src/ directo)', () => {
  const txt = leer('ui/app.js');
  assert.ok(!/from ['"]\.\.\/src\//.test(txt), 'ui/app.js importa de ../src/ directo');
});
