import { createRouter, createWebHistory } from 'vue-router';
import SendView from './views/SendView.vue';
import HistoryView from './views/HistoryView.vue';
import CallbackView from './views/CallbackView.vue';

// /callback è il redirect URI predisposto per il futuro flusso OIDC (oggi stub).
export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'send', component: SendView },
    { path: '/history', name: 'history', component: HistoryView },
    { path: '/callback', name: 'callback', component: CallbackView },
  ],
});
