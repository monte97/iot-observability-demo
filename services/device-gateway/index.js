const express = require('express');
const { Kafka } = require('kafkajs');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const pino = require('pino');

const log = pino();
const kafka = new Kafka({ clientId: 'device-gateway', brokers: [process.env.KAFKA_BROKER || 'kafka:9092'] });
const producer = kafka.producer();
const app = express();
app.use(express.json());

// Validazione del JWT contro Keycloak. Split-horizon: il JWKS si scarica dall'URL
// INTERNO (keycloak:8080, raggiungibile nella rete docker), ma l'issuer atteso è
// quello PUBBLICO (:8090/auth) perché è l'URL che browser e device vedono e che
// finisce nel claim `iss` del token. Verifichiamo firma + issuer + scadenza.
const JWKS = createRemoteJWKSet(
  new URL(process.env.JWKS_URI || 'http://keycloak:8080/auth/realms/iot-demo/protocol/openid-connect/certs'),
);
const ISSUER = process.env.OIDC_ISSUER || 'http://localhost:8090/auth/realms/iot-demo';

async function requireAuth(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/i);
  if (!m) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const { payload } = await jwtVerify(m[1], JWKS, { issuer: ISSUER });
    req.sub = payload.sub; // service account (device) o utente (browser)
    next();
  } catch (e) {
    log.warn({ err: e.code || e.message }, 'token rifiutato');
    res.status(401).json({ error: 'invalid token' });
  }
}

app.post('/ingest', requireAuth, async (req, res) => {
  // kafkajs è auto-strumentato: crea lo span producer e inietta il traceparent
  // negli header del record da solo. Niente inject manuale.
  await producer.send({
    topic: 'telemetry.raw',
    messages: [{ value: JSON.stringify(req.body) }],
  });
  // Log dentro lo span HTTP attivo: pino vi inietta trace_id/span_id.
  log.info({ device_id: req.body && req.body.device_id, sub: req.sub }, 'ingest accepted');
  res.status(202).json({ accepted: true });
});

app.get('/health', (_, res) => res.json({ ok: true }));

(async () => {
  await producer.connect();
  app.listen(8080, () => log.info('device-gateway on :8080'));
})();
