import './tracing'; // OTel Web: deve girare per primo (patcha window.fetch)
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { send } from './api';
import { auth } from './auth';

// Contratto e2e: window.__send deve esistere ed essere indipendente dal ciclo
// di vita dei componenti Vue. send() è una funzione pura (non dipende dal mount),
// quindi la esponiamo PRIMA di montare l'app: anche se il mount fallisse,
// l'e2e troverebbe comunque il trigger. Payload e2e-default.
window.__send = () => send({ device_id: 'browser-e2e', value: 1 });

// Inizializza l'auth (check-sso, non forzante) prima del mount; se Keycloak non
// è raggiungibile, proseguiamo da anonimi senza bloccare l'app.
(async () => {
  try {
    await auth.init();
  } catch (e) {
    console.warn('[auth] init fallita, proseguo da anonimo', e);
  }
  createApp(App).use(router).mount('#app');
})();
