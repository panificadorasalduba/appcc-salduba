// Capa de datos. Mantiene en memoria todas las colecciones de la EMPRESA ACTIVA
// y las sincroniza con Supabase (modo nube) o con localStorage (modo local).
//
// En Supabase (ver supabase/esquema.sql):
//   empresas (id, nombre, plantilla)        · una fila por cliente
//   miembros (empresa_id, user_id, rol)     · quién entra en cada empresa
//   items    (empresa_id, id, coleccion, data jsonb, borrado, updated_at)
// Las reglas de seguridad de Supabase impiden ver datos de otra empresa.
(function () {
  const COLECCIONES = [
    'config', // empresa y límites
    'equipos', 'personal', 'vehiculos', 'tareas', 'proveedores', 'productos',
    'registros', // todos los registros diarios (campo "tipo")
    'incidencias',
    'materias', // materias primas (catálogo; el stock se calcula)
    'lotes', // aperturas y cierres de envases (lote de materia prima)
    'ajustes', // recuentos de inventario: corrigen el stock por lote
    'cuadernos', // cuadernos de producción diaria (productos por grupo)
    'tiendas', // despachos de venta a los que se reparte (montaje)
    'instalaciones', // equipos que no son de frío (Plan de Mantenimiento)
  ];
  const CLAVE_EMPRESA = 'go_empresa_activa';
  const CLAVE_LOCAL_EMPRESAS = 'go_empresas_local';
  const claveLocalDatos = (id) => 'go_datos_' + id;

  const cfg = window.APPCC_CONFIG || {};
  const modoNube = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  let sb = null;
  let ultimaSync = null;
  let empresa = null; // { id, nombre, plantilla, rol }

  const cache = {};
  const vaciarCache = () => COLECCIONES.forEach((c) => (cache[c] = new Map()));
  vaciarCache();

  const leerJSON = (clave, defecto) => {
    try {
      return JSON.parse(localStorage.getItem(clave) || 'null') ?? defecto;
    } catch {
      return defecto;
    }
  };
  const escribirJSON = (clave, valor) => {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {
      console.error(e);
      U.toast('No se pudo guardar en este navegador', 'error');
    }
  };

  function guardarLocal() {
    const out = {};
    for (const c of COLECCIONES) out[c] = [...cache[c].values()];
    escribirJSON(claveLocalDatos(empresa.id), out);
  }

  function sembrar() {
    const P = window.PLANTILLAS[empresa.plantilla] || window.PLANTILLAS.obrador;
    cache.config.set('empresa', { ...structuredClone(P.empresa), nombre: P.empresa.nombre || empresa.nombre });
    cache.config.set('limites', structuredClone(P.limites));
    for (const c of ['equipos', 'personal', 'vehiculos', 'tareas', 'proveedores', 'productos', 'materias', 'cuadernos']) {
      (P[c] || []).forEach((o) => cache[c].set(o.id, structuredClone(o)));
    }
  }

  const fila = (col, o) => ({ empresa_id: empresa.id, id: o.id, coleccion: col, data: o, borrado: false });

  // Listas que se han añadido a la app después de crear la empresa: si están
  // vacías se rellenan con la plantilla de la empresa (no toca lo que ya haya).
  const COLECCIONES_NUEVAS = ['cuadernos'];
  async function completarPlantilla() {
    const P = window.PLANTILLAS[empresa.plantilla] || window.PLANTILLAS.obrador;
    for (const c of COLECCIONES_NUEVAS) {
      if (cache[c].size || !(P[c] || []).length) continue;
      const nuevos = P[c].map((o) => structuredClone(o));
      nuevos.forEach((o) => cache[c].set(o.id, o));
      if (modoNube) {
        const { error } = await sb.from('items').upsert(nuevos.map((o) => fila(c, o)), { onConflict: 'empresa_id,id' });
        if (error) throw error;
      } else guardarLocal();
    }
  }

  const db = {
    modoNube,

    // ---------- Sesión ----------
    async iniciarSesion(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async registrarse(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      return { necesitaConfirmar: !data.session };
    },
    async cerrarSesion() {
      try {
        localStorage.removeItem(CLAVE_EMPRESA);
      } catch {}
      if (sb) await sb.auth.signOut();
    },
    async haySesion() {
      if (!modoNube) return true;
      const { data } = await sb.auth.getSession();
      return !!data.session;
    },
    async correoUsuario() {
      if (!modoNube) return '';
      const { data } = await sb.auth.getUser();
      return data.user?.email || '';
    },

    async iniciar() {
      if (modoNube) sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    },

    // ---------- Empresas ----------
    async misEmpresas() {
      if (!modoNube) return leerJSON(CLAVE_LOCAL_EMPRESAS, []).map((e) => ({ ...e, rol: 'admin' }));
      const { data, error } = await sb.from('miembros').select('rol, empresas(id, nombre, plantilla)');
      if (error) throw error;
      return data.filter((m) => m.empresas).map((m) => ({ ...m.empresas, rol: m.rol }));
    },
    async crearEmpresa(nombre) {
      if (!modoNube) {
        const lista = leerJSON(CLAVE_LOCAL_EMPRESAS, []);
        const e = { id: U.uid(), nombre, plantilla: 'obrador' };
        lista.push(e);
        escribirJSON(CLAVE_LOCAL_EMPRESAS, lista);
        return e.id;
      }
      const { data, error } = await sb.rpc('crear_empresa', { p_nombre: nombre });
      if (error) throw error;
      return data;
    },
    // Activa una empresa: vacía la memoria y carga (o siembra) sus datos
    async usarEmpresa(e) {
      empresa = e;
      ultimaSync = null;
      vaciarCache();
      try {
        localStorage.setItem(CLAVE_EMPRESA, e.id);
      } catch {}
      if (!modoNube) {
        const datos = leerJSON(claveLocalDatos(e.id), null);
        if (datos) for (const c of COLECCIONES) (datos[c] || []).forEach((o) => cache[c].set(o.id, o));
        else {
          sembrar();
          guardarLocal();
        }
        await completarPlantilla();
        return;
      }
      await db.sincronizar();
      await completarPlantilla();
    },
    empresaGuardada() {
      try {
        return localStorage.getItem(CLAVE_EMPRESA);
      } catch {
        return null;
      }
    },
    empresaActual: () => empresa,
    esAdmin: () => !!empresa && empresa.rol === 'admin',

    // Descarga los cambios desde la última sincronización (modo nube)
    async sincronizar() {
      if (!modoNube || !empresa) return;
      const desde = ultimaSync;
      const pagina = 1000;
      for (let i = 0; ; i += pagina) {
        let q = sb.from('items').select('id,coleccion,data,borrado,updated_at').eq('empresa_id', empresa.id).order('updated_at');
        if (desde) q = q.gt('updated_at', desde);
        const { data, error } = await q.range(i, i + pagina - 1);
        if (error) throw error;
        for (const f of data) {
          if (!cache[f.coleccion]) continue;
          if (f.borrado) cache[f.coleccion].delete(f.id);
          else cache[f.coleccion].set(f.id, f.data);
          if (!ultimaSync || f.updated_at > ultimaSync) ultimaSync = f.updated_at;
        }
        if (data.length < pagina) break;
      }
      // Empresa recién creada: cargar los datos de partida de su plantilla
      if (!cache.config.has('empresa')) {
        sembrar();
        const filas = [];
        for (const c of COLECCIONES) for (const o of cache[c].values()) filas.push(fila(c, o));
        const { error } = await sb.from('items').upsert(filas, { onConflict: 'empresa_id,id' });
        if (error) throw error;
      }
    },

    // ---------- Lectura y escritura ----------
    lista(col) {
      return [...cache[col].values()];
    },
    obtener(col, id) {
      return cache[col].get(id) || null;
    },

    async guardar(col, obj) {
      if (!obj.id) obj.id = U.uid();
      obj.modificado = new Date().toISOString();
      cache[col].set(obj.id, obj);
      if (modoNube) {
        const { error } = await sb.from('items').upsert(fila(col, obj), { onConflict: 'empresa_id,id' });
        if (error) {
          U.toast('Error al guardar en la nube: ' + error.message, 'error');
          throw error;
        }
      } else guardarLocal();
      return obj;
    },

    async borrar(col, id) {
      cache[col].delete(id);
      if (modoNube) {
        const { error } = await sb.from('items').update({ borrado: true }).eq('empresa_id', empresa.id).eq('id', id);
        if (error) throw error;
      } else guardarLocal();
    },

    // ---------- Albaranes: lectura con IA (en el servidor) y fotos ----------
    async leerAlbaran(imagenesBase64) {
      if (!modoNube) {
        // Modo prueba: sin servidor. Permite probar la pantalla con una respuesta simulada.
        const sim = window.__albaranSimulado;
        if (typeof sim === 'function') return structuredClone(await sim(imagenesBase64));
        if (sim) return structuredClone(sim);
        throw Object.assign(new Error('La lectura con IA solo funciona en la app publicada (en la nube).'), { tipo: 'otro' });
      }
      const { data, error } = await sb.functions.invoke('leer-albaran', { body: { imagenes: imagenesBase64, anio: new Date().getFullYear() } });
      if (error) {
        let detalle = null;
        try {
          detalle = await error.context?.json?.();
        } catch {}
        throw Object.assign(new Error(detalle?.error || error.message), { tipo: detalle?.tipo || 'otro' });
      }
      return data;
    },
    // Documentos en PDF o foto ([{mime, data}]) leídos con IA: tipo 'montaje' (informe de pedidos) o 'plagas' (parte DDD)
    async leerDocumento(tipo, archivos) {
      if (!modoNube) {
        const sim = window.__documentoSimulado?.[tipo];
        if (typeof sim === 'function') return structuredClone(await sim(archivos));
        if (sim) return structuredClone(sim);
        throw Object.assign(new Error('La lectura con IA solo funciona en la app publicada (en la nube).'), { tipo: 'otro' });
      }
      const { data, error } = await sb.functions.invoke('leer-albaran', { body: { tipo, archivos, anio: new Date().getFullYear() } });
      if (error) {
        let detalle = null;
        try {
          detalle = await error.context?.json?.();
        } catch {}
        throw Object.assign(new Error(detalle?.error || error.message), { tipo: detalle?.tipo || 'otro' });
      }
      return data;
    },
    leerMontaje: (archivos) => db.leerDocumento('montaje', archivos),
    async subirFoto(blob, nombre, contentType = 'image/jpeg') {
      if (!modoNube) return '';
      const ruta = `${empresa.id}/${nombre}`;
      const { error } = await sb.storage.from('albaranes').upload(ruta, blob, { contentType, upsert: false });
      // El nombre lleva la huella del archivo: si ya existe, es el mismo archivo
      if (error && !/exists|duplicate/i.test(error.message)) throw error;
      return ruta;
    },
    async urlFoto(ruta) {
      if (!modoNube || !ruta) return '';
      const { data, error } = await sb.storage.from('albaranes').createSignedUrl(ruta, 600);
      if (error) throw error;
      return data.signedUrl;
    },

    // Copia de seguridad completa de la empresa activa
    exportar() {
      const out = { app: 'Gestión Obradores', empresa: empresa?.nombre || '', fecha: new Date().toISOString() };
      for (const c of COLECCIONES) out[c] = [...cache[c].values()];
      return out;
    },
    async importar(datos) {
      const filas = [];
      for (const c of COLECCIONES) {
        if (!Array.isArray(datos[c])) continue;
        for (const o of datos[c]) {
          cache[c].set(o.id, o);
          filas.push(fila(c, o));
        }
      }
      if (modoNube) {
        for (let i = 0; i < filas.length; i += 500) {
          const { error } = await sb.from('items').upsert(filas.slice(i, i + 500), { onConflict: 'empresa_id,id' });
          if (error) throw error;
        }
      } else guardarLocal();
    },

    // Atajos
    empresa: () => cache.config.get('empresa'),
    limites: () => cache.config.get('limites'),
    activos: (col) => db.lista(col).filter((o) => o.activo !== false).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre || '').localeCompare(b.nombre || '')),
    registros: (tipo) => db.lista('registros').filter((r) => r.tipo === tipo),
  };

  window.db = db;
})();
