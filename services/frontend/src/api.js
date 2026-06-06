import { record } from './store';
import { auth } from './auth';

// Same-origin: SPA e API condividono l'origin :8090. La nginx della SPA (edge)
// proxa /ingest al device-gateway, quindi niente CORS. Path relativo, così
// funziona dietro qualsiasi host/porta. Se l'utente è loggato (Keycloak),
// allega l'access token come Authorization: Bearer; da anonimo non lo allega.
// NB (demo): il device-gateway NON valida il token — il Bearer serve a mostrare
// la propagazione/cucitura della trace, non come authZ. In produzione l'endpoint
// verificherebbe la firma JWT (JWKS Keycloak) e rifiuterebbe le richieste anonime.
const INGEST = '/ingest';

export async function send(payload) {
  const headers = { 'content-type': 'application/json' };
  const t = await auth.token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(INGEST, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  record({ ts: new Date().toISOString(), device_id: payload.device_id, status: res.status });
  return res.status;
}
