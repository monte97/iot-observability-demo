import { reactive } from 'vue';

// Seam auth: interfaccia che keycloak-js riempirà nella fase Keycloak.
// Oggi è uno stub — nessun login configurato.
export const auth = reactive({
  isAuthenticated: false,
  user: null,
  init() {
    // Futuro: keycloak-js init({ onLoad: 'check-sso', pkceMethod: 'S256' }).
  },
  login() {
    console.info('[auth] login stub — Keycloak non ancora configurato');
  },
  logout() {
    console.info('[auth] logout stub');
  },
  token() {
    return null;
  },
});
