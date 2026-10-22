// Listas maestras editables (productos, proveedores, personal, equipos, vehículos, tareas de limpieza).
(function () {
  const esc = U.esc;

  function campo(c, v) {
    const req = c.req ? 'required' : '';
    switch (c.t) {
      case 'numero':
        return `<label class="campo"><span>${esc(c.l)}</span><input name="${c.n}" inputmode="decimal" value="${esc(U.fmtNum(v))}" ${req}></label>`;
      case 'select':
        return `<label class="campo"><span>${esc(c.l)}</span>${App.selectOpciones(c.n, typeof c.ops === 'function' ? c.ops() : c.ops, v, { required: c.req })}</label>`;
      case 'check':
        return `<label class="check"><input type="checkbox" name="${c.n}" ${v ? 'checked' : ''}> ${esc(c.l)}</label>`;
      case 'textarea':
        return `<label class="campo campo-ancho"><span>${esc(c.l)}</span><textarea name="${c.n}" rows="2">${esc(v || '')}</textarea></label>`;
      case 'alergenos':
        return `<div class="campo campo-ancho"><span>${esc(c.l)}</span><div class="alergenos-sel">${window.ALERGENOS.map(
          (a) => `<label><input type="checkbox" name="${c.n}" data-grupo="1" value="${esc(a)}" ${(v || []).includes(a) ? 'checked' : ''}> ${esc(a)}</label>`
        ).join('')}</div></div>`;
      default:
        return `<label class="campo"><span>${esc(c.l)}</span><input name="${c.n}" value="${esc(v || '')}" ${req} autocomplete="off"></label>`;
    }
  }

  // Pantalla genérica de lista + edición
  App.crud = ({ col, titulo, sub = '', campos, columnas, filtro, nuevoTxt = 'Añadir', defecto = {} }) => {
    const items = db.lista(col).filter(filtro || (() => true)).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre || a.elemento || '').localeCompare(b.nombre || b.elemento || ''));
    const html = `
      ${App.cabecera(titulo, sub, `<button class="btn btn-primario" data-nuevo>+ ${esc(nuevoTxt)}</button>`)}
      <div class="tarjeta"><div class="tabla-scroll"><table class="tabla tabla-clic">
        <thead><tr>${columnas.map(([t]) => `<th>${esc(t)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${items
          .map((o) => `<tr data-id="${o.id}" class="${o.activo === false ? 'inactivo' : ''}">${columnas.map(([, fn]) => `<td>${fn(o)}</td>`).join('')}<td class="nowrap"><button class="btn-icono" title="Editar">✎</button></td></tr>`)
          .join('')}</tbody></table></div></div>`;

    const editar = (obj) => {
      const o = obj || { ...defecto, activo: true };
      App.modal(
        `<form><h2>${obj ? 'Editar' : esc(nuevoTxt)}</h2>
          <div class="rejilla-campos">${campos.map((c) => campo(c, o[c.n])).join('')}
          <label class="check"><input type="checkbox" name="activo" ${o.activo !== false ? 'checked' : ''}> Activo</label></div>
          <div class="acciones">${obj ? '<button type="button" class="btn btn-peligro" data-eliminar>Eliminar</button>' : ''}<span class="hueco"></span>
          <button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn btn-primario" type="submit">Guardar</button></div>
        </form>`,
        {
          ancho: true,
          onSubmit: async (d) => {
            for (const c of campos) {
              if (c.t === 'numero') {
                if (d[c.n] !== '' && U.num(d[c.n]) === null) {
                  U.toast(`Número no válido en "${c.l}"`, 'error');
                  return false;
                }
                d[c.n] = U.num(d[c.n]);
              }
              if (c.t === 'alergenos' && !d[c.n]) d[c.n] = [];
            }
            Object.assign(o, d);
            if (o.orden === undefined) o.orden = db.lista(col).length + 1;
            await db.guardar(col, o);
            U.toast('Guardado');
            App.recargar();
          },
        }
      ).el.querySelector('[data-eliminar]')?.addEventListener('click', async () => {
        if (!(await App.confirmar('¿Eliminar definitivamente? Si solo deja de usarse, es mejor desmarcar "Activo" para conservar el histórico.'))) return;
        await db.borrar(col, o.id);
        document.querySelector('.modal-fondo')?.remove();
        App.recargar();
      });
    };

    App.vista().innerHTML = html;
    const v = App.vista();
    v.querySelector('[data-nuevo]').addEventListener('click', () => editar(null));
    v.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) editar(db.obtener(col, tr.dataset.id));
    });
  };

  const chipsAlergenos = (p) =>
    p.alergenos?.length ? p.alergenos.map((a) => `<span class="etq">${esc(a)}</span>`).join(' ') : '<span class="tenue">Sin indicar</span>';

  App.vistas['productos'] = () =>
    App.crud({
      col: 'productos',
      titulo: 'Productos y alérgenos',
      sub: 'Ficha de cada producto con su categoría de riesgo de Listeria (Plan Listeria Fase II) y sus alérgenos. Pulsa un producto para editarlo.',
      nuevoTxt: 'Nuevo producto',
      campos: [
        { n: 'nombre', l: 'Nombre', req: true },
        { n: 'familia', l: 'Familia', t: 'select', ops: ['Pan', 'Bollería', 'Repostería', 'Brioche', 'Hojaldre', 'Galletas', 'Bizcochos', 'Tartas', 'Temporada', 'Otros'], req: true },
        { n: 'grupo', l: 'Grupo (letra)' },
        { n: 'listeria', l: 'Categoría Listeria', t: 'select', ops: () => window.CATEGORIAS_LISTERIA },
        { n: 'alergenos', l: 'Alérgenos', t: 'alergenos' },
        { n: 'trazas', l: 'Puede contener trazas de' },
        { n: 'vidaUtil', l: 'Vida útil / conservación' },
      ],
      columnas: [
        ['Familia', (p) => esc(p.familia)],
        ['Producto', (p) => `<b>${esc(p.nombre)}</b>`],
        ['Listeria', (p) => `<small>${esc(p.listeria || '')}</small>`],
        ['Alérgenos', chipsAlergenos],
      ],
    });

  App.vistas['proveedores'] = () =>
    App.crud({
      col: 'proveedores',
      titulo: 'Proveedores',
      sub: 'Listado de proveedores homologados (con nº de Registro Sanitario) y empresas de servicios.',
      nuevoTxt: 'Nuevo proveedor',
      campos: [
        { n: 'nombre', l: 'Nombre / razón social', req: true },
        { n: 'tipo', l: 'Tipo', t: 'select', ops: ['Materias primas', 'Productos de limpieza', 'Envases y embalajes', 'Servicio'], req: true },
        { n: 'actividad', l: 'Qué suministra / actividad' },
        { n: 'registro', l: 'Nº Registro Sanitario (RGSEAA) u otro' },
        { n: 'cif', l: 'CIF' },
        { n: 'telefono', l: 'Teléfono' },
        { n: 'email', l: 'Email' },
        { n: 'direccion', l: 'Dirección' },
        { n: 'fichasTecnicas', l: 'Fichas técnicas recibidas y archivadas', t: 'check' },
        { n: 'obs', l: 'Observaciones', t: 'textarea' },
      ],
      columnas: [
        ['Proveedor', (p) => `<b>${esc(p.nombre)}</b>`],
        ['Tipo', (p) => esc(p.tipo || '')],
        ['Suministra', (p) => esc(p.actividad || '')],
        ['Reg. sanitario', (p) => esc(p.registro || '')],
        ['Teléfono', (p) => esc(p.telefono || '')],
      ],
    });
})();
