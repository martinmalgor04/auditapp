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
        },
        'sys-primary': 'var(--sys-primary)',
        'sys-navy': 'var(--sys-navy)',
        'sys-navy-mid': 'var(--sys-navy-mid)',
        'sys-bg-app': 'var(--sys-bg-app)',
        'sys-surface': 'var(--sys-surface)',
        'sys-border': 'var(--sys-border)',
        'sys-text-primary': 'var(--sys-text-primary)',
        'sys-text-secondary': 'var(--sys-text-secondary)',
        'sys-text-muted': 'var(--sys-text-muted)',
        'sys-text-faint': 'var(--sys-text-faint)',
        'sys-text-navy-muted': 'var(--sys-text-navy-muted)',
        'sys-status-green': 'var(--sys-status-green)',
        'sys-status-amber': 'var(--sys-status-amber)',
        'sys-status-red': 'var(--sys-status-red)',
        'sys-status-blue-bg': 'var(--sys-status-blue-bg)',
        'sys-status-blue-text': 'var(--sys-status-blue-text)'
      },
      fontFamily: {
        sys: ['var(--sys-font)'],
        'sys-base': ['var(--sys-font-base)']
      },
      borderRadius: {
        sys: 'var(--sys-radius-cta)',
        'sys-app': 'var(--sys-radius-app)'
      },
      boxShadow: {
        'sys-sm': 'var(--sys-shadow-sm)',
        'sys-card': 'var(--sys-shadow-card)',
        'sys-header': 'var(--sys-shadow-header)',
        'sys-btn': 'var(--sys-shadow-btn)',
        'sys-focus': 'var(--sys-shadow-focus)'
      }
    }
  },
  plugins: []
};
