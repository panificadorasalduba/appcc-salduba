// Plan de limpieza y desinfección: tareas del cuadro con su frecuencia y registro de ejecución.
(function () {
  const esc = U.esc;
  const TIPO = 'limpieza';

  // Última vez que se hizo cada tarea
  App.ultimasLimpiezas = () => {
    const ult = {};
    for (const r of db.registros(TIPO)) if (!ult[r.tareaId] || r.fecha > ult[r.tareaId].fecha) ult[r.tareaId] = r;
    return ult;
  };

  // Estado de una tarea: { estado: 'pendiente'|'ok'|'uso', proxima, ultima }
  App.estadoTarea = (t, ult, hoy = U.hoy()) => {
    const dias = U.FRECUENCIAS[t.frecuencia]?.dias;
    const ultima = ult[t.id]?.fecha || null;
    if (!dias) return { estado: 'uso', ultima, proxima: null };
    // Tareas no diarias/semanales sin ninguna limpieza anotada: no se sabe cuándo tocan
    if (!ultima && dias > 7) return { estado: 'sin_fecha', ultima, proxima: null };
    const proxima = ultima ? U.sumarDias(ultima, dias) : hoy;
    return { estado: proxima <= hoy ? 'pendiente' : 'ok', ultima, proxima, retraso: ultima ? U.diasEntre(proxima, hoy) : null };
  };

  function render(params) {
    const filtro = params.get('ver') || 'pendientes';
    const hoy = U.hoy();
    const ult = App.ultimasLimpiezas();
    const tareas = db.activos('tareas');
    const hechasHoy = db.registros(TIPO).filter((r) => r.fecha === hoy);

    const grupos = {};
    for (const t of tareas) {
      const st = App.estadoTarea(t, ult, hoy);
      if (filtro === 'pendientes' && st.estado !== 'pendiente') continue;
      if (filtro === 'sin_fecha' && st.estado !== 'sin_fecha') continue;
      (grupos[t.zona] = grupos[t.zona] || []).push({ t, st });
    }

    const zonas = Object.entries(grupos)
      .map(
        ([zona, items]) => `
        <section class="tarjeta">
          <h2>${esc(zona)}</h2>
          ${items
            .map(({ t, st }) => {
              let estado;
              if (st.estado === 'pendiente') estado = App.chip('fuera', st.ultima ? (st.retraso > 0 ? `Atrasada ${st.retraso} d` : 'Toca hoy') : 'Sin registrar');
              else if (st.estado === 'uso') estado = App.chip('neutro', 'Tras cada uso');
              else if (st.estado === 'sin_fecha') estado = App.chip('aviso', 'Sin fecha anotada');
              else estado = App.chip('ok', `Próxima ${U.fmtFecha(st.proxima)}`);
              return `<label class="tarea">
                <input type="checkbox" value="${t.id}">
                <div class="tarea-txt"><b>${esc(t.elemento)}</b>${t.alc ? ' <span class="etq">ALC</span>' : ''}
                  <small>${esc(U.FRECUENCIAS[t.frecuencia]?.txt || t.frecuencia)} · ${esc(t.producto)} · ${esc(t.responsable)}${st.ultima ? ` · última: ${U.fmtFecha(st.ultima)} (${esc(ult[t.id].quien)})` : ''}</small></div>
                ${estado}
              </label>`;
            })
            .join('')}
        </section>`
      )
      .join('');

    App.vista().innerHTML = `
      ${App.cabecera('Limpieza y desinfección', 'Marca las tareas al terminar la limpieza. Hechas hoy: ' + hechasHoy.length,
        `<a class="btn" href="#/limpieza/historial">Historial</a>`)}
      <div class="pestanas">
        <a href="#/limpieza?ver=pendientes" class="${filtro === 'pendientes' ? 'activa' : ''}">Pendientes</a>
        <a href="#/limpieza?ver=sin_fecha" class="${filtro === 'sin_fecha' ? 'activa' : ''}">Sin fecha anotada</a>
        <a href="#/limpieza?ver=todas" class="${filtro === 'todas' ? 'activa' : ''}">Todas las tareas</a>
      </div>
      ${filtro === 'sin_fecha' ? '<p class="aviso-info">Tareas mensuales, trimestrales, anuales… de las que aún no hay ninguna limpieza anotada. Márcalas con la fecha en que se hicieron por última vez y la app calculará cuándo toca la siguiente.</p>' : ''}
      ${zonas || '<div class="tarjeta vacio">✔ No hay limpiezas pendientes para hoy.</div>'}
      <div class="barra-flotante" id="barra-limp" hidden>
        <span id="n-sel"></span>
        <button class="btn btn-primario" id="btn-marcar">Marcar como hechas</button>
      </div>`;

    const v = App.vista();
    const barra = v.querySelector('#barra-limp');
    const seleccion = () => [...v.querySelectorAll('.tarea input:checked')].map((i) => i.value);
    v.addEventListener('change', () => {
      const n = seleccion().length;
      barra.hidden = !n;
      v.querySelector('#n-sel').textContent = `${n} seleccionada(s)`;
    });
    v.querySelector('#btn-marcar').addEventListener('click', () => marcar(seleccion()));
  }

  function marcar(ids) {
    const nombres = ids.map((id) => db.obtener('tareas', id)).map((t) => `${t.zona}: ${t.elemento}`);
    App.modal(
      `<form>
        <h2>Registrar limpieza</h2>
        <ul class="lista-compacta">${nombres.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <div class="fila-campos">
          <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${U.hoy()}" max="${U.hoy()}" required></label>
          ${App.selectPersona('quien')}
        </div>
        <label class="campo"><span>¿Quién supervisa? (opcional)</span>${App.selectOpciones('supervisa', db.activos('personal').map((p) => p.nombre))}</label>
        <label class="check"><input type="checkbox" name="anomalia"> Se ha detectado alguna anomalía (abre incidencia)</label>
        <label class="campo"><span>Observaciones / anomalía</span><textarea name="obs" rows="2"></textarea></label>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        onSubmit: async (d) => {
          if (d.anomalia && !d.obs) {
            U.toast('Describe la anomalía', 'error');
            return false;
          }
          let numInc = '';
          if (d.anomalia) {
            const inc = await App.crearIncidencia({ plan: 'Limpieza y desinfección', descripcion: `${nombres.join('; ')} — ${d.obs}`, quien: d.quien, origen: { tipo: TIPO, fecha: d.fecha } });
            numInc = inc.numero;
          }
          for (const id of ids) {
            await db.guardar('registros', { tipo: TIPO, fecha: d.fecha, tareaId: id, quien: d.quien, supervisa: d.supervisa, obs: d.obs, incidencia: numInc });
          }
          U.ultimoUsuario(d.quien);
          U.toast(`${ids.length} limpieza(s) registradas`);
          App.recargar();
        },
      }
    );
  }

  function renderHistorial(params) {
    const mesParam = params.get('mes') || U.hoy().slice(0, 7);
    const regs = db
      .registros(TIPO)
      .filter((r) => r.fecha.startsWith(mesParam))
      .sort((a, b) => (b.fecha + (b.modificado || '')).localeCompare(a.fecha + (a.modificado || '')));
    App.vista().innerHTML = `
      ${App.cabecera('Historial de limpieza', '', `<a class="btn" href="#/limpieza">Volver</a>`)}
      <div class="tarjeta">
        <label class="campo campo-corto"><span>Mes</span><input type="month" id="sel-mes" value="${mesParam}"></label>
        ${App.tablaLimpiezaMes(regs, true)}
      </div>`;
    document.getElementById('sel-mes').addEventListener('change', (e) => (location.hash = `#/limpieza/historial?mes=${e.target.value}`));
    App.vista().addEventListener('click', async (e) => {
      const b = e.target.closest('[data-borrar]');
      if (!b) return;
      if (await App.confirmar('¿Borrar este registro de limpieza?')) {
        await db.borrar('registros', b.dataset.borrar);
        App.recargar();
      }
    });
  }

  App.tablaLimpiezaMes = (regs, conBorrar = false) => {
    if (!regs.length) return '<p class="vacio">Sin registros en este periodo.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Zona</th><th>Elemento</th><th>Quién</th><th>Supervisa</th><th>Incid. nº</th>${conBorrar ? '<th></th>' : ''}</tr></thead>
      <tbody>${regs
        .map((r) => {
          const t = db.obtener('tareas', r.tareaId) || { zona: '?', elemento: '(tarea eliminada)' };
          return `<tr><td>${U.fmtFecha(r.fecha)}</td><td>${esc(t.zona)}</td><td>${esc(t.elemento)}</td><td>${esc(r.quien)}</td><td>${esc(r.supervisa || '')}</td><td>${esc(r.incidencia || '')}</td>${conBorrar ? `<td><button class="btn-icono" data-borrar="${r.id}" title="Borrar">✕</button></td>` : ''}</tr>`;
        })
        .join('')}</tbody></table></div>`;
  };

  App.vistas['limpieza'] = render;
  App.vistas['limpieza/historial'] = renderHistorial;
})();
