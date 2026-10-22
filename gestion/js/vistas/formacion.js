// Plan de formación de manipuladores: certificado de cada empleado (manual: antigüedad
// no superior a 4 años; se renueva cada 4 años) y charlas internas con su hoja de asistencia.
// Los certificados y asistencias se conservan mientras tengan validez (y al menos 2 años).
(function () {
  const esc = U.esc;
  const TIPO = 'formacion';
  const VIGENCIA_ANIOS = 4;
  const AVISO_DIAS = 60;
  const limpio = (s) => U.norm(s).replace(/[^a-z0-9]+/g, '_');

  const certificados = () => db.registros(TIPO).filter((r) => r.clase === 'certificado');
  const charlas = () => db.registros(TIPO).filter((r) => r.clase === 'interna');
  const sumarAnios = (iso, n) => (iso ? `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}` : '');
  const personaPorNombre = (n) => {
    const t = U.norm(n);
    if (!t) return null;
    const ps = db.activos('personal');
    return ps.find((p) => U.norm(p.nombre) === t) || ps.find((p) => t.includes(U.norm(p.nombre)) || U.norm(p.nombre).includes(t)) || null;
  };

  // Estado del certificado de una persona: el más reciente
  function estadoPersona(p) {
    const cs = certificados().filter((c) => c.personaId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!cs.length) return { estado: 'aviso', txt: 'Falta el certificado', cs };
    const dias = U.diasEntre(U.hoy(), cs[0].caduca);
    if (dias < 0) return { estado: 'fuera', txt: `Caducado el ${U.fmtFecha(cs[0].caduca)}`, cs };
    if (dias <= AVISO_DIAS) return { estado: 'aviso', txt: `Caduca el ${U.fmtFecha(cs[0].caduca)}`, cs };
    return { estado: 'ok', txt: `Vigente hasta ${U.fmtFecha(cs[0].caduca)}`, cs };
  }

  App.avisosFormacion = () => {
    const ps = db.activos('personal').map((p) => ({ p, e: estadoPersona(p) }));
    const av = [];
    const caducados = ps.filter((x) => x.e.estado === 'fuera');
    const pronto = ps.filter((x) => x.e.estado === 'aviso' && x.e.cs.length);
    const faltan = ps.filter((x) => !x.e.cs.length);
    if (caducados.length) av.push({ estado: 'fuera', titulo: 'Certificados de manipulador caducados', detalle: caducados.map((x) => x.p.nombre).join(', '), enlace: '#/formacion' });
    if (pronto.length) av.push({ estado: 'aviso', titulo: 'Certificados de manipulador por caducar', detalle: pronto.map((x) => `${x.p.nombre} (${U.fmtFecha(x.e.cs[0].caduca)})`).join(', '), enlace: '#/formacion' });
    if (faltan.length) av.push({ estado: 'aviso', titulo: 'Falta el certificado de manipulador', detalle: `${faltan.length} persona(s): ${faltan.map((x) => x.p.nombre).join(', ')}`, enlace: '#/formacion' });
    return av;
  };

  // ---------- Certificado de manipulador ----------
  function abrirCertificado({ datos = {}, archivos = [], reg = null, personaId = '' } = {}) {
    const v = reg || datos;
    const fecha = reg ? reg.fecha : App.Albaranes.fechaLeida(datos.fecha) || '';
    const pid = reg?.personaId || personaId || personaPorNombre(datos.persona)?.id || '';
    const caducaLeida = App.Albaranes.fechaLeida(datos.caduca);
    const m = App.modal(
      `<form>
        <h2>Certificado de manipulador de alimentos</h2>
        ${archivos.length ? `<p class="sub">Leído de ${archivos.map((a) => esc(a.nombre)).join(', ')}${datos.persona ? ` · a nombre de <b>${esc(datos.persona)}</b>` : ''}. Revisa los datos antes de guardar.</p>` : ''}
        <div class="rejilla-campos">
          <label class="campo"><span>Empleado</span>${App.selectOpciones('personaId', db.activos('personal').map((p) => [p.id, p.nombre]), pid, { required: true })}</label>
          <label class="campo"><span>Fecha del curso o certificado</span><input type="date" name="fecha" value="${fecha}" max="${U.hoy()}" required></label>
          <label class="campo"><span>Válido hasta</span><input type="date" name="caduca" value="${reg?.caduca || caducaLeida || sumarAnios(fecha, VIGENCIA_ANIOS)}" required><small>Si el certificado no pone caducidad: ${VIGENCIA_ANIOS} años desde la fecha</small></label>
          <label class="campo"><span>Entidad que lo imparte</span><input name="entidad" value="${esc(v.entidad || '')}"></label>
          <label class="campo"><span>Curso</span><input name="curso" value="${esc(v.curso || 'Manipulador de alimentos')}"></label>
          <label class="campo"><span>Horas</span><input name="horas" inputmode="decimal" value="${esc(v.horas || '')}"></label>
          <label class="campo"><span>¿Incluye alérgenos?</span>${App.selectOpciones('alergenos', [['si', 'Sí'], ['no', 'No'], ['', 'No consta']], reg ? reg.alergenos : datos.alergenos === true ? 'si' : datos.alergenos === false ? 'no' : '', { vacio: false })}</label>
        </div>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        ancho: true,
        onSubmit: async (d) => {
          const p = db.obtener('personal', d.personaId);
          const id = reg?.id || `frm-${limpio(p.nombre)}-${d.fecha}`;
          const r = reg || db.obtener('registros', id) || { id, tipo: TIPO, clase: 'certificado' };
          Object.assign(r, { personaId: p.id, persona: p.nombre, fecha: d.fecha, caduca: d.caduca, entidad: d.entidad.trim(), curso: d.curso.trim(), horas: d.horas.trim(), alergenos: d.alergenos });
          if (archivos.length) r.archivos = [...new Set([...(r.archivos || []), ...(await App.Documentos.subir(archivos, `formacion-${limpio(p.nombre)}`))])];
          await db.guardar('registros', r);
          U.toast('Certificado guardado');
          App.recargar();
        },
      }
    );
    // Al cambiar la fecha, se propone la caducidad a 4 años
    const form = m.el.querySelector('form');
    form.elements.fecha.addEventListener('change', () => {
      if (!reg && !caducaLeida) form.elements.caduca.value = sumarAnios(form.elements.fecha.value, VIGENCIA_ANIOS);
    });
  }

  // ---------- Charla o formación interna ----------
  function abrirCharla(reg) {
    const asist = reg?.asistentes || [];
    App.modal(
      `<form>
        <h2>${reg ? 'Editar formación interna' : 'Formación interna / charla'}</h2>
        <div class="rejilla-campos">
          <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${reg?.fecha || U.hoy()}" max="${U.hoy()}" required></label>
          <label class="campo"><span>Imparte</span><input name="imparte" value="${esc(reg?.imparte || '')}" placeholder="Asesora, responsable de producción…"></label>
          <label class="campo campo-ancho"><span>Tema</span><input name="tema" value="${esc(reg?.tema || '')}" placeholder="Buenas prácticas de higiene, alérgenos, limpieza…" required></label>
          <div class="campo campo-ancho"><span>Asistentes</span><div class="fila-checks">${db
            .activos('personal')
            .map((p) => `<label class="check"><input type="checkbox" name="asistentes" data-grupo="1" value="${esc(p.nombre)}" ${asist.includes(p.nombre) ? 'checked' : ''}> ${esc(p.nombre)}</label>`)
            .join('')}</div></div>
          <label class="campo campo-ancho"><span>Hoja de asistencia firmada (PDF o foto)</span><input type="file" name="archivo" accept="application/pdf,image/*" multiple></label>
        </div>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        ancho: true,
        onSubmit: async (d, form) => {
          if (!d.asistentes.length) {
            U.toast('Marca quién ha asistido', 'error');
            return false;
          }
          const archivos = await App.Documentos.preparar([...form.elements.archivo.files]);
          const r = Object.assign(reg || { tipo: TIPO, clase: 'interna' }, { fecha: d.fecha, imparte: d.imparte.trim(), tema: d.tema.trim(), asistentes: d.asistentes });
          if (archivos.length) r.archivos = [...new Set([...(r.archivos || []), ...(await App.Documentos.subir(archivos, `${d.fecha}-charla`))])];
          await db.guardar('registros', r);
          U.toast('Formación guardada');
          App.recargar();
        },
      }
    );
  }

  // ---------- Tablas (pantalla e informes) ----------
  App.tablaFormacionPersonal = (conAcciones = false) => `<div class="tabla-scroll"><table class="tabla">
    <thead><tr><th>Empleado</th><th>Puesto</th><th>Certificado</th><th>Entidad</th><th>Estado</th>${conAcciones ? '<th></th>' : ''}</tr></thead>
    <tbody>${db
      .activos('personal')
      .map((p) => {
        const e = estadoPersona(p);
        const c = e.cs[0];
        return `<tr><td>${esc(p.nombre)}</td><td>${esc(p.puesto || '')}</td>
          <td class="nowrap">${c ? `${U.fmtFecha(c.fecha)} ${App.Documentos.botones(c.archivos)}` : '—'}</td><td>${esc(c?.entidad || '')}${c?.alergenos === 'si' ? ' · con alérgenos' : ''}</td>
          <td>${App.chip(e.estado, e.txt)}</td>
          ${conAcciones ? `<td class="nowrap"><button class="btn" data-cert="${p.id}">${c ? 'Renovar' : '+ Añadir'}</button>${c ? `<button class="btn-icono" data-editar-cert="${c.id}" title="Editar">✎</button><button class="btn-icono" data-borrar="${c.id}" title="Borrar">✕</button>` : ''}</td>` : ''}</tr>`;
      })
      .join('')}</tbody></table></div>`;

  App.tablaCharlas = (regs, conAcciones = false) => {
    if (!regs.length) return '<p class="vacio">Sin formaciones internas en este periodo.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Tema</th><th>Imparte</th><th>Asistentes</th><th>Hoja</th>${conAcciones ? '<th></th>' : ''}</tr></thead>
      <tbody>${regs
        .map(
          (r) => `<tr><td class="nowrap">${U.fmtFecha(r.fecha)}</td><td>${esc(r.tema)}</td><td>${esc(r.imparte || '')}</td><td><small>${esc((r.asistentes || []).join(', '))}</small></td><td>${App.Documentos.botones(r.archivos)}</td>
          ${conAcciones ? `<td class="nowrap"><button class="btn-icono" data-editar-charla="${r.id}" title="Editar">✎</button><button class="btn-icono" data-borrar="${r.id}" title="Borrar">✕</button></td>` : ''}</tr>`
        )
        .join('')}</tbody></table></div>`;
  };

  // ---------- Pantalla ----------
  function render() {
    App.vista().innerHTML = `
      ${App.cabecera(
        'Formación de manipuladores',
        `Todo el personal con certificado de manipulador de menos de ${VIGENCIA_ANIOS} años (parte general, específica de panadería-pastelería y alérgenos). Charlas internas según las visitas de la asesora, con hoja de asistencia.`,
        '<button class="btn" id="btn-charla">+ Formación interna</button>'
      )}
      <div class="tarjeta">
        <label class="btn btn-primario btn-grande bloque">📄 Subir certificado de manipulador (PDF o foto)
          <input type="file" accept="application/pdf,image/*" multiple hidden id="in-cert"></label>
        <small>Uno por persona. La app lee el nombre y la fecha y lo asigna al empleado.</small>
        <div id="progreso-cert"></div>
      </div>
      <div class="tarjeta">
        <h2>Certificados del personal</h2>
        ${db.activos('personal').length ? App.tablaFormacionPersonal(true) : '<p class="vacio">Da de alta al personal en Ajustes.</p>'}
      </div>
      <div class="tarjeta">
        <h2>Formación interna</h2>
        ${App.tablaCharlas(charlas().sort((a, b) => b.fecha.localeCompare(a.fecha)), true)}
      </div>`;
    const v = App.vista();
    v.querySelector('#btn-charla').addEventListener('click', () => abrirCharla());
    v.querySelector('#in-cert').addEventListener('change', (e) => leer([...e.target.files]));
    v.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-cert]');
      if (c) return abrirCertificado({ personaId: c.dataset.cert });
      const ec = e.target.closest('[data-editar-cert]');
      if (ec) return abrirCertificado({ reg: db.obtener('registros', ec.dataset.editarCert) });
      const eh = e.target.closest('[data-editar-charla]');
      if (eh) return abrirCharla(db.obtener('registros', eh.dataset.editarCharla));
      const b = e.target.closest('[data-borrar]');
      if (b && (await App.confirmar('¿Borrar?'))) {
        await db.borrar('registros', b.dataset.borrar);
        App.recargar();
      }
    });
  }

  async function leer(files) {
    if (!files.length) return;
    const caja = App.vista().querySelector('#progreso-cert');
    const nombres = files.map((f) => esc(f.name)).join(', ');
    caja.innerHTML = `<p>⏳ Leyendo ${nombres}…</p>`;
    try {
      const archivos = await App.Documentos.preparar(files);
      const datos = await App.Documentos.leer('formacion', archivos, (t) => (caja.innerHTML = `<p>⏳ ${esc(t)}</p>`));
      caja.innerHTML = `<p>✔ Leído ${nombres}. Revisa y guarda.</p>`;
      abrirCertificado({ datos, archivos });
    } catch (err) {
      console.error(err);
      caja.innerHTML = `<p class="txt-fuera">✖ ${nombres}: ${esc(err.message)}. Puedes añadirlo a mano con «+ Añadir» en la persona.</p>`;
    }
  }

  // Formación del periodo para los informes
  App.informeFormacion = (desde, hasta) =>
    `${App.tablaFormacionPersonal()}<h3>Formación interna</h3>${App.tablaCharlas(charlas().filter((r) => r.fecha >= desde && r.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)))}`;

  App.vistas['formacion'] = render;
})();
