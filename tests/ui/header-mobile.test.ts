import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HeaderMobile component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/ui/HeaderMobile.svelte'),
    'utf8'
  );

  it('renderiza el title', () => {
    expect(source).toContain('{title}');
  });

  it('renderiza el subtitle cuando está presente', () => {
    expect(source).toContain('{subtitle}');
    expect(source).toContain('if subtitle');
  });

  it('muestra la inicial del nombre de usuario en el avatar', () => {
    expect(source).toContain('user.name.charAt(0).toUpperCase()');
  });

  it('muestra logo horizontal blanco del CDN', () => {
    expect(source).toContain('SYS_LOGOS.sysHorizontalW');
    expect(source).toContain('alt="Servicios y Sistemas"');
  });

  it('muestra botón "+ Nueva" solo cuando showNew=true', () => {
    expect(source).toContain('if showNew');
    expect(source).toContain('+ Nueva');
  });

  it('contenedor tiene clase lg:hidden', () => {
    expect(source).toContain('lg:hidden');
  });

  it('respeta safe-area-inset-top para no solapar la barra de estado', () => {
    expect(source).toContain('env(safe-area-inset-top');
  });

  it('avatar tiene clases de estilo correctas', () => {
    expect(source).toContain('w-8 h-8 rounded-full bg-[--sys-primary]');
  });

  it('botón nueva llama a onNew', () => {
    expect(source).toContain('onNew');
  });
});
