/**
 * Genera seed/templates/*.json y manifest.json desde definiciones compactas.
 * Ejecutar: pnpm exec tsx scripts/generate-template-fixtures.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FieldType } from '../src/lib/server/db/field-schemas';
import type {
  SectionFixture,
  TemplateFixture,
  TemplateItemFixture
} from '../src/lib/server/db/seed/templates';

const OUT_DIR = join(process.cwd(), 'seed', 'templates');

type ItemDef = Omit<TemplateItemFixture, 'sort_order'> & { sort_order?: number };

function item(index: number, def: ItemDef): TemplateItemFixture {
  return { sort_order: index, ...def };
}

function scoringSelect(
  label: string,
  choices: string[],
  scores: Record<string, 0 | 50 | 100>,
  filled_by: 'admin' | 'cliente' | 'tecnico' = 'tecnico'
): ItemDef {
  return {
    label,
    field_type: 'select',
    method: ['O'],
    filled_by,
    options: { choices, score_map: scores }
  };
}

function scoringTri(label: string): ItemDef {
  return {
    label,
    field_type: 'tri',
    method: ['O'],
    filled_by: 'tecnico',
    options: {}
  };
}

function scoringBool(label: string): ItemDef {
  return {
    label,
    field_type: 'bool',
    method: ['O'],
    filled_by: 'tecnico',
    options: {}
  };
}

function infoText(
  label: string,
  filled_by: 'admin' | 'cliente' | 'tecnico',
  required = false
): ItemDef {
  return {
    label,
    field_type: 'text',
    method: ['O'],
    filled_by,
    required,
    scores: false,
    options: {}
  };
}

function buildCabItems(): TemplateItemFixture[] {
  return [
    item(0, infoText('Razón social', 'admin', true)),
    item(1, infoText('CUIT', 'admin')),
    item(2, infoText('Rubro / actividad', 'cliente')),
    item(3, {
      label: 'Cantidad de empleados',
      field_type: 'number',
      method: ['O'],
      filled_by: 'cliente',
      scores: false,
      options: {}
    }),
    item(4, infoText('Referente principal', 'cliente')),
    item(5, infoText('Contacto referente', 'cliente')),
    item(6, infoText('ERP actual', 'cliente')),
    item(7, infoText('Proveedor de correo', 'cliente')),
    item(8, infoText('Soporte IT actual', 'cliente')),
    item(9, {
      label: 'Fecha programada de visita',
      field_type: 'date',
      method: ['O'],
      filled_by: 'admin',
      scores: false,
      options: {}
    })
  ];
}

function buildItSections(): SectionFixture[] {
  const cab: SectionFixture = {
    code: 'CAB',
    title: 'Cabecera / datos generales',
    objective: 'Información contextual del cliente',
    weight: 'bajo',
    has_score: false,
    sort_order: 0,
    items: buildCabItems()
  };

  const sectionDefs: Array<{
    code: string;
    title: string;
    standard_ref: string;
    weight: SectionFixture['weight'];
    items: ItemDef[];
  }> = [
    {
      code: 'A1',
      title: 'Inventario de activos / hardware',
      standard_ref: 'CIS 1 · NIST: Identify',
      weight: 'muy_alto',
      items: [
        scoringBool('¿Existe inventario documentado de equipos?'),
        scoringTri('¿El inventario está actualizado?'),
        {
          label: 'Tabla de equipos relevados',
          field_type: 'table',
          method: ['O', 'C'],
          filled_by: 'tecnico',
          options: {
            columns: [
              { key: 'tipo', label: 'Tipo', type: 'select' },
              { key: 'marca', label: 'Marca', type: 'text' },
              { key: 'modelo', label: 'Modelo', type: 'text' },
              { key: 'antiguedad', label: 'Antigüedad (años)', type: 'number' },
              { key: 'estado_eol', label: 'Estado EOL', type: 'select' }
            ],
            eol_rules: { vigente: 100, extendido: 50, eol: 0 }
          }
        },
        {
          label: 'Captura del inventario',
          field_type: 'file_ref',
          method: ['C'],
          filled_by: 'tecnico',
          scores: false,
          options: { max_files: 3 }
        }
      ]
    },
    {
      code: 'A2',
      title: 'Software / licencias',
      standard_ref: 'CIS 2 · NIST: Identify',
      weight: 'alto',
      items: [
        scoringBool('¿Existe registro de software instalado?'),
        scoringSelect(
          'Nivel de control de licencias',
          ['Controlado', 'Parcial', 'Sin control'],
          { Controlado: 100, Parcial: 50, 'Sin control': 0 }
        )
      ]
    },
    {
      code: 'A3',
      title: 'Gestión de datos',
      standard_ref: 'CIS 3 · NIST: Protect',
      weight: 'alto',
      items: [
        scoringTri('¿Hay política de clasificación de datos?'),
        scoringBool('¿Se aplican permisos por rol en carpetas críticas?')
      ]
    },
    {
      code: 'A4',
      title: 'Configuración segura',
      standard_ref: 'CIS 4 · NIST: Protect',
      weight: 'alto',
      items: [
        scoringSelect(
          'Endurecimiento de servidores',
          ['Aplicado', 'Parcial', 'No aplicado'],
          { Aplicado: 100, Parcial: 50, 'No aplicado': 0 }
        ),
        scoringBool('¿Se deshabilitan servicios innecesarios?')
      ]
    },
    {
      code: 'A5',
      title: 'Control de acceso',
      standard_ref: 'CIS 5 · NIST: Protect',
      weight: 'muy_alto',
      items: [
        scoringBool('¿Existe proceso formal de altas/bajas de usuarios?'),
        scoringTri('¿Se revisan permisos periódicamente?')
      ]
    },
    {
      code: 'A6',
      title: 'Protección de cuentas',
      standard_ref: 'CIS 6 · NIST: Protect',
      weight: 'muy_alto',
      items: [
        scoringSelect(
          'Política de contraseñas',
          ['Fuerte', 'Media', 'Débil'],
          { Fuerte: 100, Media: 50, Débil: 0 }
        ),
        scoringBool('¿MFA habilitado en servicios críticos?')
      ]
    },
    {
      code: 'A7',
      title: 'Gestión de vulnerabilidades',
      standard_ref: 'CIS 7 · NIST: Detect',
      weight: 'alto',
      items: [
        scoringTri('¿Se aplican parches de seguridad periódicamente?'),
        {
          label: 'Días promedio de demora en parches críticos',
          field_type: 'number',
          method: ['O'],
          filled_by: 'tecnico',
          options: {
            unit: 'días',
            thresholds: [
              { min: 0, max: 7, score: 100 },
              { min: 8, max: 30, score: 50 },
              { min: 31, max: 9999, score: 0 }
            ]
          }
        }
      ]
    },
    {
      code: 'A8',
      title: 'Registro y monitoreo',
      standard_ref: 'CIS 8 · NIST: Detect',
      weight: 'alto',
      items: [
        scoringBool('¿Hay centralización de logs?'),
        scoringTri('¿Se revisan alertas de seguridad?')
      ]
    },
    {
      code: 'A9',
      title: 'Protección contra malware',
      standard_ref: 'CIS 10 · NIST: Protect',
      weight: 'alto',
      items: [
        scoringSelect(
          'Antivirus/EDR en endpoints',
          ['100% cubierto', 'Parcial', 'Sin cobertura'],
          { '100% cubierto': 100, Parcial: 50, 'Sin cobertura': 0 }
        )
      ]
    },
    {
      code: 'A10',
      title: 'Recuperación de datos / backups',
      standard_ref: 'CIS 11 · NIST: Recover',
      weight: 'muy_alto',
      items: [
        scoringBool('¿Existen backups automatizados?'),
        scoringTri('¿Se prueban restauraciones periódicamente?'),
        {
          label: 'Lista de gaps de backup detectados',
          field_type: 'list',
          method: ['O'],
          filled_by: 'tecnico',
          scores: false,
          options: { max_items: 10 }
        }
      ]
    },
    {
      code: 'A11',
      title: 'Seguridad de red',
      standard_ref: 'CIS 12 · NIST: Protect',
      weight: 'muy_alto',
      items: [
        scoringSelect(
          'Segmentación de red',
          ['VLANs definidas', 'Parcial', 'Plana'],
          { 'VLANs definidas': 100, Parcial: 50, Plana: 0 }
        ),
        scoringBool('¿Firewall perimetral activo?')
      ]
    },
    {
      code: 'A12',
      title: 'Seguridad perimetral',
      standard_ref: 'CIS 13 · NIST: Protect',
      weight: 'alto',
      items: [
        scoringTri('¿Reglas de firewall documentadas y revisadas?'),
        scoringBool('¿Hay filtrado de salida a internet?')
      ]
    },
    {
      code: 'A13',
      title: 'Seguridad wireless',
      standard_ref: 'CIS 15 · NIST: Protect',
      weight: 'medio',
      items: [
        scoringSelect(
          'Estándar WiFi corporativo',
          ['WPA3-Enterprise', 'WPA2-Enterprise', 'WPA2-PSK', 'Abierto'],
          {
            'WPA3-Enterprise': 100,
            'WPA2-Enterprise': 100,
            'WPA2-PSK': 50,
            Abierto: 0
          }
        )
      ]
    },
    {
      code: 'A14',
      title: 'Formación y concienciación',
      standard_ref: 'CIS 14 · NIST: Protect',
      weight: 'medio',
      items: [
        scoringTri('¿Capacitación periódica en ciberseguridad?'),
        {
          label: 'Costo mensual estimado shadow IT',
          field_type: 'money',
          method: ['O'],
          filled_by: 'tecnico',
          options: {
            currency: 'ARS',
            thresholds: [
              { min: 0, max: 0, score: 100 },
              { min: 1, max: 50000, score: 50 },
              { min: 50001, max: 999999999, score: 0 }
            ]
          }
        }
      ]
    }
  ];

  return [
    cab,
    ...sectionDefs.map((s, idx) => ({
      code: s.code,
      title: s.title,
      objective: s.title,
      standard_ref: s.standard_ref,
      weight: s.weight,
      has_score: true,
      sort_order: idx + 1,
      items: s.items.map((it, i) => item(i, it))
    }))
  ];
}

function buildErpSections(prefix: 'B' | 'E', titles: string[]): SectionFixture[] {
  const cab: SectionFixture = {
    code: 'CAB',
    title: 'Cabecera ERP',
    objective: 'Datos generales del relevamiento ERP',
    weight: 'bajo',
    has_score: false,
    sort_order: 0,
    items: buildCabItems()
  };

  const sections = titles.map((title, idx) => {
    const code = `${prefix}${idx + 1}`;
    return {
      code,
      title,
      objective: title,
      standard_ref: `ERP ${code}`,
      weight: (idx < 3 ? 'muy_alto' : idx < 6 ? 'alto' : 'medio') as SectionFixture['weight'],
      has_score: true,
      sort_order: idx + 1,
      items: [
        item(0, scoringTri(`¿Proceso ${title} documentado?`)),
        item(1, scoringBool(`¿Controles internos aplicados en ${title}?`)),
        item(
          2,
          scoringSelect(
            `Madurez operativa — ${title}`,
            ['Optimizado', 'En desarrollo', 'Manual'],
            { Optimizado: 100, 'En desarrollo': 50, Manual: 0 }
          )
        )
      ]
    } satisfies SectionFixture;
  });

  return [cab, ...sections];
}

const IT_TEMPLATE: TemplateFixture = {
  code: 'it',
  name: 'Auditoría Técnica IT',
  version: 'v2',
  status: 'active',
  sections: buildItSections()
};

const ERP_TANGO_TEMPLATE: TemplateFixture = {
  code: 'erp-tango',
  name: 'Auditoría ERP Tango',
  version: 'v2',
  status: 'active',
  sections: buildErpSections('B', [
    'Administración y parametrización',
    'Ventas y facturación',
    'Compras y proveedores',
    'Stock e inventarios',
    'Contabilidad',
    'Tesorería y bancos',
    'Sueldos y RRHH',
    'Producción / costos',
    'Integraciones y Nexo',
    'Seguridad y usuarios Tango'
  ])
};

const ERP_ESTANDAR_TEMPLATE: TemplateFixture = {
  code: 'erp-estandar',
  name: 'Auditoría ERP Estándar',
  version: 'v1',
  status: 'active',
  sections: buildErpSections('E', [
    'Parametrización general',
    'Circuito comercial',
    'Compras y pagos',
    'Stock',
    'Contabilidad',
    'Reportes gerenciales',
    'Usuarios y permisos',
    'Integraciones'
  ])
};

function countTemplate(t: TemplateFixture) {
  return {
    code: t.code,
    version: t.version,
    sections: t.sections.length,
    items: t.sections.reduce((acc, s) => acc + s.items.length, 0)
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const templates = [
    { file: 'it-v2.json', data: IT_TEMPLATE },
    { file: 'erp-tango-v2.json', data: ERP_TANGO_TEMPLATE },
    { file: 'erp-estandar-v1.json', data: ERP_ESTANDAR_TEMPLATE }
  ];

  for (const { file, data } of templates) {
    await writeFile(join(OUT_DIR, file), `${JSON.stringify(data, null, 2)}\n`);
  }

  const manifest = {
    templates: templates.map(({ file, data }) => ({
      file,
      ...countTemplate(data)
    }))
  };

  await writeFile(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Generated template fixtures:', manifest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
