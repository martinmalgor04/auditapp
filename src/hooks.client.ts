import { dev } from '$app/environment';

if (!dev && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW opcional si el navegador lo bloquea
    });
  });
}
