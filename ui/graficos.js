/** Los 3 visuales de escenarios. Recibe coords 0–100; solo dibuja SVG. */
const NS = 'http://www.w3.org/2000/svg';
const el = (n, attrs = {}, txt) => {
  const e = document.createElementNS(NS, n);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (txt != null) e.textContent = txt;
  return e;
};

function svgSensibilidad(v) {
  const s = el('svg', { viewBox: '0 0 100 60', class: 'g-sens' });
  s.append(el('line', { x1: 0, y1: v.ejeY.ceroPct * 0.6, x2: 100, y2: v.ejeY.ceroPct * 0.6, stroke: 'var(--borde)', 'stroke-width': 0.5 }));
  const pts = v.puntos.map((p) => `${p.xPct},${p.yPct * 0.6}`).join(' ');
  s.append(el('polyline', { points: pts, fill: 'none', stroke: 'var(--acento)', 'stroke-width': 1.5 }));
  if (v.cruceXPct != null) {
    s.append(el('circle', { cx: v.cruceXPct, cy: v.ejeY.ceroPct * 0.6, r: 1.8, fill: 'var(--mal)' }));
  }
  return s;
}

function svgTornado(filas) {
  const h = filas.length * 16 + 6;
  const s = el('svg', { viewBox: `0 0 100 ${h}`, class: 'g-tornado' });
  s.append(el('line', { x1: 50, y1: 0, x2: 50, y2: h, stroke: 'var(--borde)', 'stroke-width': 0.5 }));
  filas.forEach((f, i) => {
    const y = i * 16 + 3;
    const cAb = f.dirAbajo === 'neg' ? 'var(--mal)' : 'var(--ok)';
    const cAr = f.dirArriba === 'neg' ? 'var(--mal)' : 'var(--ok)';
    s.append(el('rect', { x: 50 - f.abajoPct / 2, y, width: f.abajoPct / 2, height: 9, fill: cAb }));
    s.append(el('rect', { x: 50, y, width: f.arribaPct / 2, height: 9, fill: cAr }));
    s.append(el('text', { x: 1, y: y + 7, 'font-size': 5, fill: 'var(--tinta-suave)' }, f.label));
  });
  return s;
}

function svgMatriz(m) {
  const s = el('svg', { viewBox: '0 0 100 100', class: 'g-matriz' });
  const paso = 20;
  m.celdas.forEach((fila, i) => fila.forEach((c, j) => {
    s.append(el('rect', {
      x: j * paso, y: i * paso, width: paso, height: paso,
      class: `cel ${c.clase} ${c.actual ? 'actual' : ''}`,
    }));
    s.append(el('text', { x: j * paso + paso / 2, y: i * paso + paso / 2 + 2, 'font-size': 4, 'text-anchor': 'middle', fill: 'var(--tinta)' }, c.valor));
  }));
  return s;
}

export function montarEscenarios(contenedor) {
  contenedor.innerHTML = `
    <h2>Escenarios</h2>
    <div class="card">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-p="sens">Sensibilidad</button>
        <button role="tab" aria-selected="false" data-p="torn">Tornado</button>
        <button role="tab" aria-selected="false" data-p="mat">Matriz</button>
      </div>
      <div class="panel-sens sens-grid"></div>
      <div class="panel-torn tornado" hidden></div>
      <div class="panel-mat matriz" hidden></div>
      <p class="estado-esc rail-sub"></p>
    </div>`;
  const tabs = [...contenedor.querySelectorAll('[role=tab]')];
  const paneles = {
    sens: contenedor.querySelector('.panel-sens'),
    torn: contenedor.querySelector('.panel-torn'),
    mat: contenedor.querySelector('.panel-mat'),
  };
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    for (const [k, p] of Object.entries(paneles)) p.hidden = k !== t.dataset.p;
  }));

  function pintar(ve) {
    contenedor.querySelector('.estado-esc').textContent = '';
    paneles.sens.innerHTML = '';
    for (const v of ve.sensibilidad.variables) {
      const cel = document.createElement('div');
      cel.className = 'sens-cel';
      cel.innerHTML = `<h4>${v.label}</h4>`;
      cel.append(svgSensibilidad(v));
      const eje = document.createElement('div');
      eje.className = 'rail-sub';
      eje.textContent = '−50 %      0      +50 %';
      cel.append(eje);
      paneles.sens.append(cel);
    }
    paneles.torn.innerHTML = '';
    paneles.torn.append(svgTornado(ve.tornado));
    paneles.mat.innerHTML = '';
    paneles.mat.append(svgMatriz(ve.matriz));
  }
  function marcarDesactualizado() {
    contenedor.querySelector('.estado-esc').textContent = 'recalculando…';
  }
  return { pintar, marcarDesactualizado };
}
