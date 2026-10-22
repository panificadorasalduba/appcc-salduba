// Recepción con foto del albarán: la IA lee proveedor, número, fecha y líneas
// (producto, lote, envases, caducidad); se revisa y se guarda como recepción.
(function () {
  const esc = U.esc;
  const N = U.norm;

  // ---------- Fotos: reducir tamaño y huella para detectar fotos repetidas ----------
  async function prepararFoto(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(`No se puede abrir «${file.name}» (¿formato HEIC de iPhone? Cambia la cámara a «Más compatible»)`);
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    const base64 = c.toDataURL('image/jpeg', 0.82).split(',')[1];
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return { blob, base64, hash, vista: URL.createObjectURL(blob), nombre: file.name };
  }

  // Fecha leída del papel → AAAA-MM-DD (acepta 26/05/26, 26-05-2026, 26.05.26, 2026/5/26…)
  function fechaLeida(s) {
    s = String(s || '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s) || /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
    let y, mo, d;
    if (m) [, y, mo, d] = m;
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) {
      [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
    } else return '';
    const f = `${y}-${U.pad(+mo)}-${U.pad(+d)}`;
    const t = U.parse(f);
    return t.getMonth() + 1 === +mo && t.getDate() === +d ? f : '';
  }

  const recepciones = () => db.registros('recepcion');

  function albaranRepetido(proveedor, num, fecha, lineas) {
    if (num) {
      const r = recepciones().find((x) => x.numAlbaran && N(x.numAlbaran) === N(num) && N(x.proveedor) === N(proveedor));
      if (r) return r;
    } else if (proveedor && fecha) {
      // Sin número: mismo proveedor, mismo día y mismos productos
      const clave = (ls) => ls.map((l) => N(l.producto)).filter(Boolean).sort().join('|');
      const grupos = {};
      for (const x of recepciones().filter((x) => x.fecha === fecha && N(x.proveedor) === N(proveedor))) (grupos[x.albaranId || x.id] = grupos[x.albaranId || x.id] || []).push(x);
      const buscada = clave(lineas);
      for (const g of Object.values(grupos)) if (buscada && clave(g) === buscada) return g[0];
    }
    return null;
  }

  // ---------- Paso 1: hacer o elegir las fotos ----------
  App.recepcionConFoto = function () {
    let fotos = [];
    const v = App.modal(`
      <div class="ventana-grande">
        <h2>📷 Recepción con foto del albarán</h2>
        <p>Haz una foto a cada hoja del albarán. Que se vea bien el <b>número de albarán</b> y los <b>lotes</b>.</p>
        <label class="btn btn-primario btn-grande bloque">📷 Hacer foto / elegir imagen
          <input type="file" accept="image/*" capture="environment" multiple hidden id="in-fotos"></label>
        <div id="miniaturas" class="miniaturas"></div>
        <p id="estado-ia" class="estado-ia"></p>
        <button class="btn btn-primario btn-grande bloque" id="btn-leer" disabled>Leer con IA</button>
        <button class="btn btn-grande bloque" data-cerrar>Cancelar</button>
        <p class="centro"><a href="#/cola-albaranes">¿Tienes muchos albaranes? Súbelos todos de golpe</a></p>
      </div>`);
    const el = v.el;
    const estado = el.querySelector('#estado-ia');
    const pintar = () => {
      el.querySelector('#miniaturas').innerHTML = fotos.map((f, i) => `<figure><img src="${f.vista}" alt=""><button class="btn-icono" data-quitar="${i}" title="Quitar">✕</button><figcaption>Hoja ${i + 1}</figcaption></figure>`).join('');
      el.querySelector('#btn-leer').disabled = !fotos.length;
      el.querySelector('#btn-leer').textContent = fotos.length > 1 ? `Leer las ${fotos.length} hojas con IA` : 'Leer con IA';
    };
    el.querySelector('#in-fotos').addEventListener('change', async (e) => {
      for (const file of e.target.files) {
        try {
          const f = await prepararFoto(file);
          if (fotos.some((x) => x.hash === f.hash)) continue;
          fotos.push(f);
        } catch (err) {
          U.toast(err.message, 'error');
        }
      }
      e.target.value = '';
      if (fotos.length > 4) {
        fotos = fotos.slice(0, 4);
        U.toast('Máximo 4 hojas por albarán', 'aviso');
      }
      const repetida = recepciones().find((r) => (r.fotoHash || []).some((h) => fotos.some((f) => f.hash === h)));
      estado.innerHTML = repetida ? `⚠ Esta foto ya se usó en el albarán de <b>${esc(repetida.proveedor)}</b> del ${U.fmtFecha(repetida.fecha)}.` : '';
      pintar();
    });
    el.querySelector('#miniaturas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-quitar]');
      if (!b) return;
      fotos.splice(+b.dataset.quitar, 1);
      pintar();
    });
    el.querySelector('#btn-leer').addEventListener('click', async () => {
      const btn = el.querySelector('#btn-leer');
      btn.disabled = true;
      estado.textContent = 'Leyendo el albarán… puede tardar hasta un minuto si la IA está muy ocupada. No cierres esta ventana.';
      try {
        const datos = await db.leerAlbaran(fotos.map((f) => f.base64));
        v.cerrar();
        revisar(datos, fotos);
      } catch (err) {
        console.error(err);
        estado.innerHTML =
          err.tipo === 'saturado' || err.tipo === 'limite'
            ? '⚠ La IA está saturada ahora mismo. No es culpa de la foto: vuelve a pulsar en un par de minutos, o <a href="#" id="a-mano">apunta los productos a mano</a>.'
            : `⚠ No se ha podido leer (${esc(err.message)}). Prueba con una foto más nítida o <a href="#" id="a-mano">apunta los productos a mano</a>.`;
        el.querySelector('#a-mano')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          v.cerrar();
          revisar({ proveedor: '', numAlbaran: '', fecha: U.hoy(), lineas: [] }, fotos);
        });
        btn.disabled = false;
      }
    });
  };

  // ---------- Guardado común (foto suelta y carga masiva) ----------
  // Cada línea se guarda con un identificador FIJO calculado a partir de
  // proveedor + nº de albarán (o fecha si no tiene nº) + producto + lote.
  // Guardar el mismo albarán dos veces, desde la misma tablet o desde dos a la
  // vez, escribe sobre las mismas filas: es imposible que se dupliquen.
  async function idFijo(...partes) {
    const txt = partes.map((p) => N(p)).join('|');
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return 'rcp-' + Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 28);
  }

  // La IA lee el mismo papel con pequeñas diferencias (una letra del nº, «FD-004613» /
  // «SD-004613»; el código del proveedor delante del producto…). Por eso se compara:
  // misma entrega = mismo proveedor y mismas CIFRAS del nº (o misma fecha si falta);
  // misma línea = mismo lote y producto parecido. Si una línea coincide, es una copia.
  const cifras = (n) => String(n || '').replace(/\D/g, '').replace(/^0+/, '');
  const sinCodigo = (t) => N(String(t || '').replace(/^\s*\d{4,8}\s+/, '')).replace(/[^a-z0-9]+/g, ' ').trim();
  const alnum = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function mismoProveedor(a, b) {
    const x = sinCodigo(a), y = sinCodigo(b);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  }
  function mismaEntrega(r, d) {
    if (!mismoProveedor(r.proveedor, d.proveedor)) return false;
    const a = cifras(r.numAlbaran), b = cifras(d.numAlbaran);
    return a.length >= 3 && b.length >= 3 ? a === b : r.fecha === d.fecha;
  }
  function mismoLote(a, b) {
    const x = alnum(a), y = alnum(b);
    if (!x || !y) return false;
    const [c, l] = x.length <= y.length ? [x, y] : [y, x];
    return x === y || (c.length >= 4 && l.includes(c));
  }
  function mismoProducto(a, b) {
    const x = sinCodigo(a).split(' ').filter(Boolean), y = sinCodigo(b).split(' ').filter(Boolean);
    if (!x.length || !y.length) return false;
    if (x.join(' ') === y.join(' ')) return true;
    const [c, l] = x.length <= y.length ? [x, y] : [y, x];
    return c.length >= 2 && c.some((w) => w.length >= 4) && c.every((w) => l.includes(w));
  }
  // Dentro de la misma entrega, el mismo lote ya identifica la línea (el nombre puede venir
  // como el del proveedor o como el nuestro); sin lote, mismo producto y misma cantidad.
  // (un lote muy corto, «148», puede repetirse entre productos: entonces también el producto).
  const lineaRepetida = (r, l) =>
    r.lote && l.lote
      ? mismoLote(r.lote, l.lote) && (alnum(l.lote).length >= 4 || mismoProducto(r.producto, l.producto))
      : !r.lote && !l.lote && mismoProducto(r.producto, l.producto) && U.num(r.cantidad) === U.num(l.cantidad);

  // Envases de una línea: algunos albaranes ponen kilos o litros («56.000 KG» de
  // «Cremmy 4X4 Saco 14Kg») o repiten el peso del saco («25.00» de «PROKORN 25 KG»).
  function tamanoEnvase(producto) {
    const t = String(producto || '').toLowerCase().replace(',', '.');
    const base = (n, u) => (/^(g|gr|ml)$/.test(u) ? n / 1000 : n);
    const m = /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|k|l|lt|g|gr|ml)\b/.exec(t);
    if (m) return parseFloat(m[1]) * base(parseFloat(m[2]), m[3]);
    const todos = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kgs|k|l|lt|litros?|g|gr|ml)\b/g)];
    return todos.length ? base(parseFloat(todos[todos.length - 1][1]), todos[todos.length - 1][2]) : 0;
  }
  function envasesDeLinea(producto, cantidad) {
    const s = String(cantidad ?? '').toLowerCase();
    const n = parseFloat(s.replace(',', '.'));
    if (!isFinite(n) || n <= 0) return '';
    const tam = tamanoEnvase(producto);
    if (/\b(kg|kgs|kilos?|l|lt|litros?|g|gr|ml)\b/.test(s)) return tam ? Math.max(1, Math.round((/\b(g|gr|ml)\b/.test(s) ? n / 1000 : n) / tam)) : 1;
    const conUnidad = /[a-z]/.test(s.replace(/[\d.,\s]/g, ''));
    if (!conUnidad && tam >= 5 && n >= tam && Math.abs(n / tam - Math.round(n / tam)) < 0.01) return Math.round(n / tam);
    return n;
  }
  // Albaranes de hace más de 60 días: se guardan para la trazabilidad, pero esa mercancía ya se gastó
  const DIAS_STOCK = 60;
  const esAntiguo = (fecha) => !!fecha && U.diasEntre(fecha, U.hoy()) > DIAS_STOCK;

  // Devuelve { resultado: 'nuevo' | 'segunda-hoja' | 'duplicado', nuevas }
  App.guardarAlbaran = async (d, lineas, fotos, { forzarNuevo = false, sinStock = false, origen = 'foto', extra = () => ({}) } = {}) => {
    if (db.modoNube) await db.sincronizar(); // ver lo que hayan guardado otros aparatos
    const num = cifras(d.numAlbaran);
    const base = num.length >= 3 ? [d.proveedor, 'num', num] : d.numAlbaran ? [d.proveedor, 'num', d.numAlbaran] : [d.proveedor, 'fecha', d.fecha];
    const sufijo = forzarNuevo ? U.uid() : '';
    const albaranId = await idFijo(...base, sufijo);
    const misma = forzarNuevo ? [] : recepciones().filter((r) => mismaEntrega(r, d));
    if (lineas.some((l) => misma.some((r) => lineaRepetida(r, l)))) return { resultado: 'duplicado', nuevas: 0 };
    const ids = await Promise.all(lineas.map((l) => idFijo(...base, l.producto, l.lote, sufijo)));
    const nuevas = lineas.map((l, i) => ({ l, id: ids[i] })).filter(({ id }) => !db.obtener('registros', id));
    if (!nuevas.length) return { resultado: 'duplicado', nuevas: 0 };
    const yaHabia = misma.length > 0 || recepciones().some((r) => r.albaranId === albaranId);
    sinStock = sinStock || esAntiguo(d.fecha);

    const rutas = [];
    for (const [i, f] of (fotos || []).entries()) {
      try {
        if (f.blob) rutas.push(await db.subirFoto(f.blob, `${d.fecha}/${albaranId}-${f.hash.slice(0, 10)}-${i + 1}.jpg`));
      } catch (err) {
        console.error(err);
      }
    }
    for (const { l, id } of nuevas) {
      const m = App.materiaPorNombre(l.producto);
      await db.guardar('registros', {
        id, tipo: 'recepcion', fecha: d.fecha, hora: d.hora || '', proveedor: d.proveedor, numAlbaran: d.numAlbaran || '', albaranId,
        producto: m ? m.nombre : l.producto, materiaId: m?.id || '', lote: l.lote, cantidad: U.num(l.cantidad), caducidad: l.caducidad || '',
        conservacion: l.conservacion || 'ambiente', temp: U.num(l.temp), estado: d.estado || 'ok', vehiculo: d.vehiculo || 'ok', quien: d.quien || '',
        accion: '', incidencia: '', fotos: rutas.filter(Boolean), fotoHash: (fotos || []).map((f) => f.hash), origen, sinStock,
        ...extra(l),
      });
    }
    return { resultado: yaHabia ? 'segunda-hoja' : 'nuevo', nuevas: nuevas.length };
  };

  App.Albaranes = { prepararFoto: (f) => prepararFoto(f), fechaLeida: (s) => fechaLeida(s), revisar: (...a) => revisar(...a), envasesDeLinea, esAntiguo };

  // ---------- Paso 2: revisar lo leído y guardar ----------
  function revisar(datos, fotos, opciones = {}) {
    const fecha = fechaLeida(datos.fecha);
    let lineas = (datos.lineas || []).filter((l) => l.producto || l.lote);
    if (!lineas.length) lineas = [{ producto: '', lote: '', cantidad: '', caducidad: '' }];
    const fila = (l, i) => {
      const m = App.materiaPorNombre(l.producto);
      return `<tr data-i="${i}">
        <td><input name="producto" list="dl-materias-alb" value="${esc(m ? m.nombre : l.producto)}" class="${m ? '' : 'sin-catalogo'}" required></td>
        <td><input name="lote" value="${esc(l.lote)}" required style="width:130px"></td>
        <td><input name="cantidad" inputmode="numeric" value="${esc(String(envasesDeLinea(l.producto, l.cantidad)).replace('.', ','))}" style="width:70px"></td>
        <td><input name="caducidad" type="date" value="${esc(fechaLeida(l.caducidad))}"></td>
        <td><select name="conservacion"><option value="ambiente">Ambiente</option><option value="refrigerado">Refrigerado</option><option value="congelado">Congelado</option></select></td>
        <td><input name="temp" inputmode="decimal" placeholder="ºC" style="width:64px"></td>
        <td><button type="button" class="btn-icono" data-quitar-linea title="Quitar línea">✕</button></td>
      </tr>`;
    };
    const v = App.modal(
      `<form id="f-albaran">
        <h2>Revisa el albarán</h2>
        <p class="tenue">Comprueba lo que ha leído la IA y corrige lo que haga falta antes de guardar.</p>
        <div id="aviso-dup"></div>
        <div class="rejilla-campos">
          <label class="campo"><span>Proveedor</span><input name="proveedor" list="dl-prov-alb" value="${esc(datos.proveedor)}" required></label>
          <label class="campo"><span>Nº de albarán</span><input name="numAlbaran" value="${esc(datos.numAlbaran)}"></label>
          <label class="campo"><span>Fecha del albarán</span><input type="date" name="fecha" value="${fecha}" max="${U.hoy()}" required>
            ${fecha ? '' : `<small class="txt-fuera">No se ha leído bien la fecha${datos.fecha ? ` («${esc(datos.fecha)}»)` : ''}: escríbela mirando el papel.</small>`}</label>
          <label class="campo"><span>Hora de recepción</span><input type="time" name="hora" value="${U.horaAhora()}"></label>
          ${App.selectPersona('quien', undefined, '¿Quién recibe?')}
        </div>
        <div class="tabla-scroll"><table class="tabla tabla-lineas">
          <thead><tr><th>Producto</th><th>Lote</th><th>Envases</th><th>Caducidad</th><th>Conservación</th><th>Tª</th><th></th></tr></thead>
          <tbody>${lineas.map(fila).join('')}</tbody>
        </table></div>
        <div class="acciones izq"><button type="button" class="btn" id="btn-linea">+ Añadir línea</button></div>
        ${App.okNo('estado', 'ok', 'Envases, etiquetado y aspecto')}
        ${App.okNo('vehiculo', 'ok', 'Higiene del vehículo del proveedor')}
        <div class="alerta-limite" hidden></div>
        <label class="campo campo-ancho accion-correctora" hidden><span>Acción correctora (obligatoria)</span><textarea name="accion" rows="2" placeholder="Rechazar el producto o anotarlo en el albarán y avisar al proveedor"></textarea></label>
        <datalist id="dl-materias-alb">${db.activos('materias').map((m) => `<option value="${esc(m.nombre)}">`).join('')}</datalist>
        <datalist id="dl-prov-alb">${[...new Set([...db.activos('proveedores').map((p) => p.nombre), ...recepciones().map((r) => r.proveedor).filter(Boolean)])].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <p class="tenue">Los productos en <span class="sin-catalogo">naranja</span> no están en tu catálogo de materias primas: elige uno de la lista para que sume al stock.</p>
        <div class="acciones"><button type="button" class="btn" data-cerrar>Descartar</button><button class="btn btn-primario" type="submit" id="btn-guardar-alb">Guardar recepción</button></div>
      </form>`,
      { ancho: true }
    );
    const form = v.el.querySelector('#f-albaran');
    const tbody = form.querySelector('tbody');
    let forzar = false;

    const leerLineas = () =>
      [...tbody.querySelectorAll('tr')].map((tr) => {
        const g = (n) => tr.querySelector(`[name=${n}]`).value.trim();
        return { producto: g('producto'), lote: g('lote'), cantidad: g('cantidad'), caducidad: g('caducidad'), conservacion: g('conservacion'), temp: g('temp') };
      });
    const problemasDe = (l, d) => App.DEFS_REGISTROS.recepcion.evaluar({ conservacion: l.conservacion, temp: l.temp, estado: d.estado, vehiculo: d.vehiculo }).map((p) => `${l.producto}: ${p}`);
    const revisarTodo = () => {
      const d = U.leerForm(form);
      const ls = leerLineas();
      const probs = [...new Set(ls.flatMap((l) => problemasDe(l, d)))];
      const caja = form.querySelector('.alerta-limite');
      caja.hidden = !probs.length;
      caja.className = 'alerta-limite fuera';
      caja.innerHTML = probs.map((p) => '⚠ ' + esc(p)).join('<br>');
      form.querySelector('.accion-correctora').hidden = !probs.length;
      tbody.querySelectorAll('[name=producto]').forEach((i) => i.classList.toggle('sin-catalogo', !!i.value && !App.materiaPorNombre(i.value)));
      const dup = albaranRepetido(d.proveedor, d.numAlbaran, d.fecha, ls);
      form.querySelector('#aviso-dup').innerHTML = dup
        ? `<div class="alerta-limite fuera">ALBARÁN DUPLICADO: ya se guardó el de <b>${esc(dup.proveedor)}</b>${dup.numAlbaran ? ` nº ${esc(dup.numAlbaran)}` : ''} del ${U.fmtFecha(dup.fecha)}. Si de verdad es otra entrega, pulsa «Guardar de todas formas».</div>`
        : '';
      if (d.fecha && U.diasEntre(d.fecha, U.hoy()) > 60)
        form.querySelector('#aviso-dup').innerHTML += `<div class="alerta-limite aviso">La fecha es de hace ${U.diasEntre(d.fecha, U.hoy())} días (${U.fmtFecha(d.fecha)}). Compruébala en el papel.</div>`;
      form.querySelector('#btn-guardar-alb').textContent = dup ? 'Guardar de todas formas' : 'Guardar recepción';
      return { d, ls, probs, dup };
    };
    form.addEventListener('input', revisarTodo);
    form.addEventListener('change', revisarTodo);
    form.querySelector('#btn-linea').addEventListener('click', () => {
      tbody.insertAdjacentHTML('beforeend', fila({ producto: '', lote: '', cantidad: '', caducidad: '' }, tbody.children.length));
    });
    tbody.addEventListener('click', (e) => {
      if (e.target.closest('[data-quitar-linea]')) {
        e.target.closest('tr').remove();
        revisarTodo();
      }
    });
    revisarTodo();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { d, ls, probs, dup } = revisarTodo();
      const validas = ls.filter((l) => l.producto);
      if (!validas.length) return U.toast('No hay ningún producto', 'error');
      if (validas.some((l) => !l.lote)) return U.toast('Falta el lote en algún producto (si no viene en el albarán, apúntalo mirando el envase)', 'error');
      for (const l of validas) if (l.conservacion !== 'ambiente' && U.num(l.temp) === null) return U.toast(`Anota la temperatura de ${l.producto}`, 'error');
      if (!d.quien) return U.toast('Elige quién recibe', 'error');
      if (probs.length && !d.accion) return U.toast('Indica la acción correctora', 'error');
      if (dup && !forzar) {
        forzar = true;
        return U.toast('Es un albarán repetido. Pulsa otra vez para guardarlo igualmente.', 'aviso');
      }
      const btn = form.querySelector('#btn-guardar-alb');
      btn.disabled = true;
      try {
        let numInc = '';
        if (probs.length) {
          const inc = await App.crearIncidencia({ plan: 'Proveedores / recepción', descripcion: `Recepción ${d.proveedor}${d.numAlbaran ? ' nº ' + d.numAlbaran : ''}: ${probs.join('; ')}`, accion: d.accion, quien: d.quien, origen: { tipo: 'recepcion', fecha: d.fecha } });
          numInc = inc.numero;
        }
        const r = await App.guardarAlbaran(d, validas, fotos, {
          forzarNuevo: !!(dup && forzar),
          sinStock: !!opciones.sinStock,
          extra: (l) => (problemasDe(l, d).length ? { accion: d.accion, incidencia: numInc } : {}),
        });
        U.ultimoUsuario(d.quien);
        v.cerrar();
        if (r.resultado === 'duplicado') U.toast('Ese albarán ya estaba guardado entero: no se ha duplicado nada', 'aviso');
        else U.toast(`${r.resultado === 'segunda-hoja' ? 'Añadido al albarán que ya estaba' : 'Recepción guardada'}: ${r.nuevas} producto(s)${numInc ? ` · incidencia ${numInc}` : ''}`);
        if (opciones.alGuardar) return opciones.alGuardar(r);
        if (App.modoObrador()) location.hash = '#/';
        else App.recargar();
      } catch (err) {
        console.error(err);
        U.toast('Error al guardar: ' + err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  // Ver la foto guardada de un albarán (botón 📷 del historial de recepción)
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-foto]');
    if (!b) return;
    e.preventDefault();
    try {
      const url = await db.urlFoto(b.dataset.foto);
      if (url) window.open(url, '_blank', 'noopener');
      else U.toast('La foto solo se puede ver en la app publicada', 'aviso');
    } catch (err) {
      U.toast('No se ha podido abrir la foto: ' + err.message, 'error');
    }
  });
})();
