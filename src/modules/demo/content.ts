/**
 * Contenido ficticio de la empresa demo (España o Costa Rica). Todo inventado:
 * personas, empresas y documentos. Los textos "generados" se producen después
 * con las respuestas mock de la IA, a través de los mismos procesos que la app.
 */
export type DemoCountry = "ES" | "CR";

type JobFields = {
  title: string;
  department: string;
  level: "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | "director";
  work_mode: "onsite" | "hybrid" | "remote";
  location: string;
  responsibilities: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  salary_period: string;
  benefits: string;
  tone: "professional" | "friendly" | "dynamic" | "formal";
};

export type DemoContent = {
  orgName: string;
  legalName: string;
  openJob: { fields: JobFields; requirements: { text: string; kind: "required" | "preferred" }[] };
  draftJob: { fields: JobFields; requirements: { text: string; kind: "required" | "preferred" }[] };
  cvs: { filename: string; lines: string[] }[];
  decisionComment: string;
  newHireName: string;
  policy: { title: string; filename: string; pages: string[][] };
  training: { topic: string; audience: string };
};

const SPAIN: DemoContent = {
  orgName: "Logística Iberia (demo)",
  legalName: "Logística Iberia Demo S.L. (ficticia)",
  openJob: {
    fields: {
      title: "Técnico/a de logística",
      department: "Operaciones",
      level: "mid",
      work_mode: "hybrid",
      location: "Madrid",
      responsibilities:
        "Coordinar la recepción y la expedición de mercancía.\nGestionar el inventario con el sistema de gestión de almacén.\nOrganizar los turnos del equipo de almacén.\nProponer mejoras de procesos y de seguridad.",
      salary_min: "28000",
      salary_max: "34000",
      salary_currency: "EUR",
      salary_period: "year",
      benefits: "Seguro médico, formación continua y horario flexible.",
      tone: "friendly",
    },
    requirements: [
      { text: "Experiencia en gestión de almacén", kind: "required" },
      { text: "Manejo de SAP o de un sistema de gestión de almacén", kind: "required" },
      { text: "Carné de carretillero", kind: "required" },
      { text: "Inglés B2", kind: "preferred" },
      { text: "Experiencia en logística internacional", kind: "preferred" },
    ],
  },
  draftJob: {
    fields: {
      title: "Responsable de atención al cliente",
      department: "Comercial",
      level: "senior",
      work_mode: "onsite",
      location: "Madrid",
      responsibilities:
        "Atender incidencias de clientes y transportistas.\nCoordinar al equipo de atención al cliente.\nMedir la satisfacción y proponer mejoras.",
      salary_min: "",
      salary_max: "",
      salary_currency: "",
      salary_period: "",
      benefits: "Seguro médico y formación continua.",
      tone: "professional",
    },
    requirements: [
      { text: "Experiencia en atención al cliente", kind: "required" },
      { text: "Conocimiento de herramientas CRM", kind: "preferred" },
    ],
  },
  cvs: [
    {
      filename: "cv-ana-martin.pdf",
      lines: [
        "Ana Martín Ruiz",
        "Técnica de logística",
        "ana.martin@example.com · +34 612 345 678",
        "Madrid",
        "",
        "EXPERIENCIA",
        "2019 - actualidad · Coordinadora de almacén · Logística Norte S.L.",
        "- Experiencia en gestión de almacén con tres turnos y 25 personas",
        "- Manejo de SAP y de un sistema de gestión de almacén",
        "- Carné de carretillero en vigor",
        "2015 - 2019 · Técnica de logística · Distribuciones Sur S.A.",
        "- Coordinación de envíos nacionales e internacionales",
        "",
        "IDIOMAS",
        "Inglés B2",
        "",
        "CV ficticio para la demo de HRPilot.",
      ],
    },
    {
      filename: "cv-luis-perez.pdf",
      lines: [
        "Luis Pérez Gómez",
        "Mozo de almacén",
        "luis.perez@example.com · +34 622 111 222",
        "Getafe",
        "",
        "EXPERIENCIA",
        "2021 - actualidad · Mozo de almacén · Almacenes Centro S.L.",
        "- Preparación de pedidos y carga de camiones",
        "- Carné de carretillero",
        "",
        "IDIOMAS",
        "Inglés básico",
        "",
        "CV ficticio para la demo de HRPilot.",
      ],
    },
    {
      filename: "cv-sara-gil.pdf",
      lines: [
        "Sara Gil Navarro",
        "Graduada en Administración y Dirección de Empresas",
        "sara.gil@example.com · +34 633 444 555",
        "Alcalá de Henares",
        "",
        "EXPERIENCIA",
        "2024 - actualidad · Prácticas en compras · Industrias Demo S.A.",
        "- Seguimiento de pedidos a proveedores",
        "- Manejo de SAP a nivel usuario",
        "",
        "IDIOMAS",
        "Inglés B2 · Francés A2",
        "",
        "CV ficticio para la demo de HRPilot.",
      ],
    },
  ],
  decisionComment: "Perfil muy completo para el puesto: pasa a entrevista.",
  newHireName: "Persona de ejemplo (ficticia)",
  policy: {
    title: "Política de vacaciones, permisos y teletrabajo",
    filename: "politica-vacaciones-permisos.pdf",
    pages: [
      [
        "POLÍTICA DE VACACIONES, PERMISOS Y TELETRABAJO",
        "Logística Iberia - documento ficticio para la demo",
        "",
        "1. Vacaciones",
        "Cada persona tiene derecho a 23 días laborables de vacaciones al año.",
        "Las vacaciones se solicitan en el portal del empleado con quince días de antelación.",
        "Los días no disfrutados pueden usarse hasta el 31 de marzo del año siguiente.",
        "",
        "2. Permisos retribuidos",
        "Por matrimonio o registro de pareja de hecho corresponden 15 días naturales.",
        "Por mudanza del domicilio habitual corresponde un día.",
      ],
      [
        "3. Teletrabajo",
        "El personal de oficina puede teletrabajar dos días por semana con acuerdo de su responsable.",
        "El equipo de almacén trabaja de forma presencial por la naturaleza de sus tareas.",
        "",
        "4. Horario",
        "La jornada general es de 8:00 a 16:30 con media hora para comer.",
        "",
        "5. Dudas",
        "Para cualquier duda sobre esta política, consulta a RRHH desde la plataforma.",
      ],
    ],
  },
  training: {
    topic: "Vacaciones, permisos y teletrabajo en Logística Iberia",
    audience: "Toda la plantilla",
  },
};

