// Piezas compartidas por todas las pantallas.
(function () {
  const App = { vistas: {} };
  const esc = U.esc;

  App.vista = () => document.getElementById('vista');

  // ---------- Campos de formulario ----------

  App.selectPersona = (name = 'quien', valor, etiqueta = '¿Quién lo hace?') => {
    const v = valor ?? U.ultimoUsuario();
    // Empresa sin personal dado de alta todavía: se escribe el nombre a mano
    if (!db.activos('personal').length)
      return `<label class="campo"><span>${esc(etiqueta)}</span><input name="${name}" value="${esc(v)}" required autocomplete="off" placeholder="Tu nombre"></label>`;
    const ops = db.activos('personal').map((p) => `<option ${p.nombre === v ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
    return `<label class="campo"><span>${esc(etiqueta)}</span>
      <select name="${name}" required><option value="">— Elegir —</option>${ops}</select></label>`;
  };

  App.selectOpciones = (name, opciones, valor, { vacio = true, required = false } = {}) =>
    `<select name="${name}" ${required ? 'required' : ''}>${vacio ? '<option value="">— Elegir —</option>' : ''}${opciones
      .map((o) => {
        const [val, txt] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(val)}" ${String(val) === String(valor ?? '') ? 'selected' : ''}>${esc(txt)}</option>`;
      })
      .join('')}</select>`;

  App.okNo = (name, valor = 'ok', etiqueta) => `
    <div class="campo"><span>${esc(etiqueta)}</span>
      <div class="segmentado">
        <label><input type="radio" name="${name}" value="ok" ${valor === 'ok' ? 'checked' : ''}><b>Correcto</b></label>
        <label class="malo"><input type="radio" name="${name}" value="mal" ${valor === 'mal' ? 'checked' : ''}><b>Anómalo</b></label>
      </div></div>`;

  // ---------- Evaluación de temperaturas ----------
  // Devuelve 'ok' | 'aviso' | 'fuera' según el objetivo y el límite crítico
  // Los mínimos son opcionales: el manual fija rangos (refrigeración 0-5 ºC, congelación -18 ± 2 ºC)
  App.evaluarTemp = (valor, objetivoMax, criticoMax, objetivoMin, criticoMin) => {
    if (valor === null || valor === undefined) return '';
    const hay = (x) => x !== null && x !== undefined;
    if ((hay(criticoMax) && valor > criticoMax) || (hay(criticoMin) && valor < criticoMin)) return 'fuera';
    if ((hay(objetivoMax) && valor > objetivoMax) || (hay(objetivoMin) && valor < objetivoMin)) return 'aviso';
    return 'ok';
  };
  // Textos de límites de un equipo: «0 a 5 ºC» y «> 8 ºC o < -1 ºC»
  App.rangoNormal = (e) =>
    e.objetivoMin !== null && e.objetivoMin !== undefined ? `${U.fmtNum(e.objetivoMin)} a ${U.fmtNum(e.objetivoMax)} ºC` : `≤ ${U.fmtNum(e.objetivoMax)} ºC`;
  App.limiteCritico = (e) =>
    `> ${U.fmtNum(e.criticoMax)} ºC` + (e.criticoMin !== null && e.criticoMin !== undefined ? ` o < ${U.fmtNum(e.criticoMin)} ºC` : '');

  // ---------- Incidencias ----------
  App.siguienteNumeroIncidencia = () => {
    const anio = new Date().getFullYear();
    const n = db.lista('incidencias').filter((i) => String(i.numero).startsWith(anio + '-')).length + 1;
    return `${anio}-${String(n).padStart(3, '0')}`;
  };

  App.crearIncidencia = async ({ plan, descripcion, accion, quien, origen }) => {
    const inc = {
      numero: App.siguienteNumeroIncidencia(),
      fechaApertura: U.hoy(),
      plan,
      descripcion,
      accion: accion || '',
      quien,
      origen: origen || null,
      estado: 'abierta',
      fechaCierre: '',
      cerradaPor: '',
      verificacion: '',
    };
    await db.guardar('incidencias', inc);
    return inc;
  };

  App.PLANES = [
    'Temperaturas', 'Limpieza y desinfección', 'Agua', 'Proveedores / recepción', 'Transporte',
    'Mantenimiento', 'Plagas', 'Residuos', 'Trazabilidad', 'Alérgenos', 'Formación', 'Otras',
  ];

  // ---------- Modal ----------
  App.modal = (html, { onSubmit, ancho } = {}) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal ${ancho ? 'modal-ancho' : ''}">${html}</div>`;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    fondo.addEventListener('click', (e) => {
      if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar();
    });
    const form = fondo.querySelector('form');
    if (form && onSubmit) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('[type=submit]');
        if (btn) btn.disabled = true;
        try {
          const r = await onSubmit(U.leerForm(form), form);
          if (r !== false) cerrar();
        } catch (err) {
          console.error(err);
          U.toast(err.message || 'Error', 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }
    const primero = fondo.querySelector('input:not([type=hidden]),select,textarea');
    if (primero && window.innerWidth > 800) primero.focus();
    return { cerrar, el: fondo };
  };

  App.confirmar = (mensaje) =>
    new Promise((resolve) => {
      const m = App.modal(`<p class="confirmar">${esc(mensaje)}</p>
        <div class="acciones"><button class="btn" data-no>Cancelar</button><button class="btn btn-peligro" data-si>Sí, continuar</button></div>`);
      m.el.querySelector('[data-no]').onclick = () => (m.cerrar(), resolve(false));
      m.el.querySelector('[data-si]').onclick = () => (m.cerrar(), resolve(true));
    });

  // ---------- Teclado numérico grande (tablet) ----------
  // Devuelve una promesa con el número escrito, o null si se cancela.
  App.teclado = (titulo, subtitulo = '', { negativo = false, valor = '', boton = 'Guardar' } = {}) =>
    new Promise((resolve) => {
      let txt = String(valor ?? '').replace('.', ',');
      let neg = txt.startsWith('-');
      txt = txt.replace('-', '');
      let sustituir = !!txt; // el valor que ya había se reemplaza al pulsar la primera cifra
      const teclas = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0'];
      const m = App.modal(`<div class="teclado">
        <h2>${titulo}</h2>${subtitulo ? `<p class="tenue">${subtitulo}</p>` : ''}
        <div class="teclado-pantalla" id="tecl-pant"></div>
        <div class="teclado-teclas">${teclas.map((t) => `<button type="button" data-t="${t}">${t}</button>`).join('')}
          <button type="button" data-t="borrar" class="tecla-borrar" aria-label="Borrar">⌫</button>
          ${negativo ? '<button type="button" data-t="−" class="ancha">− bajo cero</button>' : ''}</div>
        <button type="button" class="btn btn-primario btn-grande bloque" data-ok>${esc(boton)}</button>
        <button type="button" class="btn btn-grande bloque" data-cancelar>Cancelar</button>
      </div>`);
      const pant = m.el.querySelector('#tecl-pant');
      const pintar = () => (pant.textContent = txt ? (neg ? '−' : '') + txt : ' ');
      pintar();
      let hecho = false;
      const fin = (v) => {
        if (hecho) return;
        hecho = true;
        m.cerrar();
        resolve(v);
      };
      m.el.addEventListener('click', (e) => {
        if (e.target === m.el) return fin(null);
        const t = e.target.closest('[data-t]')?.dataset.t;
        if (t && t !== '−' && sustituir) {
          txt = t === 'borrar' ? txt : '';
          sustituir = false;
        }
        if (t === 'borrar') txt = txt.slice(0, -1);
        else if (t === '−') neg = !neg;
        else if (t === ',') txt = txt.includes(',') ? txt : (txt || '0') + ',';
        else if (t && txt.length < 6) txt += t;
        if (t) pintar();
        if (e.target.closest('[data-cancelar]')) fin(null);
        if (e.target.closest('[data-ok]')) {
          const n = U.num((neg ? '-' : '') + txt);
          if (n !== null) fin(n);
        }
      });
    });

  // ---------- Cabecera de pantalla ----------
  App.cabecera = (titulo, subtitulo = '', acciones = '') => `
    <div class="cab">
      <div><h1>${esc(titulo)}</h1>${subtitulo ? `<p class="sub">${subtitulo}</p>` : ''}</div>
      <div class="cab-acciones">${acciones}</div>
    </div>`;

  App.chip = (estado, txt) => `<span class="chip chip-${estado}">${esc(txt)}</span>`;

  // ---------- Documentos escaneados (partes, certificados…): PDF o fotos ----------
  const archivoABase64 = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  const huella = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');

  App.Documentos = {
    // Archivos elegidos → listos para leer con IA y para guardar (PDF tal cual; fotos reducidas)
    async preparar(files) {
      const out = [];
      for (const f of files) {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          out.push({ blob: f, mime: 'application/pdf', ext: 'pdf', data: await archivoABase64(f), hash: await huella(f), nombre: f.name });
        } else {
          const p = await App.Albaranes.prepararFoto(f);
          out.push({ blob: p.blob, mime: 'image/jpeg', ext: 'jpg', data: p.base64, hash: p.hash, nombre: f.name });
        }
      }
      return out;
    },
    // Sube los archivos y devuelve sus rutas (el nombre lleva la huella: no se duplican)
    async subir(archivos, prefijo) {
      const rutas = [];
      for (const a of archivos) {
        const ruta = await db.subirFoto(a.blob, `${prefijo}-${a.hash.slice(0, 16)}.${a.ext}`, a.mime);
        if (ruta) rutas.push(ruta);
      }
      return rutas;
    },
    botones: (rutas) => (rutas || []).map((r, i) => `<button class="btn-icono" data-foto="${esc(r)}" title="Ver documento${rutas.length > 1 ? ' ' + (i + 1) : ''}">📄</button>`).join(''),
    // Lectura con IA con reintentos si está saturada; avisar(texto) informa de la espera
    async leer(tipo, archivos, avisar = () => {}) {
      if (archivos.length > 6) throw new Error('elige como mucho 6 hojas por documento');
      for (let intento = 1; ; intento++) {
        try {
          return await db.leerDocumento(tipo, archivos.map((a) => ({ mime: a.mime, data: a.data })));
        } catch (err) {
          if ((err.tipo === 'saturado' || err.tipo === 'limite') && intento < 4) {
            avisar(`La IA está saturada, reintento ${intento + 1} de 4 en 30 s…`);
            await new Promise((r) => setTimeout(r, 30000));
            continue;
          }
          throw err;
        }
      }
    },
  };

  window.App = App;
})();
