import { reactive } from 'vue';
import Keycloak from 'keycloak-js';

// Keycloak servito same-origin dietro l'edge nginx (/auth), così il flusso OIDC
// (e la POST /token) resta same-origin :8090: il traceparent del browser viaggia
// fino a Keycloak senza CORS e lo span server si cuce con la trace.
const kc = new Keycloak({
  url: window.location.origin + '/auth',
  realm: 'iot-demo',
  clientId: 'iot-frontend',
});

export const auth = reactive({
  isAuthenticated: false,
  user: null,

  async init() {
    // check-sso NON forza il login: la SPA resta usabile da anonima (load-gen ed
    // e2e continuano a girare senza token). Authorization Code + PKCE S256.
    const ok = await kc.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
    });
    this.isAuthenticated = !!ok;
    this.user = kc.tokenParsed?.preferred_username || null;
    kc.onAuthSuccess = () => {
      this.isAuthenticated = true;
      this.user = kc.tokenParsed?.preferred_username || null;
    };
    kc.onAuthLogout = () => {
      this.isAuthenticated = false;
      this.user = null;
    };
    kc.onTokenExpired = () => kc.updateToken(30).catch(() => kc.login());
  },

  login() {
    return kc.login();
  },

  logout() {
    return kc.logout({ redirectUri: window.location.origin });
  },

  // Ritorna un access token valido (refresh se sta per scadere), o null da anonimo.
  async token() {
    if (!kc.authenticated) return null;
    try {
      await kc.updateToken(30);
    } catch {
      return null;
    }
    return kc.token || null;
  },
});
