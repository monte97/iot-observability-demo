import { record } from './store';

// Same-origin: SPA e API condividono l'origin :8090. La nginx della SPA (edge)
// proxa /ingest al device-gateway, quindi niente CORS. È il "seam" dell'auth:
// qui in futuro si aggiungerà Authorization: Bearer (Keycloak). Path relativo,
// così funziona dietro qualsiasi host/porta senza riconfigurare il client.
const INGEST = '/ingest';

export async function send(payload) {
  const res = await fetch(INGEST, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  record({ ts: new Date().toISOString(), device_id: payload.device_id, status: res.status });
  return res.status;
}
