// Lotes de materias primas: abrir y cerrar envases, stock y siguiente envase.
//
// El stock NO es un contador guardado: se calcula por lote así
//   envases cerrados = recibidos (recepción) + recuentos (ajustes) − abiertos (lotes)
// De este modo dos tablets que apuntan a la vez nunca descuadran el stock.
(function () {
  const esc = U.esc;
  const N = U.norm;

  // ---------- Cálculos ----------
  App.materiaPorNombre = (nombre) => db.lista('materias').find((m) => N(m.nombre) === N(nombre)) || null;

  const esDe = (m) => (r) => r.materiaId === m.id || (!r.materiaId && N(r.producto) === N(m.nombre));

  // Envases cerrados que quedan de cada lote de una materia prima, del más antiguo al más nuevo
  App.disponiblesPorLote = (m) => {
    const porLote = new Map();
    const tomar = (lote, fecha) => {
      const k = N(lote);
      if (!porLote.has(k)) porLote.set(k, { lote: String(lote || '').trim(), disponible: 0, fecha: fecha || '9999' });
      const x = porLote.get(k);
      if (fecha && fecha < x.fecha) x.fecha = fecha;
      return x;
    };
    for (const r of db.registros('recepcion').filter(esDe(m))) {
      if (!r.lote || r.sinStock) continue; // albaranes antiguos cargados de la carpeta: no cuentan en el stock
      const n = U.num(r.cantidad);
      tomar(r.lote, r.fecha).disponible += n === null ? 1 : n;
    }
    for (const a of db.lista('ajustes').filter((a) => a.materiaId === m.id)) tomar(a.lote, a.fecha).disponible += U.num(a.cantidad) || 0;
    for (const l of db.lista('lotes').filter((l) => l.materiaId === m.id)) tomar(l.lote, l.fechaApertura).disponible -= 1;
    return [...porLote.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  };

  App.stockMateria = (m) => App.disponiblesPorLote(m).reduce((s, x) => s + Math.max(0, x.disponible), 0);

  // El siguiente envase que toca: si queda del lote que se acaba de cerrar, ese (MISMO LOTE); si no, el más antiguo
  App.siguienteEnvase = (m, loteCerrado) => {
    const disp = App.disponiblesPorLote(m).filter((x) => x.disponible > 0 && x.lote);
    if (loteCerrado) {
      const mismo = disp.find((x) => N(x.lote) === N(loteCerrado));
      if (mismo) return { ...mismo, mismo: true };
    }
    return disp[0] || null;
  };

  App.lotesAbiertos = () => db.lista('lotes').filter((l) => !l.fechaCierre).sort((a, b) => a.producto.localeCompare(b.producto, 'es'));

  async function abrir(m, lote, quien) {
    const yaUsado = db.lista('lotes').some((l) => l.materiaId === m.id && N(l.lote) === N(lote));
    await db.guardar('lotes', { materiaId: m.id, producto: m.nombre, lote: lote.trim(), fechaApertura: U.hoy(), horaApertura: U.horaAhora(), abiertoPor: quien, fechaCierre: '', cerradoPor: '', mismoLote: yaUsado });
    U.ultimoUsuario(quien);
  }
  async function cerrar(l, quien) {
    Object.assign(l, { fechaCierre: U.hoy(), horaCierre: U.horaAhora(), cerradoPor: quien });
    await db.guardar('lotes', l);
    U.ultimoUsuario(quien);
  }

  // ---------- Ventanas grandes (pensadas para la tablet) ----------
  const quienHTML = () => `<div class="quien-lotes">${App.selectPersona('quien')}</div>`;
  const leerQuien = (el) => {
    const q = el.querySelector('[name=quien]')?.value || '';
    if (!q) U.toast('Elige quién eres', 'error');
    return q;
  };

  function ventana(html) {
    return App.modal(`<div class="ventana-grande">${html}</div>`);
  }

  function terminado(l) {
    const v = ventana(`
      <h2>¿Se ha terminado este?</h2>
      <p class="grande"><b>${esc(l.producto)}</b><br>Lote ${esc(l.lote)}</p>
      ${quienHTML()}
      <button class="btn btn-primario btn-grande bloque" data-si>Sí, se ha terminado</button>
      <button class="btn btn-grande bloque" data-cerrar>No, volver</button>`);
    v.el.querySelector('[data-si]').onclick = async () => {
      const quien = leerQuien(v.el);
      if (!quien) return;
      await cerrar(l, quien);
      v.cerrar();
      const m = db.obtener('materias', l.materiaId);
      proponer(m, l.lote, 'Cerrado ✔');
    };
  }

  // Lotes con envases cerrados, del que llegó primero al último (el que se acaba de cerrar, delante: MISMO LOTE)
  function lotesEnStock(m, loteCerrado) {
    const disp = App.disponiblesPorLote(m).filter((x) => x.disponible > 0 && x.lote);
    const i = loteCerrado ? disp.findIndex((x) => N(x.lote) === N(loteCerrado)) : -1;
    if (i > 0) disp.unshift(...disp.splice(i, 1));
    return disp.map((x, k) => ({ ...x, mismo: k === 0 && i >= 0 }));
  }

  // Los envases que se abren: n a partir del lote elegido, siguiendo el orden de llegada
  function envasesAAbrir(disp, desde, n) {
    const out = [];
    for (const x of disp.slice(desde)) for (let k = 0; k < x.disponible && out.length < n; k++) out.push(x.lote);
    return out;
  }

  function proponer(m, loteCerrado, titulo) {
    if (!m) return App.recargar();
    const disp = lotesEnStock(m, loteCerrado);
    const fecha = (x) => (x.fecha && x.fecha !== '9999' ? `llegó el ${U.fmtFecha(x.fecha)}` : 'sin fecha');
    const v = ventana(`
      ${titulo ? `<h2>${esc(titulo)}</h2>` : ''}
      <p class="grande"><b>${esc(m.nombre)}</b></p>
      ${disp.length
        ? `<label class="campo"><span>¿Qué lote abrís? Viene marcado el que llegó primero</span>
            <select class="input-grande" id="sel-lote">${disp
              .map((x, k) => `<option value="${k}">${x.mismo ? 'MISMO LOTE · ' : k === 0 ? '★ ' : ''}${esc(x.lote)} · ${fecha(x)} · quedan ${x.disponible}</option>`)
              .join('')}<option value="otro">Otro lote (lo escribo)</option></select></label>
          <p class="aviso-info" id="aviso-orden" hidden>Ojo: hay un lote que llegó antes. Abrid primero el más antiguo salvo que ya no quede.</p>`
        : '<p class="grande"><small>No consta ningún envase cerrado en el stock.</small></p>'}
      ${quienHTML()}
      ${disp.length
        ? `<button class="btn btn-primario btn-grande bloque" data-abrir="1">Abrir 1</button>
          <button class="btn btn-primario btn-grande bloque" data-abrir="2">Abrir 2 a la vez</button>`
        : '<button class="btn btn-primario btn-grande bloque" data-otro>Sí, escribo su lote</button>'}
      <button class="btn btn-grande bloque" data-no>No abro ninguno ahora</button>`);
    const sel = v.el.querySelector('#sel-lote');
    sel?.addEventListener('change', () => {
      v.el.querySelector('#aviso-orden').hidden = !(Number(sel.value) > 0);
    });
    v.el.querySelector('[data-no]').onclick = () => (v.cerrar(), App.recargar());
    v.el.querySelector('[data-otro]')?.addEventListener('click', () => (v.cerrar(), escribirLote(m, 1)));
    v.el.querySelectorAll('[data-abrir]').forEach(
      (b) =>
        (b.onclick = async () => {
          const n = Number(b.dataset.abrir);
          if (sel.value === 'otro') return v.cerrar(), escribirLote(m, n);
          const quien = leerQuien(v.el);
          if (!quien) return;
          const lotes = envasesAAbrir(disp, Number(sel.value), n);
          if (lotes.length < n && !(await App.confirmar(`Solo consta ${lotes.length} envase cerrado en el stock. ¿Abrir igualmente ${n}?`))) return;
          while (lotes.length < n) lotes.push(lotes[lotes.length - 1] || disp[Number(sel.value)].lote);
          v.cerrar();
          await intentarAbrir(m, lotes, quien);
        })
    );
  }

  function escribirLote(m, n = 1) {
    const v = App.modal(
      `<form class="ventana-grande">
        <h2>${esc(m.nombre)}</h2>
        <p>Escribe el número de lote que pone en el saco, cubo o caja${n > 1 ? ` (se abren ${n} de este lote)` : ''}:</p>
        <input name="lote" class="input-grande" autocomplete="off" required>
        ${quienHTML()}
        <button class="btn btn-primario btn-grande bloque" type="submit">${n > 1 ? `Abrir ${n}` : 'Abrir'}</button>
        <button class="btn btn-grande bloque" type="button" data-cerrar>Cancelar</button>
      </form>`,
      {
        onSubmit: async (d) => {
          if (!d.quien) {
            U.toast('Elige quién eres', 'error');
            return false;
          }
          setTimeout(() => intentarAbrir(m, Array(n).fill(d.lote.trim()), d.quien), 0);
        },
      }
    );
    setTimeout(() => v.el.querySelector('[name=lote]')?.focus(), 150);
  }

  // Antes de abrir, si ya hay otro lote abierto de lo mismo, se pregunta si se ha terminado
  // (puede haber dos abiertos a la vez: entonces se dejan los dos)
  async function intentarAbrir(m, lotes, quien) {
    const otros = App.lotesAbiertos().filter((l) => l.materiaId === m.id && !lotes.some((x) => N(x) === N(l.lote)));
    const hecho = async () => {
      for (const lote of lotes) await abrir(m, lote, quien);
      const txt = [...new Set(lotes)].map((l) => `lote ${l}${lotes.filter((x) => x === l).length > 1 ? ` (×${lotes.filter((x) => x === l).length})` : ''}`).join(' y ');
      U.toast(`Abierto${lotes.length > 1 ? 's' : ''} ✔ ${m.nombre} · ${txt}`);
      App.recargar();
    };
    if (!otros.length) return hecho();
    const v = ventana(`
      <h2>${esc(m.nombre)}</h2>
      <p class="grande">Ya hay abierto el lote <b>${otros.map((o) => esc(o.lote)).join(', ')}</b>. ¿Se ha terminado?</p>
      <button class="btn btn-primario btn-grande bloque" data-si>Sí, se ha terminado</button>
      <button class="btn btn-grande bloque" data-no>No, se quedan abiertos a la vez</button>`);
    v.el.querySelector('[data-si]').onclick = async () => {
      v.cerrar();
      for (const o of otros) await cerrar(o, quien);
      await hecho();
    };
    v.el.querySelector('[data-no]').onclick = async () => {
      v.cerrar();
      await hecho();
    };
  }

  function elegirProducto() {
    const materias = db.activos('materias');
    const conStock = materias.filter((m) => App.stockMateria(m) > 0);
    const resto = materias.filter((m) => !conStock.includes(m));
    const lista = [...conStock, ...resto];
    const v = ventana(`
      <h2>¿Qué producto vais a abrir?</h2>
      <input class="input-grande" id="busca-materia" placeholder="Escribe parte del nombre…" autocomplete="off">
      <div id="lista-materias" class="lista-botones"></div>
      <button class="btn btn-grande bloque" data-cerrar>Cancelar</button>`);
    const pintar = (q) => {
      const t = N(q);
      const f = lista.filter((m) => !t || N(m.nombre).includes(t)).slice(0, 12);
      v.el.querySelector('#lista-materias').innerHTML = f.length
        ? f.map((m) => `<button class="btn btn-grande bloque izq" data-id="${m.id}">${esc(m.nombre)} <small>${App.stockMateria(m)} cerrados</small></button>`).join('')
        : `<p>No hay ningún producto con ese nombre.${db.esAdmin() && !App.modoObrador() ? ' Dalo de alta en «Materias primas».' : ' Avisa al encargado para que lo dé de alta.'}</p>`;
    };
    pintar('');
    const input = v.el.querySelector('#busca-materia');
    input.addEventListener('input', () => pintar(input.value));
    setTimeout(() => input.focus(), 150);
    v.el.querySelector('#lista-materias').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      v.cerrar();
      proponer(db.obtener('materias', b.dataset.id), null, '');
    });
  }

  // ---------- Pantalla LOTES ----------
  function render(params) {
    const abiertos = App.lotesAbiertos();
    const tablet = App.modoObrador();
    const filas = abiertos
      .map(
        (l) => `<div class="lote-fila">
          <div class="lote-txt"><b>${esc(l.producto)}</b><span>Lote ${esc(l.lote)}${l.mismoLote ? ' · <b>MISMO LOTE</b>' : ''} · abierto el ${U.fmtFecha(l.fechaApertura)}</span></div>
          <button class="btn btn-primario btn-grande" data-terminado="${l.id}">Se ha terminado</button>
        </div>`
      )
      .join('');
    App.vista().innerHTML = `
      ${App.cabecera('Lotes abiertos', 'Cuando se acabe un saco, cubo o caja, pulsa «Se ha terminado» en su línea y la app te dirá cuál toca abrir.', tablet ? '' : '<a class="btn" href="#/materias">Materias primas y stock</a>')}
      <button class="btn btn-primario btn-grande bloque" id="btn-abrir">➕ Abrir un producto</button>
      <div class="tarjeta">
        <h2>Abiertos ahora (${abiertos.length})</h2>
        <input class="input-grande" id="busca-lote" placeholder="Buscar producto…" autocomplete="off">
        <div id="lista-lotes">${filas || '<p class="vacio">No hay ningún lote abierto.</p>'}</div>
      </div>
      ${tablet ? '' : historial(params)}`;
    const v = App.vista();
    v.querySelector('#btn-abrir').addEventListener('click', elegirProducto);
    v.querySelector('#busca-lote').addEventListener('input', (e) => {
      const t = N(e.target.value);
      v.querySelectorAll('.lote-fila').forEach((f) => (f.style.display = !t || N(f.textContent).includes(t) ? '' : 'none'));
    });
    v.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-terminado]');
      if (t) return terminado(db.obtener('lotes', t.dataset.terminado));
      const b = e.target.closest('[data-borrar-lote]');
      if (b && (await App.confirmar('¿Borrar este registro de lote? Solo si se apuntó por error.'))) {
        await db.borrar('lotes', b.dataset.borrarLote);
        App.recargar();
      }
      const r = e.target.closest('[data-reabrir]');
      if (r && (await App.confirmar('¿Volver a dejar abierto este lote? (se borra la fecha de cierre)'))) {
        const l = db.obtener('lotes', r.dataset.reabrir);
        Object.assign(l, { fechaCierre: '', horaCierre: '', cerradoPor: '' });
        await db.guardar('lotes', l);
        App.recargar();
      }
    });
    v.querySelector('#sel-mes-lotes')?.addEventListener('change', (e) => (location.hash = `#/lotes?mes=${e.target.value}`));
  }

  function historial(params) {
    const mes = params.get('mes') || U.hoy().slice(0, 7);
    const lotes = db
      .lista('lotes')
      .filter((l) => l.fechaApertura.startsWith(mes) || (l.fechaCierre || '').startsWith(mes))
      .sort((a, b) => (b.fechaApertura + (b.horaApertura || '')).localeCompare(a.fechaApertura + (a.horaApertura || '')));
    return `<div class="tarjeta">
      <h2>Historial de lotes</h2>
      <label class="campo campo-corto"><span>Mes</span><input type="month" id="sel-mes-lotes" value="${mes}"></label>
      ${App.tablaLotes(lotes, true)}
    </div>`;
  }

  App.tablaLotes = (lotes, conAcciones = false) => {
    if (!lotes.length) return '<p class="vacio">Sin lotes en este periodo.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Materia prima</th><th>Lote</th><th>Apertura</th><th>Abrió</th><th>Cierre</th><th>Cerró</th><th></th>${conAcciones ? '<th></th>' : ''}</tr></thead>
      <tbody>${lotes
        .map(
          (l) => `<tr><td>${esc(l.producto)}</td><td>${esc(l.lote)}</td><td>${U.fmtFecha(l.fechaApertura)}</td><td>${esc(l.abiertoPor || '')}</td>
          <td>${l.fechaCierre ? U.fmtFecha(l.fechaCierre) : '<b>ABIERTO</b>'}</td><td>${esc(l.cerradoPor || '')}</td><td>${l.mismoLote ? '<b>MISMO LOTE</b>' : ''}</td>
          ${conAcciones ? `<td class="nowrap">${l.fechaCierre ? `<button class="btn-icono" data-reabrir="${l.id}" title="Volver a abrir">↺</button>` : ''}<button class="btn-icono" data-borrar-lote="${l.id}" title="Borrar">✕</button></td>` : ''}</tr>`
        )
        .join('')}</tbody></table></div>`;
  };

  // ---------- Pantalla MATERIAS PRIMAS ----------
  function renderMaterias() {
    App.crud({
      col: 'materias',
      titulo: 'Materias primas y stock',
      sub: 'El stock son los envases cerrados: sube al recepcionar y baja al abrir un lote. Pulsa una fila para editarla.',
      nuevoTxt: 'Nueva materia prima',
      defecto: { categoria: 'Pastelería', unidad: 'envase', stockMinimo: 0 },
      campos: [
        { n: 'nombre', l: 'Nombre (como aparece en el albarán)', req: true },
        { n: 'categoria', l: 'Categoría', t: 'select', ops: ['Panadería', 'Pastelería', 'Común', 'Envases y material'], req: true },
        { n: 'proveedor', l: 'Proveedor habitual' },
        { n: 'unidad', l: 'Envase', t: 'select', ops: ['saco', 'caja', 'cubo', 'bote', 'garrafa', 'bolsa', 'envase'] },
        { n: 'stockMinimo', l: 'Stock mínimo (avisar si quedan menos)', t: 'numero' },
      ],
      columnas: [
        ['Categoría', (m) => esc(m.categoria || '')],
        ['Materia prima', (m) => `<b>${esc(m.nombre)}</b>`],
        ['Cerrados', (m) => {
          const s = App.stockMateria(m);
          return s <= (m.stockMinimo || 0) && m.stockMinimo ? App.chip('fuera', `${s} ${m.unidad || ''}`) : `${s} ${esc(m.unidad || '')}`;
        }],
        ['Abierto ahora', (m) => esc(App.lotesAbiertos().filter((l) => l.materiaId === m.id).map((l) => l.lote).join(', ') || '—')],
        ['', (m) => `<button class="btn btn-pequeno" data-recuento="${m.id}">Recuento</button>`],
      ],
    });
    const v = App.vista();
    // El botón «Recuento» no debe abrir la edición de la fila
    v.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('[data-recuento]');
        if (!b) return;
        e.stopPropagation();
        recuento(db.obtener('materias', b.dataset.recuento));
      },
      true
    );
    // Productos recibidos que no están en el catálogo
    const sueltos = new Map();
    for (const r of db.registros('recepcion')) if (r.producto && !r.materiaId && !App.materiaPorNombre(r.producto)) sueltos.set(N(r.producto), r.producto);
    if (sueltos.size) {
      const t = document.createElement('div');
      t.className = 'tarjeta';
      t.innerHTML = `<h2>Recibidos que no están en el catálogo</h2><p class="tenue">Dalos de alta para que cuenten en el stock y salgan al abrir lotes.</p>
        <div class="acciones izq">${[...sueltos.values()].map((n) => `<button class="btn" data-alta="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>`;
      v.appendChild(t);
      t.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-alta]');
        if (!b) return;
        await db.guardar('materias', { nombre: b.dataset.alta, categoria: 'Pastelería', unidad: 'envase', stockMinimo: 0, activo: true, orden: db.lista('materias').length + 1 });
        U.toast('Añadida al catálogo');
        App.recargar();
      });
    }
  }

  // Recuento de inventario: se escribe cuántos envases cerrados hay de cada lote
  function recuento(m) {
    const disp = App.disponiblesPorLote(m).filter((x) => x.lote);
    App.modal(
      `<form><h2>Recuento · ${esc(m.nombre)}</h2>
        <p class="tenue">Escribe cuántos ${esc(m.unidad || 'envases')} <b>cerrados</b> hay ahora de cada lote. El que está abierto no se cuenta.</p>
        <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Lote</th><th>Según la app</th><th>Hay ahora</th></tr></thead><tbody>
        ${disp.map((x, i) => `<tr><td>${esc(x.lote)}</td><td>${Math.max(0, x.disponible)}</td><td><input name="c${i}" inputmode="numeric" value="${Math.max(0, x.disponible)}" style="width:90px"></td></tr>`).join('')}
        <tr><td><input name="loteNuevo" placeholder="Otro lote" style="width:150px"></td><td>—</td><td><input name="cNuevo" inputmode="numeric" placeholder="0" style="width:90px"></td></tr>
        </tbody></table></div>
        ${App.selectPersona('quien', undefined, '¿Quién cuenta?')}
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar recuento</button></div>
      </form>`,
      {
        ancho: true,
        onSubmit: async (d) => {
          const cambios = [];
          disp.forEach((x, i) => {
            const n = U.num(d['c' + i]);
            if (n !== null && n !== Math.max(0, x.disponible)) cambios.push({ lote: x.lote, cantidad: n - x.disponible });
          });
          const nn = U.num(d.cNuevo);
          if (d.loteNuevo && nn) cambios.push({ lote: d.loteNuevo, cantidad: nn });
          for (const c of cambios) await db.guardar('ajustes', { materiaId: m.id, lote: c.lote, cantidad: c.cantidad, fecha: U.hoy(), quien: d.quien, motivo: 'Recuento de inventario' });
          U.toast(cambios.length ? 'Stock actualizado' : 'Sin cambios');
          App.recargar();
        },
      }
    );
  }

  App.vistas['lotes'] = render;
  App.vistas['materias'] = renderMaterias;
})();
