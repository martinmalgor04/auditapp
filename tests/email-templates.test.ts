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
