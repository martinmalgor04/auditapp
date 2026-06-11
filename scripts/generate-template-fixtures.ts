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

type ItemExtras = Partial<Pick<TemplateItemFixture, 'method' | 'allow_na' | 'help_text'>>;

function item(index: number, def: ItemDef): TemplateItemFixture {
  return { sort_order: index, ...def };
}

function scoringSelect(
  label: string,
  choices: string[],
  scores: Record<string, 0 | 50 | 100>,
  filled_by: 'admin' | 'cliente' | 'tecnico' = 'tecnico',
  extras: ItemExtras = {}
): ItemDef {
  return {
    label,
    field_type: 'select',
    method: ['O'],
    filled_by,
    options: { choices, score_map: scores },
    ...extras
  };
}

function scoringTri(label: string, extras: ItemExtras = {}): ItemDef {
  return {
    label,
    field_type: 'tri',
    method: ['O'],
    filled_by: 'tecnico',
    options: {},
    ...extras
  };
}

function scoringBool(label: string, extras: ItemExtras = {}): ItemDef {
  return {
    label,
    field_type: 'bool',
    method: ['O'],
    filled_by: 'tecnico',
    options: {},
    ...extras
  };
}

function infoText(
  label: string,
  filled_by: 'admin' | 'cliente' | 'tecnico',
  required = false,
  extras: ItemExtras = {}
): ItemDef {
  return {
    label,
    field_type: 'text',
    method: ['O'],
    filled_by,
    required,
    scores: false,
    options: {},
    ...extras
  };
}

function infoList(label: string, extras: ItemExtras = {}): ItemDef {
  return {
    label,
    field_type: 'list',
    method: ['E'],
    filled_by: 'tecnico',
    scores: false,
    options: { max_items: 10 },
    ...extras
  };
}

