/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        sys: {
          profundo: 'var(--sys-azul-profundo)',
          medio: 'var(--sys-azul-medio)',
          blanco: 'var(--sys-blanco)',
          offwhite: 'var(--sys-offwhite)',
          celeste: 'var(--sys-celeste)',
          electrico: 'var(--sys-azul-electrico)',
          verde: 'var(--sys-verde)',
          rojo: 'var(--sys-rojo)',
          naranja: 'var(--sys-naranja)',
          neutro: 'var(--sys-gris-neutro)'
        }
      },
      fontFamily: {
        sys: ['var(--sys-font)']
      },
      borderRadius: {
        sys: 'var(--sys-radius-cta)',
        'sys-app': 'var(--sys-radius-app)'
      }
    }
  },
  plugins: []
};
