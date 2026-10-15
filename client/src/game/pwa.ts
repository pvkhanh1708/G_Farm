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

  /**
   * iOS home-screen apps with a translucent status bar size the page to the
   * screen minus the status bar while drawing from the very top, which leaves a
   * strip at the bottom that neither 100% nor 100vh covers. Size the page to
   * the real screen instead (the HUD already pads by the safe-area insets).
   */
  fitIosStandalone() {
    if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return;
    const root = document.documentElement;
    root.classList.add('ios-standalone');
    const fit = () => {
      const portrait = matchMedia('(orientation: portrait)').matches;
      const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      root.style.setProperty('--app-h', `${Math.max(innerHeight, full)}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    // the page is now taller than iOS's (short) viewport: keep it pinned instead of position:fixed
    window.addEventListener('scroll', () => (window.scrollX || window.scrollY) && window.scrollTo(0, 0), { passive: true });
    // iOS reports the new size a moment after rotating
    window.addEventListener('orientationchange', () => setTimeout(fit, 350));
  },

  register() {
    this.fitIosStandalone();
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
