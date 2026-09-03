/** vista → DOM de los bloques 1–5. Sin aritmética: todo llega listo en la vista. */

const $ = (id) => document.getElementById(id);
// escape defensivo: en Fase 3 el adapter va a leer nombres de producto del catálogo hacia
// `title`/avisos. Hoy todo `mensaje`/`label` es constante de src/, pero lo dejamos cableado.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cbEditarPrecio = null;
export function alEditarPrecioCombo(cb) { cbEditarPrecio = cb; }
let cbComboDesglose = null;
export function alCambiarComboDesglose(cb) { cbComboDesglose = cb; }
// se preserva entre repaints: sin esto la lista de avisos se colapsa ~120 ms tras cada tecla.
let avisosAbiertos = false;

function pintarVeredicto(v) {
  const b = $('bloque-veredicto');
  const r = v.veredicto;
  const hayAvisos = v.avisos.length > 0;
  const abierto = avisosAbiertos && hayAvisos;
  b.innerHTML = `
    <h2>Veredicto</h2>
    <div class="veredicto ${r.clase}">
      <div class="k">¿Es rentable?</div>
      <div class="grande" aria-live="polite">${r.titulo}</div>
      <ul>${r.lineas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="avisos-linea">
        ⚠ ${v.resumenAvisos.avisos} aviso(s) · 🔴 ${v.resumenAvisos.errores} error(es)
        ${hayAvisos ? `<button type="button" class="ver-avisos" aria-expanded="${abierto}">${abierto ? 'ocultar ▴' : 'ver ▾'}</button>` : ''}
      </div>
      <ul class="lista-avisos"${abierto ? '' : ' hidden'}>${v.avisos.map((a) => `<li class="${a.clase}">${esc(a.mensaje)}</li>`).join('')}</ul>
    </div>`;
  const btn = b.querySelector('.ver-avisos');
  if (btn) btn.addEventListener('click', () => {
    const ul = b.querySelector('.lista-avisos');
    const abrir = ul.hidden;
    ul.hidden = !abrir;
    avisosAbiertos = abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    btn.textContent = abrir ? 'ocultar ▴' : 'ver ▾';
  });
}

function pintarCombos(v) {
  const b = $('bloque-combos');
  b.innerHTML = `<h2>Combos</h2><div class="combos">${v.combos.map((c) => `
    <article class="combo ${c.esMejor ? 'mejor' : ''}">
      ${c.esMejor ? '<span class="badge">★ mejor</span>' : ''}
      ${c.editable
        ? `<input class="precio-input num" data-n="${c.n}" value="${c.precioRaw}" inputmode="decimal" aria-label="Precio ${c.titulo}">`
        : `<div class="precio">${c.precio}</div>`}
      <div class="sug">${c.editable ? `sugerido ${c.precioSugerido}` : (c.esSugerido ? 'sugerido' : 'de la escalera')}</div>
      <dl>
        <dt>gana/venta</dt><dd>${c.gana}</dd>
        <dt>margen</dt><dd>${c.margenNeto}</dd>
        <dt>markup</dt><dd>${c.markup}</dd>
        <dt>CAC</dt><dd>${c.cac}</dd>
        <dt>desc. máx</dt><dd>${c.descuentoMax}</dd>
      </dl>
      <div class="gauge ${c.semaforo.clase}"><span style="width:${c.semaforo.anchoPct}%"></span></div>
      <div class="sug">${c.semaforo.etiqueta}</div>
    </article>`).join('')}</div>`;
  for (const inp of b.querySelectorAll('.precio-input')) {
    inp.addEventListener('input', () => cbEditarPrecio && cbEditarPrecio(Number(inp.dataset.n), inp.value));
  }
}

function pintarDesglose(v) {
  const d = v.desglose;
  const b = $('bloque-desglose');
  b.innerHTML = `
    <h2>De dónde sale el precio</h2>
    <div class="card">
      <label class="combo-sel-wrap">combo:
        <select class="combo-sel" aria-label="Combo del desglose">
          ${[1, 2, 3].map((n) => `<option value="${n}"${n === d.comboN ? ' selected' : ''}>${n}u</option>`).join('')}
        </select>
      </label>
      <div class="mono">${d.precio} =</div>
      <div class="barra${d.clase ? ' ' + d.clase : ''}">${d.partes.map((p) => `<span class="${p.clase}" style="width:${p.anchoPct}%" title="${esc(p.label)} ${p.monto}"></span>`).join('')}</div>
      <div class="leyenda">${d.partes.map((p) => `<span><span class="dot ${p.clase}" style="background:var(--${p.clase})"></span>${esc(p.label)} <span class="mono">${p.monto}</span></span>`).join('')}</div>
      <p class="rail-sub" style="margin-top:12px">— aparte — CAC <span class="mono">${d.cac}</span>. ${d.notaCac}</p>
    </div>`;
  const sel = b.querySelector('.combo-sel');
  if (sel) sel.addEventListener('change', () => cbComboDesglose && cbComboDesglose(Number(sel.value)));
}

function pintarEquilibrio(v) {
  $('bloque-equilibrio').innerHTML = `
    <h2>Tus límites (punto de equilibrio)</h2>
    <div class="card">${v.equilibrio.map((f) => `
      <div class="eq-fila ${f.clase} ${f.alcanzable ? '' : 'no-alcanzable'}">
        <span>${f.label}</span>
        <span class="lim">${f.limite}</span>
        <span class="act">${f.actualLabel} ${f.actual}</span>
        <span class="eq-holgura"><span style="width:${f.holguraPct}%"></span></span>
      </div>`).join('')}</div>`;
}

function pintarProyeccion(v) {
  const p = v.proyeccion;
  $('bloque-proyeccion').innerHTML = `
    <h2>Proyección (con este presupuesto)</h2>
    <div class="card proy">
      <div><div class="k">Pedidos/día</div><div class="v">${p.pedidosDia}</div></div>
      <div><div class="k">Ventas entregadas/día</div><div class="v">${p.ventasEntregadasDia}</div></div>
      <div><div class="k">Utilidad/día</div><div class="v">${p.utilidadDia}</div></div>
      <div><div class="k">Utilidad/mes</div><div class="v">${p.utilidadMes}</div></div>
      <p class="nota">${p.nota}</p>
    </div>`;
}

export function pintar(vista) {
  // guardar el input de precio con foco para restaurarlo tras el re-render (no perder el cursor al tipear)
  const act = document.activeElement;
  const focoId = act && act.dataset && act.classList && act.classList.contains('precio-input')
    ? act.dataset.n : null;
  pintarVeredicto(vista);
  pintarCombos(vista);
  pintarDesglose(vista);
  pintarEquilibrio(vista);
  pintarProyeccion(vista);
  if (focoId) {
    const nuevo = document.querySelector(`.precio-input[data-n="${focoId}"]`);
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
  }
}
