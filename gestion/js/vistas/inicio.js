// Pantalla de inicio: qué falta por registrar hoy y avisos pendientes.
(function () {
  const esc = U.esc;

  // Lista de avisos para hoy. Cada uno: { estado: 'fuera'|'aviso'|'ok', titulo, detalle, enlace }
  App.avisosDelDia = () => {
    const hoy = U.hoy();
    const av = [];

    // Temperaturas de equipos (diario)
    const regTemp = db.registros(App.TEMP_TIPO).find((r) => r.fecha === hoy);
    av.push(
      regTemp
        ? { estado: 'ok', titulo: 'Temperaturas de equipos', detalle: `Registradas por ${regTemp.quien}`, enlace: '#/temperaturas' }
        : { estado: 'fuera', titulo: 'Temperaturas de equipos', detalle: 'Falta el registro de hoy', enlace: '#/temperaturas' }
    );
    const sinTemp = [];
    const fechasTemp = new Set(db.registros(App.TEMP_TIPO).map((r) => r.fecha));
    const primera = [...fechasTemp].sort()[0];
    for (let i = 1; i <= 7; i++) {
      const f = U.sumarDias(hoy, -i);
      if (primera && f > primera && !fechasTemp.has(f)) sinTemp.push(U.fmtFecha(f).slice(0, 5));
    }
    if (sinTemp.length)
      av.push({ estado: 'aviso', titulo: 'Días sin temperaturas', detalle: `Últimos 7 días sin registro: ${sinTemp.join(', ')}`, enlace: '#/temperaturas/mes' });

    // Limpieza
    const ult = App.ultimasLimpiezas();
    const pend = db.activos('tareas').filter((t) => App.estadoTarea(t, ult, hoy).estado === 'pendiente');
    const atrasadas = pend.filter((t) => ult[t.id] && App.estadoTarea(t, ult, hoy).retraso > 0);
    av.push(
      pend.length
        ? { estado: atrasadas.length ? 'fuera' : 'aviso', titulo: 'Limpieza', detalle: `${pend.length} tareas pendientes${atrasadas.length ? ` (${atrasadas.length} atrasadas)` : ''}`, enlace: '#/limpieza' }
        : { estado: 'ok', titulo: 'Limpieza', detalle: 'Todo al día', enlace: '#/limpieza' }
    );
    const sinFecha = db.activos('tareas').filter((t) => App.estadoTarea(t, ult, hoy).estado === 'sin_fecha');
    if (sinFecha.length)
      av.push({ estado: 'neutro', titulo: 'Limpiezas periódicas', detalle: `${sinFecha.length} tareas sin fecha de última limpieza: anótala para que la app avise`, enlace: '#/limpieza?ver=sin_fecha' });

    // Agua (semanal)
    const lunes = U.lunesDeSemana(hoy);
    const aguaSemana = db.registros('agua').filter((r) => r.fecha >= lunes && r.fecha <= hoy);
    av.push(
      aguaSemana.length
        ? { estado: 'ok', titulo: 'Control de agua', detalle: `Hecho esta semana (${U.fmtFecha(aguaSemana[0].fecha)})`, enlace: '#/agua' }
        : { estado: 'aviso', titulo: 'Control de agua', detalle: `Pendiente esta semana (S${U.semanaISO(hoy)})`, enlace: '#/agua?nuevo=1' }
    );

    // Transporte (solo días de reparto de pastelería)
    const trHoy = db.registros('transporte').some((r) => r.fecha === hoy);
    av.push(
      trHoy
        ? { estado: 'ok', titulo: 'Transporte refrigerado', detalle: 'Registrado hoy', enlace: '#/transporte' }
        : { estado: 'neutro', titulo: 'Transporte refrigerado', detalle: 'Si hoy se reparte pastelería, anota la temperatura', enlace: '#/transporte?nuevo=1' }
    );

    // Incidencias abiertas
    const abiertas = db.lista('incidencias').filter((i) => i.estado !== 'cerrada');
    av.push(
      abiertas.length
        ? { estado: 'fuera', titulo: 'Incidencias abiertas', detalle: `${abiertas.length} sin cerrar`, enlace: '#/incidencias' }
        : { estado: 'ok', titulo: 'Incidencias', detalle: 'Ninguna abierta', enlace: '#/incidencias' }
    );

    // Verificación trimestral: 1 alimento + 2 superficies
    const anio = hoy.slice(0, 4);
    const tri = U.trimestre(hoy);
    const mTri = db.registros('muestra').filter((r) => r.fecha.startsWith(anio) && U.trimestre(r.fecha) === tri);
    const nAli = mTri.filter((r) => r.clase === 'alimento').length;
    const nSup = mTri.filter((r) => r.clase === 'superficie').length;
    if (nAli < 1 || nSup < 2)
      av.push({ estado: 'aviso', titulo: `Muestras del ${tri}º trimestre`, detalle: `Alimento ${nAli}/1 · superficies ${nSup}/2`, enlace: '#/muestras' });
    const pendRes = db.registros('muestra').filter((r) => r.resultado === 'pendiente');
    if (pendRes.length) av.push({ estado: 'aviso', titulo: 'Resultados de análisis', detalle: `${pendRes.length} muestra(s) pendientes de resultado`, enlace: '#/muestras' });

    // Visitas anuales: plagas y análisis de agua
    const ultimaVisita = (cat) => db.registros('visita').filter((r) => r.categoria === cat).map((r) => r.fecha).sort().pop();
    for (const [cat, txt, enlace] of [['Control de plagas (DDD)', 'Visita de control de plagas', '#/plagas'], ['Análisis de agua (laboratorio)', 'Análisis anual de agua (grifo)', '#/visitas?nuevo=1']]) {
      const u = ultimaVisita(cat);
      if (!u || U.diasEntre(u, hoy) > 365) av.push({ estado: 'aviso', titulo: txt, detalle: u ? `Última: ${U.fmtFecha(u)} (hace más de un año)` : 'No consta ninguna registrada', enlace });
    }
    av.push(...App.avisosPlagas(), ...App.avisosMantenimiento(), ...App.avisosFormacion());
    return av;
  };

  function render() {
    const hoy = U.hoy();
    const av = App.avisosDelDia();
    const orden = { fuera: 0, aviso: 1, neutro: 2, ok: 3 };
    av.sort((a, b) => orden[a.estado] - orden[b.estado]);
    const accesos = [
      ['#/temperaturas', 'Temperaturas'],
      ['#/limpieza', 'Limpieza'],
      ['#/recepcion?nuevo=1', 'Recepción'],
      ['#/agua?nuevo=1', 'Agua'],
      ['#/transporte?nuevo=1', 'Transporte'],
      ['#/aceite?nuevo=1', 'Freidora'],
      ['#/acrilamida?nuevo=1', 'Acrilamida'],
      ['#/incidencias', 'Incidencias'],
    ];
    App.vista().innerHTML = `
      ${App.cabecera('Hoy', U.fmtFechaLarga(hoy))}
      <div class="avisos">${av
        .map((a) => `<a class="aviso aviso-${a.estado}" href="${a.enlace}"><b>${esc(a.titulo)}</b><span>${esc(a.detalle)}</span></a>`)
        .join('')}</div>
      <h2 class="titulo-seccion">Registrar</h2>
      <div class="accesos">${accesos.map(([h, t]) => `<a class="acceso" href="${h}">${esc(t)}</a>`).join('')}</div>`;
  }

  App.vistas[''] = render;
})();
