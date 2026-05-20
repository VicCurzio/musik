/**
 * PWA install helpers — Android (beforeinstallprompt) e instrucciones iOS.
 */

/** @type {BeforeInstallPromptEvent|null} */
let deferredPrompt = null;

export function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/** @returns {'ios'|'android'|'other'} */
export function getPlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

/** @returns {Promise<boolean>} */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function getInstallHint() {
  const platform = getPlatform();
  if (isStandalone()) {
    return { type: 'installed', message: 'Musik ya está instalada en tu pantalla de inicio.' };
  }
  if (platform === 'ios') {
    return {
      type: 'ios',
      message:
        'En Safari: tocá el botón Compartir (cuadrado con flecha) y elegí «Añadir a pantalla de inicio».',
    };
  }
  if (platform === 'android' && canPromptInstall()) {
    return { type: 'prompt', message: 'Podés instalar Musik como app en tu teléfono.' };
  }
  if (platform === 'android') {
    return {
      type: 'android-manual',
      message:
        'En Chrome: menú ⋮ (arriba a la derecha) → «Instalar aplicación» o «Añadir a pantalla de inicio».',
    };
  }
  return {
    type: 'desktop',
    message: 'En Chrome o Edge: icono de instalar en la barra de direcciones.',
  };
}
