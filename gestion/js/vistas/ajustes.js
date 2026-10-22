// Ajustes: datos de la empresa, límites, listas maestras y copia de seguridad.
(function () {
  const esc = U.esc;

  function render() {
    const e = db.empresa();
    const l = db.limites();
    const num = (n, label, v) => `<label class="campo"><span>${esc(label)}</span><input name="${n}" inputmode="decimal" value="${esc(U.fmtNum(v))}" required></label>`;

    App.vista().innerHTML = `
      ${App.cabecera('Ajustes')}
      <div class="rejilla-tarjetas">
        <a class="tarjeta enlace" href="#/ajustes/personal"><b>Personal</b><small>${db.activos('personal').length} personas activas</small></a>
        <a class="tarjeta enlace" href="#/ajustes/equipos"><b>Equipos de frío y límites</b><small>${db.activos('equipos').length} equipos</small></a>
        <a class="tarjeta enlace" href="#/ajustes/tareas"><b>Cuadro de limpieza</b><small>${db.activos('tareas').length} tareas</small></a>
        <a class="tarjeta enlace" href="#/ajustes/vehiculos"><b>Vehículos</b><small>${db.activos('vehiculos').length} vehículos</small></a>
        <a class="tarjeta enlace" href="#/ajustes/cuadernos"><b>Cuadernos de producción</b><small>${db.activos('cuadernos').length} cuadernos</small></a>
      </div>

      <form class="tarjeta" id="f-limites">
        <h2>Límites de control</h2>
        <div class="rejilla-campos">
          ${num('recepcionRefrigMax', 'Recepción refrigerados: máx. ºC (PCC1)', l.recepcionRefrigMax)}
          ${num('recepcionCongMax', 'Recepción congelados: máx. ºC (PCC1)', l.recepcionCongMax)}
          ${num('transporteObjetivoMax', 'Transporte: al cargar ≤ ºC', l.transporteObjetivoMax)}
          ${num('transporteCriticoMax', 'Transporte: límite crítico < ºC (PCC4)', l.transporteCriticoMax)}
          ${num('cloroMin', 'Cloro libre mínimo (mg/l)', l.cloroMin)}
          ${num('cloroMax', 'Cloro libre máximo (mg/l)', l.cloroMax)}
          ${num('aceitePolaresMax', 'Compuestos polares máx. (%)', l.aceitePolaresMax)}
        </div>
        <p class="tenue">Los límites de cada cámara/congelador se cambian en "Equipos de frío y límites".</p>
        <div class="acciones"><button class="btn btn-primario" type="submit">Guardar límites</button></div>
      </form>

      <form class="tarjeta" id="f-empresa">
        <h2>Datos de la empresa</h2>
        <div class="rejilla-campos">
          ${[['nombre', 'Nombre'], ['rgsaa', 'Nº RGSAA'], ['cif', 'CIF'], ['direccion', 'Dirección'], ['telefono', 'Teléfono'], ['titular', 'Titular / responsable del autocontrol'], ['edicionAppcc', 'Edición del APPCC'], ['consultora', 'Consultora externa']]
            .map(([n, t]) => `<label class="campo"><span>${t}</span><input name="${n}" value="${esc(e[n] || '')}"></label>`)
            .join('')}
        </div>
        <div class="acciones"><button class="btn btn-primario" type="submit">Guardar datos</button></div>
      </form>

      <form class="tarjeta" id="f-tablet">
        <h2>Tablet del obrador</h2>
        <p>En la tablet del obrador la app enseña solo botones grandes (temperaturas, limpieza, recepción, agua, incidencias) y oculta el menú y los ajustes. Para salir de ese modo se pide el PIN.</p>
        <div class="fila-campos">
          <label class="campo campo-corto"><span>PIN del encargado (4 cifras)</span><input name="pinObrador" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" value="${esc(e.pinObrador || '')}" required></label>
        </div>
        <div class="acciones izq"><button class="btn btn-primario" type="submit">Usar ESTE aparato como tablet del obrador</button></div>
      </form>

      <div class="tarjeta">
        <h2>Copia de seguridad</h2>
        <p>${db.modoNube ? 'Los datos están en la nube. Aun así, conviene descargar una copia de vez en cuando.' : '<b>Modo local:</b> los datos solo están en este navegador. Descarga copias con frecuencia.'}</p>
        <div class="acciones izq">
          <button class="btn" id="btn-exportar">Descargar copia (.json)</button>
          <label class="btn">Restaurar copia<input type="file" id="in-importar" accept=".json,application/json" hidden></label>
          ${db.modoNube ? '<button class="btn btn-peligro" id="btn-salir">Cerrar sesión</button>' : ''}
        </div>
      </div>`;

    const v = App.vista();
    v.querySelector('#f-limites').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = U.leerForm(ev.target);
      const nuevo = { ...l };
      for (const [k, val] of Object.entries(d)) {
        const n = U.num(val);
        if (n === null) return U.toast('Revisa los valores numéricos', 'error');
        nuevo[k] = n;
      }
      await db.guardar('config', nuevo);
      U.toast('Límites guardados');
    });
    v.querySelector('#f-empresa').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await db.guardar('config', { ...e, ...U.leerForm(ev.target) });
      U.toast('Datos guardados');
    });
    v.querySelector('#f-tablet').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const { pinObrador } = U.leerForm(ev.target);
      if (!/^\d{4}$/.test(pinObrador)) return U.toast('El PIN tiene que ser de 4 cifras', 'error');
      if (!(await App.confirmar('Este aparato pasará a enseñar solo la pantalla del obrador. Para volver a la app completa hará falta el PIN. ¿Seguir?'))) return;
      await db.guardar('config', { ...db.empresa(), pinObrador });
      App.ponerModoObrador(true);
      document.body.classList.add('modo-obrador');
      location.hash = '#/';
    });
    v.querySelector('#btn-exportar').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(db.exportar(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `copia-${(db.empresa()?.nombre || 'obrador').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${U.hoy()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    v.querySelector('#in-importar').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      try {
        const datos = JSON.parse(await f.text());
        if (!['Gestión Obradores', 'APPCC Salduba'].includes(datos.app)) throw new Error('El archivo no es una copia de esta app');
        if (!(await App.confirmar('Se añadirán/sobrescribirán los datos con los de la copia. ¿Continuar?'))) return;
        await db.importar(datos);
        U.toast('Copia restaurada');
        App.recargar();
      } catch (err) {
        U.toast(err.message, 'error');
      }
    });
    v.querySelector('#btn-salir')?.addEventListener('click', async () => {
      await db.cerrarSesion();
      location.reload();
    });
  }

  App.vistas['ajustes'] = render;

  App.vistas['ajustes/personal'] = () =>
    App.crud({
      col: 'personal',
      titulo: 'Personal',
      sub: 'Las personas activas aparecen en la lista "¿Quién lo hace?" de cada registro (sirve como firma).',
      nuevoTxt: 'Nueva persona',
      campos: [
        { n: 'nombre', l: 'Nombre', req: true },
        { n: 'puesto', l: 'Puesto / sección' },
        { n: 'formacion', l: 'Fecha última formación manipulador (dd/mm/aaaa)' },
      ],
      columnas: [
        ['Nombre', (p) => `<b>${esc(p.nombre)}</b>`],
        ['Puesto', (p) => esc(p.puesto || '')],
        ['Formación', (p) => esc(p.formacion || '')],
        ['Estado', (p) => (p.activo === false ? 'Baja' : 'Activo')],
      ],
    });

  App.vistas['ajustes/equipos'] = () =>
    App.crud({
      col: 'equipos',
      titulo: 'Equipos de frío y límites',
      sub: 'Refrigeración: objetivo 0-5 ºC, crítico 8 ºC · Congelación: objetivo -18 ºC, crítico -16 ºC (PCC2/PCC3).',
      nuevoTxt: 'Nuevo equipo',
      defecto: { tipo: 'refrigeracion', objetivoMax: 5, criticoMax: 8 },
      campos: [
        { n: 'nombre', l: 'Nombre', req: true },
        { n: 'tipo', l: 'Tipo', t: 'select', ops: [['refrigeracion', 'Refrigeración'], ['congelacion', 'Congelación'], ['sala', 'Sala climatizada']], req: true },
        { n: 'objetivoMax', l: 'Temperatura objetivo máx. (ºC)', t: 'numero', req: true },
        { n: 'criticoMax', l: 'Límite crítico máx. (ºC)', t: 'numero', req: true },
        { n: 'orden', l: 'Orden en el registro', t: 'numero' },
      ],
      columnas: [
        ['Orden', (e) => esc(e.orden ?? '')],
        ['Equipo', (e) => `<b>${esc(e.nombre)}</b>`],
        ['Tipo', (e) => ({ refrigeracion: 'Refrigeración', congelacion: 'Congelación', sala: 'Sala' }[e.tipo] || e.tipo)],
        ['Objetivo', (e) => `≤ ${U.fmtNum(e.objetivoMax)} ºC`],
        ['Crítico', (e) => `> ${U.fmtNum(e.criticoMax)} ºC`],
      ],
    });

  App.vistas['ajustes/vehiculos'] = () =>
    App.crud({
      col: 'vehiculos',
      titulo: 'Vehículos',
      sub: 'Solo los vehículos refrigerados llevan registro de temperatura de transporte.',
      nuevoTxt: 'Nuevo vehículo',
      campos: [
        { n: 'nombre', l: 'Nombre', req: true },
        { n: 'matricula', l: 'Matrícula' },
        { n: 'refrigerado', l: 'Tiene equipo de frío (registro de temperatura)', t: 'check' },
        { n: 'atp', l: 'Certificado ATP: caducidad (dd/mm/aaaa)' },
      ],
      columnas: [
        ['Vehículo', (x) => `<b>${esc(x.nombre)}</b>`],
        ['Matrícula', (x) => esc(x.matricula || '')],
        ['Refrigerado', (x) => (x.refrigerado ? 'Sí' : 'No')],
        ['ATP', (x) => esc(x.atp || '')],
      ],
    });

  App.vistas['ajustes/tareas'] = () =>
    App.crud({
      col: 'tareas',
      titulo: 'Cuadro de limpieza',
      sub: 'Tareas del Plan de Limpieza y Desinfección con su frecuencia. ALC = zona de alimentos listos para consumo (riesgo Listeria).',
      nuevoTxt: 'Nueva tarea',
      defecto: { frecuencia: 'diaria', producto: 'Lavavajillas manual (L+D)' },
      campos: [
        { n: 'zona', l: 'Zona', req: true },
        { n: 'elemento', l: 'Elemento', req: true },
        { n: 'frecuencia', l: 'Frecuencia', t: 'select', ops: Object.entries(U.FRECUENCIAS).map(([k, v]) => [k, v.txt]), req: true },
        { n: 'producto', l: 'Producto' },
        { n: 'responsable', l: 'Responsable' },
        { n: 'alc', l: 'Zona ALC (Listeria)', t: 'check' },
        { n: 'orden', l: 'Orden', t: 'numero' },
      ],
      columnas: [
        ['Zona', (t) => esc(t.zona)],
        ['Elemento', (t) => `<b>${esc(t.elemento)}</b>${t.alc ? ' <span class="etq">ALC</span>' : ''}`],
        ['Frecuencia', (t) => esc(U.FRECUENCIAS[t.frecuencia]?.txt || t.frecuencia)],
        ['Producto', (t) => esc(t.producto || '')],
        ['Responsable', (t) => esc(t.responsable || '')],
      ],
    });
})();
