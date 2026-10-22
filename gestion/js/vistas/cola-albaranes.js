// Carga de muchos albaranes de golpe: las fotos se quedan en una cola guardada en
// el aparato (IndexedDB) y se leen una detrás de otra hasta la última.
// Si se cierra la página, al volver la cola sigue donde estaba.
(function () {
  const esc = U.esc;
  const N = U.norm;

  // ---------- Cola en IndexedDB (las fotos no caben en localStorage) ----------
  const BD = 'gestion_obradores_cola';
  function abrir() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(modo, fn) {
    const bd = await abrir();
    return new Promise((res, rej) => {
      const t = bd.transaction('fotos', modo);
      const resultado = fn(t.objectStore('fotos'));
      t.oncomplete = () => res(resultado?.result ?? resultado);
      t.onerror = () => rej(t.error);
    });
  }
  const Cola = {
    todos: async () => {
      const todos = await tx('readonly', (s) => s.getAll());
      const emp = db.empresaActual()?.id;
      return (todos || []).filter((x) => x.empresaId === emp).sort((a, b) => a.orden - b.orden);
    },
    poner: (item) => tx('readwrite', (s) => s.put(item)),
    quitar: (id) => tx('readwrite', (s) => s.delete(id)),
  };

  const blobABase64 = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const fotoYaUsada = (hash) => db.registros('recepcion').find((r) => (r.fotoHash || []).includes(hash));

  let corriendo = false;
  let parar = false;
  let wakeLock = null;

  // ---------- Pantalla ----------
  async function render() {
    // Si se ha cambiado de pantalla, la cola sigue trabajando pero no se pinta
    if (!location.hash.startsWith('#/cola-albaranes')) return;
    const items = await Cola.todos();
    // Lo que se quedó «leyendo» porque se cerró la página vuelve a la cola
    for (const it of items.filter((x) => x.estado === 'leyendo' && !corriendo)) {
      it.estado = 'pendiente';
      await Cola.poner(it);
    }
    const cuenta = (e) => items.filter((x) => x.estado === e).length;
    const pend = cuenta('pendiente');
    const hechos = items.length - pend - cuenta('leyendo');
    const tablet = App.modoObrador();
    App.vista().innerHTML = `
      ${App.cabecera('Carga de muchos albaranes', 'Sube todas las fotos de una vez (una foto por hoja). Se quedan en cola y se leen solas, una detrás de otra. No se duplica nada: los albaranes que ya estaban se saltan.', tablet ? '' : '<a class="btn" href="#/recepcion">Volver a recepción</a>')}
      <div class="tarjeta">
        <label class="btn btn-primario btn-grande bloque">📷 Añadir fotos de albaranes
          <input type="file" accept="image/*" multiple hidden id="in-cola"></label>
        <div class="fila-campos">
          ${App.selectPersona('quien', undefined, '¿Quién recepciona?')}
          <label class="check"><input type="checkbox" id="suma-stock"> La mercancía acaba de llegar (suma al stock de materias primas)</label>
        </div>
        <p class="tenue">Si son albaranes antiguos de la carpeta, deja la casilla sin marcar: esa mercancía ya se gastó y no debe contar en el stock.</p>
        <div class="progreso"><div class="progreso-barra" style="width:${items.length ? Math.round((hechos / items.length) * 100) : 0}%"></div></div>
        <p class="estado-ia" id="estado-cola">${items.length ? `${hechos} de ${items.length} terminados · ${pend} en cola · ${cuenta('revisar')} para revisar · ${cuenta('duplicado')} ya estaban` : 'La cola está vacía.'}</p>
        <div class="acciones izq">
          ${corriendo
            ? '<button class="btn btn-peligro btn-grande" id="btn-parar">⏸ Parar</button>'
            : `<button class="btn btn-primario btn-grande" id="btn-empezar" ${pend ? '' : 'disabled'}>⚡ Leer y guardar ${pend ? `los ${pend}` : ''}</button>`}
          ${items.some((x) => ['guardado', 'duplicado'].includes(x.estado)) ? '<button class="btn" id="btn-limpiar">Quitar los terminados</button>' : ''}
        </div>
      </div>
      <div class="tarjeta">
        ${items.length ? items.map(fila).join('') : '<p class="vacio">Añade las fotos de los albaranes para empezar.</p>'}
      </div>`;

    const v = App.vista();
    // Liberar la memoria de cada miniatura cuando ya se ha pintado
    v.querySelectorAll('.miniatura-cola').forEach((img) => img.addEventListener('load', () => window.URL.revokeObjectURL(img.src), { once: true }));
    v.querySelector('#in-cola').addEventListener('change', (e) => anadir(e.target.files));
    v.querySelector('#btn-empezar')?.addEventListener('click', empezar);
    v.querySelector('#btn-parar')?.addEventListener('click', () => {
      parar = true;
      U.toast('Se para al terminar el albarán que está leyendo');
    });
    v.querySelector('#btn-limpiar')?.addEventListener('click', async () => {
      for (const it of items.filter((x) => ['guardado', 'duplicado'].includes(x.estado))) await Cola.quitar(it.id);
      render();
    });
    v.onclick = async (e) => {
      const b = e.target.closest('[data-accion]');
      if (!b) return;
      const it = (await Cola.todos()).find((x) => x.id === b.dataset.id);
      if (!it) return;
      if (b.dataset.accion === 'quitar') await Cola.quitar(it.id);
      if (b.dataset.accion === 'reintentar') {
        Object.assign(it, { estado: 'pendiente', mensaje: '', intentos: 0 });
        await Cola.poner(it);
      }
      if (b.dataset.accion === 'revisar') return revisarItem(it);
      render();
    };
  }

  const ETIQUETAS = {
    pendiente: ['neutro', 'En cola'],
    leyendo: ['aviso', 'Leyendo…'],
    guardado: ['ok', 'Guardado'],
    duplicado: ['neutro', 'Ya estaba'],
    revisar: ['fuera', 'Para revisar'],
    error: ['fuera', 'No se pudo leer'],
  };
  function fila(it) {
    const [c, t] = ETIQUETAS[it.estado] || ['neutro', it.estado];
    const url = URL.createObjectURL(it.blob);
    return `<div class="cola-fila">
      <img src="${url}" alt="" class="miniatura-cola">
      <div class="cola-txt">${App.chip(c, t)} <span>${esc(it.mensaje || it.nombre || '')}</span></div>
      <div class="cola-acciones">
        ${it.estado === 'revisar' ? `<button class="btn btn-primario" data-accion="revisar" data-id="${it.id}">Revisar</button>` : ''}
        ${it.estado === 'error' ? `<button class="btn" data-accion="reintentar" data-id="${it.id}">Reintentar</button>` : ''}
        ${it.estado !== 'leyendo' ? `<button class="btn-icono" data-accion="quitar" data-id="${it.id}" title="Quitar de la cola">✕</button>` : ''}
      </div>
    </div>`;
  }

  async function anadir(files) {
    const items = await Cola.todos();
    let orden = items.reduce((m, x) => Math.max(m, x.orden), 0);
    let repetidas = 0;
    let malas = [];
    for (const file of files) {
      try {
        const f = await App.Albaranes.prepararFoto(file);
        if (items.some((x) => x.hash === f.hash)) {
          repetidas++;
          continue;
        }
        const usada = fotoYaUsada(f.hash);
        const it = {
          id: U.uid(), empresaId: db.empresaActual().id, orden: ++orden, blob: f.blob, hash: f.hash, nombre: file.name,
          estado: usada ? 'duplicado' : 'pendiente', mensaje: usada ? `Esta foto ya se usó: ${usada.proveedor} del ${U.fmtFecha(usada.fecha)}` : '', intentos: 0,
        };
        items.push(it);
        await Cola.poner(it);
      } catch (err) {
        malas.push(err.message);
      }
    }
    if (repetidas) U.toast(`${repetidas} foto(s) ya estaban en la cola`, 'aviso');
    if (malas.length) U.toast(`${malas.length} foto(s) no se han podido abrir: ${malas[0]}`, 'error');
    render();
  }

  // ---------- Proceso de la cola ----------
  async function empezar() {
    const quien = App.vista().querySelector('[name=quien]')?.value || '';
    if (!quien) return U.toast('Elige quién recepciona', 'error');
    U.ultimoUsuario(quien);
    const sinStock = !App.vista().querySelector('#suma-stock')?.checked;
    corriendo = true;
    parar = false;
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch {}
    try {
      wakeLock = await navigator.wakeLock?.request('screen'); // que la tablet no se apague a mitad
    } catch {}
    render();
    const resumen = { guardados: 0, hojas: 0, duplicados: 0, revisar: 0, errores: 0 };

    while (!parar) {
      const it = (await Cola.todos()).find((x) => x.estado === 'pendiente');
      if (!it) break;
      it.estado = 'leyendo';
      it.mensaje = 'Leyendo con IA…';
      await Cola.poner(it);
      render();
      try {
        if (db.modoNube) await db.sincronizar();
        const usada = fotoYaUsada(it.hash);
        if (usada) {
          Object.assign(it, { estado: 'duplicado', mensaje: `Esta foto ya se usó: ${usada.proveedor} del ${U.fmtFecha(usada.fecha)}` });
          resumen.duplicados++;
        } else {
          const datos = await db.leerAlbaran([await blobABase64(it.blob)]);
          it.datos = datos;
          const d = { proveedor: (datos.proveedor || '').trim(), numAlbaran: (datos.numAlbaran || '').trim(), fecha: App.Albaranes.fechaLeida(datos.fecha), hora: '', quien, estado: 'ok', vehiculo: 'ok' };
          const lineas = (datos.lineas || [])
            .filter((l) => l.producto || l.lote)
            .map((l) => ({ producto: l.producto, lote: l.lote, cantidad: (String(l.cantidad ?? '').match(/\d+(?:[.,]\d+)?/) || [''])[0], caducidad: App.Albaranes.fechaLeida(l.caducidad), conservacion: 'ambiente' }));
          const motivo = !d.fecha
            ? `no se lee bien la fecha${datos.fecha ? ` («${datos.fecha}»)` : ''}`
            : d.fecha > U.hoy()
              ? 'la fecha leída es posterior a hoy'
              : !d.proveedor
                ? 'no se lee el proveedor'
                : !lineas.length
                  ? 'no se lee ningún producto'
                  : lineas.some((l) => !l.producto || !l.lote)
                    ? 'falta el producto o el lote en alguna línea'
                    : '';
          const quienEs = `${d.proveedor || '¿proveedor?'}${d.numAlbaran ? ' nº ' + d.numAlbaran : ''}${d.fecha ? ' · ' + U.fmtFecha(d.fecha) : ''}`;
          if (motivo) {
            Object.assign(it, { estado: 'revisar', mensaje: `${quienEs}: ${motivo}` });
            resumen.revisar++;
          } else {
            const r = await App.guardarAlbaran(d, lineas, [{ blob: it.blob, hash: it.hash }], { sinStock, origen: 'carga-masiva' });
            if (r.resultado === 'duplicado') {
              Object.assign(it, { estado: 'duplicado', mensaje: `${quienEs}: ya estaba guardado, no se ha duplicado` });
              resumen.duplicados++;
            } else {
              Object.assign(it, { estado: 'guardado', mensaje: `${quienEs}: ${r.nuevas} producto(s)${r.resultado === 'segunda-hoja' ? ' añadidos al albarán que ya estaba (otra hoja)' : ''}` });
              r.resultado === 'segunda-hoja' ? resumen.hojas++ : resumen.guardados++;
            }
          }
        }
      } catch (err) {
        console.error(err);
        it.intentos = (it.intentos || 0) + 1;
        if ((err.tipo === 'saturado' || err.tipo === 'limite') && it.intentos < 4) {
          Object.assign(it, { estado: 'pendiente', mensaje: `La IA está saturada; se reintenta en 30 s (intento ${it.intentos + 1} de 4)`, orden: it.orden + 0.5 });
          await Cola.poner(it);
          render();
          for (let s = 0; s < 30 && !parar; s++) await esperar(1000);
          continue;
        }
        Object.assign(it, { estado: 'error', mensaje: err.message });
        resumen.errores++;
      }
      await Cola.poner(it);
      render();
      await esperar(1500); // pausa corta para no saturar la IA
    }

    corriendo = false;
    try {
      await wakeLock?.release();
    } catch {}
    avisarFin(resumen);
    render();
  }

  function avisarFin(r) {
    const txt = `Terminado: ${r.guardados} albaranes guardados${r.hojas ? `, ${r.hojas} segundas hojas` : ''}${r.duplicados ? `, ${r.duplicados} ya estaban` : ''}${r.revisar ? `, ${r.revisar} para revisar` : ''}${r.errores ? `, ${r.errores} sin leer` : ''}.`;
    U.toast(txt);
    try {
      const ac = new AudioContext();
      const o = ac.createOscillator();
      o.frequency.value = 880;
      o.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.4);
    } catch {}
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Albaranes cargados', { body: txt, requireInteraction: true });
    } catch {}
  }

  function revisarItem(it) {
    App.Albaranes.revisar(it.datos || { proveedor: '', numAlbaran: '', fecha: '', lineas: [] }, [{ blob: it.blob, hash: it.hash, vista: URL.createObjectURL(it.blob) }], {
      sinStock: !App.vista().querySelector('#suma-stock')?.checked,
      alGuardar: async (r) => {
        Object.assign(it, { estado: r.resultado === 'duplicado' ? 'duplicado' : 'guardado', mensaje: r.resultado === 'duplicado' ? 'Ya estaba guardado' : `Revisado y guardado: ${r.nuevas} producto(s)` });
        await Cola.poner(it);
        render();
      },
    });
  }

  App.vistas['cola-albaranes'] = render;
})();
