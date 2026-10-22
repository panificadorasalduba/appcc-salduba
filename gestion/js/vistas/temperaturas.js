// Registro diario de temperaturas de equipos de frío y sala de pastelería (PCC2 / PCC3).
(function () {
  const esc = U.esc;
  const TIPO = 'temp_equipos';

  const registroDelDia = (fecha) => db.registros(TIPO).find((r) => r.fecha === fecha) || null;

  const textoLimite = (e) => `Objetivo ≤ ${U.fmtNum(e.objetivoMax)} ºC · crítico > ${U.fmtNum(e.criticoMax)} ºC`;

  function render(params) {
    const fecha = params.get('fecha') || U.hoy();
    const reg = registroDelDia(fecha);
    const equipos = db.activos('equipos');
    const lect = reg?.lecturas || {};
    const acc = reg?.acciones || {};

    const filas = equipos
      .map((e) => {
        const v = lect[e.id];
        const est = App.evaluarTemp(v, e.objetivoMax, e.criticoMax);
        return `<div class="temp-fila" data-eq="${e.id}" data-estado="${est}">
          <div class="temp-nombre"><b>${esc(e.nombre)}</b><small>${textoLimite(e)}</small></div>
          <div class="temp-input"><input name="t_${e.id}" inputmode="decimal" autocomplete="off" value="${esc(U.fmtNum(v))}" placeholder="ºC"><span>ºC</span></div>
          <div class="temp-accion" ${est === 'fuera' ? '' : 'hidden'}>
            <label class="campo"><span>Fuera de límite: ¿qué se ha hecho? (acción correctora)</span>
            <textarea name="a_${e.id}" rows="2" placeholder="Ej.: se regula el termostato y se pasan los productos a otra cámara; se avisa al técnico">${esc(acc[e.id] || '')}</textarea></label>
          </div>
        </div>`;
      })
      .join('');

    App.vista().innerHTML = `
      ${App.cabecera('Temperaturas de equipos', 'Registro diario · PCC2 y PCC3 · se anota la temperatura del visor de cada equipo', `<a class="btn" href="#/temperaturas/mes">Ver mes</a>`)}
      <form id="f-temp" class="tarjeta">
        <div class="fila-campos">
          <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${fecha}" max="${U.hoy()}"></label>
          ${App.selectPersona('quien', reg?.quien)}
        </div>
        ${reg ? `<p class="aviso-info">Ya hay registro de este día (por ${esc(reg.quien)}). Si lo cambias se actualizará.</p>` : ''}
        <div class="temp-lista">${filas}</div>
        <label class="campo"><span>Observaciones</span><textarea name="obs" rows="2">${esc(reg?.obs || '')}</textarea></label>
        <div class="acciones"><button class="btn btn-primario btn-grande" type="submit">Guardar temperaturas</button></div>
      </form>`;

    const form = document.getElementById('f-temp');
    form.fecha.addEventListener('change', () => (location.hash = `#/temperaturas?fecha=${form.fecha.value}`));
    form.addEventListener('input', (e) => {
      const fila = e.target.closest('.temp-fila');
      if (!fila || !e.target.name.startsWith('t_')) return;
      const eq = db.obtener('equipos', fila.dataset.eq);
      const est = App.evaluarTemp(U.num(e.target.value), eq.objetivoMax, eq.criticoMax);
      fila.dataset.estado = est;
      fila.querySelector('.temp-accion').hidden = est !== 'fuera';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = U.leerForm(form);
      if (!d.quien) return U.toast('Elige quién hace el registro', 'error');
      const lecturas = {};
      const acciones = {};
      const fuera = [];
      for (const eq of equipos) {
        const raw = d['t_' + eq.id];
        if (raw === '') continue;
        const v = U.num(raw);
        if (v === null) return U.toast(`Temperatura no válida en ${eq.nombre}`, 'error');
        lecturas[eq.id] = v;
        if (App.evaluarTemp(v, eq.objetivoMax, eq.criticoMax) === 'fuera') {
          if (!d['a_' + eq.id]) return U.toast(`Indica la acción correctora para ${eq.nombre}`, 'error');
          acciones[eq.id] = d['a_' + eq.id];
          fuera.push(eq);
        }
      }
      if (!Object.keys(lecturas).length) return U.toast('No has anotado ninguna temperatura', 'error');
      const faltan = equipos.filter((eq) => !(eq.id in lecturas));
      if (faltan.length && !(await App.confirmar(`Faltan ${faltan.length} equipos sin temperatura (${faltan.map((x) => x.nombre).join(', ')}). ¿Guardar igualmente?`))) return;

      const r = reg || { tipo: TIPO, fecha: d.fecha, incidencias: {} };
      r.lecturas = lecturas;
      r.acciones = acciones;
      r.quien = d.quien;
      r.obs = d.obs;
      r.incidencias = r.incidencias || {};
      for (const eq of fuera) {
        if (r.incidencias[eq.id]) continue; // ya abierta en un guardado anterior
        const inc = await App.crearIncidencia({
          plan: 'Temperaturas',
          descripcion: `${eq.nombre}: ${U.fmtNum(lecturas[eq.id])} ºC (límite crítico ${U.fmtNum(eq.criticoMax)} ºC) el ${U.fmtFecha(d.fecha)}`,
          accion: acciones[eq.id],
          quien: d.quien,
          origen: { tipo: TIPO, fecha: d.fecha },
        });
        r.incidencias[eq.id] = inc.numero;
      }
      await db.guardar('registros', r);
      U.ultimoUsuario(d.quien);
      U.toast(fuera.length ? `Guardado. Se ha abierto ${fuera.length} incidencia(s).` : 'Temperaturas guardadas');
      location.hash = '#/';
    });
  }

  // Vista mensual con el mismo formato que el registro en papel (p. 152)
  function renderMes(params) {
    const hoy = U.hoy();
    const mesParam = params.get('mes') || hoy.slice(0, 7);
    const [anio, mes] = mesParam.split('-').map(Number);
    App.vista().innerHTML = `
      ${App.cabecera('Temperaturas · vista mensual', '', `<a class="btn" href="#/temperaturas">Registrar hoy</a>`)}
      <div class="tarjeta">
        <label class="campo campo-corto"><span>Mes</span><input type="month" id="sel-mes" value="${mesParam}"></label>
        ${App.tablaTemperaturasMes(anio, mes, true)}
      </div>`;
    document.getElementById('sel-mes').addEventListener('change', (e) => (location.hash = `#/temperaturas/mes?mes=${e.target.value}`));
  }

  // Tabla reutilizada también por los informes
  App.tablaTemperaturasMes = (anio, mes, enlaces = false) => {
    const equipos = db.activos('equipos');
    const regs = db.registros(TIPO).filter((r) => r.fecha.startsWith(`${anio}-${U.pad(mes)}`));
    const porDia = Object.fromEntries(regs.map((r) => [r.fecha, r]));
    const hoy = U.hoy();
    let filas = '';
    for (let d = 1; d <= U.diasDelMes(anio, mes); d++) {
      const f = `${anio}-${U.pad(mes)}-${U.pad(d)}`;
      const r = porDia[f];
      const futuro = f > hoy;
      const celdas = equipos
        .map((e) => {
          const v = r?.lecturas?.[e.id];
          const est = App.evaluarTemp(v, e.objetivoMax, e.criticoMax);
          return `<td class="c-${est}">${U.fmtNum(v)}</td>`;
        })
        .join('');
      const incs = r ? Object.values(r.incidencias || {}).join(', ') : '';
      const diaTxt = enlaces && !futuro ? `<a href="#/temperaturas?fecha=${f}">${d}</a>` : d;
      filas += `<tr class="${!r && !futuro ? 'sin-registro' : ''}"><td>${diaTxt}</td>${celdas}<td>${esc(r?.quien || '')}</td><td>${esc(incs)}</td></tr>`;
    }
    return `<div class="tabla-scroll"><table class="tabla tabla-temp">
      <thead><tr><th>Día</th>${equipos.map((e) => `<th>${esc(e.nombre)}<small>≤ ${U.fmtNum(e.criticoMax)}</small></th>`).join('')}<th>Responsable</th><th>Incid. nº</th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  };

  App.vistas['temperaturas'] = render;
  App.vistas['temperaturas/mes'] = renderMes;
  App.TEMP_TIPO = TIPO;
})();
