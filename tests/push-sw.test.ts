/**
 * Tests del service worker para push (#53).
 * Cubre: R7 (push→showNotification), R8 (notificationclick→openWindow), R15.
 *
 * El SW es JS puro (static/sw.js). Se evalúa en un contexto simulado de service worker.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const swSource = readFileSync(join(process.cwd(), 'static/sw.js'), 'utf8');

type ShowNotificationOptions = {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

type NotificationObj = {
  close: ReturnType<typeof vi.fn>;
  data?: { url?: string };
};

type ClientObj = {
  url: string;
  navigate: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
};

/** Crea un contexto mínimo de service worker para ejecutar el SW. */
function createSwContext() {
  const handlers: Record<string, ((event: Record<string, unknown>) => void)[]> = {};
  const showNotification = vi.fn<(title: string, opts: ShowNotificationOptions) => Promise<void>>();
  const openWindow = vi.fn<(url: string) => Promise<ClientObj>>();
  const matchAll = vi.fn<(opts: Record<string, unknown>) => Promise<ClientObj[]>>();

  const swContext = {
    self: {
      addEventListener(event: string, handler: (e: Record<string, unknown>) => void) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      location: { origin: 'https://app.example.com' },
      registration: { showNotification },
      clients: { matchAll, openWindow },
      skipWaiting: vi.fn(),
      caches: {
        open: vi.fn().mockResolvedValue({ addAll: vi.fn() }),
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        match: vi.fn().mockResolvedValue(undefined)
      }
    },
    caches: {
      open: vi.fn().mockResolvedValue({ addAll: vi.fn().mockResolvedValue(undefined) }),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(undefined)
    },
    URL: globalThis.URL,
    fetch: vi.fn(),
    Response: globalThis.Response,
    Request: globalThis.Request
  };

  return { handlers, showNotification, openWindow, matchAll, swContext };
}

function evalSw(swContext: ReturnType<typeof createSwContext>['swContext']) {
  const fn = new Function(
    'self',
    'caches',
    'URL',
    'fetch',
    'Response',
    'Request',
    swSource
  );
  fn(
    swContext.self,
    swContext.caches,
    swContext.URL,
    swContext.fetch,
    swContext.Response,
    swContext.Request
  );
}

function waitUntilPromise(event: Record<string, unknown>): Promise<void> | null {
  return (event as { _waitUntilPromise?: Promise<void> })._waitUntilPromise ?? null;
}

describe('push service worker — R7: push → showNotification', () => {
  let ctx: ReturnType<typeof createSwContext>;

  beforeEach(() => {
    ctx = createSwContext();
    evalSw(ctx.swContext);
  });

  it('registra el handler "push"', () => {
    expect(ctx.handlers['push']).toBeDefined();
    expect(ctx.handlers['push'].length).toBeGreaterThan(0);
  });

  it('R7: payload válido → showNotification con title y body correctos', async () => {
    const payload = {
      event: 'aviso_briefing_completado',
      title: 'SyS · Briefing completado',
      body: 'Briefing TEST-001 listo',
      url: '/auditorias/abc123',
      tag: 'aviso_briefing_completado:TEST-001'
    };

    let waitUntilProm: Promise<void> | undefined;
    const pushEvent = {
      data: {
        json: () => payload
      },
      waitUntil(p: Promise<void>) {
        waitUntilProm = p;
      }
    };

    ctx.handlers['push'][0](pushEvent as unknown as Record<string, unknown>);
    await waitUntilProm;

    expect(ctx.showNotification).toHaveBeenCalledWith(
      payload.title,
      expect.objectContaining({
        body: payload.body,
        icon: expect.stringContaining('icon')
      })
    );
  });

  it('R7: payload sin datos no rompe el SW (no lanza)', () => {
    const pushEvent = {
      data: null,
      waitUntil: vi.fn()
    };
    expect(() => {
      ctx.handlers['push'][0](pushEvent as unknown as Record<string, unknown>);
    }).not.toThrow();
    expect(ctx.showNotification).not.toHaveBeenCalled();
  });

  it('R7: payload JSON inválido no rompe el SW', () => {
    const pushEvent = {
      data: {
        json: () => {
          throw new SyntaxError('bad json');
        }
      },
      waitUntil: vi.fn()
    };
    expect(() => {
      ctx.handlers['push'][0](pushEvent as unknown as Record<string, unknown>);
    }).not.toThrow();
  });

  it('R7: ícono de la notificación apunta a brand SyS (icon-192.png)', async () => {
    const payload = {
      title: 'SyS · Test',
      body: 'Cuerpo de prueba',
      url: '/'
    };

    let waitUntilProm: Promise<void> | undefined;
    const pushEvent = {
      data: { json: () => payload },
      waitUntil(p: Promise<void>) {
        waitUntilProm = p;
      }
    };

    ctx.handlers['push'][0](pushEvent as unknown as Record<string, unknown>);
    await waitUntilProm;

    const callArgs = ctx.showNotification.mock.calls[0] as [string, ShowNotificationOptions];
    expect(callArgs[1].icon).toContain('icon-192.png');
  });
});

describe('push service worker — R8: notificationclick → openWindow', () => {
  let ctx: ReturnType<typeof createSwContext>;

  beforeEach(() => {
    ctx = createSwContext();
    evalSw(ctx.swContext);
  });

  it('registra el handler "notificationclick"', () => {
    expect(ctx.handlers['notificationclick']).toBeDefined();
  });

  it('R8: click abre la url del payload con openWindow cuando no hay ventana activa', async () => {
    ctx.matchAll.mockResolvedValue([]);
    ctx.openWindow.mockResolvedValue({
      url: 'https://app.example.com/auditorias/123',
      navigate: vi.fn(),
      focus: vi.fn()
    });

    const notification: NotificationObj = {
      close: vi.fn(),
      data: { url: '/auditorias/123' }
    };

    let waitUntilProm: Promise<void> | undefined;
    const clickEvent = {
      notification,
      waitUntil(p: Promise<void>) {
        waitUntilProm = p;
      }
    };

    ctx.handlers['notificationclick'][0](clickEvent as unknown as Record<string, unknown>);
    await waitUntilProm;

    expect(notification.close).toHaveBeenCalled();
    expect(ctx.openWindow).toHaveBeenCalledWith('/auditorias/123');
  });

  it('R8: click usa la ventana existente cuando la hay (misma origin)', async () => {
    const existingClient: ClientObj = {
      url: 'https://app.example.com/auditorias/otro',
      navigate: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue({} as ClientObj)
    };
    ctx.matchAll.mockResolvedValue([existingClient]);

    const notification: NotificationObj = {
      close: vi.fn(),
      data: { url: '/auditorias/123' }
    };

    let waitUntilProm: Promise<void> | undefined;
    const clickEvent = {
      notification,
      waitUntil(p: Promise<void>) {
        waitUntilProm = p;
      }
    };

    ctx.handlers['notificationclick'][0](clickEvent as unknown as Record<string, unknown>);
    await waitUntilProm;

    expect(notification.close).toHaveBeenCalled();
    expect(existingClient.navigate).toHaveBeenCalledWith('/auditorias/123');
    expect(existingClient.focus).toHaveBeenCalled();
    expect(ctx.openWindow).not.toHaveBeenCalled();
  });
});
