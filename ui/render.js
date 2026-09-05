// ui/render.js
/** vista/hero -> DOM. Sin aritmética: todo llega listo desde el adapter. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cbCta = null;
export function alPulsarCta(cb) { cbCta = cb; }
let cbComboDesglose = null;
export function alCambiarComboDesglose(cb) { cbComboDesglose = cb; }
let avisosAbiertos = false;

/** Construye una sola vez el esqueleto persistente (el nodo del precio no se recrea nunca). */
export function montarResultado() {
  $('bloque-hero').innerHTML = `
    <article class="hero" data-acento="neutro">
      <div class="hero-chips" aria-hidden="false"></div>
      <p class="hero-label">PRECIO RECOMENDADO</p>
      <p id="precio-recomendado" class="hero-precio" aria-live="polite">—</p>
      <p class="hero-titulo" hidden></p>
      <p class="hero-margen"></p>
      <p class="hero-utilidad"></p>
      <div class="hero-warn" hidden></div>
      <p class="hero-confianza"></p>
      <button type="button" class="hero-cta" hidden></button>
    </article>
    <section class="por-que">
      <h3>¿Por qué este precio?</h3>
      <p class="por-que-txt"></p>
      <button type="button" class="ver-desglose" aria-expanded="false" aria-controls="acc-desglose">Ver el desglose completo →</button>
    </section>`;

  $('bloque-secundario').innerHTML = `
    <details class="acc" id="acc-piso"><summary>Precio mínimo operativo</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-desglose"><summary>De dónde sale el precio</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-combos"><summary>Combos por cantidad</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-equilibrio"><summary>Tus límites (punto de equilibrio)</summary><div class="acc-cuerpo"></div></details>
    <details class="acc" id="acc-proyeccion"><summary>Proyección con este presupuesto</summary><div class="acc-cuerpo"></div></details>`;

  $('bloque-hero').querySelector('.hero-cta').addEventListener('click', () => {
    const btn = $('bloque-hero').querySelector('.hero-cta');
    if (cbCta && btn.dataset.destino) cbCta(btn.dataset.destino, btn.dataset.clave || null);
  });
  const verDesglose = $('bloque-hero').querySelector('.ver-desglose');
  verDesglose.addEventListener('click', () => {
    const acc = $('acc-desglose');
    acc.open = true;
    verDesglose.setAttribute('aria-expanded', 'true');
    acc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

export function pintarHero(h) {
  const hero = $('bloque-hero').querySelector('.hero');
  hero.dataset.acento = h.acento;

  const precioNodo = $('precio-recomendado');
  const titulo = hero.querySelector('.hero-titulo');
  const label = hero.querySelector('.hero-label');
  if (h.muestraPrecio) {
    precioNodo.hidden = false;
    precioNodo.textContent = h.precio;   // <- se actualiza en el sitio, no se recrea
    label.hidden = false;
    titulo.hidden = true;
  } else {
    precioNodo.hidden = true;
    label.hidden = true;
    titulo.hidden = false;
    titulo.textContent = h.titulo;
  }

  hero.querySelector('.hero-chips').innerHTML = h.chips
    .map((c) => `<span class="chip chip-${c.tono}">${esc(c.texto)}</span>`).join('');
  hero.querySelector('.hero-margen').textContent = h.lineaMargen;
  hero.querySelector('.hero-utilidad').textContent = h.lineaUtilidad;

  const warn = hero.querySelector('.hero-warn');
  warn.hidden = !h.advertencia;
  warn.textContent = h.advertencia || '';

  hero.querySelector('.hero-confianza').textContent = h.confianza;

  const cta = hero.querySelector('.hero-cta');
  if (h.cta) {
    cta.hidden = false;
    cta.textContent = h.cta.texto;
    cta.dataset.destino = h.cta.destino;
    if (h.cta.clave) cta.dataset.clave = h.cta.clave; else delete cta.dataset.clave;
  } else {
    cta.hidden = true;
  }

  $('bloque-hero').querySelector('.por-que-txt').textContent = h.porQue;

  const pisoCuerpo = $('acc-piso').querySelector('.acc-cuerpo');
  pisoCuerpo.innerHTML = h.precioMinimoOperativo
    ? `<p class="nota"><strong>${esc(h.precioMinimoOperativo)}</strong> — cubre logística y el colchón de devoluciones, sin utilidad ni publicidad. Es tu piso: nunca ofrezcas un descuento por debajo de esta línea.</p>`
    : `<p class="nota">Necesita el costo del proveedor y el flete de ida para calcularse.</p>`;
}

function pintarDesglose(v) {
  const d = v.desglose;
  $('acc-desglose').querySelector('.acc-cuerpo').innerHTML = `
    <label class="combo-sel-wrap">combo:
      <select class="combo-sel" aria-label="Combo del desglose">
        ${[1, 2, 3].map((n) => `<option value="${n}"${n === d.comboN ? ' selected' : ''}>${n}u</option>`).join('')}
      </select>
    </label>
    <div class="mono">${esc(d.precio)} =</div>
    <div class="barra${d.clase ? ' ' + d.clase : ''}">${d.partes.map((p) => `<span class="${p.clase}" style="width:${p.anchoPct}%" title="${esc(p.label)} ${esc(p.monto)}"></span>`).join('')}</div>
    <div class="leyenda">${d.partes.map((p) => `<span><span class="dot ${p.clase}"></span>${esc(p.label)} <span class="mono">${esc(p.monto)}</span></span>`).join('')}</div>
    <p class="nota" style="margin-top:12px">— aparte — CAC <span class="mono">${esc(d.cac)}</span>. ${esc(d.notaCac)}</p>`;
  const sel = $('acc-desglose').querySelector('.combo-sel');
  if (sel) sel.addEventListener('change', () => cbComboDesglose && cbComboDesglose(Number(sel.value)));
}

function pintarCombos(v) {
  $('acc-combos').querySelector('.acc-cuerpo').innerHTML = `
    <table class="tabla-combos">
      <thead><tr><th>Unidades</th><th class="num">Precio</th><th class="num">Precio / unidad</th><th class="num">Margen</th></tr></thead>
      <tbody>${v.combos.map((c) => `
        <tr${c.esMejor ? ' class="mejor"' : ''}>
          <td>${c.n}${c.esMejor ? ' <span class="mini-badge">mejor</span>' : ''}</td>
          <td class="num">${esc(c.precio)}</td>
          <td class="num">${esc(c.precioUnidad ?? '—')}</td>
          <td class="num">${esc(c.margenNeto)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

function pintarEquilibrio(v) {
  $('acc-equilibrio').querySelector('.acc-cuerpo').innerHTML = `
    <div class="card">${v.equilibrio.map((f) => `
      <div class="eq-fila ${f.clase} ${f.alcanzable ? '' : 'no-alcanzable'}">
        <span>${esc(f.label)}</span>
        <span class="lim">${esc(f.limite)}</span>
        <span class="act">${esc(f.actualLabel)} ${esc(f.actual)}</span>
        <span class="eq-holgura"><span style="width:${f.holguraPct}%"></span></span>
      </div>`).join('')}</div>`;
}

function pintarProyeccion(v) {
  const p = v.proyeccion;
  $('acc-proyeccion').querySelector('.acc-cuerpo').innerHTML = `
    <div class="card proy">
      <div><div class="k">Pedidos/día</div><div class="v">${esc(p.pedidosDia)}</div></div>
      <div><div class="k">Ventas entregadas/día</div><div class="v">${esc(p.ventasEntregadasDia)}</div></div>
      <div><div class="k">Utilidad/día</div><div class="v">${esc(p.utilidadDia)}</div></div>
      <div><div class="k">Utilidad/mes</div><div class="v">${esc(p.utilidadMes)}</div></div>
      <p class="nota">${esc(p.nota)}</p>
    </div>`;
}

export function pintarSecundario(vista) {
  pintarDesglose(vista);
  pintarCombos(vista);
  pintarEquilibrio(vista);
  pintarProyeccion(vista);
}
