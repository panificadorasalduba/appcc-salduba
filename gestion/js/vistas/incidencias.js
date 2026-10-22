// Registro de incidencias y acciones correctoras (común a todos los planes).
(function () {
  const esc = U.esc;

  function render(params) {
    const ver = params.get('ver') || 'abiertas';
    let incs = db.lista('incidencias').sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
    if (ver === 'abiertas') incs = incs.filter((i) => i.estado !== 'cerrada');
    if (ver === 'cerradas') incs = incs.filter((i) => i.estado === 'cerrada');

    App.vista().innerHTML = `
      ${App.cabecera('Incidencias', 'Se abren solas cuando un registro sale de límite. También puedes abrirlas a mano (avería, plagas, residuos…)', `<button class="btn btn-primario" id="btn-nueva">+ Nueva incidencia</button>`)}
      <div class="pestanas">
        <a href="#/incidencias?ver=abiertas" class="${ver === 'abiertas' ? 'activa' : ''}">Abiertas</a>
        <a href="#/incidencias?ver=cerradas" class="${ver === 'cerradas' ? 'activa' : ''}">Cerradas</a>
        <a href="#/incidencias?ver=todas" class="${ver === 'todas' ? 'activa' : ''}">Todas</a>
      </div>
      ${incs.length ? incs.map(tarjeta).join('') : `<div class="tarjeta vacio">${ver === 'abiertas' ? '✔ No hay incidencias abiertas.' : 'No hay incidencias.'}</div>`}`;

    const v = App.vista();
    v.querySelector('#btn-nueva').addEventListener('click', () => nueva());
    v.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cerrar-inc]');
      if (b) cerrar(db.obtener('incidencias', b.dataset.cerrarInc));
      const r = e.target.closest('[data-reabrir]');
      if (r) reabrir(db.obtener('incidencias', r.dataset.reabrir));
    });
  }

  const tarjeta = (i) => `
    <article class="tarjeta incidencia ${i.estado === 'cerrada' ? 'cerrada' : ''}">
      <div class="inc-cab">
        <b>Nº ${esc(i.numero)}</b> ${App.chip('neutro', i.plan)}
        ${i.estado === 'cerrada' ? App.chip('ok', 'Cerrada ' + U.fmtFecha(i.fechaCierre)) : App.chip('fuera', 'Abierta')}
      </div>
      <p>${esc(i.descripcion)}</p>
      <dl class="datos">
        <dt>Apertura</dt><dd>${U.fmtFecha(i.fechaApertura)} · ${esc(i.quien || '')}</dd>
        <dt>Acción correctora</dt><dd>${esc(i.accion || '—')}</dd>
        ${i.estado === 'cerrada' ? `<dt>Cierre</dt><dd>${esc(i.cerradaPor)}${i.verificacion ? ' · Verificado por ' + esc(i.verificacion) : ''}</dd>` : ''}
      </dl>
      <div class="acciones">${i.estado === 'cerrada' ? `<button class="btn" data-reabrir="${i.id}">Reabrir</button>` : `<button class="btn btn-primario" data-cerrar-inc="${i.id}">Cerrar incidencia</button>`}</div>
    </article>`;

  function nueva() {
    App.modal(
      `<form><h2>Nueva incidencia</h2>
        <div class="rejilla-campos">
          <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${U.hoy()}" required></label>
          <label class="campo"><span>Plan</span>${App.selectOpciones('plan', App.PLANES, '', { required: true })}</label>
          <label class="campo campo-ancho"><span>Descripción del problema</span><textarea name="descripcion" rows="3" required></textarea></label>
          <label class="campo campo-ancho"><span>Acción correctora inmediata</span><textarea name="accion" rows="2"></textarea></label>
          ${App.selectPersona('quien', undefined, '¿Quién la registra?')}
        </div>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Abrir incidencia</button></div>
      </form>`,
      {
        ancho: true,
        onSubmit: async (d) => {
          const inc = await App.crearIncidencia({ plan: d.plan, descripcion: d.descripcion, accion: d.accion, quien: d.quien });
          if (d.fecha) {
            inc.fechaApertura = d.fecha;
            await db.guardar('incidencias', inc);
          }
          U.ultimoUsuario(d.quien);
          U.toast(`Incidencia ${inc.numero} abierta`);
          App.recargar();
        },
      }
    );
  }

  function cerrar(inc) {
    App.modal(
      `<form><h2>Cerrar incidencia Nº ${esc(inc.numero)}</h2>
        <p>${esc(inc.descripcion)}</p>
        <label class="campo campo-ancho"><span>Acción correctora realizada</span><textarea name="accion" rows="3" required>${esc(inc.accion || '')}</textarea></label>
        <div class="fila-campos">
          <label class="campo"><span>Fecha de cierre</span><input type="date" name="fechaCierre" value="${U.hoy()}" required></label>
          ${App.selectPersona('cerradaPor', undefined, '¿Quién la cierra?')}
        </div>
        <label class="campo"><span>Verificado por (responsable)</span>${App.selectOpciones('verificacion', db.activos('personal').map((p) => p.nombre))}</label>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Cerrar incidencia</button></div>
      </form>`,
      {
        onSubmit: async (d) => {
          Object.assign(inc, d, { estado: 'cerrada' });
          await db.guardar('incidencias', inc);
          U.toast('Incidencia cerrada');
          App.recargar();
        },
      }
    );
  }

  async function reabrir(inc) {
    if (!(await App.confirmar(`¿Reabrir la incidencia ${inc.numero}?`))) return;
    Object.assign(inc, { estado: 'abierta', fechaCierre: '', cerradaPor: '', verificacion: '' });
    await db.guardar('incidencias', inc);
    App.recargar();
  }

  App.tablaIncidencias = (incs) => {
    if (!incs.length) return '<p class="vacio">Sin incidencias en este periodo.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Nº</th><th>Apertura</th><th>Plan</th><th>Descripción</th><th>Quién registra</th><th>Acción correctora</th><th>Cierre</th><th>Quién cierra</th><th>Verifica</th></tr></thead>
      <tbody>${incs
        .map(
          (i) => `<tr><td>${esc(i.numero)}</td><td>${U.fmtFecha(i.fechaApertura)}</td><td>${esc(i.plan)}</td><td>${esc(i.descripcion)}</td><td>${esc(i.quien || '')}</td><td>${esc(i.accion || '')}</td><td>${i.estado === 'cerrada' ? U.fmtFecha(i.fechaCierre) : '<b>ABIERTA</b>'}</td><td>${esc(i.cerradaPor || '')}</td><td>${esc(i.verificacion || '')}</td></tr>`
        )
        .join('')}</tbody></table></div>`;
  };

  App.vistas['incidencias'] = render;
})();
