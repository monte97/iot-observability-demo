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

// Monta SUBITO: la SPA è usabile da anonima, quindi non aspettiamo l'auth per
// mostrarla (se Keycloak è lento/giù, il check-sso può bloccarsi ~10s e la pagina
// resterebbe bianca). L'auth gira in background e, al completamento, lo stato
// reactive `auth` aggiorna l'header (sign in/out).
createApp(App).use(router).mount('#app');
auth.init().catch((e) => console.warn('[auth] init fallita, resto anonimo', e));
