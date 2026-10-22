// Registros que siguen el mismo patrón (formulario + historial): recepción, agua,
// transporte, aceite, acrilamida, visitas externas y muestras de verificación.
// Cada definición indica sus campos y cómo evaluar si algo está fuera de límite.
(function () {
  const esc = U.esc;
  const L = () => db.limites();

  const DEFS = {
    recepcion: {
      titulo: 'Recepción de mercancía',
      sub: 'PCC1 · en cada entrega: lote, temperatura de perecederos y estado. Refrigerados ≤ 8 ºC · congelados ≤ -16 ºC',
      plan: 'Proveedores / recepción',
      nuevo: 'Nueva recepción',
      campos: [
        { n: 'fecha', t: 'fecha' },
        { n: 'hora', t: 'hora' },
        { n: 'proveedor', t: 'proveedor', l: 'Proveedor', req: true },
        { n: 'producto', t: 'materia', l: 'Producto', req: true, ayuda: 'Elige de la lista de materias primas para que sume al stock' },
        { n: 'lote', t: 'texto', l: 'Lote', req: true, ayuda: 'Si el albarán no trae lote, anotarlo a mano también en el albarán' },
        { n: 'cantidad', t: 'numero', l: 'Nº de envases (sacos, cajas, cubos…)', ayuda: 'Es lo que suma al stock de envases cerrados' },
        { n: 'caducidad', t: 'fecha', l: 'Caducidad / consumo preferente', req: false },
        { n: 'conservacion', t: 'select', l: 'Conservación', ops: [['refrigerado', 'Refrigerado'], ['congelado', 'Congelado'], ['ambiente', 'Ambiente']], req: true },
        { n: 'temp', t: 'numero', l: 'Temperatura (ºC)', ayuda: 'Obligatoria en refrigerados y congelados (termómetro láser o del camión)' },
        { n: 'estado', t: 'okno', l: 'Envases, etiquetado y aspecto' },
        { n: 'vehiculo', t: 'okno', l: 'Higiene del vehículo del proveedor' },
        { n: 'quien', t: 'persona', l: '¿Quién recibe?' },
        { n: 'obs', t: 'textarea', l: 'Observaciones' },
      ],
      validar: (d) => {
        if (d.conservacion !== 'ambiente' && U.num(d.temp) === null) return 'Anota la temperatura del producto';
      },
      evaluar: (d) => {
        const r = [];
        const t = U.num(d.temp);
        if (d.conservacion === 'refrigerado' && t !== null && t > L().recepcionRefrigMax) r.push(`Refrigerado a ${U.fmtNum(t)} ºC (máx. ${L().recepcionRefrigMax} ºC): rechazar`);
        if (d.conservacion === 'congelado' && t !== null && t > L().recepcionCongMax) r.push(`Congelado a ${U.fmtNum(t)} ºC (máx. ${L().recepcionCongMax} ºC): comprobar si hay descongelación`);
        if (d.estado === 'mal') r.push('Envases/etiquetado/aspecto incorrectos');
        if (d.vehiculo === 'mal') r.push('Vehículo del proveedor en mal estado higiénico');
        return r;
      },
      ayudaAccion: 'Rechazar el producto o anotarlo en el albarán y avisar al proveedor',
      columnas: [
        ['Fecha', (r) => `${U.fmtFecha(r.fecha)} ${esc(r.hora || '')}`],
        ['Sem.', (r) => 'S' + U.semanaISO(r.fecha)],
        ['Proveedor', (r) => esc(r.proveedor)],
        ['Albarán', (r) => esc(r.numAlbaran || '') + (r.fotos?.length ? ` <button class="btn-icono" data-foto="${esc(r.fotos[0])}" title="Ver foto del albarán">📷</button>` : '')],
        ['Producto', (r) => esc(r.producto)],
        ['Lote', (r) => esc(r.lote)],
        ['Envases', (r) => esc(U.fmtNum(r.cantidad))],
        ['Tª', (r) => (r.temp !== '' && r.temp != null ? esc(U.fmtNum(r.temp)) + ' ºC' : '—')],
        ['Quién', (r) => esc(r.quien)],
      ],
    },

    agua: {
      titulo: 'Control de agua',
      sub: 'Mínimo 1 vez por semana · cloro libre 0,2 – 1,0 mg/l (kit Visocolor Alpha) y caracteres organolépticos. Rotar el punto de muestreo',
      plan: 'Agua',
      nuevo: 'Nuevo control',
      campos: [
        { n: 'fecha', t: 'fecha' },
        { n: 'punto', t: 'select', l: 'Punto de muestreo (grifo)', ops: ['Grifo sala de pan', 'Grifo sala de pastelería', 'Fregadero office', 'Lavamanos', 'Depósito acumulador', 'Otro'], req: true },
        { n: 'cloro', t: 'numero', l: 'Cloro libre (mg/l)', req: true, ayuda: 'Escala del kit: 0,25 · 0,5 · 1,0 · 1,5 · 2,0' },
        { n: 'olor', t: 'okno', l: 'Olor' },
        { n: 'color', t: 'okno', l: 'Color' },
        { n: 'sabor', t: 'okno', l: 'Sabor' },
        { n: 'turbidez', t: 'okno', l: 'Turbidez' },
        { n: 'quien', t: 'persona' },
        { n: 'obs', t: 'textarea', l: 'Observaciones' },
      ],
      evaluar: (d) => {
        const r = [];
        const c = U.num(d.cloro);
        if (c !== null && (c < L().cloroMin || c > L().cloroMax)) r.push(`Cloro ${U.fmtNum(c)} mg/l fuera de ${U.fmtNum(L().cloroMin)}–${U.fmtNum(L().cloroMax)} mg/l`);
        for (const k of ['olor', 'color', 'sabor', 'turbidez']) if (d[k] === 'mal') r.push(`${k[0].toUpperCase() + k.slice(1)} anómalo`);
        return r;
      },
      ayudaAccion: 'Repetir la medición, llamar a HIDRALIA y usar agua embotellada mientras tanto',
      columnas: [
        ['Fecha', (r) => U.fmtFecha(r.fecha)],
        ['Punto', (r) => esc(r.punto)],
        ['Cloro', (r) => esc(U.fmtNum(r.cloro)) + ' mg/l'],
        ['Organolépticos', (r) => (['olor', 'color', 'sabor', 'turbidez'].every((k) => r[k] !== 'mal') ? 'Correctos' : 'Anómalos')],
        ['Quién', (r) => esc(r.quien)],
      ],
    },

    transporte: {
      titulo: 'Temperatura de transporte',
      sub: 'PCC4 · los días de reparto de pastelería · conectar el frío antes de cargar (≤ 4 ºC) · límite crítico < 8 ºC',
      plan: 'Transporte',
      nuevo: 'Nuevo reparto',
      campos: [
        { n: 'fecha', t: 'fecha' },
        { n: 'vehiculo', t: 'vehiculo', l: 'Vehículo' },
        { n: 'tempInicio', t: 'numero', l: 'Tª al cargar (ºC)', req: true },
        { n: 'tempFin', t: 'numero', l: 'Tª al terminar el reparto (ºC)' },
        { n: 'reparto', t: 'texto', l: 'Reparto (tiendas / clientes)' },
        { n: 'quien', t: 'persona' },
        { n: 'obs', t: 'textarea', l: 'Observaciones' },
      ],
      evaluar: (d) => {
        const r = [];
        for (const [k, txt] of [['tempInicio', 'al cargar'], ['tempFin', 'al terminar']]) {
          const t = U.num(d[k]);
          if (t !== null && t >= L().transporteCriticoMax) r.push(`Tª ${txt}: ${U.fmtNum(t)} ºC (debe ser < ${L().transporteCriticoMax} ºC)`);
        }
        return r;
      },
      avisos: (d) => {
        const t = U.num(d.tempInicio);
        return t !== null && t > L().transporteObjetivoMax && t < L().transporteCriticoMax ? [`Al cargar debería estar a ≤ ${L().transporteObjetivoMax} ºC`] : [];
      },
      ayudaAccion: 'Avisar al servicio técnico; usar vehículo de sustitución o alquilar uno refrigerado',
      columnas: [
        ['Fecha', (r) => U.fmtFecha(r.fecha)],
        ['Vehículo', (r) => esc(db.obtener('vehiculos', r.vehiculo)?.nombre || '')],
        ['Inicio', (r) => esc(U.fmtNum(r.tempInicio)) + ' ºC'],
        ['Fin', (r) => (r.tempFin !== '' && r.tempFin != null ? esc(U.fmtNum(r.tempFin)) + ' ºC' : '—')],
        ['Reparto', (r) => esc(r.reparto || '')],
        ['Quién', (r) => esc(r.quien)],
      ],
    },

    aceite: {
      titulo: 'Freidora y aceite',
      sub: 'Cada vez que se usa la freidora · si los compuestos polares superan el 24 % se cambia el aceite',
      plan: 'Otras',
      nuevo: 'Nuevo uso de freidora',
      campos: [
        { n: 'fecha', t: 'fecha' },
        { n: 'producto', t: 'producto', l: 'Producto frito', req: true, ayuda: 'Susos, bombas, pestiños, borrachuelos, torrijas…' },
        { n: 'aceite', t: 'select', l: 'Aceite', ops: [['nuevo', 'Nuevo'], ['usado', 'Reutilizado']], req: true },
        { n: 'tiempo', t: 'numero', l: 'Tiempo de fritura (min)' },
        { n: 'temp', t: 'numero', l: 'Temperatura (ºC)', ayuda: 'Habitual: 180 ºC' },
        { n: 'polares', t: 'numero', l: 'Compuestos polares (%)', ayuda: 'Solo cuando se mide con el test' },
        { n: 'cambio', t: 'select', l: '¿Se cambia el aceite?', ops: [['no', 'No'], ['si', 'Sí, aceite cambiado']], req: true },
        { n: 'quien', t: 'persona' },
        { n: 'obs', t: 'textarea', l: 'Observaciones' },
      ],
      evaluar: (d) => {
        const p = U.num(d.polares);
        return p !== null && p > L().aceitePolaresMax && d.cambio !== 'si' ? [`Compuestos polares ${U.fmtNum(p)} % (máx. ${L().aceitePolaresMax} %) y no se ha cambiado el aceite`] : [];
      },
      ayudaAccion: 'Cambiar el aceite y reducir el número de usos',
      columnas: [
        ['Fecha', (r) => U.fmtFecha(r.fecha)],
        ['Producto', (r) => esc(r.producto)],
        ['Aceite', (r) => (r.aceite === 'nuevo' ? 'Nuevo' : 'Reutilizado')],
        ['Tiempo', (r) => (r.tiempo ? esc(r.tiempo) + ' min' : '')],
        ['Tª', (r) => (r.temp ? esc(r.temp) + ' ºC' : '')],
        ['Polares', (r) => (r.polares ? esc(U.fmtNum(r.polares)) + ' %' : '')],
        ['Cambio', (r) => (r.cambio === 'si' ? 'Sí' : 'No')],
        ['Quién', (r) => esc(r.quien)],
      ],
    },

    acrilamida: {
      titulo: 'Acrilamida · control visual',
      sub: 'Pan, susos y bombas: el producto horneado o frito debe quedar de color amarillo dorado claro',
      plan: 'Otras',
      nuevo: 'Nuevo control',
      campos: [
        { n: 'fecha', t: 'fecha' },
        { n: 'producto', t: 'producto', l: 'Producto', req: true },
        { n: 'color', t: 'select', l: 'Color del producto final', ops: [['ok', 'Amarillo dorado claro (correcto)'], ['mal', 'Demasiado tostado / oscuro']], req: true },
        { n: 'quien', t: 'persona' },
        { n: 'obs', t: 'textarea', l: 'Observaciones' },
      ],
      evaluar: (d) => (d.color === 'mal' ? ['Producto demasiado tostado'] : []),
      ayudaAccion: 'Retirar el lote demasiado tostado y revisar tiempo/temperatura del horno o freidora',
      columnas: [
        ['Fecha', (r) => U.fmtFecha(r.fecha)],
        ['Producto', (r) => esc(r.producto)],
        ['Color', (r) => (r.color === 'ok' ? App.chip('ok', 'Correcto') : App.chip('fuera', 'Tostado'))],
        ['Quién', (r) => esc(r.quien)],
      ],
    },

    visita: {
      titulo: 'Visitas, análisis y documentos externos',
      sub: 'Partes de plagas (PLAGUIRONDA), mantenimiento y averías, análisis de agua, auditorías de la consultora, formación, retirada de aceite…',
      plan: 'Otras',
      nuevo: 'Nueva visita / documento',
      campos: [
        { n: 'fecha', t: 'fecha' },
        { n: 'categoria', t: 'select', l: 'Tipo', req: true, ops: ['Control de plagas (DDD)', 'Mantenimiento / avería', 'Análisis de agua (laboratorio)', 'Limpieza depósito de agua', 'Auditoría / verificación consultora', 'Formación de manipuladores', 'Retirada aceite usado', 'Residuos (SANDACH, etc.)', 'Otro'] },
        { n: 'empresa', t: 'proveedor', l: 'Empresa / técnico' },
        { n: 'descripcion', t: 'textarea', l: 'Qué se ha hecho / resultado', req: true },
        { n: 'documento', t: 'texto', l: 'Nº de parte, factura o certificado' },
        { n: 'requiereAccion', t: 'select', l: '¿Hay que corregir algo?', ops: [['no', 'No'], ['si', 'Sí (abre incidencia)']], req: true },
        { n: 'quien', t: 'persona', l: '¿Quién lo registra?' },
      ],
      evaluar: (d) => (d.requiereAccion === 'si' ? [`${d.categoria}: ${d.descripcion}`] : []),
      ayudaAccion: 'Lo que recomiende la empresa (arreglar, tratamiento, etc.)',
      planDe: (d) => ({ 'Control de plagas (DDD)': 'Plagas', 'Mantenimiento / avería': 'Mantenimiento', 'Análisis de agua (laboratorio)': 'Agua', 'Limpieza depósito de agua': 'Agua', 'Formación de manipuladores': 'Formación', 'Residuos (SANDACH, etc.)': 'Residuos', 'Retirada aceite usado': 'Residuos' }[d.categoria] || 'Otras'),
      columnas: [
        ['Fecha', (r) => U.fmtFecha(r.fecha)],
        ['Tipo', (r) => esc(r.categoria)],
        ['Empresa', (r) => esc(r.empresa || '')],
        ['Descripción', (r) => esc(r.descripcion)],
        ['Doc.', (r) => esc(r.documento || '') + (r.archivos || []).map((f) => ` <button class="btn-icono" data-foto="${esc(f)}" title="Ver documento">📄</button>`).join('')],
      ],
    },

    muestra: {
      titulo: 'Muestras de verificación',
      sub: 'Cada trimestre: 1 muestra de alimento y 2 de superficie (Reglamento CE 2073/2005). Superficies: aerobios < 10 ufc/cm² limpio, enterobacterias < 1, Listeria ausencia',
      plan: 'Otras',
      nuevo: 'Nueva muestra',
      campos: [
        { n: 'fecha', t: 'fecha', l: 'Fecha de recogida' },
        { n: 'clase', t: 'select', l: 'Tipo de muestra', ops: [['alimento', 'Alimento'], ['superficie', 'Superficie']], req: true },
        { n: 'muestra', t: 'texto', l: 'Producto o superficie', req: true },
        { n: 'resultado', t: 'select', l: 'Resultado', ops: [['pendiente', 'Pendiente de resultado'], ['conforme', 'Conforme'], ['no_conforme', 'No conforme']], req: true },
        { n: 'detalle', t: 'texto', l: 'Detalle del resultado (opcional)' },
        { n: 'quien', t: 'persona', l: '¿Quién firma la recogida?' },
      ],
      evaluar: (d) => (d.resultado === 'no_conforme' ? [`Muestra no conforme: ${d.muestra}. Aplicar protocolo de gestión de crisis`] : []),
      ayudaAccion: 'Parar producción si procede, inmovilizar lotes, limpieza a fondo con hipoclorito y repetir análisis',
      columnas: [
        ['Fecha', (r) => U.fmtFecha(r.fecha)],
        ['Trim.', (r) => 'T' + U.trimestre(r.fecha)],
        ['Tipo', (r) => (r.clase === 'alimento' ? 'Alimento' : 'Superficie')],
        ['Muestra', (r) => esc(r.muestra)],
        ['Resultado', (r) => ({ pendiente: App.chip('aviso', 'Pendiente'), conforme: App.chip('ok', 'Conforme'), no_conforme: App.chip('fuera', 'No conforme') }[r.resultado] || '')],
        ['Quién', (r) => esc(r.quien)],
      ],
    },
  };

  // ---------- Construcción de campos ----------
  function campoHTML(c, valor) {
    const etiqueta = c.l || { fecha: 'Fecha', hora: 'Hora', persona: '¿Quién lo hace?' }[c.t] || c.n;
    const req = c.req ? 'required' : '';
    const v = valor ?? '';
    const ayuda = c.ayuda ? `<small>${esc(c.ayuda)}</small>` : '';
    switch (c.t) {
      case 'persona':
        return App.selectPersona(c.n, valor, etiqueta);
      case 'okno':
        return App.okNo(c.n, valor || 'ok', etiqueta);
      case 'fecha':
        return `<label class="campo"><span>${esc(etiqueta)}</span><input type="date" name="${c.n}" value="${esc(v || (c.n === 'fecha' ? U.hoy() : ''))}" ${c.n === 'fecha' ? 'required' : req}>${ayuda}</label>`;
      case 'hora':
        return `<label class="campo"><span>${esc(etiqueta)}</span><input type="time" name="${c.n}" value="${esc(v || U.horaAhora())}">${ayuda}</label>`;
      case 'numero':
        return `<label class="campo"><span>${esc(etiqueta)}</span><input name="${c.n}" inputmode="decimal" autocomplete="off" value="${esc(U.fmtNum(v))}" ${req}>${ayuda}</label>`;
      case 'select':
        return `<label class="campo"><span>${esc(etiqueta)}</span>${App.selectOpciones(c.n, c.ops, v, { required: c.req })}${ayuda}</label>`;
      case 'vehiculo': {
        const vs = db.activos('vehiculos').filter((x) => x.refrigerado);
        return `<label class="campo"><span>${esc(etiqueta)}</span>${App.selectOpciones(c.n, vs.map((x) => [x.id, x.nombre]), v || vs[0]?.id, { vacio: false })}</label>`;
      }
      case 'proveedor':
        return `<label class="campo"><span>${esc(etiqueta)}</span><input name="${c.n}" list="dl-proveedores" value="${esc(v)}" ${req} autocomplete="off">${ayuda}</label>`;
      case 'producto':
        return `<label class="campo"><span>${esc(etiqueta)}</span><input name="${c.n}" list="dl-productos" value="${esc(v)}" ${req} autocomplete="off">${ayuda}</label>`;
      case 'materia':
        return `<label class="campo"><span>${esc(etiqueta)}</span><input name="${c.n}" list="dl-materias" value="${esc(v)}" ${req} autocomplete="off">${ayuda}</label>`;
      case 'textarea':
        return `<label class="campo campo-ancho"><span>${esc(etiqueta)}</span><textarea name="${c.n}" rows="2" ${req}>${esc(v)}</textarea>${ayuda}</label>`;
      default:
        return `<label class="campo"><span>${esc(etiqueta)}</span><input name="${c.n}" value="${esc(v)}" ${req} autocomplete="off">${ayuda}</label>`;
    }
  }

  const datalists = () => `
    <datalist id="dl-proveedores">${db.activos('proveedores').map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
    <datalist id="dl-materias">${db.activos('materias').map((m) => `<option value="${esc(m.nombre)}">`).join('')}</datalist>
    <datalist id="dl-productos">${['Pan', 'Susos', 'Bombas', 'Pestiños', 'Borrachuelos', 'Torrijas', ...db.activos('productos').map((p) => p.nombre)].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;

  function abrirFormulario(tipo, reg) {
    const def = DEFS[tipo];
    const m = App.modal(
      `<form>
        <h2>${esc(reg ? 'Editar registro' : def.nuevo)}</h2>
        <div class="rejilla-campos">${def.campos.map((c) => campoHTML(c, reg?.[c.n])).join('')}</div>
        <div class="alerta-limite" hidden></div>
        <label class="campo campo-ancho accion-correctora" hidden><span>Acción correctora (obligatoria)</span>
          <textarea name="accion" rows="2" placeholder="${esc(def.ayudaAccion || '')}">${esc(reg?.accion || '')}</textarea></label>
        ${datalists()}
        <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
      </form>`,
      {
        ancho: true,
        onSubmit: async (d) => {
          const err = def.validar?.(d);
          if (err) {
            U.toast(err, 'error');
            return false;
          }
          for (const c of def.campos) if (c.t === 'numero' && d[c.n] !== '' && U.num(d[c.n]) === null) {
            U.toast(`Valor no válido en "${c.l}"`, 'error');
            return false;
          }
          const problemas = def.evaluar(d);
          if (problemas.length && !d.accion) {
            U.toast('Indica la acción correctora', 'error');
            return false;
          }
          const r = reg || { tipo };
          for (const c of def.campos) r[c.n] = c.t === 'numero' ? U.num(d[c.n]) : d[c.n];
          r.accion = problemas.length ? d.accion : '';
          // La recepción queda ligada a su materia prima para el stock y los lotes
          if (tipo === 'recepcion') r.materiaId = App.materiaPorNombre(d.producto)?.id || '';
          if (problemas.length && !r.incidencia) {
            const inc = await App.crearIncidencia({
              plan: def.planDe ? def.planDe(d) : def.plan,
              descripcion: `${def.titulo}: ${problemas.join('; ')}${d.producto ? ` (${d.producto}${d.lote ? ', lote ' + d.lote : ''})` : ''}`,
              accion: d.accion,
              quien: d.quien,
              origen: { tipo, fecha: d.fecha },
            });
            r.incidencia = inc.numero;
            U.toast(`Guardado. Incidencia ${inc.numero} abierta`, 'aviso');
          } else U.toast('Registro guardado');
          await db.guardar('registros', r);
          if (d.quien) U.ultimoUsuario(d.quien);
          // En la tablet del obrador, después de apuntar se vuelve a los botones grandes
          if (App.modoObrador() && !reg) location.hash = '#/';
          else App.recargar();
        },
      }
    );
    const form = m.el.querySelector('form');
    const revisar = () => {
      const d = U.leerForm(form);
      const prob = def.evaluar(d);
      const av = def.avisos?.(d) || [];
      const caja = form.querySelector('.alerta-limite');
      caja.hidden = !prob.length && !av.length;
      caja.className = 'alerta-limite ' + (prob.length ? 'fuera' : 'aviso');
      caja.innerHTML = [...prob.map((p) => '⚠ ' + esc(p)), ...av.map((p) => 'ℹ ' + esc(p))].join('<br>');
      form.querySelector('.accion-correctora').hidden = !prob.length;
    };
    form.addEventListener('input', revisar);
    form.addEventListener('change', revisar);
    revisar();
  }

  function renderLista(tipo, params) {
    const def = DEFS[tipo];
    const mesParam = params.get('mes') || U.hoy().slice(0, 7);
    const regs = db
      .registros(tipo)
      .filter((r) => r.fecha.startsWith(mesParam))
      .sort((a, b) => (b.fecha + (b.hora || '') + (b.modificado || '')).localeCompare(a.fecha + (a.hora || '') + (a.modificado || '')));
    const enlaceExtra =
      {
        visita: '<a class="btn" href="#/muestras">Muestras de verificación</a>',
        muestra: '<a class="btn" href="#/visitas">Visitas y documentos</a>',
        recepcion: '<a class="btn" href="#/cola-albaranes">📚 Muchos albaranes de golpe</a><button class="btn btn-primario" id="btn-foto-albaran">📷 Con foto del albarán</button>',
      }[tipo] || '';
    App.vista().innerHTML = `
      ${App.cabecera(def.titulo, esc(def.sub), `${enlaceExtra}<button class="btn btn-primario" id="btn-nuevo">+ ${esc(def.nuevo)}</button>`)}
      <div class="tarjeta">
        <label class="campo campo-corto"><span>Mes</span><input type="month" id="sel-mes" value="${mesParam}"></label>
        ${App.tablaRegistros(tipo, regs, true)}
      </div>`;
    const v = App.vista();
    v.querySelector('#btn-nuevo').addEventListener('click', () => abrirFormulario(tipo));
    v.querySelector('#btn-foto-albaran')?.addEventListener('click', () => App.recepcionConFoto());
    if (tipo === 'recepcion' && params.get('foto')) {
      history.replaceState(null, '', '#/recepcion');
      App.recepcionConFoto();
    }
    v.querySelector('#sel-mes').addEventListener('change', (e) => (location.hash = `#/${App.rutaRegistro(tipo)}?mes=${e.target.value}`));
    v.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-borrar]');
      if (b) {
        if (await App.confirmar('¿Borrar este registro?')) {
          await db.borrar('registros', b.dataset.borrar);
          App.recargar();
        }
        return;
      }
      const ed = e.target.closest('[data-editar]');
      if (ed) abrirFormulario(tipo, db.obtener('registros', ed.dataset.editar));
    });
    if (params.get('nuevo')) {
      history.replaceState(null, '', `#/${App.rutaRegistro(tipo)}`);
      abrirFormulario(tipo);
    }
  }

  // Tabla de registros reutilizada por los informes
  App.tablaRegistros = (tipo, regs, conAcciones = false) => {
    const def = DEFS[tipo];
    if (!regs.length) return '<p class="vacio">Sin registros en este periodo.</p>';
    return `<div class="tabla-scroll"><table class="tabla">
      <thead><tr>${def.columnas.map(([t]) => `<th>${esc(t)}</th>`).join('')}<th>Incid. nº</th>${conAcciones ? '<th></th>' : ''}</tr></thead>
      <tbody>${regs
        .map(
          (r) => `<tr class="${r.incidencia ? 'fila-incidencia' : ''}">${def.columnas.map(([, fn]) => `<td>${fn(r)}</td>`).join('')}<td>${esc(r.incidencia || '')}</td>
          ${conAcciones ? `<td class="nowrap"><button class="btn-icono" data-editar="${r.id}" title="Editar">✎</button><button class="btn-icono" data-borrar="${r.id}" title="Borrar">✕</button></td>` : ''}</tr>`
        )
        .join('')}</tbody></table></div>`;
  };

  App.DEFS_REGISTROS = DEFS;
  App.abrirFormularioRegistro = abrirFormulario;
  App.rutaRegistro = (tipo) => ({ visita: 'visitas', muestra: 'muestras' }[tipo] || tipo);
  for (const tipo of Object.keys(DEFS)) App.vistas[App.rutaRegistro(tipo)] = (params) => renderLista(tipo, params);
})();
