/**
 * PWA install helpers — Android (beforeinstallprompt) e instrucciones iOS.
 */

/**
 * `beforeinstallprompt` no está en los tipos del DOM: es una propuesta que solo
 * implementan los navegadores basados en Chromium. Se declara lo que se usa.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** En iOS, Safari marca la app instalada con una propiedad propia. */
type NavigatorWithStandalone = Navigator & { standalone?: boolean };

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function initPwaInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

export function getPlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export function canPromptInstall(): boolean {
  return !!deferredPrompt;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export interface InstallHint {
  type: 'installed' | 'ios' | 'prompt' | 'android-manual' | 'desktop';
  message: string;
}

export function getInstallHint(): InstallHint {
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
