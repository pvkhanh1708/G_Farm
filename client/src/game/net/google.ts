/**
 * "Sign in with Google" via Google Identity Services. The button returns an ID
 * token (credential) that the API verifies; no Google secret lives in the client.
 * Needs VITE_GOOGLE_CLIENT_ID (an OAuth "Web application" client whose authorized
 * JavaScript origins include this site).
 */

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean; use_fedcm_for_button?: boolean }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}
type G = { accounts: { id: GoogleId } };

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

let loading: Promise<G> | null = null;

function loadScript(): Promise<G> {
  loading ??= new Promise((resolve, reject) => {
    const w = window as unknown as { google?: G };
    if (w.google?.accounts) return resolve(w.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google?.accounts ? resolve(w.google) : reject(new Error('GIS unavailable')));
    s.onerror = () => {
      loading = null;
      reject(new Error('Không tải được Google Sign-In'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Render Google's own button into `el`; `onCredential` receives the ID token. */
export async function renderGoogleButton(el: HTMLElement, onCredential: (credential: string) => void) {
  const g = await loadScript();
  g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onCredential(r.credential), ux_mode: 'popup', use_fedcm_for_button: true });
  g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'vi', width: Math.min(300, el.clientWidth || 300) });
}
