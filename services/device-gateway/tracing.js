const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');

// Oltre alle tracce, esporta anche i log via OTLP. L'instrumentation-pino
// (inclusa negli auto-instrumentations) inietta trace_id/span_id nei record e
// li inoltra a questo LoggerProvider → Loki, abilitando la correlazione log↔trace.
const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()],
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
});
sdk.start();
