// ui/perfil-pantalla.js
/** Pantalla "Perfil económico": filas agrupadas, barra de confianza, prioridades. Sin fórmulas. */

const GRUPOS = [
  { titulo: 'Logística', claves: ['fleteIda', 'fleteDevolucion', 'feeDevolucion', 'pctProductoPerdidoEnDevolucion', 'empaquePorPedido'] },
  { titulo: 'Mercado', claves: ['tasaEntrega', 'tasaCierre'] },
  { titulo: 'Adquisición', claves: ['costoConversacion', 'costoAtencionConversacion'] },
  { titulo: 'Pasarela COD', claves: ['comisionRecaudoPct', 'comisionRecaudoFijo'] },
  { titulo: 'Overhead — no cambia el precio, solo tu panel de rentabilidad', claves: ['costosFijosMes', 'diasOperacionMes'] },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ES_PCT = new Set(['tasaEntrega', 'tasaCierre', 'pctProductoPerdidoEnDevolucion', 'comisionRecaudoPct']);

export function montarPerfilPantalla(contenedor, { alCambiarCampo, alGuardar, alRestablecer, alCerrar }) {
  contenedor.classList.add('perfil-pantalla');
  contenedor.hidden = true;
  let disparador = null;

  contenedor.innerHTML = `
    <div class="perfil-caja" role="dialog" aria-modal="true" aria-labelledby="perfil-h">
      <header class="perfil-head">
        <h2 id="perfil-h">Perfil económico</h2>
        <button type="button" class="perfil-cerrar" aria-label="Cerrar">✕</button>
      </header>
      <p class="perfil-intro">Cada dato real que agregues acerca tu precio a un número garantizado. Nada de esto bloquea tu operación — solo te dice, en cada venta, qué tan firme es el número que estás usando.</p>
      <div class="perfil-confianza"></div>
      <section class="perfil-prioridades"></section>
      <div class="perfil-grupos"></div>
      <footer class="perfil-acciones">
        <button type="button" class="btn btn-sec perfil-restablecer">Restablecer supuestos JDSMPlus</button>
        <button type="button" class="btn btn-pri perfil-guardar">Guardar perfil</button>
      </footer>
    </div>`;

  const q = (s) => contenedor.querySelector(s);
  q('.perfil-cerrar').addEventListener('click', () => { cerrar(); alCerrar?.(); });
  q('.perfil-guardar').addEventListener('click', () => alGuardar?.());
  q('.perfil-restablecer').addEventListener('click', () => alRestablecer?.());
  contenedor.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrar(); alCerrar?.(); } });

  function filaHtml(f) {
    const inputAttrs = ES_PCT.has(f.clave) ? 'inputmode="decimal"' : 'inputmode="decimal"';
    return `
      <div class="perfil-fila" data-clave="${f.clave}">
        <div class="perfil-fila-lbl">
          <span>${esc(f.titulo)}</span>
          <button type="button" class="perfil-info" aria-label="Qué es ${esc(f.titulo)}" data-ayuda="${esc(f.ayuda)}">ⓘ</button>
        </div>
        <span class="caja ${ES_PCT.has(f.clave) ? 'porcentaje' : 'moneda'}">
          <input type="text" ${inputAttrs} value="${f.estado === 'FALTANTE' ? '' : esc(f.valorTexto.replace(/[^\d.,]/g, ''))}"
            placeholder="${f.estado === 'FALTANTE' ? '— sin dato —' : ''}" aria-label="${esc(f.titulo)}">
        </span>
        <span class="perfil-estado" role="group" aria-label="Estado del dato">
          <button type="button" class="badge badge-real" data-estado="REAL" aria-pressed="${f.estado === 'REAL'}">● real</button>
          <button type="button" class="badge badge-supuesto" data-estado="SUPUESTO" aria-pressed="${f.estado === 'SUPUESTO'}">~ supuesto</button>
          <span class="badge badge-faltante" ${f.estado === 'FALTANTE' ? '' : 'hidden'}>! falta</span>
        </span>
      </div>`;
  }

  function pintar(v) {
    q('.perfil-confianza').innerHTML = `
      <div class="conf-num">${v.confianza.real}% real</div>
      <div class="conf-barra" role="img" aria-label="${v.confianza.real} reales, ${v.confianza.supuesto} supuestos, ${v.confianza.falta} faltantes de ${v.confianza.real + v.confianza.supuesto + v.confianza.falta}">
        <i class="c-real" style="flex:${v.confianza.real}"></i>
        <i class="c-sup" style="flex:${v.confianza.supuesto}"></i>
        <i class="c-fal" style="flex:${v.confianza.falta}"></i>
      </div>
      <div class="conf-leyenda">${v.confianza.real} real · ${v.confianza.supuesto} supuesto · ${v.confianza.falta} falta · 1 config (margen objetivo)</div>`;

    q('.perfil-prioridades').innerHTML = v.prioridades.length ? `
      <h3>Esto es lo que más cambiaría tu precio</h3>
      <ul>${v.prioridades.map((p) => `
        <li data-clave="${p.clave}">
          <span class="badge badge-faltante">! falta</span>
          <span class="pr-lbl">${esc(p.titulo)}</span>
          <span class="pr-impacto ${p.impacto === 'precio' ? 'imp-alto' : 'imp-bajo'}">${p.impacto === 'precio' ? 'cambia tu precio' : 'no cambia el precio'}</span>
        </li>`).join('')}</ul>` : '';

    q('.perfil-grupos').innerHTML = GRUPOS.map((g) => `
      <section class="perfil-grupo">
        <h4>${esc(g.titulo)}</h4>
        ${g.claves.map((k) => filaHtml(v.filas.find((f) => f.clave === k))).join('')}
      </section>`).join('');

    for (const li of contenedor.querySelectorAll('.perfil-prioridades li')) {
      li.addEventListener('click', () => enfocarClave(li.dataset.clave));
    }
    for (const fila of contenedor.querySelectorAll('.perfil-fila')) {
      const clave = fila.dataset.clave;
      const input = fila.querySelector('input');
      const botones = fila.querySelectorAll('.perfil-estado button');
      const emitir = () => {
        const txt = input.value.trim();
        const valorNum = txt === '' ? null : Number(txt.replace(',', '.'));
        const estado = txt === '' ? 'FALTANTE'
          : (fila.querySelector('.perfil-estado button[aria-pressed="true"]')?.dataset.estado ?? 'SUPUESTO');
        const valor = valorNum == null || !Number.isFinite(valorNum) ? null
          : (ES_PCT.has(clave) ? valorNum / 100 : valorNum);
        alCambiarCampo?.(clave, { valor, estado });
      };
      input.addEventListener('input', () => {
        if (input.value.trim() !== '' && !fila.querySelector('.perfil-estado button[aria-pressed="true"]')) {
          botones[1].setAttribute('aria-pressed', 'true'); // por defecto: supuesto
        }
        emitir();
      });
      for (const b of botones) {
        b.addEventListener('click', () => {
          for (const x of botones) x.setAttribute('aria-pressed', String(x === b));
          emitir();
        });
      }
    }
    for (const b of contenedor.querySelectorAll('.perfil-info')) {
      b.addEventListener('click', () => alert(b.dataset.ayuda)); // V2: tooltip simple; suficiente y accesible por teclado
    }
  }

  function abrir(desde) {
    disparador = desde ?? null;
    contenedor.hidden = false;
    contenedor.querySelector('.perfil-cerrar').focus();
  }
  function cerrar() {
    contenedor.hidden = true;
    disparador?.focus?.();
  }
  function enfocarClave(clave) {
    const fila = contenedor.querySelector(`.perfil-fila[data-clave="${clave}"]`);
    if (!fila) return;
    fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
    fila.querySelector('input')?.focus();
  }

  return { pintar, abrir, cerrar, enfocarClave };
}
