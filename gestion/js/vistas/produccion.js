// Producción diaria: cuadernos (por ejemplo Montaje, Bollería y hojaldre, Masas)
// con las unidades de cada producto por día. El lote interno es el día.
// Cada casilla es un registro con identificador fijo (cuaderno + producto + día):
// dos tablets apuntando lo mismo escriben sobre la misma casilla, nunca duplican.
(function () {
  const esc = U.esc;
  const N = U.norm;
  const TIPO = 'produccion';

  App.cuadernos = () => db.activos('cuadernos');
  const idCasilla = (cuadernoId, producto, fecha) => `prd-${cuadernoId}-${fecha}-${N(producto).replace(/[^a-z0-9]+/g, '_')}`;
  const casilla = (cuadernoId, producto, fecha) => db.obtener('registros', idCasilla(cuadernoId, producto, fecha));

  async function apuntar(cuadernoId, producto, fecha, unidades, quien) {
    const id = idCasilla(cuadernoId, producto, fecha);
    if (unidades === null || unidades === 0) {
      if (db.obtener('registros', id)) await db.borrar('registros', id);
      return;
    }
    await db.guardar('registros', { id, tipo: TIPO, cuadernoId, producto, fecha, unidades, quien, lote: fecha });
  }

  const apuntadosEl = (cuadernoId, fecha) => db.registros(TIPO).filter((r) => r.cuadernoId === cuadernoId && r.fecha === fecha).length;

  // ---------- Tablet ----------
  function renderTablet(params) {
    const cuadernos = App.cuadernos();
    const cuaderno = cuadernos.find((c) => c.id === params.get('c'));
    const ayer = params.get('dia') === 'ayer';
    const fecha = ayer ? U.sumarDias(U.hoy(), -1) : U.hoy();

    if (!cuaderno) {
      App.vista().innerHTML = `
        ${App.cabecera('Producción', '¿En qué cuaderno vas a apuntar?')}
        <div class="obrador-inicio">${cuadernos
          .map((c) => {
            const n = apuntadosEl(c.id, U.hoy());
            return `<a class="boton-obrador estado-${n ? 'ok' : 'neutro'}" href="#/produccion?c=${c.id}"><span class="bo-titulo">🥐 ${esc(c.titulo)}</span><span class="bo-detalle">Hoy: ${n} ${n === 1 ? 'producto apuntado' : 'productos apuntados'}</span></a>`;
          })
          .join('') || '<p class="vacio">No hay cuadernos. El encargado los crea en Ajustes → Cuadernos de producción.</p>'}</div>`;
      return;
    }

    const grupos = (cuaderno.grupos || [])
      .map(
        (gr) => `<h3 class="grupo-prod">${esc(gr.grupo)}</h3>
        ${gr.productos
          .map((p) => {
            const r = casilla(cuaderno.id, p, fecha);
            return `<button class="prod-boton ${r ? 'hecho' : ''}" data-prod="${esc(p)}"><span>${esc(p)}</span><b>${r ? esc(U.fmtNum(r.unidades)) : '—'}</b></button>`;
          })
          .join('')}`
      )
      .join('');
    App.vista().innerHTML = `
      ${App.cabecera('🥐 ' + cuaderno.titulo, `Apuntando en: <b>${ayer ? 'Ayer' : 'Hoy'}, ${U.fmtFecha(fecha)}</b>${cuaderno.ayuda ? ' · ' + esc(cuaderno.ayuda) : ''}`)}
      <div class="dia-botones">
        <a class="btn btn-grande ${ayer ? '' : 'activo'}" href="#/produccion?c=${cuaderno.id}">Hoy</a>
        <a class="btn btn-grande ${ayer ? 'activo' : ''}" href="#/produccion?c=${cuaderno.id}&dia=ayer">Ayer</a>
        <a class="btn btn-grande" href="#/produccion">Otro cuaderno</a>
      </div>
      <div class="tarjeta">
        <div class="campo-corto">${App.selectPersona('quien', undefined, '¿Quién apunta?')}</div>
        <p class="tenue">Toca cada producto y escribe las unidades. Para borrar una, pon 0. Si el turno pasa de las 12 de la noche, pulsa «Ayer».</p>
        ${grupos}
      </div>`;
    App.vista().onclick = async (e) => {
      const b = e.target.closest('[data-prod]');
      if (!b) return;
      const quien = App.vista().querySelector('[name=quien]').value;
      if (!quien) return U.toast('Elige quién eres', 'error');
      const p = b.dataset.prod;
      const actual = casilla(cuaderno.id, p, fecha);
      const n = await App.teclado(esc(p), `${ayer ? 'Ayer' : 'Hoy'}, ${U.fmtFecha(fecha)} · unidades`, { valor: actual?.unidades ?? '' });
      if (n === null) return;
      await apuntar(cuaderno.id, p, fecha, n, quien);
      U.ultimoUsuario(quien);
      App.recargar();
    };
  }

  // ---------- Ordenador: rejilla mensual como el cuaderno en papel ----------
  App.tablaProduccionMes = (cuaderno, anio, mes, editable = false) => {
    const nDias = U.diasDelMes(anio, mes);
    const pre = `${anio}-${U.pad(mes)}-`;
    const regs = db.registros(TIPO).filter((r) => r.cuadernoId === cuaderno.id && r.fecha.startsWith(pre));
    const val = {};
    regs.forEach((r) => (val[N(r.producto) + '|' + r.fecha] = r.unidades));
    let cab = '<tr><th class="col-prod">Producto</th>';
    for (let d = 1; d <= nDias; d++) cab += `<th>${d}</th>`;
    cab += '<th>Total</th></tr>';
    let cuerpo = '';
    for (const gr of cuaderno.grupos || []) {
      cuerpo += `<tr class="fila-grupo"><td colspan="${nDias + 2}">${esc(gr.grupo)}</td></tr>`;
      for (const p of gr.productos) {
        let total = 0;
        let celdas = '';
        for (let d = 1; d <= nDias; d++) {
          const f = pre + U.pad(d);
          const v = val[N(p) + '|' + f];
          if (v != null) total += Number(v) || 0;
          celdas += editable
            ? `<td><input class="celda-prod" inputmode="decimal" data-p="${esc(p)}" data-f="${f}" value="${esc(U.fmtNum(v))}"></td>`
            : `<td>${esc(U.fmtNum(v))}</td>`;
        }
        cuerpo += `<tr><td class="col-prod">${esc(p)}</td>${celdas}<td><b>${total ? U.fmtNum(total) : ''}</b></td></tr>`;
      }
    }
    return `<div class="tabla-scroll"><table class="tabla tabla-prod"><thead>${cab}</thead><tbody>${cuerpo}</tbody></table></div>`;
  };

  function renderOrdenador(params) {
    const cuadernos = App.cuadernos();
    const cuaderno = cuadernos.find((c) => c.id === params.get('c')) || cuadernos[0];
    const mesParam = params.get('mes') || U.hoy().slice(0, 7);
    const [anio, mes] = mesParam.split('-').map(Number);
    App.vista().innerHTML = `
      ${App.cabecera('Producción diaria', 'Los cuadernos de producción del obrador, con los mismos productos que en papel. El lote interno de cada producto es el día de elaboración.', '<a class="btn" href="#/ajustes/cuadernos">Editar cuadernos</a>')}
      <div class="pestanas">${cuadernos.map((c) => `<a href="#/produccion?c=${c.id}&mes=${mesParam}" class="${c.id === cuaderno?.id ? 'activa' : ''}">${esc(c.titulo)}</a>`).join('')}</div>
      ${cuaderno
        ? `<div class="tarjeta">
            <div class="fila-campos">
              <label class="campo campo-corto"><span>Mes</span><input type="month" id="sel-mes-prod" value="${mesParam}"></label>
              <div class="campo-corto">${App.selectPersona('quien', undefined, '¿Quién apunta?')}</div>
            </div>
            <p class="tenue">${esc(cuaderno.traza || '')} ${esc(cuaderno.ayuda || '')} Escribe las unidades en la casilla del día; se guarda solo al salir de la casilla.</p>
            ${App.tablaProduccionMes(cuaderno, anio, mes, true)}
          </div>`
        : '<div class="tarjeta vacio">No hay cuadernos de producción. Créalos en <a href="#/ajustes/cuadernos">Ajustes</a>.</div>'}`;
    const v = App.vista();
    v.querySelector('#sel-mes-prod')?.addEventListener('change', (e) => (location.hash = `#/produccion?c=${cuaderno.id}&mes=${e.target.value}`));
    v.addEventListener('change', async (e) => {
      const i = e.target.closest('.celda-prod');
      if (!i) return;
      const quien = v.querySelector('[name=quien]').value;
      const n = i.value.trim() === '' ? null : U.num(i.value);
      if (i.value.trim() !== '' && n === null) return U.toast('Escribe un número', 'error');
      await apuntar(cuaderno.id, i.dataset.p, i.dataset.f, n, quien);
      i.classList.add('guardada');
    });
  }

  App.vistas['produccion'] = (params) => (App.modoObrador() ? renderTablet(params) : renderOrdenador(params));

  // ---------- Ajustes: editar cuadernos con un texto sencillo ----------
  App.vistas['ajustes/cuadernos'] = () => {
    const cuadernos = db.lista('cuadernos').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const aTexto = (c) => (c.grupos || []).map((gr) => `# ${gr.grupo}\n${gr.productos.join('\n')}`).join('\n\n');
    App.vista().innerHTML = `
      ${App.cabecera('Cuadernos de producción', 'Cada cuaderno es una hoja de producción. Escribe un producto por línea; las líneas que empiezan por # son títulos de grupo.', '<button class="btn btn-primario" id="btn-nuevo-cuad">+ Nuevo cuaderno</button>')}
      ${cuadernos
        .map(
          (c) => `<form class="tarjeta" data-id="${c.id}">
            <div class="rejilla-campos">
              <label class="campo"><span>Nombre</span><input name="titulo" value="${esc(c.titulo)}" required></label>
              <label class="campo"><span>Referencia (opcional)</span><input name="traza" value="${esc(c.traza || '')}"></label>
              <label class="campo campo-ancho"><span>Explicación para el obrador</span><input name="ayuda" value="${esc(c.ayuda || '')}"></label>
              <label class="campo campo-ancho"><span>Productos</span><textarea name="texto" rows="10">${esc(aTexto(c))}</textarea></label>
            </div>
            <label class="check"><input type="checkbox" name="activo" ${c.activo !== false ? 'checked' : ''}> Activo</label>
            <div class="acciones"><button class="btn btn-primario" type="submit">Guardar cuaderno</button></div>
          </form>`
        )
        .join('')}`;
    const v = App.vista();
    v.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const d = U.leerForm(f);
      const grupos = [];
      for (const linea of d.texto.split('\n').map((x) => x.trim()).filter(Boolean)) {
        if (linea.startsWith('#')) grupos.push({ grupo: linea.replace(/^#+\s*/, ''), productos: [] });
        else {
          if (!grupos.length) grupos.push({ grupo: 'Productos', productos: [] });
          grupos[grupos.length - 1].productos.push(linea);
        }
      }
      const c = db.obtener('cuadernos', f.dataset.id);
      Object.assign(c, { titulo: d.titulo, traza: d.traza, ayuda: d.ayuda, activo: d.activo, grupos });
      await db.guardar('cuadernos', c);
      U.toast('Cuaderno guardado');
    });
    v.querySelector('#btn-nuevo-cuad').addEventListener('click', async () => {
      await db.guardar('cuadernos', { id: 'cuad-' + U.uid().slice(0, 8), orden: cuadernos.length + 1, activo: true, titulo: 'Nuevo cuaderno', traza: '', ayuda: '', grupos: [{ grupo: 'Productos', productos: [] }] });
      App.recargar();
    });
  };
})();
