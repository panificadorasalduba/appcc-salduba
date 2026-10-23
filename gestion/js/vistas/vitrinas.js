// Registro diario de temperatura de las vitrinas expositoras de los despachos (PCC5).
// Cada vitrina es un equipo de tipo «vitrina» con su tienda; el registro es uno por tienda y día.
(function () {
  const esc = U.esc;
  const TIPO = 'temp_vitrinas';

  const vitrinas = (tienda) => db.activos('equipos').filter((e) => e.tipo === 'vitrina' && (!tienda || e.tienda === tienda));
  const tiendasConVitrina = () => [...new Set(vitrinas().map((e) => e.tienda).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const registroDe = (tienda, fecha) => db.registros(TIPO).find((r) => r.tienda === tienda && r.fecha === fecha) || null;
  const textoLimite = (e) => `Lo normal ${App.rangoNormal(e)} · crítico ${App.limiteCritico(e)}`;

  function render(params) {
    const tiendas = tiendasConVitrina();
    if (!tiendas.length) {
      App.vista().innerHTML = `${App.cabecera('Vitrinas de las tiendas', 'PCC5 · temperatura de la vitrina expositora de pasteles')}
        <div class="tarjeta"><p class="vacio">No hay vitrinas dadas de alta. Añádelas en <a href="#/ajustes/equipos">Ajustes → Equipos de frío</a> con el tipo «Vitrina de tienda» y su tienda.</p></div>`;
      return;
    }
    const tienda = params.get('tienda') || localStorage.getItem('go_tienda_vitrina') || tiendas[0];
    const fecha = params.get('fecha') || U.hoy();
    const reg = registroDe(tienda, fecha);
    const eqs = vitrinas(tienda);
    const lect = reg?.lecturas || {};
    const acc = reg?.acciones || {};

    App.vista().innerHTML = `
      ${App.cabecera('Vitrinas de las tiendas', 'PCC5 · se anota cada día la temperatura del visor de la vitrina de pasteles', `<a class="btn" href="#/vitrinas/mes?tienda=${encodeURIComponent(tienda)}">Ver mes</a>`)}
      <form id="f-vit" class="tarjeta">
        <div class="fila-campos">
          <label class="campo"><span>Tienda</span>${App.selectOpciones('tienda', tiendas, tienda, { vacio: false })}</label>
          <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${fecha}" max="${U.hoy()}"></label>
          <label class="campo"><span>¿Quién lo anota?</span><input name="quien" value="${esc(reg?.quien || localStorage.getItem('go_quien_vitrina') || '')}" autocomplete="off" required></label>
        </div>
        ${reg ? `<p class="aviso-info">Ya hay registro de este día (por ${esc(reg.quien)}). Si lo cambias se actualizará.</p>` : ''}
        <div class="temp-lista">${eqs
          .map((e) => {
            const est = App.evaluarTemp(lect[e.id], e.objetivoMax, e.criticoMax, e.objetivoMin, e.criticoMin);
            return `<div class="temp-fila" data-eq="${e.id}" data-estado="${est}">
              <div class="temp-nombre"><b>${esc(e.nombre)}</b><small>${textoLimite(e)}</small></div>
              <div class="temp-input"><input name="t_${e.id}" inputmode="decimal" autocomplete="off" value="${esc(U.fmtNum(lect[e.id]))}" placeholder="ºC"><span>ºC</span></div>
              <div class="temp-accion" ${est === 'fuera' ? '' : 'hidden'}>
                <label class="campo"><span>Fuera de límite: ¿qué se ha hecho?</span>
                <textarea name="a_${e.id}" rows="2" placeholder="Avisar para arreglo; pasar los pasteles a otro equipo de frío; venderlos ya o retirarlos">${esc(acc[e.id] || '')}</textarea></label>
              </div>
            </div>`;
          })
          .join('')}</div>
        <label class="campo"><span>Observaciones</span><textarea name="obs" rows="2">${esc(reg?.obs || '')}</textarea></label>
        <div class="acciones"><button class="btn btn-primario btn-grande" type="submit">Guardar</button></div>
      </form>`;

    const form = document.getElementById('f-vit');
    const ir = () => (location.hash = `#/vitrinas?tienda=${encodeURIComponent(form.tienda.value)}&fecha=${form.fecha.value}`);
    form.tienda.addEventListener('change', ir);
    form.fecha.addEventListener('change', ir);
    form.addEventListener('input', (e) => {
      const fila = e.target.closest('.temp-fila');
      if (!fila || !e.target.name.startsWith('t_')) return;
      const eq = db.obtener('equipos', fila.dataset.eq);
      const est = App.evaluarTemp(U.num(e.target.value), eq.objetivoMax, eq.criticoMax, eq.objetivoMin, eq.criticoMin);
      fila.dataset.estado = est;
      fila.querySelector('.temp-accion').hidden = est !== 'fuera';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = U.leerForm(form);
      if (!d.quien.trim()) return U.toast('Indica quién lo anota', 'error');
      const lecturas = {};
      const acciones = {};
      const fuera = [];
      for (const eq of eqs) {
        if (d['t_' + eq.id] === '') continue;
        const v = U.num(d['t_' + eq.id]);
        if (v === null) return U.toast(`Temperatura no válida en ${eq.nombre}`, 'error');
        lecturas[eq.id] = v;
        if (App.evaluarTemp(v, eq.objetivoMax, eq.criticoMax, eq.objetivoMin, eq.criticoMin) === 'fuera') {
          if (!d['a_' + eq.id]) return U.toast(`Indica qué se ha hecho con ${eq.nombre}`, 'error');
          acciones[eq.id] = d['a_' + eq.id];
          fuera.push(eq);
        }
      }
      if (!Object.keys(lecturas).length) return U.toast('No has anotado ninguna temperatura', 'error');
      const r = reg || { tipo: TIPO, tienda: d.tienda, fecha: d.fecha, incidencias: {} };
      Object.assign(r, { lecturas, acciones, quien: d.quien.trim(), obs: d.obs });
      r.incidencias = r.incidencias || {};
      for (const eq of fuera) {
        if (r.incidencias[eq.id]) continue;
        const inc = await App.crearIncidencia({
          plan: 'Temperaturas',
          descripcion: `PCC5 · ${eq.nombre} (${d.tienda}): ${U.fmtNum(lecturas[eq.id])} ºC (límite crítico ${App.limiteCritico(eq)}) el ${U.fmtFecha(d.fecha)}`,
          accion: acciones[eq.id],
          quien: r.quien,
          origen: { tipo: TIPO, fecha: d.fecha },
        });
        r.incidencias[eq.id] = inc.numero;
      }
      await db.guardar('registros', r);
      try {
        localStorage.setItem('go_tienda_vitrina', d.tienda);
        localStorage.setItem('go_quien_vitrina', r.quien);
      } catch (_) {}
      U.toast(fuera.length ? `Guardado. Se ha abierto ${fuera.length} incidencia(s).` : 'Temperatura guardada');
      App.recargar();
    });
  }

  // Tabla mensual de una tienda (también la usan los informes)
  App.tablaVitrinasMes = (tienda, anio, mes, enlaces = false) => {
    const eqs = vitrinas(tienda);
    const pref = `${anio}-${U.pad(mes)}`;
    const porDia = Object.fromEntries(db.registros(TIPO).filter((r) => r.tienda === tienda && r.fecha.startsWith(pref)).map((r) => [r.fecha, r]));
    const hoy = U.hoy();
    let filas = '';
    for (let d = 1; d <= U.diasDelMes(anio, mes); d++) {
      const f = `${pref}-${U.pad(d)}`;
      const r = porDia[f];
      const celdas = eqs.map((e) => {
        const v = r?.lecturas?.[e.id];
        return `<td class="c-${App.evaluarTemp(v, e.objetivoMax, e.criticoMax, e.objetivoMin, e.criticoMin)}">${U.fmtNum(v)}</td>`;
      }).join('');
      const dia = enlaces && f <= hoy ? `<a href="#/vitrinas?tienda=${encodeURIComponent(tienda)}&fecha=${f}">${d}</a>` : d;
      filas += `<tr class="${!r && f <= hoy ? 'sin-registro' : ''}"><td>${dia}</td>${celdas}<td>${esc(r?.quien || '')}</td><td>${esc(r ? Object.values(r.incidencias || {}).join(', ') : '')}</td></tr>`;
    }
    return `<div class="tabla-scroll"><table class="tabla tabla-temp">
      <thead><tr><th>Día</th>${eqs.map((e) => `<th>${esc(e.nombre)}<small>${esc(App.rangoNormal(e))}</small></th>`).join('')}<th>Responsable</th><th>Incid. nº</th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  };

  function renderMes(params) {
    const tiendas = tiendasConVitrina();
    const tienda = params.get('tienda') || tiendas[0] || '';
    const mesParam = params.get('mes') || U.hoy().slice(0, 7);
    const [anio, mes] = mesParam.split('-').map(Number);
    App.vista().innerHTML = `
      ${App.cabecera('Vitrinas · vista mensual', 'PCC5', `<a class="btn" href="#/vitrinas?tienda=${encodeURIComponent(tienda)}">Registrar hoy</a>`)}
      <div class="tarjeta">
        <div class="fila-campos">
          <label class="campo"><span>Tienda</span>${App.selectOpciones('tienda', tiendas, tienda, { vacio: false })}</label>
          <label class="campo campo-corto"><span>Mes</span><input type="month" name="mes" value="${mesParam}"></label>
        </div>
        ${tienda ? App.tablaVitrinasMes(tienda, anio, mes, true) : '<p class="vacio">No hay vitrinas dadas de alta.</p>'}
      </div>`;
    const v = App.vista();
    const ir = () => (location.hash = `#/vitrinas/mes?tienda=${encodeURIComponent(v.querySelector('[name=tienda]').value)}&mes=${v.querySelector('[name=mes]').value}`);
    v.querySelector('[name=tienda]')?.addEventListener('change', ir);
    v.querySelector('[name=mes]').addEventListener('change', ir);
  }

  // Aviso en inicio: tiendas con vitrina que ayer no anotaron la temperatura
  App.avisosVitrinas = () => {
    const ayer = U.sumarDias(U.hoy(), -1);
    const faltan = tiendasConVitrina().filter((t) => !registroDe(t, ayer) && !registroDe(t, U.hoy()));
    return faltan.length
      ? [{ estado: 'aviso', titulo: 'Vitrinas de tiendas (PCC5)', detalle: `Sin temperatura ayer ni hoy: ${faltan.join(', ')}`, enlace: '#/vitrinas' }]
      : [];
  };
  App.tiendasConVitrina = tiendasConVitrina;
  App.VITRINAS_TIPO = TIPO;
  App.vistas['vitrinas'] = render;
  App.vistas['vitrinas/mes'] = renderMes;
})();
