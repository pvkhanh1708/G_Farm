/**
 * Home-screen install support. Android/Chrome fires `beforeinstallprompt`, which
 * we keep so a button can open the real install dialog later. iOS Safari has no
 * such API: the player adds the app via Share -> "Add to Home Screen", so the UI
 * shows those steps instead. Either way the app then opens fullscreen
 * (manifest.webmanifest + the apple-mobile-web-app-* meta tags).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export const pwa = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  /** Already running from the home screen. */
  get installed(): boolean {
    return (
      matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  },

  /** iPhone/iPad (iPadOS reports itself as a Mac with touch). */
  get ios(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  /** The browser offered a native install dialog we can open. */
  get canPrompt(): boolean {
    return deferred !== null;
  },

  /** Opens the native install dialog; resolves true if the player accepted. */
  async prompt(): Promise<boolean> {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    notify();
    await e.prompt();
    return (await e.userChoice).outcome === 'accepted';
  },

  register() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // keep it for our own button instead of the mini-infobar
      deferred = e as BeforeInstallPromptEvent;
      notify();
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      notify();
    });
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
  },
};
