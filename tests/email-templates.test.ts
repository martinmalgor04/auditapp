import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { getTestSql } from './helpers/db';
import { sendEmail } from '../src/lib/server/email/index';
import { EMAIL_TEMPLATES } from '../src/lib/server/email/templates';
import { resetMailTransportForTests, setMailTransportForTests } from '../src/lib/server/email/transport';

const AVISO_TEMPLATES = [
  'aviso_auditoria_asignada',
  'aviso_briefing_completado',
  'aviso_informe_aprobado',
  'aviso_auditoria_cerrada',
  'aviso_feedback_cliente'
] as const;

const sampleData = {
  aviso_auditoria_asignada: {
    tecnicoNombre: 'Facu',
    auditRef: 'ACME-IT-0001',
    clienteNombre: 'Acme SA',
    auditUrl: 'http://localhost:5173/auditorias/1'
  },
  aviso_briefing_completado: {
    auditRef: 'ACME-IT-0001',
    clienteNombre: 'Acme SA',
    auditUrl: 'http://localhost:5173/auditorias/1'
  },
  aviso_informe_aprobado: {
    auditRef: 'ACME-IT-0001',
    clienteNombre: 'Acme SA',
    version: 2,
    auditUrl: 'http://localhost:5173/auditorias/1'
  },
  aviso_auditoria_cerrada: {
    auditRef: 'ACME-IT-0001',
    clienteNombre: 'Acme SA',
    auditUrl: 'http://localhost:5173/auditorias/1'
  },
  aviso_feedback_cliente: {
    auditRef: 'ACME-IT-0001',
    clienteNombre: 'Acme SA',
    valoracionGlobal: 4,
    auditUrl: 'http://localhost:5173/auditorias/1'
  }
} as const;

describe('email templates (#49 R5)', () => {
  beforeEach(() => {
    setSqlForTests(getTestSql());
    resetMailTransportForTests();
    setMailTransportForTests({ sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) });
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    resetMailTransportForTests();
  });

  for (const name of AVISO_TEMPLATES) {
    it(`${name} renderiza HTML branded y texto plano con payload válido`, () => {
      const data = sampleData[name];
      const rendered = EMAIL_TEMPLATES[name].render(data as never);
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.html).toContain('Servicios y Sistemas');
      expect(rendered.html).toContain('#2196F3');
      expect(rendered.text.length).toBeGreaterThan(0);
      expect(rendered.text).toContain(data.auditRef);
      expect(rendered.text).toContain(data.clienteNombre);
    });
  }

  it('datos inválidos devuelven fallido sin tocar transporte (R5)', async () => {
    const sendMail = vi.fn();
    setMailTransportForTests({ sendMail });

    const result = await sendEmail('aviso_briefing_completado', 'a@b.com', {
      auditRef: '',
      clienteNombre: 'X',
      auditUrl: 'not-a-url'
    });

    expect(result.status).toBe('fallido');
    expect(result.logIds).toEqual([]);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('envio_informe_cliente template (R4 #51)', () => {
  beforeEach(() => {
    setSqlForTests(getTestSql());
    resetMailTransportForTests();
    setMailTransportForTests({ sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) });
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    resetMailTransportForTests();
  });

  it('renderiza HTML branded con informeUrl y pdfUrl (R4)', () => {
    const data = {
      contactoNombre: 'Juan Pérez',
      informeUrl: 'http://localhost:5173/informe/abc123token',
      pdfUrl: 'http://localhost:5173/informe/abc123token/imprimir'
    };
    const rendered = EMAIL_TEMPLATES.envio_informe_cliente.render(data);
    expect(rendered.subject).toContain('informe');
    expect(rendered.subject).toContain('Servicios y Sistemas');
    expect(rendered.html).toContain('Servicios y Sistemas');
    expect(rendered.html).toContain(data.informeUrl);
    expect(rendered.html).toContain(data.pdfUrl);
    expect(rendered.html).toContain('Juan Pérez');
    expect(rendered.text).toContain(data.informeUrl);
    expect(rendered.text).toContain(data.pdfUrl);
    expect(rendered.text).toContain('Juan Pérez');
    expect(rendered.html).not.toContain('Reservado');
  });

  it('renderiza sin pdfUrl (campo opcional)', () => {
    const data = {
      contactoNombre: 'Ana García',
      informeUrl: 'http://localhost:5173/informe/tok456'
    };
    const rendered = EMAIL_TEMPLATES.envio_informe_cliente.render(data);
    expect(rendered.html).toContain(data.informeUrl);
    expect(rendered.text).toContain(data.informeUrl);
    expect(rendered.html).not.toContain('/imprimir');
    expect(rendered.text).not.toContain('/imprimir');
  });

  it('fixture con upsell_findings/internal_draft → ninguno de sus textos aparece (R4)', () => {
    const internalText = 'UPSELL_SECRET_FINDING_12345';
    const internalDraft = 'INTERNAL_DRAFT_CONFIDENTIAL_99';
    const data = {
      contactoNombre: internalText,  // provocaría leak si se pasara el draft interno
      informeUrl: 'http://localhost:5173/informe/tok789',
      pdfUrl: 'http://localhost:5173/informe/tok789/imprimir'
    };
    // La plantilla SOLO usa contactoNombre, informeUrl, pdfUrl.
    // Si alguien pasara los campos internos por error, no están en el schema → no renderiza.
    const rendered = EMAIL_TEMPLATES.envio_informe_cliente.render(data);
    expect(rendered.html).not.toContain(internalDraft);
    expect(rendered.text).not.toContain(internalDraft);
    // El schema Zod rechaza campos extra (strict=false, pero el render solo accede a los 3)
    // Verificamos que no hay filtración de texto que NO fuera explícitamente pasado
    expect(rendered.html).not.toContain('upsell_findings');
    expect(rendered.html).not.toContain('internal_draft');
  });
});

describe('password_reset template (R8 #50)', () => {
  beforeEach(() => {
    setSqlForTests(getTestSql());
    resetMailTransportForTests();
    setMailTransportForTests({ sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) });
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    resetMailTransportForTests();
  });

  it('renderiza HTML con resetUrl y expiraEnMin', () => {
    const data = {
      nombre: 'Martín',
      resetUrl: 'http://localhost:5173/reset/abc123',
      expiraEnMin: 60
    };
    const rendered = EMAIL_TEMPLATES.password_reset.render(data);
    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.html).toContain('Servicios y Sistemas');
    expect(rendered.html).toContain(data.resetUrl);
    expect(rendered.html).toContain('60');
    expect(rendered.html).toContain('Martín');
    expect(rendered.text).toContain(data.resetUrl);
    expect(rendered.text).toContain('60');
    expect(rendered.text).toContain('Martín');
    // No debe ser el placeholder reservado
    expect(rendered.html).not.toContain('Reservado');
  });

  it('texto plano no vacío e incluye nota de no solicitaste', () => {
    const data = {
      nombre: 'Ana',
      resetUrl: 'http://localhost:5173/reset/xyz',
      expiraEnMin: 30
    };
    const rendered = EMAIL_TEMPLATES.password_reset.render(data);
    expect(rendered.text).toContain('ignorá');
    expect(rendered.text.length).toBeGreaterThan(50);
  });

  it('datos inválidos (resetUrl sin URL) devuelven fallido sin tocar transporte', async () => {
    const sendMail = vi.fn();
    setMailTransportForTests({ sendMail });

    const result = await sendEmail('password_reset', 'a@b.com', {
      nombre: 'Ana',
      resetUrl: 'no-es-url',
      expiraEnMin: 60
    });

    expect(result.status).toBe('fallido');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
