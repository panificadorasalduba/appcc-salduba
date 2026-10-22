// Montaje: lo que sale del obrador a cada tienda cada día (trazabilidad hacia delante).
// Se carga subiendo el informe diario de pedidos del programa de gestión (PDF),
// que la IA convierte en: día → producto → unidades por tienda + comentarios.
//
// Cada casilla tiene identificador fijo (día + tienda + producto): volver a subir
// el mismo día sustituye los datos de ese día, nunca los duplica.
(function () {
  const esc = U.esc;
  const N = U.norm;
  const TIPO = 'montaje';
  const TIPO_COM = 'montaje-comentario';
  const limpio = (s) => N(s).replace(/[^a-z0-9]+/g, '_');
  const idCasilla = (fecha, tienda, producto) => `mtj-${fecha}-${limpio(tienda)}-${limpio(producto)}`;

  const delDia = (fecha) => db.registros(TIPO).filter((r) => r.fecha === fecha);
  const diasConMontaje = () => [...new Set(db.registros(TIPO).map((r) => r.fecha))].sort();

  // Nombre de tienda tal como está dado de alta (para que «Puente Malaga» y «Puente Málaga» sean la misma)
  async function tiendaCanonica(nombre) {
    const t = db.lista('tiendas').find((x) => N(x.nombre) === N(nombre));
    if (t) return t.nombre;
    await db.guardar('tiendas', { nombre: nombre.trim(), activo: true, orden: db.lista('tiendas').length + 1 });
    return nombre.trim();
  }

  const archivoABase64 = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });

  // Guarda un día leído: sustituye lo que hubiera de ese día. Devuelve avisos de totales.
  async function guardarDia(datos, origen) {
    const fecha = App.Albaranes.fechaLeida(datos.fecha);
    if (!fecha) throw new Error(`no se lee la fecha del informe${datos.fecha ? ` («${datos.fecha}»)` : ''}`);
    if (fecha > U.hoy()) throw new Error(`la fecha leída (${U.fmtFecha(fecha)}) es posterior a hoy`);
    const avisos = [];
    const nuevos = new Map();
    for (const l of datos.lineas || []) {
      const suma = Object.values(l.cantidades || {}).reduce((s, n) => s + (Number(n) || 0), 0);
      if (l.total && Math.abs(suma - l.total) > 0.001) avisos.push(`${l.producto}: las tiendas suman ${U.fmtNum(suma)} y el total pone ${U.fmtNum(l.total)}`);
      for (const [t, n] of Object.entries(l.cantidades || {})) {
        if (!(Number(n) > 0)) continue;
        const tienda = await tiendaCanonica(t);
        const id = idCasilla(fecha, tienda, l.producto);
        nuevos.set(id, { id, tipo: TIPO, fecha, tienda, familia: l.familia || '', producto: l.producto, unidades: Number(n), lote: '', origen });
      }
    }
    if (!nuevos.size) throw new Error('no se ha leído ningún producto');
    // Lo que había ese día y ya no viene en el informe nuevo se quita
    for (const r of delDia(fecha)) if (!nuevos.has(r.id)) await db.borrar('registros', r.id);
    const filas = [...nuevos.values()];
    await db.importar({ registros: filas });
    for (const r of db.registros(TIPO_COM).filter((x) => x.fecha === fecha)) await db.borrar('registros', r.id);
    for (const [t, texto] of Object.entries(datos.comentarios || {})) {
      const tienda = await tiendaCanonica(t);
      await db.guardar('registros', { id: `mtc-${fecha}-${limpio(tienda)}`, tipo: TIPO_COM, fecha, tienda, texto });
    }
    return { fecha, productos: new Set(filas.map((f) => f.producto)).size, casillas: filas.length, avisos };
  }

  // ---------- Tabla de un día, como el informe en papel ----------
  App.tablaMontajeDia = (fecha) => {
    const regs = delDia(fecha);
    if (!regs.length) return '<p class="vacio">No hay montaje de este día.</p>';
    const ordenTiendas = new Map(db.activos('tiendas').map((t, i) => [t.nombre, i]));
    const tiendas = [...new Set(regs.map((r) => r.tienda))].sort((a, b) => (ordenTiendas.get(a) ?? 99) - (ordenTiendas.get(b) ?? 99));
    const familias = {};
    for (const r of regs) ((familias[r.familia || 'Otros'] = familias[r.familia || 'Otros'] || {})[r.producto] = familias[r.familia || 'Otros'][r.producto] || {})[r.tienda] = r.unidades;
    let filas = '';
    for (const fam of Object.keys(familias).sort()) {
      filas += `<tr class="fila-grupo"><td colspan="${tiendas.length + 2}">${esc(fam)}</td></tr>`;
      for (const prod of Object.keys(familias[fam]).sort()) {
        const c = familias[fam][prod];
        const total = Object.values(c).reduce((s, n) => s + n, 0);
        filas += `<tr><td class="col-prod">${esc(prod)}</td><td><b>${U.fmtNum(total)}</b></td>${tiendas.map((t) => `<td>${c[t] ? U.fmtNum(c[t]) : ''}</td>`).join('')}</tr>`;
      }
    }
    const coms = db.registros(TIPO_COM).filter((r) => r.fecha === fecha);
    return `<div class="tabla-scroll"><table class="tabla tabla-prod">
      <thead><tr><th class="col-prod">Producto</th><th>Total</th>${tiendas.map((t) => `<th>${esc(t)}</th>`).join('')}</tr></thead>
      <tbody>${filas}</tbody></table></div>
      ${coms.length ? `<h3>Comentarios de los pedidos</h3><ul>${coms.map((c) => `<li><b>${esc(c.tienda)}:</b> ${esc(c.texto)}</li>`).join('')}</ul>` : ''}`;
  };

  // ---------- Pantalla ----------
  function render(params) {
    const dias = diasConMontaje();
    const fecha = params.get('fecha') || dias[dias.length - 1] || U.hoy();
    const busca = params.get('buscar') || '';
    App.vista().innerHTML = `
      ${App.cabecera('Montaje · reparto a tiendas', 'Lo que sale del obrador a cada tienda cada día. Sube el informe diario de pedidos (PDF) y se carga solo. Si subes otra vez el mismo día, se sustituye: nunca se duplica.')}
      <div class="tarjeta">
        <label class="btn btn-primario btn-grande bloque">📄 Subir informes de pedidos (PDF)
          <input type="file" accept="application/pdf,image/*" multiple hidden id="in-montaje"></label>
        <div id="progreso-montaje"></div>
      </div>
      <div class="tarjeta">
        <div class="fila-campos">
          <label class="campo campo-corto"><span>Día</span><input type="date" id="sel-dia-montaje" value="${fecha}" max="${U.hoy()}"></label>
          <label class="campo"><span>Días cargados</span><select id="sel-dias-cargados"><option value="">— ${dias.length} días —</option>${dias.slice().reverse().map((d) => `<option value="${d}" ${d === fecha ? 'selected' : ''}>${esc(U.fmtFechaLarga(d))}</option>`).join('')}</select></label>
        </div>
        <h2>${esc(U.fmtFechaLarga(fecha))}</h2>
        ${App.tablaMontajeDia(fecha)}
      </div>
      <div class="tarjeta">
        <h2>¿A qué tiendas fue un producto?</h2>
        <form id="f-buscar-montaje" class="fila-campos">
          <label class="campo"><span>Producto</span><input name="q" value="${esc(busca)}" placeholder="Ej.: milhojas crema" list="dl-prod-montaje"></label>
          <label class="campo campo-corto"><span>Desde</span><input type="date" name="desde" value="${params.get('desde') || U.sumarDias(U.hoy(), -30)}"></label>
          <label class="campo campo-corto"><span>Hasta</span><input type="date" name="hasta" value="${params.get('hasta') || U.hoy()}"></label>
          <div class="campo"><span>&nbsp;</span><button class="btn">Buscar</button></div>
        </form>
        <datalist id="dl-prod-montaje">${[...new Set(db.registros(TIPO).map((r) => r.producto))].sort().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        ${busca ? resultadoBusqueda(busca, params.get('desde') || U.sumarDias(U.hoy(), -30), params.get('hasta') || U.hoy()) : ''}
      </div>`;
    const v = App.vista();
    v.querySelector('#sel-dia-montaje').addEventListener('change', (e) => (location.hash = `#/montaje?fecha=${e.target.value}`));
    v.querySelector('#sel-dias-cargados').addEventListener('change', (e) => e.target.value && (location.hash = `#/montaje?fecha=${e.target.value}`));
    v.querySelector('#f-buscar-montaje').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = U.leerForm(e.target);
      location.hash = `#/montaje?fecha=${fecha}&buscar=${encodeURIComponent(d.q)}&desde=${d.desde}&hasta=${d.hasta}`;
    });
    v.querySelector('#in-montaje').addEventListener('change', (e) => subir([...e.target.files]));
  }

  function resultadoBusqueda(q, desde, hasta) {
    const t = N(q);
    const regs = db
      .registros(TIPO)
      .filter((r) => r.fecha >= desde && r.fecha <= hasta && N(r.producto).includes(t))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tienda.localeCompare(b.tienda));
    if (!regs.length) return '<p class="vacio">No ha salido ningún producto con ese nombre en esas fechas.</p>';
    const total = regs.reduce((s, r) => s + r.unidades, 0);
    return `<p><b>${regs.length}</b> repartos · <b>${U.fmtNum(total)}</b> unidades en total.</p>
      <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Día</th><th>Producto</th><th>Tienda</th><th>Unidades</th></tr></thead>
      <tbody>${regs.map((r) => `<tr><td>${U.fmtFecha(r.fecha)}</td><td>${esc(r.producto)}</td><td>${esc(r.tienda)}</td><td>${U.fmtNum(r.unidades)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function subir(files) {
    if (!files.length) return;
    const caja = App.vista().querySelector('#progreso-montaje');
    const lineas = [];
    const pintar = (extra = '') => (caja.innerHTML = `<ul class="lista-compacta">${lineas.join('')}</ul>${extra}`);
    let ultimaFecha = '';
    for (const [i, f] of files.entries()) {
      lineas.push(`<li id="mtj-${i}">⏳ ${esc(f.name)}: leyendo…</li>`);
      pintar();
      let resultado = '';
      for (let intento = 1; intento <= 4; intento++) {
        try {
          const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
          const data = esPdf ? await archivoABase64(f) : (await App.Albaranes.prepararFoto(f)).base64;
          const datos = await db.leerMontaje([{ mime: esPdf ? 'application/pdf' : 'image/jpeg', data }]);
          const r = await guardarDia(datos, f.name);
          ultimaFecha = r.fecha;
          resultado = `${r.avisos.length ? '⚠' : '✔'} ${esc(f.name)}: ${esc(U.fmtFechaLarga(r.fecha))} · ${r.productos} productos, ${r.casillas} repartos${r.avisos.length ? `<br><small class="txt-fuera">Revisa: ${r.avisos.map(esc).join(' · ')}</small>` : ''}`;
          break;
        } catch (err) {
          console.error(err);
          if ((err.tipo === 'saturado' || err.tipo === 'limite') && intento < 4) {
            lineas[lineas.length - 1] = `<li>⏳ ${esc(f.name)}: la IA está saturada, reintento ${intento + 1} de 4 en 30 s…</li>`;
            pintar();
            await new Promise((r) => setTimeout(r, 30000));
            continue;
          }
          resultado = `✖ ${esc(f.name)}: ${esc(err.message)}`;
          break;
        }
      }
      lineas[lineas.length - 1] = `<li>${resultado}</li>`;
      pintar();
    }
    pintar(ultimaFecha ? `<a class="btn" href="#/montaje?fecha=${ultimaFecha}">Ver el último día cargado</a>` : '');
  }

  App.vistas['montaje'] = render;
})();
