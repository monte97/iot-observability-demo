const { test, expect } = require('@playwright/test');
const { trace } = require('@opentelemetry/api');
const { sdk } = require('./otel.setup');

// /ingest ora valida il JWT (Keycloak). Il test agisce come un "device": ottiene
// un token via client-credentials (client confidenziale iot-device) e lo allega.
async function deviceToken() {
  const res = await fetch('http://localhost:8090/auth/realms/iot-demo/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=iot-device&client_secret=device-secret',
  });
  if (!res.ok) throw new Error('token request failed: ' + res.status);
  return (await res.json()).access_token;
}

test('ingest end-to-end (browser SPA -> backend, single-origin, autenticato)', async ({ page }) => {
  const tracer = trace.getTracer('e2e');
  const token = await deviceToken();

  await tracer.startActiveSpan('e2e:ingest', async (span) => {
    // traceparent per radicare la trace del *test*; Authorization perché /ingest
    // ora richiede un JWT valido (il device si autentica via client-credentials).
    // La SPA si auto-strumenta (OTel Web), quindi l'iniezione del traceparent è
    // ridondante per i veri utenti — qui serve solo a radicare la trace del test.
    const sc = span.spanContext();
    const tp = `00-${sc.traceId}-${sc.spanId}-0${sc.traceFlags.toString(16)}`;
    await page.context().setExtraHTTPHeaders({ traceparent: tp, Authorization: `Bearer ${token}` });

    // Real browser hitting the SPA on :8090 (same-origin: SPA + /ingest proxy).
    await page.goto('http://localhost:8090');

    // Fire the same-origin fetch; returns the backend HTTP status (202).
    const status = await page.evaluate(() => window.__send());
    expect(status).toBe(202);

    span.end();
  });
});

// SimpleSpanProcessor exports each span synchronously, so no forceFlush is
// needed; just shut the SDK down cleanly when the suite finishes.
test.afterAll(async () => {
  try {
    await sdk.shutdown();
  } catch (_) {}
});
