// Arranque: inicio de sesión, elección o alta de empresa, modo tablet del obrador
// y navegación entre pantallas (rutas con #/).
(function () {
  const esc = U.esc;
  const menu = document.getElementById('menu');
  const CFG = window.APPCC_CONFIG || {};

  // ---------- Modo tablet del obrador (se recuerda en cada aparato) ----------
  App.modoObrador = () => {
    try {
      return localStorage.getItem('go_modo_obrador') === '1';
    } catch {
      return false;
    }
  };
  App.ponerModoObrador = (si) => {
    try {
      localStorage.setItem('go_modo_obrador', si ? '1' : '0');
    } catch {}
  };
  // Pantallas a las que se puede llegar desde la tablet del obrador
  const RUTAS_OBRADOR = ['', 'obrador-temperaturas', 'obrador-agua', 'lotes', 'produccion', 'cola-albaranes', 'temperaturas', 'limpieza', 'recepcion', 'agua', 'transporte', 'aceite', 'acrilamida', 'control-alergenos', 'vitrinas', 'vitrinas/mes', 'incidencias'];

  async function navegar() {
    let [ruta, query] = location.hash.replace(/^#\/?/, '').split('?');
    if (App.modoObrador() && !RUTAS_OBRADOR.includes(ruta)) {
      location.hash = '#/';
      return;
    }
    const params = new URLSearchParams(query || '');
    menu.classList.remove('abierto');
    for (const a of menu.querySelectorAll('a')) a.classList.toggle('activo', a.getAttribute('href').replace(/^#\/?/, '').split('?')[0] === ruta);
    document.getElementById('btn-inicio').hidden = !(App.modoObrador() && ruta !== '');

    if (db.modoNube) {
      try {
        await db.sincronizar();
      } catch (e) {
        console.error(e);
        U.toast('Sin conexión: mostrando los últimos datos descargados', 'error');
      }
    }

    document.querySelectorAll('.modal-fondo').forEach((m) => m.remove());
    // Sustituir el contenedor para soltar los eventos de la pantalla anterior
    const viejo = App.vista();
    const nuevo = viejo.cloneNode(false);
    viejo.replaceWith(nuevo);

    const vista = ruta === '' && App.modoObrador() ? App.vistas['obrador'] : App.vistas[ruta];
    if (!vista) {
      nuevo.innerHTML = '<div class="tarjeta vacio">Pantalla no encontrada. <a href="#/">Volver al inicio</a></div>';
      return;
    }
    try {
      vista(params);
    } catch (e) {
      console.error(e);
      nuevo.innerHTML = `<div class="tarjeta vacio">Error al mostrar la pantalla: ${esc(e.message)}</div>`;
    }
    window.scrollTo(0, 0);
  }

  App.recargar = navegar;

  // ---------- Pantallas sin sesión ----------
  function pantallaSuelta(html) {
    document.body.classList.add('sin-sesion');
    App.vista().innerHTML = html;
  }

  function pantallaAcceso(modo = 'entrar') {
    const registro = modo === 'registro';
    pantallaSuelta(`
      <form class="tarjeta login" id="f-acceso">
        <h1>${esc(CFG.producto || 'Gestión Obradores')}</h1>
        <p class="sub">${registro ? 'Crea tu cuenta para dar de alta tu obrador' : 'El autocontrol APPCC de tu obrador'}</p>
        <label class="campo"><span>Correo</span><input type="email" name="email" autocomplete="username" required></label>
        <label class="campo"><span>Contraseña</span><input type="password" name="password" autocomplete="${registro ? 'new-password' : 'current-password'}" minlength="8" required></label>
        <div class="acciones"><button class="btn btn-primario btn-grande" type="submit">${registro ? 'Crear cuenta' : 'Entrar'}</button></div>
        ${CFG.registroAbierto ? `<p class="centro">${registro ? '¿Ya tienes cuenta? <a href="#" data-modo="entrar">Entrar</a>' : '¿Primera vez? <a href="#" data-modo="registro">Crea tu cuenta</a>'}</p>` : ''}
      </form>`);
    const f = document.getElementById('f-acceso');
    f.addEventListener('click', (e) => {
      const a = e.target.closest('[data-modo]');
      if (a) {
        e.preventDefault();
        pantallaAcceso(a.dataset.modo);
      }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = U.leerForm(f);
      try {
        if (registro) {
          const r = await db.registrarse(d.email, d.password);
          if (r.necesitaConfirmar) {
            pantallaSuelta(`<div class="tarjeta login"><h1>Revisa tu correo</h1><p>Te hemos enviado un enlace a <b>${esc(d.email)}</b>. Púlsalo para confirmar la cuenta y vuelve aquí para entrar.</p></div>`);
            return;
          }
        } else await db.iniciarSesion(d.email, d.password);
        location.reload();
      } catch (err) {
        U.toast(registro ? 'No se ha podido crear la cuenta: ' + err.message : 'Correo o contraseña incorrectos', 'error');
      }
    });
  }

  // Alta de la empresa (la primera vez que entra un cliente)
  function pantallaCrearEmpresa() {
    pantallaSuelta(`
      <form class="tarjeta alta-empresa" id="f-empresa">
        <h1>Da de alta tu obrador</h1>
        <p class="sub">Con estos datos salen las cabeceras de los registros y los informes para la inspección. Puedes cambiarlos luego en Ajustes.</p>
        <div class="rejilla-campos">
          <label class="campo"><span>Nombre de la empresa *</span><input name="nombre" required></label>
          <label class="campo"><span>Nº Registro Sanitario (RGSEAA)</span><input name="rgsaa"></label>
          <label class="campo"><span>CIF</span><input name="cif"></label>
          <label class="campo"><span>Teléfono</span><input name="telefono"></label>
          <label class="campo campo-ancho"><span>Dirección del obrador</span><input name="direccion"></label>
          <label class="campo"><span>Titular / responsable del autocontrol *</span><input name="titular" required></label>
          <label class="campo"><span>Tu nombre (para firmar los registros) *</span><input name="responsable" required></label>
        </div>
        <div class="acciones"><button class="btn btn-primario btn-grande" type="submit">Crear mi obrador</button></div>
      </form>`);
    const f = document.getElementById('f-empresa');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = U.leerForm(f);
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const id = await db.crearEmpresa(d.nombre);
        await db.usarEmpresa({ id, nombre: d.nombre, plantilla: 'obrador', rol: 'admin' });
        const { responsable, ...datos } = d;
        await db.guardar('config', { ...db.empresa(), ...datos });
        await db.guardar('personal', { nombre: responsable, puesto: 'Responsable del autocontrol', activo: true, orden: 1 });
        U.ultimoUsuario(responsable);
        location.hash = '#/';
        location.reload();
      } catch (err) {
        console.error(err);
        U.toast('No se ha podido crear la empresa: ' + err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  function pantallaElegirEmpresa(empresas) {
    pantallaSuelta(`
      <div class="tarjeta login">
        <h1>¿Qué obrador?</h1>
        <p class="sub">Tu cuenta tiene acceso a varias empresas.</p>
        ${empresas.map((e, i) => `<button class="btn btn-grande bloque" data-i="${i}">${esc(e.nombre)}</button>`).join('')}
      </div>`);
    App.vista().addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      await db.usarEmpresa(empresas[+b.dataset.i]);
      location.reload();
    });
  }

  App.cambiarEmpresa = async () => {
    try {
      localStorage.removeItem('go_empresa_activa');
    } catch {}
    location.hash = '#/';
    location.reload();
  };

  // ---------- Arranque ----------
  async function arrancar() {
    document.getElementById('btn-menu').addEventListener('click', () => menu.classList.toggle('abierto'));
    document.getElementById('modo').textContent = db.modoNube ? '' : 'MODO PRUEBA (local)';
    await db.iniciar();
    if (!(await db.haySesion())) return pantallaAcceso();

    const empresas = await db.misEmpresas();
    if (!empresas.length) return pantallaCrearEmpresa();
    const guardada = empresas.find((e) => e.id === db.empresaGuardada());
    const elegida = guardada || (empresas.length === 1 ? empresas[0] : null);
    if (!elegida) return pantallaElegirEmpresa(empresas);
    await db.usarEmpresa(elegida);

    document.getElementById('nombre-empresa').textContent = db.empresa()?.nombre || elegida.nombre;
    document.title = `${db.empresa()?.nombre || elegida.nombre} · ${CFG.producto || 'Gestión Obradores'}`;
    document.body.classList.toggle('modo-obrador', App.modoObrador());
    // Quien no es administrador solo usa la pantalla del obrador
    if (!db.esAdmin()) {
      App.ponerModoObrador(true);
      document.body.classList.add('modo-obrador');
    }
    if (empresas.length < 2) document.getElementById('enlace-cambiar-empresa')?.remove();

    window.addEventListener('hashchange', navegar);
    // Al volver a la app (tablet que estaba en reposo) refrescar datos
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && db.modoNube && !document.querySelector('.modal-fondo')) navegar();
    });
    navegar();
  }

  arrancar().catch((e) => {
    console.error(e);
    App.vista().innerHTML = `<div class="tarjeta vacio">No se pudo iniciar la app: ${esc(e.message)}</div>`;
  });
})();