const COSTA_RICA: DemoContent = {
  orgName: "Café Volcán (demo)",
  legalName: "Café Volcán Demo S.A. (ficticia)",
  openJob: {
    fields: {
      title: "Coordinador/a de logística",
      department: "Operaciones",
      level: "mid",
      work_mode: "onsite",
      location: "San José",
      responsibilities:
        "Coordinar la recepción de café verde y el despacho de producto terminado.\nControlar el inventario de bodega con el sistema de gestión de almacén.\nOrganizar los turnos del equipo de bodega.\nVelar por la seguridad y la calidad en bodega.",
      salary_min: "900000",
      salary_max: "1200000",
      salary_currency: "CRC",
      salary_period: "month",
      benefits: "Seguro médico privado, capacitación y café de cortesía.",
      tone: "friendly",
    },
    requirements: [
      { text: "Experiencia en gestión de almacén", kind: "required" },
      { text: "Manejo de SAP o de un sistema de gestión de almacén", kind: "required" },
      { text: "Licencia de montacargas", kind: "required" },
      { text: "Inglés B2", kind: "preferred" },
      { text: "Experiencia en exportación", kind: "preferred" },
    ],
  },
  draftJob: {
    fields: {
      title: "Encargado/a de servicio al cliente",
      department: "Comercial",
      level: "senior",
      work_mode: "onsite",
      location: "Heredia",
      responsibilities:
        "Atender consultas de clientes y distribuidores.\nCoordinar al equipo de servicio al cliente.\nMedir la satisfacción y proponer mejoras.",
      salary_min: "",
      salary_max: "",
      salary_currency: "",
      salary_period: "",
      benefits: "Seguro médico privado y capacitación.",
      tone: "professional",
    },
    requirements: [
      { text: "Experiencia en servicio al cliente", kind: "required" },
      { text: "Conocimiento de herramientas CRM", kind: "preferred" },
    ],
  },
  cvs: [
    {
      filename: "cv-maria-jimenez.pdf",
      lines: [
        "María Jiménez Solís",
        "Coordinadora de bodega",
        "maria.jimenez@example.com · 8888 1234",
        "Heredia",
        "",
        "EXPERIENCIA",
        "2018 - actualidad · Coordinadora de bodega · Exportadora Central S.A.",
        "- Experiencia en gestión de almacén y control de inventarios",
        "- Manejo de SAP y de un sistema de gestión de almacén",
        "- Licencia de montacargas al día",
        "",
        "IDIOMAS",
        "Inglés B2",
        "",
        "CV ficticio para la demo de HRPilot.",
      ],
    },
    {
      filename: "cv-jose-mora.pdf",
      lines: [
        "José Mora Vargas",
        "Bodeguero",
        "jose.mora@example.com · 8777 5678",
        "Cartago",
        "",
        "EXPERIENCIA",
        "2020 - actualidad · Bodeguero · Distribuidora del Valle S.A.",
        "- Alisto de pedidos y carga de camiones",
        "- Licencia de montacargas",
        "",
        "IDIOMAS",
        "Inglés básico",
        "",
        "CV ficticio para la demo de HRPilot.",
      ],
    },
    {
      filename: "cv-daniela-rojas.pdf",
      lines: [
        "Daniela Rojas Quesada",
        "Bachiller en Administración de Empresas",
        "daniela.rojas@example.com · 8666 9012",
        "San José",
        "",
        "EXPERIENCIA",
        "2024 - actualidad · Práctica en compras · Industrias Demo S.A.",
        "- Seguimiento de órdenes de compra",
        "- Manejo de SAP a nivel usuario",
        "",
        "IDIOMAS",
        "Inglés B2",
        "",
        "CV ficticio para la demo de HRPilot.",
      ],
    },
  ],
  decisionComment: "Perfil muy completo para el puesto: pasa a entrevista.",
  newHireName: "Persona de ejemplo (ficticia)",
  policy: {
    title: "Reglamento interno de vacaciones y permisos",
    filename: "reglamento-vacaciones-permisos.pdf",
    pages: [
      [
        "REGLAMENTO INTERNO DE VACACIONES Y PERMISOS",
        "Café Volcán - documento ficticio para la demo",
        "",
        "1. Vacaciones",
        "Cada persona tiene derecho a dos semanas de vacaciones remuneradas por cada",
        "cincuenta semanas de trabajo.",
        "Las vacaciones se solicitan a la jefatura con quince días de anticipación.",
        "",
        "2. Permisos",
        "Por matrimonio se otorgan tres días hábiles con goce de salario.",
        "Por fallecimiento de un familiar cercano se otorgan tres días hábiles.",
      ],
      [
        "3. Teletrabajo",
        "El personal administrativo puede teletrabajar un día por semana con acuerdo de su jefatura.",
        "",
        "4. Horario",
        "La jornada ordinaria es de lunes a viernes de 8:00 a 17:00 con una hora de almuerzo.",
        "",
        "5. Consultas",
        "Para cualquier consulta sobre este reglamento, escriba a RRHH desde la plataforma.",
      ],
    ],
  },
  training: {
    topic: "Vacaciones y permisos en Café Volcán",
    audience: "Todo el personal",
  },
};

export function demoContent(country: DemoCountry): DemoContent {
  return country === "CR" ? COSTA_RICA : SPAIN;
}

/** Las empresas demo se borran solas pasados estos días. */
export const DEMO_TTL_DAYS = 14;
