/**
 * #52 T2 — R3: plantilla `envio_briefing_cliente` render HTML+texto branded + datos inválidos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { getTestSql } from './helpers/db';
import { sendEmail } from '../src/lib/server/email/index';
import { EMAIL_TEMPLATES } from '../src/lib/server/email/templates';
import { resetMailTransportForTests } from '../src/lib/server/email/transport';

describe('envio_briefing_cliente template (#52 R3)', () => {
  beforeEach(() => {
    setSqlForTests(getTestSql());
    resetMailTransportForTests();
  });

  afterEach(() => {
    resetMailTransportForTests();
  });

  it('render con datos válidos produce HTML no vacío con briefingUrl y contactoNombre', () => {
    const template = EMAIL_TEMPLATES['envio_briefing_cliente'];
    const data = {
      contactoNombre: 'Juan Pérez',
      briefingUrl: 'http://localhost:5173/briefing/abc123'
    };
    const rendered = template.render(data);

    expect(rendered.subject).toBeTruthy();
    expect(rendered.html).toBeTruthy();
    expect(rendered.text).toBeTruthy();

    // Contiene briefingUrl
    expect(rendered.html).toContain('http://localhost:5173/briefing/abc123');
    expect(rendered.text).toContain('http://localhost:5173/briefing/abc123');

    // Contiene contactoNombre
    expect(rendered.html).toContain('Juan Pérez');
    expect(rendered.text).toContain('Juan Pérez');
  });

  it('render produce HTML con tokens de marca SyS (Servicios y Sistemas)', () => {
    const template = EMAIL_TEMPLATES['envio_briefing_cliente'];
    const data = {
      contactoNombre: 'María García',
      briefingUrl: 'http://localhost:5173/briefing/xyz789'
    };
    const rendered = template.render(data);

    // Verifica que hay contenido de marca SyS en el HTML (layout o subject)
    const combined = rendered.html + rendered.subject;
    expect(combined).toMatch(/Servicios y Sistemas/i);
  });

  it('render produce texto plano no vacío', () => {
    const template = EMAIL_TEMPLATES['envio_briefing_cliente'];
    const data = {
      contactoNombre: 'Carlos López',
      briefingUrl: 'http://localhost:5173/briefing/tok999'
    };
    const rendered = template.render(data);
    expect(rendered.text.length).toBeGreaterThan(20);
  });

  it('datos inválidos → sendEmail devuelve fallido sin abrir SMTP', async () => {
    // briefingUrl no es URL válida → schema Zod rechaza
    const result = await sendEmail('envio_briefing_cliente', 'cliente@empresa.com', {
      contactoNombre: 'Test',
      briefingUrl: 'not-a-url' // inválido
    });
    expect(result.status).toBe('fallido');
    expect(result.logIds).toHaveLength(0);
    expect(result.error).toBeTruthy();
  });

  it('contactoNombre vacío → sendEmail devuelve fallido', async () => {
    const result = await sendEmail('envio_briefing_cliente', 'cliente@empresa.com', {
      contactoNombre: '', // inválido (min(1))
      briefingUrl: 'http://localhost:5173/briefing/abc'
    });
    expect(result.status).toBe('fallido');
    expect(result.logIds).toHaveLength(0);
  });
});
