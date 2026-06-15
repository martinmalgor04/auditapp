import { describe, expect, it } from 'vitest';
import { extractJson } from '../src/lib/server/informe/claude';

describe('extractJson', () => {
  it('extrae el objeto ignorando preamble y markdown', () => {
    const text = 'Claro, acá va:\n```json\n{"a":1,"b":2}\n```';
    expect(extractJson(text)).toEqual({ a: 1, b: 2 });
  });

  it('toma el primer objeto balanceado aunque haya prosa con llaves después', () => {
    // Antes (lastIndexOf "}") esto rompía: el slice incluía " :)" final con "}".
    const text = '{"ok":true} ¡listo! que lo disfrutes :}';
    expect(extractJson(text)).toEqual({ ok: true });
  });

  it('respeta llaves dentro de strings del JSON', () => {
    const text = 'resultado: {"nota":"usar { y } con cuidado","n":3}';
    expect(extractJson(text)).toEqual({ nota: 'usar { y } con cuidado', n: 3 });
  });

  it('soporta objetos anidados', () => {
    const text = 'x {"a":{"b":{"c":1}}} y';
    expect(extractJson(text)).toEqual({ a: { b: { c: 1 } } });
  });

  it('lanza si no hay objeto JSON', () => {
    expect(() => extractJson('sin json acá')).toThrow();
  });
});
