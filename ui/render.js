/** vista → DOM de los bloques 1–5. Sin aritmética: todo llega listo en la vista. */

const $ = (id) => document.getElementById(id);
let cbEditarPrecio = null;
export function alEditarPrecioCombo(cb) { cbEditarPrecio = cb; }

function pintarVeredicto(v) {
  const b = $('bloque-veredicto');
  const r = v.veredicto;
  b.innerHTML = `
    <h2>Veredicto</h2>
    <div class="veredicto ${r.clase}">
      <div class="k">¿Es rentable?</div>
      <div class="grande">${r.titulo}</div>
      <ul>${r.lineas.map((l) => `<li>${l}</li>`).join('')}</ul>
      <div class="avisos-linea">
        ⚠ ${v.resumenAvisos.avisos} aviso(s) · 🔴 ${v.resumenAvisos.errores} error(es)
        ${v.avisos.length ? '<button type="button" class="ver-avisos" aria-expanded="false">ver ▾</button>' : ''}
      </div>
      <ul class="lista-avisos" hidden>${v.avisos.map((a) => `<li class="${a.clase}">${a.mensaje}</li>`).join('')}</ul>
    </div>`;
  const btn = b.querySelector('.ver-avisos');
  if (btn) btn.addEventListener('click', () => {
    const ul = b.querySelector('.lista-avisos');
    const abierto = !ul.hidden;
    ul.hidden = abierto;
    btn.setAttribute('aria-expanded', String(!abierto));
    btn.textContent = abierto ? 'ver ▾' : 'ocultar ▴';
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
  $('bloque-desglose').innerHTML = `
    <h2>De dónde sale el precio</h2>
    <div class="card">
      <div class="mono">${d.precio} =</div>
      <div class="barra">${d.partes.map((p) => `<span class="${p.clase}" style="width:${p.anchoPct}%" title="${p.label} ${p.monto}"></span>`).join('')}</div>
      <div class="leyenda">${d.partes.map((p) => `<span><span class="dot ${p.clase}" style="background:var(--${p.clase})"></span>${p.label} <span class="mono">${p.monto}</span></span>`).join('')}</div>
      <p class="rail-sub" style="margin-top:12px">— aparte — CAC <span class="mono">${d.cac}</span>. ${d.notaCac}</p>
    </div>`;
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
  pintarVeredicto(vista);
  pintarCombos(vista);
  pintarDesglose(vista);
  pintarEquilibrio(vista);
  pintarProyeccion(vista);
}
