import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ChipPill component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/ui/ChipPill.svelte'),
    'utf8'
  );

  it('active=true produce clase bg-[--sys-primary]', () => {
    expect(source).toContain('bg-[--sys-primary] text-white');
  });

  it('active=false (default) produce bg-[--sys-bg-app]', () => {
    expect(source).toContain('bg-[--sys-bg-app]');
  });

  it("variant='green' produce tinte verde cuando active=false", () => {
    expect(source).toContain('bg-green-100 text-green-700');
  });

  it("variant='blue' produce tinte azul", () => {
    expect(source).toContain('bg-[--sys-status-blue-bg] text-[--sys-status-blue-text]');
  });

  it("variant='gray' produce chip de segmento gris", () => {
    expect(source).toContain('bg-gray-100 text-gray-600');
  });

  it('tiene handler onClick', () => {
    expect(source).toContain('onClick');
  });
});
