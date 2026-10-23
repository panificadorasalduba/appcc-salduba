// Plan de mantenimiento: partes de trabajo y facturas de reparación (correctivo) y
// tareas programadas (preventivo). El manual pide conservar los partes y facturas de
// arreglos de equipos que influyan en los alimentos y de las instalaciones, al menos 2 años,
// y anotar cada avería en el Registro de Incidencias.
//
// Los partes se guardan como registros "visita" de categoría «Mantenimiento / avería»
// (siguen saliendo en Visitas). Identificador fijo (fecha + nº de parte): no se duplican.
(function () {
  const esc = U.esc;
  const CATEGORIA = 'Mantenimiento / avería';
  const TIPO_PLAN = 'mant-plan';
  const limpio = (s) => U.norm(s).replace(/[^a-z0-9]+/g, '_');
  const TIPOS = { correctivo: 'Correctivo (avería)', preventivo: 'Preventivo (programado)' };

  const partes = () => db.registros('visita').filter((r) => r.categoria === CATEGORIA);
  const planes = () => db.registros(TIPO_PLAN).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // Cualquier incidencia abierta puede cerrarla un arreglo (p. ej. una cámara que no enfría está en Temperaturas)
  const incidenciasAbiertas = () => db.lista('incidencias').filter((i) => i.estado !== 'cerrada').sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
  const sumarMeses = (iso, n) => {
    const d = U.parse(iso);
    d.setMonth(d.getMonth() + Number(n));
    return U.fechaISO(d);
  };

  // Estado de una tarea preventiva: última vez (parte enlazado o fecha anotada) y próxima
  function estadoPlan(p) {
    const ultima = [p.ultima, ...partes().filter((r) => r.planId === p.id).map((r) => r.fecha)].filter(Boolean).sort().pop() || '';
    if (!ultima) return { ultima, proxima: '', estado: 'aviso', txt: 'Sin fecha de la última vez' };
    const proxima = sumarMeses(ultima, p.meses);
    const dias = U.diasEntre(U.hoy(), proxima);
    if (dias < 0) return { ultima, proxima, estado: 'fuera', txt: `Vencida desde el ${U.fmtFecha(proxima)}` };
    if (dias <= 30) return { ultima, proxima, estado: 'aviso', txt: `Toca antes del ${U.fmtFecha(proxima)}` };
    return { ultima, proxima, estado: 'ok', txt: `Próxima: ${U.fmtFecha(proxima)}` };
  }

  App.avisosMantenimiento = () =>
    planes()
      .map((p) => ({ p, e: estadoPlan(p) }))
      .filter(({ e }) => e.proxima && e.estado !== 'ok')
      .map(({ p, e }) => ({ estado: e.estado, titulo: `Mantenimiento: ${p.nombre}`, detalle: e.txt, enlace: '#/mantenimiento' }));

  const resumen = (r) => [TIPOS[r.tipoMant] || '', r.equipo, r.averia ? 'Avería: ' + r.averia : '', r.trabajo ? 'Trabajo: ' + r.trabajo : ''].filter(Boolean).join(' · ');

  // ---------- Parte de trabajo / factura ----------
  function abrirParte({ datos = {}, archivos = [], reg = null, previo = {} } = {}) {
    const v = reg || { ...datos, ...previo };
    const fecha = reg ? reg.fecha : App.Albaranes.fechaLeida(datos.fecha) || U.hoy();
    const abiertas = incidenciasAbiertas();
    const m = App.modal(
      `<form>
        <h2>${reg ? 'Editar parte de mantenimiento' : 'Parte de trabajo / factura de reparación'}</h2>
        ${archivos.length ? `<p class="sub">Leído de ${archivos.map((a) => esc(a.nombre)).join(', ')}. Revisa los datos antes de guardar.</p>` : ''}
        <div class="rejilla-campos">
          <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${fecha}" max="${U.hoy()}" required></label>
          <label class="campo"><span>Empresa / técnico</span><input name="empresa" list="dl-prov-mant" value="${esc(v.empresa || '')}" required></label>
          <label class="campo"><span>Nº de parte o factura</span><input name="documento" value="${esc(reg ? reg.documento : datos.numDocumento || '')}"></label>
          <label class="campo"><span>Tipo</span>${App.selectOpciones('tipoMant', Object.entries(TIPOS), v.tipoMant || v.tipo || 'correctivo', { vacio: false })}</label>
          <label class="campo"><span>Equipo o instalación</span><input name="equipo" list="dl-equipos-mant" value="${esc(v.equipo || '')}" required></label>
          ${planes().length ? `<label class="campo"><span>Tarea preventiva que se hace</span>${App.selectOpciones('planId', planes().map((p) => [p.id, p.nombre]), v.planId || '', { vacio: true })}</label>` : ''}
          <label class="campo campo-ancho"><span>Avería o motivo</span><textarea name="averia" rows="2">${esc(v.averia || '')}</textarea></label>
          <label class="campo campo-ancho"><span>Trabajo realizado</span><textarea name="trabajo" rows="2" required>${esc(v.trabajo || '')}</textarea></label>
          <label class="campo"><span>Técnico</span><input name="tecnico" value="${esc(v.tecnico || '')}"></label>
          ${!reg && abiertas.length ? `<label class="campo"><span>¿Resuelve una incidencia abierta?</span>${App.selectOpciones('cierra', abiertas.map((i) => [i.numero, `${i.numero} · ${i.descripcion.slice(0, 60)}`]), '', { vacio: true })}</label>` : ''}
          <label class="campo"><span>¿Queda algo pendiente?</span>${App.selectOpciones('requiereAccion', [['no', 'No, queda arreglado'], ['si', 'Sí (abre incidencia)']], reg?.requiereAccion || 'no', { vacio: false })}</label>
          ${App.selectPersona('quien', reg?.quien, '¿Quién lo registra?')}
        </div>
        <label class="campo campo-ancho accion-correctora" hidden><span>Qué queda pendiente y qué se hace mientras</span>
          <textarea name="accion" rows="2" placeholder="Pedir pieza, usar otro equipo, trasladar el género…">${esc(reg?.accion || '')}</textarea></label>
        <datalist id="dl-prov-mant">${db.activos('proveedores').map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
        <datalist id="dl-equipos-mant">${[...db.activos('equipos').map((e) => e.nombre), ...db.activos('instalaciones').map((e) => e.nombre), 'Instalación eléctrica', 'Fontanería', 'Techos y paredes'].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        ancho: true,
        onSubmit: async (d) => {
          if (d.requiereAccion === 'si' && !d.accion.trim()) {
            U.toast('Indica qué queda pendiente', 'error');
            return false;
          }
          const id = reg?.id || (d.documento.trim() ? `mnt-${d.fecha}-${limpio(d.documento)}` : `mnt-${d.fecha}-${(archivos[0]?.hash || U.uid()).slice(0, 16)}`);
          const previoReg = !reg && db.obtener('registros', id);
          if (previoReg && !(await App.confirmar(`Ya hay un parte nº ${d.documento} del ${U.fmtFecha(d.fecha)}. ¿Sustituirlo por este?`))) return false;
          const r = reg || previoReg || { id, tipo: 'visita', categoria: CATEGORIA };
          Object.assign(r, {
            fecha: d.fecha,
            empresa: d.empresa.trim(),
            documento: d.documento.trim(),
            tipoMant: d.tipoMant,
            equipo: d.equipo.trim(),
            planId: d.planId || '',
            averia: d.averia.trim(),
            trabajo: d.trabajo.trim(),
            tecnico: d.tecnico.trim(),
            requiereAccion: d.requiereAccion,
            accion: d.requiereAccion === 'si' ? d.accion.trim() : '',
            quien: d.quien,
          });
          r.descripcion = resumen(r);
          if (archivos.length) r.archivos = [...new Set([...(r.archivos || []), ...(await App.Documentos.subir(archivos, `${d.fecha}-mant`))])];
          // El parte cierra la incidencia de la avería
          if (d.cierra) {
            const inc = db.lista('incidencias').find((i) => i.numero === d.cierra);
            if (inc) {
              Object.assign(inc, { estado: 'cerrada', fechaCierre: d.fecha, cerradaPor: d.quien, accion: inc.accion || r.trabajo });
              await db.guardar('incidencias', inc);
              r.cierraIncidencia = inc.numero;
            }
          }
          if (d.requiereAccion === 'si' && !r.incidencia) {
            const inc = await App.crearIncidencia({
              plan: 'Mantenimiento',
              descripcion: `Mantenimiento (${r.equipo}, ${U.fmtFecha(d.fecha)}): ${r.averia || r.trabajo} — pendiente: ${r.accion}`,
              accion: r.accion,
              quien: d.quien,
              origen: { tipo: 'visita', fecha: d.fecha },
            });
            r.incidencia = inc.numero;
            U.toast(`Parte guardado. Incidencia ${inc.numero} abierta`, 'aviso');
          } else U.toast(r.cierraIncidencia ? `Parte guardado. Incidencia ${r.cierraIncidencia} cerrada` : 'Parte guardado');
          await db.guardar('registros', r);
          if (d.quien) U.ultimoUsuario(d.quien);
          App.recargar();
        },
      }
    );
    const form = m.el.querySelector('form');
    const revisar = () => (form.querySelector('.accion-correctora').hidden = form.elements.requiereAccion.value !== 'si');
    form.elements.requiereAccion.addEventListener('change', revisar);
    revisar();
  }

  // ---------- Tarea preventiva ----------
  function abrirPlan(reg) {
    App.modal(
      `<form>
        <h2>${reg ? 'Editar tarea preventiva' : 'Nueva tarea preventiva'}</h2>
        <div class="rejilla-campos">
          <label class="campo campo-ancho"><span>Tarea</span><input name="nombre" value="${esc(reg?.nombre || '')}" placeholder="Ej.: revisión de equipos de frío, calibración de termómetros" required></label>
          <label class="campo"><span>Equipo o zona</span><input name="equipo" list="dl-equipos-plan" value="${esc(reg?.equipo || '')}"></label>
          <label class="campo"><span>Cada cuántos meses</span><input name="meses" inputmode="numeric" value="${esc(reg?.meses || '')}" required></label>
          <label class="campo"><span>Última vez que se hizo</span><input type="date" name="ultima" value="${esc(reg?.ultima || '')}" max="${U.hoy()}"></label>
          <label class="campo"><span>Quién lo hace</span><input name="responsable" value="${esc(reg?.responsable || '')}" placeholder="Empresa o persona"></label>
        </div>
        <datalist id="dl-equipos-plan">${[...db.activos('equipos'), ...db.activos('instalaciones')].map((e) => `<option value="${esc(e.nombre)}">`).join('')}</datalist>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        onSubmit: async (d) => {
          const meses = Math.round(U.num(d.meses));
          if (!(meses > 0)) {
            U.toast('Pon cada cuántos meses (un número)', 'error');
            return false;
          }
          await db.guardar('registros', Object.assign(reg || { tipo: TIPO_PLAN }, { nombre: d.nombre.trim(), equipo: d.equipo.trim(), meses, ultima: d.ultima, responsable: d.responsable.trim() }));
          U.toast('Tarea guardada');
          App.recargar();
        },
      }
    );
  }

  // ---------- Tablas (pantalla e informes) ----------
  App.tablaMantenimiento = (regs, conAcciones = false) => {
    if (!regs.length) return '<p class="vacio">Sin partes de mantenimiento en este periodo.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Equipo</th><th>Avería / motivo</th><th>Trabajo realizado</th><th>Empresa</th><th>Parte</th><th>Incid. nº</th>${conAcciones ? '<th></th>' : ''}</tr></thead>
      <tbody>${regs
        .map(
          (r) => `<tr class="${r.incidencia ? 'fila-incidencia' : ''}">
            <td class="nowrap">${U.fmtFecha(r.fecha)}</td>
            <td>${esc(r.tipoMant === 'preventivo' ? 'Preventivo' : r.tipoMant ? 'Correctivo' : '')}</td>
            <td>${esc(r.equipo || '')}</td>
            <td><small>${esc(r.averia || (r.tipoMant ? '' : r.descripcion || ''))}</small></td>
            <td><small>${esc(r.trabajo || '')}</small></td>
            <td>${esc(r.empresa || '')}</td>
            <td class="nowrap">${esc(r.documento || '')} ${App.Documentos.botones(r.archivos)}</td>
            <td>${esc([r.incidencia, r.cierraIncidencia ? `cierra ${r.cierraIncidencia}` : ''].filter(Boolean).join(' · '))}</td>
            ${conAcciones ? `<td class="nowrap"><button class="btn-icono" data-editar="${r.id}" title="Editar">✎</button><button class="btn-icono" data-borrar="${r.id}" title="Borrar">✕</button></td>` : ''}
          </tr>`
        )
        .join('')}</tbody></table></div>`;
  };

  App.tablaPlanMantenimiento = (conAcciones = false) => {
    const ps = planes();
    if (!ps.length) return '<p class="vacio">No hay tareas preventivas programadas.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Tarea</th><th>Equipo / zona</th><th>Frecuencia</th><th>Quién</th><th>Última vez</th><th>Estado</th>${conAcciones ? '<th></th>' : ''}</tr></thead>
      <tbody>${ps
        .map((p) => {
          const e = estadoPlan(p);
          return `<tr><td>${esc(p.nombre)}</td><td>${esc(p.equipo || '')}</td><td>Cada ${p.meses} ${p.meses == 1 ? 'mes' : 'meses'}</td><td>${esc(p.responsable || '')}</td>
            <td>${e.ultima ? U.fmtFecha(e.ultima) : '—'}</td><td>${App.chip(e.estado, e.txt)}</td>
            ${conAcciones ? `<td class="nowrap"><button class="btn" data-hecho="${p.id}">✔ Hecho</button><button class="btn-icono" data-editar-plan="${p.id}" title="Editar">✎</button><button class="btn-icono" data-borrar="${p.id}" title="Borrar">✕</button></td>` : ''}</tr>`;
        })
        .join('')}</tbody></table></div>`;
  };

  // ---------- Pantalla ----------
  function render() {
    const lista = partes().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const abiertas = incidenciasAbiertas();
    App.vista().innerHTML = `
      ${App.cabecera(
        'Mantenimiento',
        'Ante una avería: anotarla en Incidencias y avisar al técnico. Se guardan los partes de trabajo y las facturas de reparación de equipos e instalaciones (al menos 2 años). La pintura de techos va en el plan de limpieza.',
        '<button class="btn" id="btn-parte-mano">+ Parte a mano</button>'
      )}
      <div class="tarjeta">
        <label class="btn btn-primario btn-grande bloque">📄 Subir parte de trabajo o factura (PDF o fotos)
          <input type="file" accept="application/pdf,image/*" multiple hidden id="in-mant"></label>
        <small>Si tiene varias hojas, elígelas todas a la vez.</small>
        <div id="progreso-mant"></div>
      </div>
      ${abiertas.length ? `<div class="tarjeta"><p>${App.chip('fuera', `${abiertas.length} incidencia(s) abiertas`)} Al guardar el parte del arreglo puedes cerrar la que corresponda.</p></div>` : ''}
      <div class="tarjeta">
        <div class="cab"><h2>Mantenimiento preventivo</h2><button class="btn" id="btn-plan">+ Tarea preventiva</button></div>
        ${App.tablaPlanMantenimiento(true)}
      </div>
      <div class="tarjeta">
        <h2>Partes y facturas</h2>
        ${App.tablaMantenimiento(lista, true)}
      </div>`;
    const v = App.vista();
    v.querySelector('#btn-parte-mano').addEventListener('click', () => abrirParte());
    v.querySelector('#btn-plan').addEventListener('click', () => abrirPlan());
    v.querySelector('#in-mant').addEventListener('change', (e) => leer([...e.target.files]));
    v.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-editar]');
      if (ed) return abrirParte({ reg: db.obtener('registros', ed.dataset.editar) });
      const ep = e.target.closest('[data-editar-plan]');
      if (ep) return abrirPlan(db.obtener('registros', ep.dataset.editarPlan));
      const h = e.target.closest('[data-hecho]');
      if (h) {
        const p = db.obtener('registros', h.dataset.hecho);
        return abrirParte({ previo: { tipoMant: 'preventivo', planId: p.id, equipo: p.equipo || p.nombre, trabajo: p.nombre, empresa: p.responsable || '' } });
      }
      const b = e.target.closest('[data-borrar]');
      if (b && (await App.confirmar('¿Borrar?'))) {
        await db.borrar('registros', b.dataset.borrar);
        App.recargar();
      }
    });
  }

  async function leer(files) {
    if (!files.length) return;
    const caja = App.vista().querySelector('#progreso-mant');
    const nombres = files.map((f) => esc(f.name)).join(', ');
    caja.innerHTML = `<p>⏳ Leyendo ${nombres}…</p>`;
    try {
      const archivos = await App.Documentos.preparar(files);
      const datos = await App.Documentos.leer('mantenimiento', archivos, (t) => (caja.innerHTML = `<p>⏳ ${esc(t)}</p>`));
      caja.innerHTML = `<p>✔ Leído ${nombres}. Revisa y guarda.</p>`;
      abrirParte({ datos, archivos });
    } catch (err) {
      console.error(err);
      caja.innerHTML = `<p class="txt-fuera">✖ ${nombres}: ${esc(err.message)}. Puedes meterlo con «+ Parte a mano».</p>`;
    }
  }

  App.vistas['mantenimiento'] = render;
})();
