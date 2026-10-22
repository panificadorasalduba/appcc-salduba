// Plantillas con los datos de partida de una empresa nueva. Todo es editable
// después desde "Ajustes".
//  - "salduba": tomada del Sistema de Autocontrol APPCC Ed. 04 de Panificadora Salduba.
//  - "obrador": genérica para cualquier panadería u obrador cliente.
(function () {
  const empresa = {
    id: 'empresa',
    nombre: 'Panificadora Salduba',
    rgsaa: '20.27987/MA',
    cif: 'B-93033744',
    direccion: 'Plaza Juan de Austria, 1 · 29603 Marbella (Málaga)',
    telefono: '952 76 52 07',
    titular: 'Mª José Benítez Bermúdez',
    edicionAppcc: 'Ed. 04 · Mayo 2026',
    consultora: 'Laboratorio Vázquez',
  };

  // Límites generales (PCC y requisitos previos)
  const limites = {
    id: 'limites',
    recepcionRefrigMax: 8, // PCC1: refrigerados ≤ 8 ºC
    recepcionCongMax: -16, // PCC1: congelados ≤ -16 ºC
    transporteObjetivoMax: 4, // vehículo conectado antes de cargar ≤ 4 ºC
    transporteCriticoMax: 8, // PCC4: < 8 ºC
    cloroMin: 0.2, // Plan de agua: 0,2 – 1,0 mg/l
    cloroMax: 1.0,
    aceitePolaresMax: 24, // compuestos polares > 24 % → cambiar aceite
    conservacionRegistrosAnios: 2,
  };

  // Equipos del "Registro de control de temperaturas de equipos" (p. 152) + sala de pastelería.
  // objetivoMax: valor deseado · criticoMax: límite crítico (por encima = incidencia)
  const R = { tipo: 'refrigeracion', objetivoMax: 5, criticoMax: 8 };
  const C = { tipo: 'congelacion', objetivoMax: -18, criticoMax: -16 };
  const equipos = [
    { nombre: 'Congelador pastelería', ...C },
    { nombre: 'Congelador masas (Luis)', ...C },
    { nombre: 'Arcón congelador 1', ...C },
    { nombre: 'Arcón congelador 2', ...C },
    { nombre: 'Arcón congelador 3', ...C },
    { nombre: 'Arcón congelador 4', ...C },
    { nombre: 'Arcón congelador 5', ...C },
    { nombre: 'Arcón congelador 6', ...C },
    { nombre: 'Cámara refrigeración pan (interior)', ...R },
    { nombre: 'Cámara refrigeración exterior', ...R },
    { nombre: 'Congelador tartas', ...C },
    { nombre: 'Sala de pastelería', tipo: 'sala', objetivoMax: 15, criticoMax: 17 },
  ].map((e, i) => ({ id: 'eq' + (i + 1), orden: i + 1, activo: true, ...e }));

  const personal = [
    ['Mª José Benítez', 'Propietaria · Responsable del autocontrol'],
    ['Berta', 'Panadería y pastelería'],
    ['Luis', 'Panadería'],
    ['José', 'Panadería'],
    ['Patricio', 'Panadería'],
    ['Ana R.', 'Pastelería'],
    ['Ana P.', 'Pastelería'],
    ['Bernabé', 'Pastelería'],
    ['María Jesús', 'Pastelería'],
    ['Feliciana', 'Limpieza'],
    ['Ezequiel', 'Reparto'],
  ].map(([nombre, puesto], i) => ({ id: 'p' + (i + 1), nombre, puesto, activo: true }));

  const vehiculos = [
    { id: 'v1', nombre: 'Furgoneta refrigerada', refrigerado: true, matricula: '', activo: true },
    { id: 'v2', nombre: 'Furgoneta isoterma (pan)', refrigerado: false, matricula: '', activo: true },
  ];

  // Cuadro del Plan de Limpieza (pp. 48-50). alc = zona de alimentos listos para consumo (Listeria)
  const L = 'Lavavajillas manual (L+D)';
  const PL = 'Personal de limpieza';
  const PP = 'Personal de pastelería';
  const tareas = [
    ['Zona acceso / carga-descarga', 'Suelo', 'dos_semana', L, PL],
    ['Zona acceso / carga-descarga', 'Exterior de cámaras', 'dos_semana', L, PL],
    ['Zona acceso / carga-descarga', 'Puerta acceso', 'quincenal', L, PL],
    ['Zona acceso / carga-descarga', 'Paredes bajas (con rotación de palés de harina)', 'tres_cuatro_semanas', 'Agua a presión + lavavajillas manual', PL],
    ['Zona acceso / carga-descarga', 'Cámaras de congelación (pastelería y Luis)', 'bimestral', L, PL, true],
    ['Zona acceso / carga-descarga', 'Techo', 'bienal', 'Pintar', 'Empresa de pintura'],
    ['Pasillo arcones', 'Suelo', 'dos_semana', L, PL],
    ['Pasillo arcones', 'Paredes', 'quincenal', L, PL],
    ['Pasillo arcones', 'Arcones congeladores', 'bimestral', L, PL],
    ['Sala de pan', 'Mesa de trabajo', 'diaria', L, PL],
    ['Sala de pan', 'Cubos de basura (retirada)', 'diaria', L, PL],
    ['Sala de pan', 'Noria de pan', 'diaria', 'Rascado', 'Panaderos'],
    ['Sala de pan', 'Tolva porcionadora', 'diaria', L, PL],
    ['Sala de pan', 'Refinadora', 'diaria', 'Rascado', 'Panaderos'],
    ['Sala de pan', 'Amasadoras', 'diaria', L, PL],
    ['Sala de pan', 'Laminadora', 'semanal', 'Cepillado / lavavajillas manual (L+D) y lejía', PP],
    ['Sala de pan', 'Paredes bajas', 'semanal', L, PL],
    ['Sala de pan', 'Estante inferior mesa', 'semanal', L, PL],
    ['Sala de pan', 'Fermentadora', 'semanal', L, PL],
    ['Sala de pan', 'Paredes altas', 'anual', L, 'Empresa de limpieza externa'],
    ['Sala de pan', 'Depósito acumulador agua refrigeración', 'anual', 'Detergente + hipoclorito sódico', PL],
    ['Sala de pan', 'Techos', 'bienal', 'Pintar', 'Empresa de pintura'],
    ['Cámara refrigeración pan (interior)', 'Suelo', 'semanal', L, PL],
    ['Cámara refrigeración pan (interior)', 'Paredes', 'quincenal', L, PP],
    ['Cámara refrigeración pan (interior)', 'Techo', 'mensual', L, PP],
    ['Cámara refrigeración exterior', 'Suelo', 'diaria', L, PL],
    ['Cámara refrigeración exterior', 'Paredes', 'quincenal', L, PP],
    ['Cámara refrigeración exterior', 'Techo', 'mensual', L, PP],
    ['Sala de hornos', 'Mesas de trabajo', 'diaria', L, PP],
    ['Sala de hornos', 'Cubos de basura (retirada)', 'diaria', L, PL],
    ['Sala de hornos', 'Freidora (en cada cambio de aceite)', 'uso', L, PP],
    ['Sala de hornos', 'Paredes bajas', 'quincenal', L, PL],
    ['Sala de hornos', 'Paredes altas', 'anual', L, 'Empresa de limpieza externa'],
    ['Sala de hornos', 'Techos', 'bienal', 'Pintar', 'Empresa de pintura'],
    ['Sala de pastelería', 'Menaje y utillaje (bandejas, recipientes…)', 'diaria', L, PP],
    ['Sala de pastelería', 'Mesas de trabajo', 'diaria', L, PP, true],
    ['Sala de pastelería', 'Cubos de basura (retirada)', 'diaria', L, PL],
    ['Sala de pastelería', 'Amasadoras', 'uso', L, PP, true],
    ['Sala de pastelería', 'Escudilladora', 'uso', L, PP],
    ['Sala de pastelería', 'Paredes bajas', 'dos_semana', L, PP],
    ['Sala de pastelería', 'Mueble verde isotermo', 'semanal', L, PP, true],
    ['Sala de pastelería', 'Estantes inferiores', 'quincenal', L, PP],
    ['Sala de pastelería', 'Estanterías superiores', 'mensual', L, PP],
    ['Sala de pastelería', 'Congelador tartas', 'mensual', L, PP, true],
    ['Sala de pastelería', 'Paredes altas', 'trimestral', L, PP],
    ['Sala de pastelería', 'Techos', 'bienal', 'Pintar', 'Empresa de pintura'],
    ['Zona office', 'Estanterías', 'semanal', L, 'Personal de pastelería / limpieza', true],
    ['Zona office', 'Paredes', 'quincenal', L, PL],
    ['Zona office', 'Lavavajillas (exterior)', 'quincenal', L, PL],
    ['Zona almacén', 'Suelo', 'semanal', L, PP],
    ['Zona almacén', 'Estantería', 'quincenal', L, PP],
    ['Zona almacén', 'Paredes', 'mensual', L, PL],
  ].map(([zona, elemento, frecuencia, producto, responsable, alc], i) => ({
    id: 'lt' + (i + 1),
    orden: i + 1,
    zona,
    elemento,
    frecuencia,
    producto,
    responsable,
    alc: !!alc,
    activo: true,
  }));

  // Proveedores y servicios externos citados en el APPCC (el listado completo lo tiene administración)
  const proveedores = [
    { nombre: 'HIDRALIA', tipo: 'Servicio', actividad: 'Suministro de agua de red (Marbella)', registro: '' },
    { nombre: 'PLAGUIRONDA SL', tipo: 'Servicio', actividad: 'Control de plagas DDD', registro: 'ROESBA 0043-AND-750' },
    { nombre: 'REGRASOL SL', tipo: 'Servicio', actividad: 'Retirada de aceite usado', registro: 'GRU-3293' },
    { nombre: 'Laboratorio Vázquez', tipo: 'Servicio', actividad: 'Consultora APPCC · auditorías y análisis', registro: '' },
  ].map((p, i) => ({ id: 'pr' + (i + 1), telefono: '', email: '', productos: '', activo: true, ...p }));

  // Productos según la tipificación de riesgo de Listeria (Plan Listeria Fase II)
  const ALC7 = 'ALC Nota 7 (no detectado/25 g)';
  const VU5 = 'Vida útil < 5 días';
  const N4 = 'No necesario controlar (Nota 4)';
  const prods = [
    ['Bollería', 'B', 'Bizcocho clásico', ALC7],
    ['Bollería', 'B', 'Bomba de chocolate', VU5],
    ['Bollería', 'B', 'Bomba de crema', VU5],
    ['Bollería', 'B', 'Buena mujer (hojaldre con manzana)', ALC7],
    ['Bollería', 'C', 'Caña de chocolate', ALC7],
    ['Bollería', 'C', 'Caña de crema pastelera', ALC7],
    ['Bollería', 'C', 'Croissant', VU5],
    ['Bollería', 'D', 'Donut clásico', VU5],
    ['Bollería', 'D', 'Donut chocolate', VU5],
    ['Bollería', 'L', 'Lazo de crema pastelera', ALC7],
    ['Bollería', 'M', 'Magdalenas', VU5],
    ['Bollería', 'M', 'Magdalenas con chocolate', VU5],
    ['Bollería', 'N', 'Napolitana de chocolate', VU5],
    ['Bollería', 'P', 'Palmera', VU5],
    ['Bollería', 'P', 'Palmera de Ferrero', VU5],
    ['Bollería', 'P', 'Palmera de chocolate', VU5],
    ['Bollería', 'P', 'Palmera Nutella', VU5],
    ['Bollería', 'P', 'Palmera Kinder', VU5],
    ['Bollería', 'P', 'Palmera chocolate blanco', VU5],
    ['Bollería', 'P', 'Palmera yema y fondant', VU5],
    ['Bollería', 'T', 'Triángulo de crema', VU5],
    ['Bollería', 'T', 'Triángulo de Nutella', VU5],
    ['Bollería', 'T', 'Triángulo de nata y Nutella', VU5],
    ['Bollería', 'X', 'Xuxo de crema pastelera', VU5],
    ['Repostería', 'B', 'Bizcocho plancha', VU5],
    ['Repostería', 'B', 'Bizcocho plancha chocolate', VU5],
    ['Repostería', 'B', 'Brownie', ALC7],
    ['Repostería', 'C', 'Cono de nata', VU5],
    ['Repostería', 'C', 'Croissant de almendra', ALC7],
    ['Repostería', 'E', 'Eclair chocolate', ALC7],
    ['Repostería', 'E', 'Eclair crema', ALC7],
    ['Repostería', 'G', 'Galletas (espelta y espelta+choco)', N4],
    ['Repostería', 'M', 'Milhojas de crema de chocolate y trufa', ALC7],
    ['Repostería', 'M', 'Milhojas de crema diplo y yema', ALC7],
    ['Repostería', 'M', 'Milhojas de crema', ALC7],
    ['Repostería', 'M', 'Milhojas de merengue', ALC7],
    ['Repostería', 'M', 'Milhojas de nata-crema', ALC7],
    ['Repostería', 'M', 'Milhojas de nata', ALC7],
    ['Repostería', 'P', 'Pastel de galleta', ALC7],
    ['Repostería', 'P', 'Pastel de zanahoria, queso y nueces', ALC7],
    ['Repostería', 'P', 'Pío de coco', ALC7],
    ['Repostería', 'S', 'Sanmarco chocolate', ALC7],
    ['Repostería', 'S', 'Sanmarco fresa', ALC7],
    ['Repostería', 'S', 'Sanmarco dulce de leche', ALC7],
    ['Repostería', 'S', 'Sanmarco de galleta', ALC7],
    ['Repostería', 'S', 'Sanmarco de Kinder', ALC7],
    ['Repostería', 'S', 'Sanmarco de Kit-Kat', ALC7],
    ['Repostería', 'S', 'Sanmarco de nata', ALC7],
    ['Repostería', 'S', 'Sanmarco de nata/trufa y yema tostada', ALC7],
    ['Repostería', 'T', 'Tarta de almendras', ALC7],
    ['Repostería', 'T', 'Tarta de queso y mermelada de frambuesa', ALC7],
    ['Repostería', 'T', 'Tarta de manzana', VU5],
    ['Repostería', 'T', 'Tartaleta de frutas', ALC7],
    ['Repostería', 'Sin azúcar', 'Sanmarco de nata/trufa sin azúcar', ALC7],
    ['Repostería', 'Tartas', 'Tartas vitrina', ALC7],
    ['Repostería', 'Tartas', 'Tartas encargo', VU5],
  ];
  const productos = prods.map(([familia, grupo, nombre, listeria], i) => ({
    id: 'pd' + (i + 1),
    familia,
    grupo,
    nombre,
    listeria,
    alergenos: [],
    activo: true,
  }));

  // Cuadernos de producción diaria (los mismos productos y orden que en papel)
  const g = (grupo, productos) => ({ grupo, productos });
  // El montaje (lo que sale a cada tienda) va aparte, en su propio apartado.
  const cuadernos = [
    { id: 'elaboraciones', orden: 2, titulo: 'Bollería y hojaldre', traza: 'Traza 2.2', ayuda: 'Unidades elaboradas.', grupos: [
      g('Bollería', ['Bomba chocolate', 'Bomba nata', 'Bomba dulce de leche', 'Bomba kínder', 'Bilbao', 'Cuñas horneadas', 'Cuñas (triángulo + crema)', 'Suso frito', 'Suso relleno', 'Triángulo nata-nutella horno', 'Triángulo nata-nutella relleno']),
      g('Hojaldre', ['Buena mujer manzanas gajo', 'Cuadrado horno', 'Triángulo horno', 'Cuadrado chocolate', 'Triángulo chocolate', 'Triángulo crema', 'Cortadillo de cabello de ángel', 'Hojaldre plancha horneado', 'Milhojas chocolate', 'Milhojas crema diplo y yema', 'Milhojas crema', 'Milhojas merengue', 'Milhojas nata-crema', 'Milhojas nata']),
      g('Palmeras', ['Palmera clásica', 'Palmera chocolate', 'Palmera ferrero', 'Palmera kínder', 'Palmera nutella', 'Palmera yema', 'Palmera frutas (solo findes)', 'Mini palmeritas', 'Mini palmeritas integrales']),
      g('Pan', ['Pan molde (anotar unds y lote)']),
    ] },
    { id: 'masas', orden: 3, titulo: 'Masas', traza: 'Traza 2.1', ayuda: 'Plastones y masas elaboradas.', grupos: [
      g('Productos en masa', ['Empanada', 'Masa sablé', 'Tartaletas', 'Tartas']),
      g('Masa de bollería · plastones (5 kg)', ['Plastones de bollería (5 kg)', 'Bomba masa', 'Lazo en masa', 'Caracola en masa', 'Cuña en masa (torta)', 'Suso masa', 'Triángulo nata-nutella masa']),
      g('De hojaldre · plastones (4 kg)', ['Plastones de hojaldre (4 kg)', 'Buena mujer masa', 'Caña de chocolate (masa)', 'Cortadillo cabello ángel', 'Cuadrado hojaldre masa', 'Triángulo hojaldre masa', 'Hojaldre plancha (milhoja) masa', 'Hojaldre manzana masa', 'Palmera normal masa', 'Palmera mediana masa', 'Palmera gigante masa']),
    ] },
  ].map((c) => ({ activo: true, ...c }));

  const salduba = { empresa, limites, equipos, personal, vehiculos, tareas, proveedores, productos, cuadernos };

  // ---------- Plantilla genérica de obrador ----------
  const conId = (prefijo, lista) => lista.map((o, i) => ({ id: prefijo + (i + 1), orden: i + 1, activo: true, ...o }));
  const obrador = {
    empresa: { id: 'empresa', nombre: '', rgsaa: '', cif: '', direccion: '', telefono: '', titular: '', edicionAppcc: '', consultora: '' },
    limites: { ...limites },
    equipos: conId('eq', [
      { nombre: 'Cámara de refrigeración', ...R },
      { nombre: 'Cámara de congelación', ...C },
      { nombre: 'Arcón congelador', ...C },
    ]),
    personal: [],
    vehiculos: [],
    tareas: conId('lt', [
      ['Obrador', 'Mesas de trabajo', 'diaria', L, 'Personal de obrador', true],
      ['Obrador', 'Amasadoras y batidoras', 'diaria', L, 'Personal de obrador'],
      ['Obrador', 'Menaje y utensilios', 'diaria', L, 'Personal de obrador', true],
      ['Obrador', 'Suelos', 'diaria', L, PL],
      ['Obrador', 'Cubos de basura (retirada)', 'diaria', L, PL],
      ['Obrador', 'Hornos (exterior y puertas)', 'semanal', L, 'Personal de obrador'],
      ['Obrador', 'Freidora (en cada cambio de aceite)', 'uso', L, 'Personal de obrador'],
      ['Obrador', 'Paredes bajas', 'semanal', L, PL],
      ['Obrador', 'Campana extractora', 'mensual', 'Desengrasante', PL],
      ['Obrador', 'Paredes altas y techos', 'trimestral', L, PL],
      ['Cámaras', 'Exterior y tiradores', 'semanal', L, PL],
      ['Cámaras', 'Interior cámara de refrigeración', 'mensual', L, 'Personal de obrador'],
      ['Cámaras', 'Interior cámara y arcones de congelación', 'bimestral', L, 'Personal de obrador'],
      ['Almacén', 'Suelo', 'semanal', L, PL],
      ['Almacén', 'Estanterías', 'quincenal', L, PL],
      ['Aseos y vestuarios', 'Sanitarios, lavabos y suelo', 'diaria', L, PL],
    ].map(([zona, elemento, frecuencia, producto, responsable, alc]) => ({ zona, elemento, frecuencia, producto, responsable, alc: !!alc }))),
    proveedores: [],
    productos: [],
    cuadernos: [
      { id: 'diaria', orden: 1, activo: true, titulo: 'Producción diaria', traza: '', ayuda: 'Unidades elaboradas cada día. Edita los productos en Ajustes → Cuadernos de producción.', grupos: [
        g('Pan', ['Barra', 'Pan de molde', 'Pan integral']),
        g('Bollería', ['Croissant', 'Napolitana', 'Magdalenas']),
        g('Pastelería', ['Pasteles', 'Tartas']),
      ] },
    ],
  };

  window.PLANTILLAS = { salduba, obrador };

  // Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011)
  window.ALERGENOS = [
    'Gluten', 'Crustáceos', 'Huevo', 'Pescado', 'Cacahuete', 'Soja', 'Leche',
    'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Altramuces', 'Moluscos',
  ];
  window.CATEGORIAS_LISTERIA = [ALC7, VU5, N4, 'ALC fin vida útil < 100 ufc', 'pH ≤ 4,4 o aw ≤ 0,92', 'pH ≤ 5,0 y aw ≤ 0,94'];
})();
