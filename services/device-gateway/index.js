const express = require('express');
const { Kafka } = require('kafkajs');
const { propagation, context } = require('@opentelemetry/api');

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
  res.status(202).json({ accepted: true });
});

app.get('/health', (_, res) => res.json({ ok: true }));

(async () => {
  await producer.connect();
  app.listen(8080, () => console.log('device-gateway on :8080'));
})();
