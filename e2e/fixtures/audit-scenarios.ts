export type AuditScenario = {
  id: 'A' | 'C' | 'D';
  title: string;
  razonSocial: string;
  cuit: string;
  rubro: string;
  types: Array<'it' | 'erp-tango' | 'erp-estandar'>;
  segment: 'A' | 'B' | 'C';
  tecnicoEmail: string;
  tecnicoLabel: string;
  fecha: string;
  briefing: {
    rubro: string;
    empleados: string;
    referente: string;
    contacto: string;
    erp: string;
    correo: string;
    soporte: string;
  };
  closure: {
    riesgo: string;
    quickWin: string;
    nextStep: string;
  };
};

export const AUDIT_SCENARIOS: AuditScenario[] = [
  {
    id: 'A',
    title: 'Distribuidora del Litoral SA',
    razonSocial: 'Distribuidora del Litoral SA',
    cuit: '30-71234567-8',
    rubro: 'Distribución alimenticia y bebidas',
    types: ['it'],
    segment: 'A',
    tecnicoEmail: 'facu@serviciosysistemas.com.ar',
    tecnicoLabel: 'Facu',
    fecha: '2026-07-08',
    briefing: {
      rubro: 'Distribución mayorista — alimentos, bebidas y limpieza',
      empleados: '85',
      referente: 'Carolina Méndez — Gerente Administrativa',
      contacto: 'carolina.mendez@distlitoral.com.ar · 3624-555123',
      erp: 'Tango Gestión (Ventas, Compras, Stock)',
      correo: 'Google Workspace',
      soporte: 'Servicios y Sistemas — contrato anual'
    },
    closure: {
      riesgo: 'Backups sin prueba de restore periódica',
      quickWin: 'Activar MFA en cuentas admin de Google',
      nextStep: 'Revisión de infraestructura en 30 días'
    }
  },
  {
    id: 'C',
    title: 'Metalúrgica NEA SA',
    razonSocial: 'Metalúrgica NEA SA',
    cuit: '30-70987654-3',
    rubro: 'Metalurgia y estructuras',
    types: ['it', 'erp-tango'],
    segment: 'A',
    tecnicoEmail: 'facu@serviciosysistemas.com.ar',
    tecnicoLabel: 'Facu',
    fecha: '2026-08-05',
    briefing: {
      rubro: 'Fabricación de estructuras metálicas y montajes industriales',
      empleados: '120',
      referente: 'Laura Benítez — Directora Financiera',
      contacto: 'lbenitez@metalurgicanea.com.ar · 3624-555890',
      erp: 'Tango Gestión v9',
      correo: 'Servicios y Sistemas (hosting propio)',
      soporte: 'Servicios y Sistemas'
    },
    closure: {
      riesgo: 'Usuarios ERP con permisos excesivos',
      quickWin: 'Auditoría de roles Tango en 2 semanas',
      nextStep: 'Propuesta de hardening IT + ERP'
    }
  },
  {
    id: 'D',
    title: 'Boutique Moda & Estilo',
    razonSocial: 'Boutique Moda & Estilo',
    cuit: '27-33445566-1',
    rubro: 'Retail — indumentaria',
    types: ['erp-tango'],
    segment: 'C',
    tecnicoEmail: 'simon@serviciosysistemas.com.ar',
    tecnicoLabel: 'Simón',
    fecha: '2026-07-18',
    briefing: {
      rubro: 'Venta minorista de indumentaria femenina',
      empleados: '12',
      referente: 'Valentina Acosta — Dueña',
      contacto: 'valentina@modaestilo.com · 3764-223344',
      erp: 'Tango Punto de Venta + Tango Gestión básico',
      correo: 'Gmail (cuentas del negocio)',
      soporte: 'Sin contrato — soporte puntual'
    },
    closure: {
      riesgo: 'PdV sin conciliación diaria de caja',
      quickWin: 'Capacitación cierre de caja Tango PdV',
      nextStep: 'Seguimiento post-implementación en 15 días'
    }
  }
];
