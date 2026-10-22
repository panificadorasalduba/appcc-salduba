// Utilidades comunes: fechas, formato, HTML y frecuencias.
(function () {
  const U = {};

  U.pad = (n) => String(n).padStart(2, '0');

  // Fecha local en formato AAAA-MM-DD
  U.hoy = () => U.fechaISO(new Date());
  U.fechaISO = (d) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  U.horaAhora = () => {
    const d = new Date();
    return `${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  };
  U.parse = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  U.sumarDias = (iso, n) => {
    const d = U.parse(iso);
    d.setDate(d.getDate() + n);
    return U.fechaISO(d);
  };
  U.diasEntre = (a, b) => Math.round((U.parse(b) - U.parse(a)) / 86400000);
  U.fmtFecha = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  U.MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  U.DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  U.fmtFechaLarga = (iso) => {
    const d = U.parse(iso);
    return `${U.DIAS[d.getDay()]} ${d.getDate()} de ${U.MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
  };
  U.diasDelMes = (anio, mes) => new Date(anio, mes, 0).getDate(); // mes 1-12

  // Semana ISO (para el marcado de albaranes "S10")
  U.semanaISO = (iso) => {
    const d = U.parse(iso);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dia = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dia);
    const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - inicio) / 86400000 + 1) / 7);
  };
  U.lunesDeSemana = (iso) => {
    const d = U.parse(iso);
    const dia = d.getDay() || 7;
    d.setDate(d.getDate() - dia + 1);
    return U.fechaISO(d);
  };
  U.trimestre = (iso) => Math.floor((U.parse(iso).getMonth()) / 3) + 1;

  // Escapar texto para insertarlo en HTML
  U.esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  U.num = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  U.fmtNum = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

  // Texto comparable: sin tildes, minúsculas y sin espacios sobrantes
  U.norm = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  U.uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

  // Frecuencias del plan de limpieza → días entre limpiezas (null = "tras cada uso", sin vencimiento)
  U.FRECUENCIAS = {
    diaria: { txt: 'Diaria', dias: 1 },
    dos_semana: { txt: '2 veces/semana', dias: 3 },
    semanal: { txt: 'Semanal', dias: 7 },
    quincenal: { txt: 'Quincenal', dias: 14 },
    tres_cuatro_semanas: { txt: 'Cada 3-4 semanas', dias: 28 },
    mensual: { txt: 'Mensual', dias: 30 },
    bimestral: { txt: 'Cada 2 meses', dias: 60 },
    trimestral: { txt: 'Trimestral', dias: 91 },
    anual: { txt: 'Anual', dias: 365 },
    bienal: { txt: 'Cada 2 años', dias: 730 },
    uso: { txt: 'Tras cada uso', dias: null },
  };

  // Formulario → objeto plano
  U.leerForm = (form) => {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        if (el.dataset.grupo) {
          o[el.name] = o[el.name] || [];
          if (el.checked) o[el.name].push(el.value);
        } else o[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) o[el.name] = el.value;
      } else o[el.name] = el.value.trim();
    }
    return o;
  };

  U.toast = (msg, tipo = 'ok') => {
    const t = document.createElement('div');
    t.className = `toast toast-${tipo}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('visible'), 10);
    setTimeout(() => {
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 300);
    }, 2600);
  };

  // Recordar el último nombre elegido en este dispositivo
  U.ultimoUsuario = (v) => {
    try {
      if (v !== undefined) localStorage.setItem('appcc_ultimo_usuario', v);
      return localStorage.getItem('appcc_ultimo_usuario') || '';
    } catch {
      return '';
    }
  };

  window.U = U;
})();