function buildCabItems(opts: { modulosTango?: boolean } = {}): TemplateItemFixture[] {
  const base: ItemDef[] = [
    infoText('Razón social', 'admin', true),
    infoText('CUIT', 'admin'),
    infoText('Rubro / actividad', 'cliente'),
    {
      label: 'Cantidad de empleados',
      field_type: 'number',
      method: ['O'],
      filled_by: 'cliente',
      scores: false,
      options: {}
    },
    infoText('Referente principal', 'cliente'),
    infoText('Contacto referente', 'cliente'),
    infoText('ERP actual', 'cliente'),
    infoText('Proveedor de correo', 'cliente'),
    infoText('Soporte IT actual', 'cliente')
  ];

  if (opts.modulosTango) {
    // item_code consumido por el builder canónico (cab_modulos_tango)
    base.push({
      label: 'Módulos Tango instalados',
      field_type: 'multiselect',
      method: ['O'],
      filled_by: 'cliente',
      required: false,
      scores: false,
      options: {
        item_code: 'cab_modulos_tango',
        choices: ['ventas', 'compras', 'stock', 'tesorería', 'sueldos', 'punto_venta']
      }
    });
  }

  base.push({
    label: 'Fecha programada de visita',
    field_type: 'date',
    method: ['O'],
    filled_by: 'admin',
    scores: false,
    options: {}
  });

  return base.map((def, i) => item(i, def));
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

/**
 * ERP Tango v3 — secciones B1-B9 con ítems específicos de Tango Gestión.
 * Fuente: sysaudit/docs/2026-06-05_plantilla_sys_auditoria-erp-tango_v2.md (spec 04b).
 */
function buildErpTangoSections(): SectionFixture[] {
  const cab: SectionFixture = {
    code: 'CAB',
    title: 'Cabecera ERP',
    objective: 'Datos generales del relevamiento ERP',
    weight: 'bajo',
    has_score: false,
    sort_order: 0,
    items: buildCabItems({ modulosTango: true })
  };

  const sectionDefs: Array<{
    code: string;
    title: string;
    objective: string;
    weight: SectionFixture['weight'];
    items: ItemDef[];
  }> = [
    {
      code: 'B1',
      title: 'Administración y parametrización',
      objective: 'Identificación, licenciamiento y parametrización general de Tango',
      weight: 'muy_alto',
      items: [
        infoText('Versión / generación de Tango instalada (ej.: Delta, Delta 2)', 'tecnico', false, {
          method: ['O', 'C']
        }),
        {
          label: 'Modalidad de uso',
          field_type: 'select',
          method: ['E'],
          filled_by: 'tecnico',
          scores: false,
          options: { choices: ['Local instalado', 'Tango Nube', 'Suscripción Nexo'] }
        },
        scoringSelect(
          'Brecha de versión vs. última liberada por Axoft',
          ['Al día', 'Una versión atrás', 'Dos o más versiones atrás'],
          { 'Al día': 100, 'Una versión atrás': 50, 'Dos o más versiones atrás': 0 },
          'tecnico',
          { method: ['O', 'E'] }
        ),
        scoringBool('¿Garantía de actualización / abono Axoft vigente?', {
          method: ['E'],
          help_text: 'Precargable desde registros SyS de licencias'
        }),
        scoringSelect(
          'Usuarios licenciados vs. usuarios activos reales',
          ['Alineados', 'Brecha menor', 'Brecha importante (sobre-gasto o licencias que faltan)'],
          {
            Alineados: 100,
            'Brecha menor': 50,
            'Brecha importante (sobre-gasto o licencias que faltan)': 0
          },
          'tecnico',
          { method: ['E'] }
        ),
        scoringTri('¿Hay un referente interno de Tango definido (key user)?', { method: ['E'] }),
        scoringTri(
          '¿Parametrización general documentada (empresas, sucursales, talonarios, listas de precios)?',
          { method: ['E', 'O'] }
        ),
        scoringBool('¿Operan multiempresa con módulo Central (si tienen más de una empresa)?', {
          method: ['E'],
          allow_na: true
        }),
        infoText(
          'Estudio contable externo: nombre y cómo trabaja (sobre Tango / le exportan datos)',
          'tecnico',
          false,
          { method: ['E'] }
        )
      ]
    },
    {
      code: 'B2',
      title: 'Ventas y facturación',
      objective: 'Circuito comercial completo y facturación electrónica desde Tango',
      weight: 'muy_alto',
      items: [
        scoringTri(
          '¿Facturación electrónica AFIP/ARCA integrada en Tango y al día con la normativa vigente?',
          { method: ['E', 'O'] }
        ),
        scoringSelect(
          'Circuito pedido → remito → factura → cobro',
          ['Completo en Tango', 'Parcial (tramos manuales)', 'Mayormente fuera del sistema'],
          {
            'Completo en Tango': 100,
            'Parcial (tramos manuales)': 50,
            'Mayormente fuera del sistema': 0
          },
          'tecnico',
          { method: ['E'] }
        ),
        scoringBool(
          '¿Todos los comprobantes de venta se emiten desde Tango (sin facturación paralela)?',
          { method: ['E'] }
        ),
        scoringTri('¿Listas de precios y condiciones comerciales parametrizadas en el sistema?', {
          method: ['E', 'O']
        }),
        scoringTri('¿Cuentas corrientes de clientes conciliadas y al día en Tango?', {
          method: ['E']
        }),
        scoringTri(
          '¿Usan informes de ventas de Tango (Live / Reportes) para decisiones comerciales?',
          { method: ['E'] }
        ),
        infoList('Tareas de ventas que hoy se resuelven a mano o en Excel'),
        infoText('Cuellos de botella detectados en el circuito de ventas', 'tecnico', false, {
          method: ['E']
        })
      ]
    },
    {
      code: 'B3',
      title: 'Compras y proveedores',
      objective: 'Circuito de compras, matching y cuentas corrientes de proveedores',
      weight: 'muy_alto',
      items: [
        scoringSelect(
          'Circuito orden de compra → recepción → factura → pago',
          ['Completo en Tango', 'Parcial (tramos manuales)', 'Mayormente fuera del sistema'],
          {
            'Completo en Tango': 100,
            'Parcial (tramos manuales)': 50,
            'Mayormente fuera del sistema': 0
          },
          'tecnico',
          { method: ['E'] }
        ),
        scoringTri('¿Compras respaldadas por orden de compra en el sistema?', { method: ['E'] }),
        scoringTri('¿Control de recepción contra OC y factura de proveedor (matching)?', {
          method: ['E']
        }),
        scoringTri('¿Cuentas corrientes de proveedores conciliadas y al día?', { method: ['E'] }),
        scoringBool(
          '¿Percepciones y retenciones de compras configuradas y aplicadas desde Tango?',
          { method: ['E'] }
        ),
        infoText('Doble carga / reprocesos detectados en compras', 'tecnico', false, {
          method: ['E']
        })
      ]
    },
    {
      code: 'B4',
      title: 'Stock e inventarios',
      objective: 'Confiabilidad del stock del sistema frente al stock físico',
      weight: 'alto',
      items: [
        scoringTri('¿El stock del sistema refleja el stock físico (la operación confía en Tango)?', {
          method: ['E', 'O']
        }),
        scoringTri('¿Movimientos de stock registrados en tiempo real (no se cargan en diferido)?', {
          method: ['E', 'O']
        }),
        scoringSelect(
          'Inventarios / conteos físicos',
          ['Cíclicos programados', 'Solo anual', 'No se hacen'],
          { 'Cíclicos programados': 100, 'Solo anual': 50, 'No se hacen': 0 },
          'tecnico',
          { method: ['E'] }
        ),
        scoringTri('¿Artículos codificados con criterio único (sin duplicados)?', {
          method: ['O', 'E']
        }),
        scoringBool('¿Depósitos / sucursales de stock reflejados en Tango (multidepósito)?', {
          method: ['E'],
          allow_na: true
        }),
        infoText('Diferencias de inventario típicas y causas detectadas', 'tecnico', false, {
          method: ['E']
        })
      ]
    },
    {
      code: 'B5',
      title: 'Tesorería',
      objective: 'Cajas, bancos, conciliación y posición financiera desde el módulo Fondos',
      weight: 'alto',
      items: [
        scoringTri('¿Usan el módulo Tesorería/Fondos para cajas y bancos?', { method: ['E'] }),
        scoringTri('¿Conciliación bancaria hecha en Tango y al día?', { method: ['E'] }),
        scoringSelect(
          'Posición financiera / cash flow',
          ['Sale de Tango', 'Se arma en Excel con datos de Tango', 'No se proyecta'],
          { 'Sale de Tango': 100, 'Se arma en Excel con datos de Tango': 50, 'No se proyecta': 0 },
          'tecnico',
          { method: ['E'] }
        ),
        scoringBool('¿Cheques y valores administrados desde el sistema?', {
          method: ['E'],
          allow_na: true
        }),
        scoringTri('¿Cobranzas con medios de pago electrónicos integradas (Tango Cobranzas u otro)?', {
          method: ['E'],
          allow_na: true
        }),
        infoText('Circuito de pagos: quién autoriza y cómo se registra', 'tecnico', false, {
          method: ['E']
        })
      ]
    },
    {
      code: 'B6',
      title: 'Sueldos y RRHH',
      objective: 'Liquidación de sueldos, libros y control de asistencia',
      weight: 'medio',
      items: [
        scoringTri('¿Liquidan sueldos con el módulo Sueldos de Tango?', {
          method: ['E'],
          allow_na: true
        }),
        scoringBool('¿Libro de sueldos y F.931 se generan desde el sistema?', {
          method: ['E'],
          allow_na: true
        }),
        scoringTri('¿Convenios y conceptos de liquidación parametrizados al día?', {
          method: ['E'],
          allow_na: true
        }),
        scoringSelect(
          'Control de asistencia',
          [
            'Integrado a la liquidación (Control de Horarios / Fichadas)',
            'Sistema aparte sin integrar',
            'Manual / planillas'
          ],
          {
            'Integrado a la liquidación (Control de Horarios / Fichadas)': 100,
            'Sistema aparte sin integrar': 50,
            'Manual / planillas': 0
          },
          'tecnico',
          { method: ['E'], allow_na: true }
        ),
        infoText('Dolores en la liquidación (tiempos, errores, reclamos)', 'tecnico', false, {
          method: ['E']
        })
      ]
    },
    {
      code: 'B7',
      title: 'Producción / costos',
      objective: 'Producción, costos y rentabilidad dentro del sistema',
      weight: 'medio',
      items: [
        scoringTri('¿Gestionan producción / armado dentro de Tango?', {
          method: ['E'],
          allow_na: true
        }),
        scoringTri('¿Costos de productos actualizados en el sistema?', {
          method: ['E'],
          allow_na: true
        }),
        scoringSelect(
          'Cálculo de rentabilidad por producto / línea',
          ['Sale de Tango', 'Se arma en Excel', 'No se calcula'],
          { 'Sale de Tango': 100, 'Se arma en Excel': 50, 'No se calcula': 0 },
          'tecnico',
          { method: ['E'], allow_na: true }
        ),
        infoText('Procesos productivos que corren fuera del sistema', 'tecnico', false, {
          method: ['E']
        })
      ]
    },
    {
      code: 'B8',
      title: 'Integraciones y Nexo',
      objective: 'Apps Nexo, integraciones y personalizaciones a medida',
      weight: 'medio',
      items: [
        {
          label: 'Apps Tango Nexo activas',
          field_type: 'multiselect',
          method: ['E'],
          filled_by: 'tecnico',
          scores: false,
          options: {
            choices: [
              'Tango Clientes',
              'Tango Reportes',
              'Tango Tablero',
              'Tango Tiendas',
              'Tango Cobranzas',
              'Tango Backup',
              'Tango Update',
              'Tango Empleados',
              'Tango Fichadas',
              'TangoNet',
              'Tango Notificaciones'
            ]
          }
        },
        scoringTri('¿Aprovechan las apps Nexo gratuitas (Reportes, Tablero, Backup, Update)?', {
          method: ['E'],
          help_text: 'Apps gratis sin activar = quick wins inmediatos'
        }),
        scoringTri('¿Integración con e-commerce resuelta (Tango Tiendas / API / conector)?', {
          method: ['E'],
          allow_na: true
        }),
        scoringTri('¿Intercambio con bancos y medios de pago integrado (sin retipeo)?', {
          method: ['E'],
          allow_na: true
        }),
        scoringSelect(
          'Personalizaciones a medida y riesgo de actualización',
          [
            'No hay personalizaciones',
            'Hay, documentadas y con soporte',
            'Hay, sin documentación o proveedor desconocido'
          ],
          {
            'No hay personalizaciones': 100,
            'Hay, documentadas y con soporte': 100,
            'Hay, sin documentación o proveedor desconocido': 0
          },
          'tecnico',
          { method: ['E'] }
        ),
        infoList('Necesidades de integración no resueltas (oportunidades)'),
        infoText(
          'Exportaciones / importaciones manuales con Excel (qué y con qué frecuencia)',
          'tecnico',
          false,
          { method: ['E'] }
        )
      ]
    },
    {
      code: 'B9',
      title: 'Seguridad y usuarios Tango',
      objective: 'Permisos, segregación de funciones, trazabilidad y respaldo de la base Tango',
      weight: 'medio',
      items: [
        scoringTri('¿Perfiles y permisos por usuario definidos en Tango?', { method: ['O', 'E'] }),
        scoringTri('¿Segregación de funciones: quien factura ≠ quien cobra ≠ quien concilia?', {
          method: ['E']
        }),
        scoringBool('¿Cada operador usa su propio usuario (sin cuentas compartidas)?', {
          method: ['E', 'O']
        }),
        scoringTri('¿Permisos totales (administrador) limitados a quienes corresponde?', {
          method: ['O', 'E']
        }),
        scoringTri('¿Trazabilidad / auditoría de operaciones activada en Tango?', {
          method: ['O', 'E']
        }),
        scoringTri('¿Respaldo específico de la base Tango configurado y probado (Tango Backup u otro)?', {
          method: ['E'],
          help_text: 'Solo la base Tango; el backup integral se releva en la Auditoría IT (A10)'
        }),
        infoText('Incidentes o riesgos de seguridad detectados en el ERP', 'tecnico', false, {
          method: ['E']
        })
      ]
    }
  ];

  return [
    cab,
    ...sectionDefs.map((s, idx) => ({
      code: s.code,
      title: s.title,
      objective: s.objective,
      standard_ref: `ERP ${s.code}`,
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
  version: 'v3',
  status: 'active',
  sections: buildErpTangoSections()
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
    { file: 'erp-tango-v3.json', data: ERP_TANGO_TEMPLATE },
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
