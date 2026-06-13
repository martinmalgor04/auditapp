<script lang="ts">
  import { page } from '$app/state';
  import { LOGO_VERT_URL } from '$lib/informe/render';

  const rateLimited = $derived(page.status === 429);
</script>

<svelte:head>
  <title>Servicios y Sistemas</title>
</svelte:head>

<!-- Pantalla amable branded (R2): misma para token inexistente/revocado/expirado. -->
<div class="informe-unavailable" data-testid="informe-unavailable">
  <img src={LOGO_VERT_URL} alt="Servicios y Sistemas" />
  <h1>
    {rateLimited ? 'Demasiados intentos' : 'Este enlace ya no está disponible'}
  </h1>
  <p>
    {rateLimited
      ? 'Esperá unos minutos y volvé a intentar.'
      : 'Si necesitás acceder al informe, escribinos y te enviamos un enlace nuevo.'}
  </p>
  <div class="contact">
    Servicios y Sistemas SRL · San Martín 1180, Corrientes · +54 3794 426022<br />
    <a href="mailto:info@serviciosysistemas.com.ar">info@serviciosysistemas.com.ar</a>
  </div>
</div>

<style>
  .informe-unavailable {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 28px;
    font-family: var(--sys-font, 'Montserrat', Arial, sans-serif);
    color: rgba(255, 255, 255, 0.88);
  }
  .informe-unavailable img {
    height: 90px;
    margin-bottom: 40px;
  }
  .informe-unavailable h1 {
    font-size: clamp(24px, 5vw, 36px);
    font-weight: 800;
    letter-spacing: -0.8px;
    color: #fff;
    margin-bottom: 16px;
  }
  .informe-unavailable p {
    font-size: 16px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.65);
    max-width: 480px;
  }
  .informe-unavailable .contact {
    margin-top: 48px;
    font-size: 13px;
    line-height: 2.2;
    color: rgba(255, 255, 255, 0.45);
  }
  .informe-unavailable .contact a {
    color: var(--sys-celeste);
    text-decoration: none;
  }
</style>
