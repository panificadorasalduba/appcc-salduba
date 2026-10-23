// Informes imprimibles (o guardables en PDF desde el navegador) para inspección y auditoría.
(function () {
  const esc = U.esc;

  const TIPOS = [
    ['completo', 'Todos los registros del periodo'],
    ['temperaturas', 'Temperaturas de equipos'],
    ['vitrinas', 'Vitrinas de las tiendas (PCC5)'],
    ['control_alergenos', 'Control de alérgenos'],
    ['limpieza', 'Limpieza y desinfección'],
    ['lotes', 'Lotes de materias primas (apertura y cierre)'],
    ['produccion', 'Producción diaria (lote interno = día)'],
    ['montaje', 'Montaje · reparto a tiendas'],
    ['recepcion', 'Recepción de mercancía'],
    ['agua', 'Control de agua'],
    ['transporte', 'Temperatura de transporte'],
    ['aceite', 'Freidora y aceite'],
    ['acrilamida', 'Acrilamida (control visual)'],
    ['plagas', 'Control de plagas (DDD): partes y documentación'],
    ['mantenimiento', 'Mantenimiento: partes, facturas y preventivo'],
    ['formacion', 'Formación de manipuladores'],
    ['visita', 'Visitas, análisis y documentos externos'],
    ['muestra', 'Muestras de verificación'],
    ['incidencias', 'Incidencias y acciones correctoras'],
    ['cuadro_limpieza', 'Cuadro del plan de limpieza'],
    ['alergenos', 'Matriz de alérgenos y categoría Listeria'],
  ];

  function seccion(tipo, desde, hasta) {
    const enRango = (f) => f >= desde && f <= hasta;
    const titulo = TIPOS.find(([k]) => k === tipo)[1];
    let cuerpo = '';
    if (tipo === 'temperaturas') {
      // Una tabla por cada mes del periodo
      let [a, m] = desde.split('-').map(Number);
      const [a2, m2] = hasta.split('-').map(Number);
      while (a < a2 || (a === a2 && m <= m2)) {
        cuerpo += `<h3>${U.MESES[m - 1]} ${a}</h3>${App.tablaTemperaturasMes(a, m)}`;
        m++;
        if (m > 12) (m = 1), a++;
      }
    } else if (tipo === 'vitrinas') {
      // Una tabla por tienda y mes
      for (const t of App.tiendasConVitrina()) {
        let [a, m] = desde.split('-').map(Number);
        const [a2, m2] = hasta.split('-').map(Number);
        while (a < a2 || (a === a2 && m <= m2)) {
          cuerpo += `<h3>${esc(t)} — ${U.MESES[m - 1]} ${a}</h3>${App.tablaVitrinasMes(t, a, m)}`;
          m++;
          if (m > 12) (m = 1), a++;
        }
      }
      if (!cuerpo) cuerpo = '<p class="vacio">No hay vitrinas dadas de alta.</p>';
    } else if (tipo === 'limpieza') {
      const regs = db.registros('limpieza').filter((r) => enRango(r.fecha)).sort((x, y) => x.fecha.localeCompare(y.fecha));
      cuerpo = App.tablaLimpiezaMes(regs);
    } else if (tipo === 'produccion') {
      // Un cuaderno por mes del periodo, como la hoja en papel
      for (const c of App.cuadernos()) {
        let [a, m] = desde.split('-').map(Number);
        const [a2, m2] = hasta.split('-').map(Number);
        while (a < a2 || (a === a2 && m <= m2)) {
          cuerpo += `<h3>${esc(c.titulo)}${c.traza ? ' · ' + esc(c.traza) : ''} — ${U.MESES[m - 1]} ${a}</h3>${App.tablaProduccionMes(c, a, m)}`;
          m++;
          if (m > 12) (m = 1), a++;
        }
      }
    } else if (tipo === 'montaje') {
      const dias = [...new Set(db.registros('montaje').map((r) => r.fecha))].filter((f) => f >= desde && f <= hasta).sort();
      cuerpo = dias.length ? dias.map((f) => `<h3>${esc(U.fmtFechaLarga(f))}</h3>${App.tablaMontajeDia(f)}`).join('') : '<p class="vacio">Sin montaje en este periodo.</p>';
    } else if (tipo === 'plagas') {
      const regs = db.registros('visita').filter((r) => r.categoria === 'Control de plagas (DDD)' && enRango(r.fecha)).sort((x, y) => x.fecha.localeCompare(y.fecha));
      cuerpo = `${App.tablaPlagas(regs)}<h3>Documentación del plan DDD</h3>${App.tablaDocsPlagas()}`;
    } else if (tipo === 'mantenimiento') {
      const regs = db.registros('visita').filter((r) => r.categoria === 'Mantenimiento / avería' && enRango(r.fecha)).sort((x, y) => x.fecha.localeCompare(y.fecha));
      cuerpo = `${App.tablaMantenimiento(regs)}<h3>Mantenimiento preventivo</h3>${App.tablaPlanMantenimiento()}`;
    } else if (tipo === 'formacion') {
      cuerpo = App.informeFormacion(desde, hasta);
    } else if (tipo === 'lotes') {
      // Todo lote que estuvo abierto en algún momento del periodo
      const lotes = db
        .lista('lotes')
        .filter((l) => l.fechaApertura <= hasta && (!l.fechaCierre || l.fechaCierre >= desde))
        .sort((x, y) => x.producto.localeCompare(y.producto, 'es') || x.fechaApertura.localeCompare(y.fechaApertura));
      cuerpo = App.tablaLotes(lotes);
    } else if (tipo === 'incidencias') {
      const incs = db.lista('incidencias').filter((i) => enRango(i.fechaApertura) || (i.estado !== 'cerrada' && i.fechaApertura <= hasta)).sort((x, y) => String(x.numero).localeCompare(String(y.numero)));
      cuerpo = App.tablaIncidencias(incs);
    } else if (tipo === 'cuadro_limpieza') {
      cuerpo = `<table class="tabla"><thead><tr><th>Zona</th><th>Elemento</th><th>ALC</th><th>Frecuencia</th><th>Producto</th><th>Responsable</th></tr></thead><tbody>${db
        .activos('tareas')
        .map((t) => `<tr><td>${esc(t.zona)}</td><td>${esc(t.elemento)}</td><td>${t.alc ? 'X' : ''}</td><td>${esc(U.FRECUENCIAS[t.frecuencia]?.txt || '')}</td><td>${esc(t.producto)}</td><td>${esc(t.responsable)}</td></tr>`)
        .join('')}</tbody></table>`;
    } else if (tipo === 'alergenos') {
      const A = window.ALERGENOS;
      cuerpo = `<div class="tabla-scroll"><table class="tabla tabla-alergenos"><thead><tr><th>Producto</th><th>Categoría Listeria</th>${A.map((x) => `<th class="vertical"><span>${esc(x)}</span></th>`).join('')}</tr></thead><tbody>${db
        .activos('productos')
        .sort((x, y) => (x.familia + x.nombre).localeCompare(y.familia + y.nombre))
        .map((p) => `<tr><td>${esc(p.nombre)}</td><td><small>${esc(p.listeria || '')}</small></td>${A.map((x) => `<td class="centro">${(p.alergenos || []).includes(x) ? '●' : ''}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`;
    } else {
      const regs = db.registros(tipo).filter((r) => enRango(r.fecha)).sort((x, y) => (x.fecha + (x.hora || '')).localeCompare(y.fecha + (y.hora || '')));
      cuerpo = App.tablaRegistros(tipo, regs);
    }
    return `<section class="informe-seccion"><h2>${esc(titulo)}</h2>${cuerpo}</section>`;
  }

  function render(params) {
    const hoy = U.hoy();
    const tipo = params.get('tipo') || 'completo';
    const desde = params.get('desde') || hoy.slice(0, 8) + '01';
    const hasta = params.get('hasta') || hoy;
    const e = db.empresa();

    const tipos = tipo === 'completo' ? ['temperaturas', 'vitrinas', 'limpieza', 'lotes', 'produccion', 'montaje', 'recepcion', 'agua', 'transporte', 'aceite', 'acrilamida', 'control_alergenos', 'visita', 'muestra', 'incidencias'] : [tipo];

    App.vista().innerHTML = `
      <div class="no-imprimir">
        ${App.cabecera('Informes para inspección', 'Elige el registro y el periodo; después pulsa "Imprimir / PDF" y en el destino elige "Guardar como PDF".')}
        <form class="tarjeta" id="f-inf">
          <div class="rejilla-campos">
            <label class="campo"><span>Registro</span>${App.selectOpciones('tipo', TIPOS, tipo, { vacio: false })}</label>
            <label class="campo"><span>Desde</span><input type="date" name="desde" value="${desde}"></label>
            <label class="campo"><span>Hasta</span><input type="date" name="hasta" value="${hasta}"></label>
          </div>
          <div class="acciones izq"><button class="btn" type="submit">Ver informe</button><button class="btn btn-primario" type="button" id="btn-imprimir">Imprimir / PDF</button></div>
        </form>
      </div>
      <div class="informe">
        <header class="informe-cab">
          <div><b>${esc(e.nombre)}</b> · RGSAA ${esc(e.rgsaa)}<br><small>${esc(e.direccion)}</small></div>
          <div class="derecha">Sistema de Autocontrol APPCC · ${esc(e.edicionAppcc || '')}<br><small>Periodo: ${U.fmtFecha(desde)} – ${U.fmtFecha(hasta)} · Emitido ${U.fmtFecha(hoy)}</small></div>
        </header>
        ${tipos.map((t) => seccion(t, desde, hasta)).join('')}
        <footer class="informe-pie">Responsable del autocontrol: ${esc(e.titular)} · Firma: ______________________ &nbsp;&nbsp; Verificación (${esc(e.consultora || 'consultora')}): ______________________</footer>
      </div>`;

    const f = document.getElementById('f-inf');
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = U.leerForm(f);
      location.hash = `#/informes?tipo=${d.tipo}&desde=${d.desde}&hasta=${d.hasta}`;
    });
    document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
  }

  App.vistas['informes'] = render;
})();
