import { record } from './store';

// Cross-origin verso il gateway Nginx (:8088), che fa reverse-proxy a
// device-gateway. È il "seam" dell'auth: qui in futuro si aggiungerà
// Authorization: Bearer. NON impostiamo altri header oltre a content-type, così
// il traceparent iniettato a livello di browser-context (e2e) sopravvive.
const GATEWAY = 'http://localhost:8088/ingest';

export async function send(payload) {
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  record({ ts: new Date().toISOString(), device_id: payload.device_id, status: res.status });
  return res.status;
}
