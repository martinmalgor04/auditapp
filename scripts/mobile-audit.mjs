#!/usr/bin/env node
// Captura mobile: recorre la app con viewport de celular, saca screenshots
// y reporta roturas (overflow horizontal, elementos fuera del viewport).
// Uso: node scripts/mobile-audit.mjs [--base http://localhost:5173] [--out artifacts/mobile]
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5173';
const OUT_ROOT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'artifacts/mobile';
const ONLY = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1].split(',')
  : null;
const AUDIT_ID = process.argv.includes('--audit-id')
  ? process.argv[process.argv.indexOf('--audit-id') + 1]
  : null;

const OUT = join(OUT_ROOT, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const DEVICE = devices['iPhone 13']; // 390x844, DPR 3, mobile + touch

const ADMIN = { email: 'admin@serviciosysistemas.com.ar', password: 'changeme-admin' };
const TECH = { email: 'facu@serviciosysistemas.com.ar', password: 'changeme-tech' };

async function login(page, creds) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Contraseña').fill(creds.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/tablero', { timeout: 30_000 });
}

// Análisis de roturas en la página actual
async function analyze(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    const horizontalOverflow = doc.scrollWidth > vw + 1;

    const offenders = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed') continue; // fixed puede salir intencionalmente (navs)
      // Se pasa del borde derecho o izquierdo del viewport
      if (r.right > vw + 1 || r.left < -1) {
        // Ignorar si está dentro de un ancestro con scroll horizontal propio (carrusel/tabla scrolleable)
        let p = el.parentElement;
        let contained = false;
        while (p) {
          const ps = getComputedStyle(p);
          if (/(auto|scroll)/.test(ps.overflowX) && p.scrollWidth > p.clientWidth) {
            contained = true;
            break;
          }
          p = p.parentElement;
        }
        if (contained) continue;
        const tag = el.tagName.toLowerCase();
        const cls = (el.className && typeof el.className === 'string')
          ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';
        const text = (el.textContent || '').trim().slice(0, 40);
        offenders.push({
          selector: `${tag}${cls}`,
          right: Math.round(r.right),
          left: Math.round(r.left),
          width: Math.round(r.width),
          text
        });
      }
    }
    // Deduplicar por selector+right
    const seen = new Set();
    const unique = offenders.filter((o) => {
      const k = `${o.selector}|${o.right}|${o.left}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 15);

    return {
      viewport: vw,
      scrollWidth: doc.scrollWidth,
      horizontalOverflow,
      offenders: unique
    };
  });
}

async function shoot(page, name, results) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(400);
  const analysis = await analyze(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  results.push({ page: name, url: page.url(), ...analysis });
  const flag = analysis.horizontalOverflow ? 'OVERFLOW' : (analysis.offenders.length ? 'OFFENDERS' : 'ok');
  console.log(`${flag.padEnd(10)} ${name}  (scrollWidth=${analysis.scrollWidth}, offenders=${analysis.offenders.length})`);
}

async function firstHref(page, selector) {
  const href = await page.locator(selector).first().getAttribute('href').catch(() => null);
  return href;
}

const results = [];
const browser = await chromium.launch();

async function runRole(label, creds, routesFn) {
  const context = await browser.newContext({ ...DEVICE, baseURL: BASE });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await login(page, creds);
    await routesFn(page);
  } catch (err) {
    console.error(`ERROR en rol ${label}:`, err.message);
    results.push({ page: `${label}__error`, error: err.message });
  } finally {
    await context.close();
  }
}

const want = (name) => !ONLY || ONLY.includes(name);

// ---- ADMIN ----
await runRole('admin', ADMIN, async (page) => {
  if (want('tablero')) { await page.goto(`${BASE}/tablero`); await shoot(page, 'admin_01_tablero', results); }

  if (want('auditoria-detalle') || want('form') || want('cierre') || want('reunion')) {
    let auditPath = AUDIT_ID ? `/auditorias/${AUDIT_ID}` : null;
    if (!auditPath) {
      await page.goto(`${BASE}/tablero`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const auditHref = await firstHref(page, 'a[href^="/auditorias/"]');
      if (auditHref && !auditHref.includes('/new')) auditPath = auditHref;
    }
    if (auditPath) {
      if (want('auditoria-detalle')) { await page.goto(`${BASE}${auditPath}`); await shoot(page, 'admin_02_auditoria_detalle', results); }
      if (want('form')) { await page.goto(`${BASE}${auditPath}/form`); await shoot(page, 'admin_03_form', results); }
      if (want('cierre')) { await page.goto(`${BASE}${auditPath}/cierre`); await shoot(page, 'admin_04_cierre', results); }
      if (want('reunion')) { await page.goto(`${BASE}${auditPath}/reunion`); await shoot(page, 'admin_13_reunion', results); }
    } else {
      console.log('(sin auditorías para detalle/form/cierre)');
    }
  }

  if (want('auditorias-new')) { await page.goto(`${BASE}/auditorias/new`); await shoot(page, 'admin_05_auditorias_new', results); }
  if (want('crm')) { await page.goto(`${BASE}/crm`); await shoot(page, 'admin_06_crm', results); }

  if (want('crm-ficha')) {
    await page.goto(`${BASE}/crm`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const crmHref = await firstHref(page, 'a[href^="/crm/"]');
    if (crmHref) { await page.goto(`${BASE}${crmHref}`); await shoot(page, 'admin_07_crm_ficha', results); }
  }

  if (want('mercado')) { await page.goto(`${BASE}/mercado`); await shoot(page, 'admin_08_mercado', results); }
  if (want('plantillas')) { await page.goto(`${BASE}/plantillas`); await shoot(page, 'admin_09_plantillas', results); }

  if (want('plantilla-detalle')) {
    await page.goto(`${BASE}/plantillas`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const tplHref = await firstHref(page, 'a[href^="/plantillas/"]');
    if (tplHref) { await page.goto(`${BASE}${tplHref}`); await shoot(page, 'admin_10_plantilla_detalle', results); }
  }

  if (want('usuarios')) { await page.goto(`${BASE}/usuarios`); await shoot(page, 'admin_11_usuarios', results); }
  if (want('perfil')) { await page.goto(`${BASE}/perfil`); await shoot(page, 'admin_12_perfil', results); }
});

// ---- TÉCNICO ----
await runRole('tech', TECH, async (page) => {
  if (want('tablero')) { await page.goto(`${BASE}/tablero`); await shoot(page, 'tech_01_tablero', results); }
  if (want('form')) {
    let auditPath = AUDIT_ID ? `/auditorias/${AUDIT_ID}` : null;
    if (!auditPath) {
      await page.goto(`${BASE}/tablero`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const auditHref = await firstHref(page, 'a[href^="/auditorias/"]');
      if (auditHref && !auditHref.includes('/new')) auditPath = auditHref;
    }
    if (auditPath) {
      await page.goto(`${BASE}${auditPath}`);
      await shoot(page, 'tech_02_auditoria_detalle', results);
      await page.goto(`${BASE}${auditPath}/form`);
      await shoot(page, 'tech_03_form', results);
    }
  }
  if (want('perfil')) { await page.goto(`${BASE}/perfil`); await shoot(page, 'tech_04_perfil', results); }
});

// ---- PÚBLICAS ----
{
  const context = await browser.newContext({ ...DEVICE, baseURL: BASE });
  const page = await context.newPage();
  if (want('login')) { await page.goto(`${BASE}/login`); await shoot(page, 'public_01_login', results); }
  if (want('briefing')) {
    await page.goto(`${BASE}/briefing/e2e-form-token-demo`);
    await shoot(page, 'public_02_briefing', results);
  }
  await context.close();
}

// ---- VIEWPORT ANGOSTO (360px, Android chico) — solo páginas clave ----
{
  const context = await browser.newContext({
    ...DEVICE,
    viewport: { width: 360, height: 740 },
    baseURL: BASE
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await login(page, ADMIN);
    if (want('tablero')) { await page.goto(`${BASE}/tablero`); await shoot(page, 'w360_01_tablero', results); }
    if (want('crm')) { await page.goto(`${BASE}/crm`); await shoot(page, 'w360_02_crm', results); }
    if (want('form') && AUDIT_ID) {
      await page.goto(`${BASE}/auditorias/${AUDIT_ID}/form`);
      await shoot(page, 'w360_03_form', results);
    }
  } catch (err) {
    console.error('ERROR en w360:', err.message);
  } finally {
    await context.close();
  }
}

await browser.close();

writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));
const broken = results.filter((r) => r.horizontalOverflow || (r.offenders && r.offenders.length > 0));
console.log(`\nScreenshots + reporte en: ${OUT}`);
console.log(`Páginas con roturas: ${broken.length}/${results.length}`);
if (broken.length) {
  for (const b of broken) {
    console.log(`- ${b.page}: overflow=${b.horizontalOverflow}, offenders=${b.offenders?.length ?? 0}`);
  }
}
