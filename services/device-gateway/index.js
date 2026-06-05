const express = require('express');
const { Kafka } = require('kafkajs');
const { propagation, context } = require('@opentelemetry/api');
const pino = require('pino');

const log = pino();
const kafka = new Kafka({ clientId: 'device-gateway', brokers: [process.env.KAFKA_BROKER || 'kafka:9092'] });
const producer = kafka.producer();
const app = express();
app.use(express.json());

app.post('/ingest', async (req, res) => {
  const headers = {};
  propagation.inject(context.active(), headers);
  await producer.send({
    topic: 'telemetry.raw',
    messages: [{ value: JSON.stringify(req.body), headers }],
  });
  // Log dentro lo span HTTP attivo: pino vi inietta trace_id/span_id.
  log.info({ device_id: req.body && req.body.device_id }, 'ingest accepted');
  res.status(202).json({ accepted: true });
});

app.get('/health', (_, res) => res.json({ ok: true }));

(async () => {
  await producer.connect();
  app.listen(8080, () => log.info('device-gateway on :8080'));
})();
