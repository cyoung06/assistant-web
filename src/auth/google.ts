// Single-user sign-in with Google Identity Services. The API accepts the Google ID token as a bearer token.
// When VITE_GOOGLE_CLIENT_ID is not set (local development), no token is sent.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const STORAGE_KEY = "assistant.idToken";

export const authEnabled = Boolean(CLIENT_ID);

type Listener = (signedIn: boolean) => void;
const listeners = new Set<Listener>();

let token: string | null = readStoredToken();

function readStoredToken(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored && !isExpired(stored) ? stored : null;
  } catch {
    return null;
  }
}

function isExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    // Treat tokens as expired a minute early so requests don't race the expiry.
    return payload.exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

function setToken(value: string | null) {
  token = value;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the in-memory token still works.
  }
  listeners.forEach((l) => l(value !== null));
}

export function currentToken(): string | null {
  if (token && isExpired(token)) setToken(null);
  return token;
}

export function isSignedIn(): boolean {
  return !authEnabled || currentToken() !== null;
}

export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called when the API rejects the token. */
export function signOut() {
  setToken(null);
}

let gisLoaded: Promise<void> | null = null;

function loadGis(): Promise<void> {
  gisLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(script);
  });
  return gisLoaded;
}

/** Renders Google's sign-in button into [element] and tries silent sign-in. */
export async function renderSignIn(element: HTMLElement) {
  await loadGis();
  const google = (window as unknown as { google: GoogleIdentity }).google;
  google.accounts.id.initialize({
    client_id: CLIENT_ID!,
    auto_select: true,
    callback: (response) => setToken(response.credential),
  });
  google.accounts.id.renderButton(element, { theme: "outline", size: "large", shape: "pill" });
  google.accounts.id.prompt();
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: { client_id: string; auto_select: boolean; callback: (r: { credential: string }) => void }): void;
      renderButton(element: HTMLElement, options: Record<string, string>): void;
      prompt(): void;
    };
  };
}
