// Control de plagas (Plan DDD): partes de visita de la empresa de plagas y su documentación.
// El manual pide conservar (al menos 2 años) los partes de visita —mínimo una al año—,
// el certificado de diagnóstico, el plan de tratamiento, fichas técnicas y de seguridad
// de los productos y el carné del aplicador.
//
// Los partes se guardan como registros "visita" de categoría «Control de plagas (DDD)»
// (así siguen saliendo en Visitas y en el aviso anual) con los datos leídos por la IA.
// Identificador fijo (fecha + nº de parte): subir otra vez el mismo parte no lo duplica.
(function () {
  const esc = U.esc;
  const CATEGORIA = 'Control de plagas (DDD)';
  const TIPO_DOC = 'plagas-doc';
  const limpio = (s) => U.norm(s).replace(/[^a-z0-9]+/g, '_');

  const TIPOS_VISITA = { revision: 'Revisión periódica', tratamiento: 'Tratamiento', incidencia: 'Aviso por incidencia', diagnostico: 'Diagnóstico inicial' };
  const TRATAMIENTOS = { desratizacion: 'Desratización', desinsectacion: 'Desinsectación', desinfeccion: 'Desinfección' };
  // Documentos del Plan DDD (manual 4.5: anexos y registros); caduca = tiene fecha de validez
  const DOCS = [
    ['diagnostico', 'Certificado de diagnóstico inicial', false],
    ['plan', 'Plan de tratamiento', false],
    ['fichas', 'Fichas técnicas de los productos aplicados', false],
    ['fds', 'Fichas de datos de seguridad', false],
    ['carne', 'Carné de aplicador cualificado', true],
    ['contrato', 'Contrato anual con la empresa DDD', true],
    ['otro', 'Otro documento', false],
  ];

  const partes = () => db.registros('visita').filter((r) => r.categoria === CATEGORIA);
  const documentos = () => db.registros(TIPO_DOC);
  const empresaDDD = () => db.activos('proveedores').find((p) => /plaga|ddd/i.test(p.actividad || ''));

  const prepararArchivos = (files) => App.Documentos.preparar(files);
  const subirArchivos = (archivos, prefijo) => App.Documentos.subir(archivos, prefijo);
  const botonesArchivo = (rutas) => App.Documentos.botones(rutas);

  const resumen = (d) =>
    [TIPOS_VISITA[d.tipoVisita] || '', (d.tratamientos || []).map((t) => TRATAMIENTOS[t]).join(', '), d.actividad === 'si' ? 'CON actividad de plagas' : 'sin actividad', d.recomendaciones ? 'Recomienda: ' + d.recomendaciones : '']
      .filter(Boolean)
      .join(' · ');

  // ---------- Revisar / editar un parte ----------
  // datos: lo leído por la IA (o vacío); archivos: los preparados para subir; reg: el parte si se edita
  function abrirParte({ datos = {}, archivos = [], reg = null } = {}) {
    const v = reg || datos;
    const fecha = reg ? reg.fecha : App.Albaranes.fechaLeida(datos.fecha) || U.hoy();
    const actividad = reg ? reg.actividad : datos.actividad ? 'si' : 'no';
    const productos = (v.productos || []).map((p) => [p.nombre, p.registro, p.dosis, p.lote].map((x) => x || '').join(' | ').replace(/( \| )+$/, '')).join('\n');
    const requiere = reg ? reg.requiereAccion : actividad === 'si' || datos.recomendaciones ? 'si' : 'no';
    const m = App.modal(
      `<form>
        <h2>${reg ? 'Editar parte de plagas' : 'Parte de visita de plagas'}</h2>
        ${archivos.length ? `<p class="sub">Leído de ${archivos.map((a) => esc(a.nombre)).join(', ')}. Revisa los datos antes de guardar.</p>` : ''}
        <div class="rejilla-campos">
          <label class="campo"><span>Fecha de la visita</span><input type="date" name="fecha" value="${fecha}" max="${U.hoy()}" required></label>
          <label class="campo"><span>Empresa</span><input name="empresa" list="dl-prov-plagas" value="${esc(v.empresa || empresaDDD()?.nombre || '')}" required></label>
          <label class="campo"><span>Nº de parte / certificado</span><input name="documento" value="${esc(reg ? reg.documento : datos.numParte || '')}"></label>
          <label class="campo"><span>Tipo de visita</span>${App.selectOpciones('tipoVisita', Object.entries(TIPOS_VISITA), v.tipoVisita || 'revision', { vacio: false })}</label>
          <div class="campo campo-ancho"><span>Tratamientos</span><div class="fila-checks">${Object.entries(TRATAMIENTOS)
            .map(([k, t]) => `<label class="check"><input type="checkbox" name="tratamientos" data-grupo="1" value="${k}" ${(v.tratamientos || []).includes(k) ? 'checked' : ''}> ${t}</label>`)
            .join('')}</div></div>
          <label class="campo campo-ancho"><span>Zonas tratadas o revisadas</span><input name="zonas" value="${esc(v.zonas || '')}"></label>
          <label class="campo campo-ancho"><span>Productos aplicados (uno por línea: nombre | nº registro | dosis | lote)</span><textarea name="productos" rows="2">${esc(productos)}</textarea></label>
          <label class="campo campo-ancho"><span>Cebos, trampas e insectocutores revisados</span><textarea name="cebos" rows="2">${esc(v.cebos || '')}</textarea></label>
          <label class="campo"><span>¿Hay actividad de plagas?</span>${App.selectOpciones('actividad', [['no', 'No, sin indicios'], ['si', 'Sí: consumo, capturas o indicios']], actividad, { vacio: false })}</label>
          <label class="campo"><span>¿Hay que corregir algo?</span>${App.selectOpciones('requiereAccion', [['no', 'No'], ['si', 'Sí (abre incidencia)']], requiere, { vacio: false })}</label>
          <label class="campo campo-ancho"><span>Observaciones del técnico</span><textarea name="observaciones" rows="2">${esc(v.observaciones || '')}</textarea></label>
          <label class="campo campo-ancho"><span>Recomendaciones / deficiencias a corregir</span><textarea name="recomendaciones" rows="2">${esc(v.recomendaciones || '')}</textarea></label>
          <label class="campo"><span>Técnico aplicador</span><input name="tecnico" value="${esc(v.tecnico || '')}"></label>
          <label class="campo"><span>Nº de carné</span><input name="carne" value="${esc(v.carne || '')}"></label>
          ${App.selectPersona('quien', reg?.quien, '¿Quién lo registra?')}
        </div>
        <label class="campo campo-ancho accion-correctora" hidden><span>Acción correctora (obligatoria)</span>
          <textarea name="accion" rows="2" placeholder="Lo que recomiende la empresa: tapar huecos, retirar cartones, tratamiento…">${esc(reg?.accion || datos.recomendaciones || '')}</textarea></label>
        <datalist id="dl-prov-plagas">${db.activos('proveedores').map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        ancho: true,
        onSubmit: async (d) => {
          if (d.requiereAccion === 'si' && !d.accion.trim()) {
            U.toast('Indica la acción correctora', 'error');
            return false;
          }
          const id = reg?.id || (d.documento.trim() ? `plg-${d.fecha}-${limpio(d.documento)}` : `plg-${d.fecha}-${(archivos[0]?.hash || U.uid()).slice(0, 16)}`);
          const previo = !reg && db.obtener('registros', id);
          if (previo && !(await App.confirmar(`Ya hay un parte nº ${d.documento} del ${U.fmtFecha(d.fecha)}. ¿Sustituirlo por este?`))) return false;
          const r = reg || previo || { id, tipo: 'visita', categoria: CATEGORIA };
          Object.assign(r, {
            fecha: d.fecha,
            empresa: d.empresa.trim(),
            documento: d.documento.trim(),
            tipoVisita: d.tipoVisita,
            tratamientos: d.tratamientos,
            zonas: d.zonas.trim(),
            productos: d.productos
              .split('\n')
              .map((l) => l.split('|').map((x) => x.trim()))
              .filter((c) => c[0])
              .map(([nombre, registro = '', dosis = '', lote = '']) => ({ nombre, registro, dosis, lote })),
            cebos: d.cebos.trim(),
            actividad: d.actividad,
            observaciones: d.observaciones.trim(),
            recomendaciones: d.recomendaciones.trim(),
            tecnico: d.tecnico.trim(),
            carne: d.carne.trim(),
            requiereAccion: d.requiereAccion,
            accion: d.requiereAccion === 'si' ? d.accion.trim() : '',
            quien: d.quien,
          });
          r.descripcion = resumen(r);
          if (archivos.length) r.archivos = [...new Set([...(r.archivos || []), ...(await subirArchivos(archivos, `${d.fecha}-plagas`))])];
          if (d.requiereAccion === 'si' && !r.incidencia) {
            const inc = await App.crearIncidencia({
              plan: 'Plagas',
              descripcion: `Control de plagas (${U.fmtFecha(d.fecha)}${r.documento ? ', parte ' + r.documento : ''}): ${d.actividad === 'si' ? 'actividad de plagas. ' : ''}${r.recomendaciones || r.observaciones || r.cebos}`,
              accion: r.accion,
              quien: d.quien,
              origen: { tipo: 'visita', fecha: d.fecha },
            });
            r.incidencia = inc.numero;
            U.toast(`Parte guardado. Incidencia ${inc.numero} abierta`, 'aviso');
          } else U.toast('Parte guardado');
          await db.guardar('registros', r);
          if (d.quien) U.ultimoUsuario(d.quien);
          App.recargar();
        },
      }
    );
    const form = m.el.querySelector('form');
    const revisar = () => (form.querySelector('.accion-correctora').hidden = form.elements.requiereAccion.value !== 'si');
    form.elements.actividad.addEventListener('change', () => {
      if (form.elements.actividad.value === 'si') form.elements.requiereAccion.value = 'si';
      revisar();
    });
    form.elements.requiereAccion.addEventListener('change', revisar);
    revisar();
  }

  // ---------- Documentación ----------
  function abrirDocumento(clase, reg) {
    const [, titulo, caduca] = DOCS.find(([k]) => k === clase);
    App.modal(
      `<form>
        <h2>${esc(titulo)}</h2>
        <div class="rejilla-campos">
          ${clase === 'otro' || clase === 'fichas' || clase === 'fds' ? `<label class="campo campo-ancho"><span>${clase === 'otro' ? 'Qué documento es' : 'Producto'}</span><input name="titulo" value="${esc(reg?.titulo || '')}" ${clase === 'otro' ? 'required' : ''}></label>` : ''}
          <label class="campo"><span>Fecha del documento</span><input type="date" name="fecha" value="${reg?.fecha || U.hoy()}" required></label>
          ${caduca ? `<label class="campo"><span>Válido hasta</span><input type="date" name="caduca" value="${reg?.caduca || ''}" required></label>` : ''}
          <label class="campo campo-ancho"><span>${reg ? 'Añadir archivo (opcional)' : 'Archivo (PDF o foto)'}</span><input type="file" name="archivo" accept="application/pdf,image/*" multiple ${reg ? '' : 'required'}></label>
        </div>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        onSubmit: async (d, form) => {
          const files = [...form.elements.archivo.files];
          const archivos = await prepararArchivos(files);
          const r = reg || { tipo: TIPO_DOC, clase };
          r.titulo = (d.titulo || '').trim();
          r.fecha = d.fecha;
          r.caduca = d.caduca || '';
          r.archivos = [...new Set([...(r.archivos || []), ...(await subirArchivos(archivos, `plagas-doc-${clase}`))])];
          await db.guardar('registros', r);
          U.toast('Documento guardado');
          App.recargar();
        },
      }
    );
  }

  // Estado de cada documento: el más reciente de su clase
  function estadoDoc(clase) {
    const [, , caduca] = DOCS.find(([k]) => k === clase);
    const ds = documentos().filter((x) => x.clase === clase).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!ds.length) return { estado: clase === 'otro' ? 'neutro' : 'aviso', txt: 'Falta', ds };
    if (caduca && ds[0].caduca) {
      const dias = U.diasEntre(U.hoy(), ds[0].caduca);
      if (dias < 0) return { estado: 'fuera', txt: `Caducado el ${U.fmtFecha(ds[0].caduca)}`, ds };
      if (dias <= 30) return { estado: 'aviso', txt: `Caduca el ${U.fmtFecha(ds[0].caduca)}`, ds };
      return { estado: 'ok', txt: `Válido hasta ${U.fmtFecha(ds[0].caduca)}`, ds };
    }
    return { estado: 'ok', txt: 'Archivado', ds };
  }

  // Avisos para la pantalla de inicio (la visita anual ya la avisa inicio.js)
  App.avisosPlagas = () =>
    DOCS.filter(([k, , caduca]) => caduca)
      .map(([k, titulo]) => ({ k, titulo, e: estadoDoc(k) }))
      .filter(({ e }) => e.ds.length && (e.estado === 'fuera' || e.estado === 'aviso'))
      .map(({ titulo, e }) => ({ estado: e.estado, titulo, detalle: e.txt, enlace: '#/plagas' }));

  // ---------- Tablas (pantalla e informes) ----------
  App.tablaPlagas = (regs, conAcciones = false) => {
    if (!regs.length) return '<p class="vacio">Sin partes de plagas en este periodo.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Tratamientos</th><th>Productos</th><th>Actividad</th><th>Recomendaciones</th><th>Parte</th><th>Incid. nº</th>${conAcciones ? '<th></th>' : ''}</tr></thead>
      <tbody>${regs
        .map(
          (r) => `<tr class="${r.incidencia ? 'fila-incidencia' : ''}">
            <td class="nowrap">${U.fmtFecha(r.fecha)}</td>
            <td>${esc(TIPOS_VISITA[r.tipoVisita] || '')}${r.empresa ? `<br><small>${esc(r.empresa)}</small>` : ''}</td>
            <td>${esc((r.tratamientos || []).map((t) => TRATAMIENTOS[t]).join(', ') || (r.tipoVisita ? '—' : r.descripcion || ''))}</td>
            <td><small>${(r.productos || []).map((p) => esc(p.nombre) + (p.registro ? ` (${esc(p.registro)})` : '')).join('<br>')}</small></td>
            <td>${r.actividad === 'si' ? App.chip('fuera', 'Sí') : r.actividad === 'no' ? App.chip('ok', 'No') : ''}</td>
            <td><small>${esc(r.recomendaciones || '')}</small></td>
            <td class="nowrap">${esc(r.documento || '')} ${botonesArchivo(r.archivos)}</td>
            <td>${esc(r.incidencia || '')}</td>
            ${conAcciones ? `<td class="nowrap"><button class="btn-icono" data-editar="${r.id}" title="Editar">✎</button><button class="btn-icono" data-borrar="${r.id}" title="Borrar">✕</button></td>` : ''}
          </tr>`
        )
        .join('')}</tbody></table></div>`;
  };

  App.tablaDocsPlagas = (conAcciones = false) => `<div class="tabla-scroll"><table class="tabla">
    <thead><tr><th>Documento</th><th>Estado</th><th>Archivos</th>${conAcciones ? '<th></th>' : ''}</tr></thead>
    <tbody>${DOCS.map(([k, titulo]) => {
      const e = estadoDoc(k);
      if (k === 'otro' && !e.ds.length && !conAcciones) return '';
      return `<tr><td>${esc(titulo)}</td><td>${App.chip(e.estado, e.txt)}</td>
        <td>${e.ds.map((x) => `<span class="nowrap">${x.titulo ? esc(x.titulo) + ' · ' : ''}${U.fmtFecha(x.fecha)} ${botonesArchivo(x.archivos)}${conAcciones ? `<button class="btn-icono" data-borrar-doc="${x.id}" title="Borrar">✕</button>` : ''}</span>`).join('<br>')}</td>
        ${conAcciones ? `<td><button class="btn" data-doc="${k}">${e.ds.length && !['fichas', 'fds', 'otro'].includes(k) ? 'Renovar' : '+ Subir'}</button></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>`;

  // ---------- Pantalla ----------
  function render() {
    const hoy = U.hoy();
    const lista = partes().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultima = lista[0]?.fecha;
    const dias = ultima ? U.diasEntre(ultima, hoy) : null;
    const emp = empresaDDD();
    const estadoVisita = !ultima
      ? App.chip('fuera', 'No consta ninguna visita')
      : dias > 365
        ? App.chip('fuera', `Última visita hace ${dias} días: toca visita anual`)
        : App.chip('ok', `Última visita: ${U.fmtFecha(ultima)} · la próxima antes del ${U.fmtFecha(U.sumarDias(ultima, 365))}`);
    const conActividad = lista.filter((r) => r.actividad === 'si' && U.diasEntre(r.fecha, hoy) <= 365).length;
    App.vista().innerHTML = `
      ${App.cabecera(
        'Control de plagas (DDD)',
        `${emp ? `${esc(emp.nombre)}${emp.registro ? ' · ' + esc(emp.registro) : ''} · ` : ''}Al menos una visita al año y siempre que se les llame. Se conservan los partes y la documentación al menos 2 años.`,
        '<button class="btn" id="btn-parte-mano">+ Parte a mano</button>'
      )}
      <div class="tarjeta">
        <label class="btn btn-primario btn-grande bloque">📄 Subir parte de visita (PDF o fotos)
          <input type="file" accept="application/pdf,image/*" multiple hidden id="in-plagas"></label>
        <small>Si el parte tiene varias hojas, elígelas todas a la vez.</small>
        <div id="progreso-plagas"></div>
      </div>
      <div class="tarjeta">
        <p>${estadoVisita} ${conActividad ? App.chip('aviso', `${conActividad} parte(s) con actividad en el último año`) : ''}</p>
      </div>
      <div class="tarjeta">
        <h2>Partes de visita</h2>
        ${App.tablaPlagas(lista, true)}
      </div>
      <div class="tarjeta">
        <h2>Documentación del plan DDD</h2>
        ${App.tablaDocsPlagas(true)}
      </div>`;
    const v = App.vista();
    v.querySelector('#btn-parte-mano').addEventListener('click', () => abrirParte());
    v.querySelector('#in-plagas').addEventListener('change', (e) => leer([...e.target.files]));
    v.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-editar]');
      if (ed) return abrirParte({ reg: db.obtener('registros', ed.dataset.editar) });
      const b = e.target.closest('[data-borrar]');
      if (b && (await App.confirmar('¿Borrar este parte de plagas?'))) {
        await db.borrar('registros', b.dataset.borrar);
        return App.recargar();
      }
      const bd = e.target.closest('[data-borrar-doc]');
      if (bd && (await App.confirmar('¿Borrar este documento?'))) {
        await db.borrar('registros', bd.dataset.borrarDoc);
        return App.recargar();
      }
      const doc = e.target.closest('[data-doc]');
      if (doc) abrirDocumento(doc.dataset.doc);
    });
  }

  async function leer(files) {
    if (!files.length) return;
    const caja = App.vista().querySelector('#progreso-plagas');
    const nombres = files.map((f) => esc(f.name)).join(', ');
    caja.innerHTML = `<p>⏳ Leyendo ${nombres}…</p>`;
    try {
      const archivos = await prepararArchivos(files);
      const datos = await App.Documentos.leer('plagas', archivos, (t) => (caja.innerHTML = `<p>⏳ ${esc(t)}</p>`));
      caja.innerHTML = `<p>✔ Leído ${nombres}. Revisa y guarda.</p>`;
      abrirParte({ datos, archivos });
    } catch (err) {
      console.error(err);
      caja.innerHTML = `<p class="txt-fuera">✖ ${nombres}: ${esc(err.message)}. Puedes meterlo con «+ Parte a mano».</p>`;
    }
  }

  App.vistas['plagas'] = render;
})();
