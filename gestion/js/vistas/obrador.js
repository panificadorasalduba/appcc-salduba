// Tablet del obrador: cuatro botones grandes (LOTES, TEMPERATURAS, PRODUCCIÓN y AGUA),
// con el mismo formato que la tablet que ya se usa en Salduba. Todo se guarda en los
// mismos registros que usa el administrador, así sale igual en sus pantallas e informes.
(function () {
  const esc = U.esc;

  const lunes = () => U.lunesDeSemana(U.hoy());
  const aguaSemana = () => db.registros('agua').filter((r) => r.fecha >= lunes() && r.fecha <= U.hoy()).sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null;
  const tempHoy = () => db.registros(App.TEMP_TIPO).find((r) => r.fecha === U.hoy()) || null;

  // Quién apunta: se elige arriba y la tablet lo recuerda
  const lineaQuien = () => `<div class="ob-quien">${App.selectPersona('quien', undefined, 'Quién apunta')}</div>`;
  function quienDe(v) {
    const sel = v.querySelector('[name=quien]');
    sel?.addEventListener('change', () => U.ultimoUsuario(sel.value));
    return () => {
      const q = (sel?.value || '').trim();
      if (!q) {
        U.toast('Elige quién apunta', 'error');
        sel?.focus();
      }
      return q;
    };
  }

  const avisoEncargado = (html) =>
    new Promise((resolve) => {
      const m = App.modal(`<div class="ob-alerta"><h2>⚠ Avisa al encargado</h2><p>${html}</p><button type="button" class="btn btn-grande bloque" data-vale>Vale</button></div>`);
      m.el.querySelector('[data-vale]').onclick = () => (m.cerrar(), resolve());
    });

  // ---------- Inicio ----------
  function render() {
    const equipos = App.equiposObrador();
    const t = tempHoy();
    const nTemp = equipos.filter((e) => t?.lecturas?.[e.id] !== undefined).length;
    const alertas = equipos.filter((e) => App.evaluarTemp(t?.lecturas?.[e.id], e.objetivoMax, e.criticoMax, e.objetivoMin, e.criticoMin) === 'fuera').length;
    const agua = aguaSemana();
    const boton = (href, icono, titulo, detalle, color) =>
      `<a class="boton-obrador" style="background:${color}" href="${href}"><span class="bo-icono">${icono}</span><span><span class="bo-titulo">${esc(titulo)}</span><span class="bo-detalle">${esc(detalle)}</span></span></a>`;
    App.vista().innerHTML = `
      <div class="obrador-inicio">
        <div class="ob-cab"><b>Obrador</b><span>${esc(U.fmtFechaLarga(U.hoy()))}</span></div>
        ${boton('#/lotes', '📦', 'LOTES', `${App.lotesAbiertos().length} abiertos ahora · abrir y cerrar sacos, cubos y cajas`, '#c2410c')}
        ${boton('#/obrador-temperaturas', '🌡️', 'TEMPERATURAS', `${alertas ? `⚠ ${alertas} fuera de rango · ` : ''}Hoy: ${nTemp} de ${equipos.length} apuntadas`, alertas ? '#b42318' : equipos.length && nTemp >= equipos.length ? '#1e7b46' : '#2747d1')}
        ${boton('#/produccion', '🥐', 'PRODUCCIÓN', 'Apuntar las unidades que se hacen hoy', '#7a5426')}
        ${boton('#/obrador-agua', '💧', 'AGUA', agua ? `Esta semana ya está hecha ✔ (${U.fmtFecha(agua.fecha)})` : 'Toma de agua semanal: falta esta semana', agua ? '#1e7b46' : '#16739a')}
        ${db.esAdmin() ? '<p class="centro"><a href="#" class="enlace-tenue" id="salir-obrador">Salir de la pantalla del obrador</a></p>' : ''}
      </div>`;
    App.vista().querySelector('#salir-obrador')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      salir();
    });
  }

  // ---------- Temperaturas: un botón por cámara ----------
  function renderTemperaturas() {
    const equipos = App.equiposObrador();
    const t = tempHoy();
    const lect = t?.lecturas || {};
    const hechas = equipos.filter((e) => lect[e.id] !== undefined).length;
    App.vista().innerHTML = `
      <div class="ob-pantalla">
        <h1>TEMPERATURAS</h1>
        <p class="ob-estado ${hechas >= equipos.length ? 'ok' : ''}">Apuntadas hoy: <b>${hechas} de ${equipos.length}</b>. Toca cada cámara y escribe lo que marca su termómetro.</p>
        ${lineaQuien()}
        ${equipos
          .map((e) => {
            const v = lect[e.id];
            const est = App.evaluarTemp(v, e.objetivoMax, e.criticoMax, e.objetivoMin, e.criticoMin);
            return `<button type="button" class="ob-fila ob-${est || 'vacia'}" data-eq="${e.id}">
              <span><b>${esc(e.nombre)}</b><small>Crítico ${App.limiteCritico(e)}${e.objetivoMax != null ? ` · lo normal ${App.rangoNormal(e)}` : ''}</small></span>
              <span class="ob-valor">${v !== undefined ? U.fmtNum(v) + ' º' : 'Tocar'}</span></button>`;
          })
          .join('')}
      </div>`;
    const v = App.vista();
    const quien = quienDe(v);
    v.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-eq]');
      if (!b) return;
      const q = quien();
      if (!q) return;
      const e = db.obtener('equipos', b.dataset.eq);
      const valor = await App.teclado(`🌡️ ${esc(e.nombre)}`, `Lo normal ${App.rangoNormal(e)}. Usa «− bajo cero» en congeladores.`, { negativo: true, valor: tempHoy()?.lecturas?.[e.id] ?? '' });
      if (valor === null) return;
      const r = tempHoy() || { tipo: App.TEMP_TIPO, fecha: U.hoy(), lecturas: {}, acciones: {}, incidencias: {} };
      r.lecturas = { ...(r.lecturas || {}), [e.id]: valor };
      r.acciones = r.acciones || {};
      r.incidencias = r.incidencias || {};
      const ya = String(r.quien || '').split(/\s*,\s*/).filter(Boolean);
      r.quien = ya.includes(q) ? r.quien : [...ya, q].join(', ');
      const fuera = App.evaluarTemp(valor, e.objetivoMax, e.criticoMax, e.objetivoMin, e.criticoMin) === 'fuera';
      if (fuera && !r.incidencias[e.id]) {
        r.acciones[e.id] = 'Avisado el encargado desde la tablet';
        const inc = await App.crearIncidencia({
          plan: 'Temperaturas',
          descripcion: `${e.nombre}: ${U.fmtNum(valor)} ºC (límite crítico ${App.limiteCritico(e)}) el ${U.fmtFecha(r.fecha)}`,
          accion: r.acciones[e.id],
          quien: q,
          origen: { tipo: App.TEMP_TIPO, fecha: r.fecha },
        });
        r.incidencias[e.id] = inc.numero;
      }
      await db.guardar('registros', r);
      U.ultimoUsuario(q);
      if (fuera) await avisoEncargado(`<b>${esc(e.nombre)}</b> marca <b>${U.fmtNum(valor)} ºC</b> y el límite es ${App.limiteCritico(e)}.`);
      App.recargar();
    });
  }

  // ---------- Agua: toma semanal (cloro y olor, color, sabor, turbidez) ----------
  // El manual pide rotar el punto de muestreo: se propone el grifo siguiente al de la última toma
  const puntos = () => App.DEFS_REGISTROS.agua.campos.find((c) => c.n === 'punto').ops.filter((p) => p !== 'Otro');
  function puntoSiguiente() {
    const ult = db.registros('agua').sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const ps = puntos();
    const i = ps.indexOf(ult?.punto);
    return ps[(i + 1) % ps.length];
  }

  function renderAgua() {
    const agua = aguaSemana();
    const L = db.limites();
    let punto = puntoSiguiente();
    const ultimas = db.registros('agua').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
    App.vista().innerHTML = `
      <div class="ob-pantalla">
        <h1>AGUA</h1>
        <p class="ob-estado ${agua ? 'ok' : ''}">${agua ? `✔ Esta semana ya está hecha (${U.fmtFecha(agua.fecha)}).` : 'Falta la toma de agua de <b>esta semana</b>.'}</p>
        ${lineaQuien()}
        <p class="ob-punto">Grifo de hoy: <b id="ob-punto">${esc(punto)}</b> · <a href="#" id="ob-cambiar-punto">cambiar</a></p>
        <button type="button" class="btn btn-primario btn-grande bloque ob-grande" id="ob-apuntar-agua">💧 Apuntar toma de agua de hoy</button>
        <p class="tenue">Se mide el cloro libre con el kit. Lo correcto: entre ${U.fmtNum(L.cloroMin)} y ${U.fmtNum(L.cloroMax)} mg/l.</p>
        ${ultimas.length ? `<h2>Últimas tomas</h2>${ultimas.map((r) => `<div class="ob-ultima">${U.fmtFecha(r.fecha)} · ${esc(r.punto || '')} · cloro <b>${U.fmtNum(r.cloro)} mg/l</b>${r.incidencia ? ' · <b class="txt-fuera">revisar</b>' : ' ✔'}</div>`).join('')}` : ''}
      </div>`;
    const v = App.vista();
    const quien = quienDe(v);
    v.querySelector('#ob-cambiar-punto').addEventListener('click', (ev) => {
      ev.preventDefault();
      const m = App.modal(`<div><h2>¿De qué grifo coges el agua?</h2>${puntos()
        .map((p) => `<button type="button" class="btn btn-grande bloque" data-p="${esc(p)}">${esc(p)}</button>`)
        .join('')}</div>`);
      m.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-p]');
        if (!b) return;
        punto = b.dataset.p;
        v.querySelector('#ob-punto').textContent = punto;
        m.cerrar();
      });
    });
    v.querySelector('#ob-apuntar-agua').addEventListener('click', async () => {
      const q = quien();
      if (!q) return;
      const cloro = await App.teclado('Cloro del agua', `¿Cuánto marca el kit? (mg/l), lo normal es ${U.fmtNum(L.cloroMin)}`, { valor: L.cloroMin, boton: 'Siguiente' });
      if (cloro === null) return;
      const normal = await new Promise((resolve) => {
        const m = App.modal(`<div class="ob-pregunta"><h2>¿El agua huele, sabe y se ve normal?</h2><p class="tenue">Sin olor raro, sin color y transparente.</p>
          <button type="button" class="btn btn-grande bloque btn-ok" data-r="si">Sí, todo normal</button>
          <button type="button" class="btn btn-grande bloque btn-peligro" data-r="no">No, hay algo raro</button>
          <button type="button" class="btn btn-grande bloque" data-r="">Cancelar</button></div>`);
        m.el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-r]');
          if (e.target === m.el) resolve(null);
          if (!b) return;
          m.cerrar();
          resolve(b.dataset.r === '' ? null : b.dataset.r === 'si');
        });
      });
      if (normal === null) return;
      const ok = normal ? 'ok' : 'mal';
      const r = { tipo: 'agua', fecha: U.hoy(), punto, cloro, olor: ok, color: ok, sabor: ok, turbidez: ok, quien: q, obs: 'Apuntado en la tablet del obrador' };
      const problemas = App.DEFS_REGISTROS.agua.evaluar(r);
      if (problemas.length) {
        r.accion = 'Avisado el encargado; agua embotellada mientras tanto';
        const inc = await App.crearIncidencia({ plan: 'Agua', descripcion: `Control de agua (${punto}): ${problemas.join('; ')}`, accion: r.accion, quien: q, origen: { tipo: 'agua', fecha: r.fecha } });
        r.incidencia = inc.numero;
      }
      await db.guardar('registros', r);
      U.ultimoUsuario(q);
      if (problemas.length) await avisoEncargado(`${problemas.map(esc).join('<br>')}<br>Mientras tanto, no la uséis para elaborar: usad agua embotellada.`);
      else U.toast(`Guardado ✔ Cloro ${U.fmtNum(cloro)} mg/l · todo normal`);
      location.hash = '#/';
    });
  }

  function salir() {
    const pin = String(db.empresa()?.pinObrador || '');
    const terminar = () => {
      App.ponerModoObrador(false);
      document.body.classList.remove('modo-obrador');
      location.hash = '#/';
      App.recargar();
    };
    if (!pin) return terminar();
    App.modal(
      `<form><h2>Salir de la pantalla del obrador</h2>
        <label class="campo"><span>PIN del encargado</span><input name="pin" type="password" inputmode="numeric" autocomplete="off" required></label>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Salir</button></div>
      </form>`,
      {
        onSubmit: (d) => {
          if (d.pin !== pin) {
            U.toast('PIN incorrecto', 'error');
            return false;
          }
          terminar();
        },
      }
    );
  }

  App.vistas['obrador'] = render;
  App.vistas['obrador-temperaturas'] = renderTemperaturas;
  App.vistas['obrador-agua'] = renderAgua;
})();
