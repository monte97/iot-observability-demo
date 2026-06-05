const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

// SimpleSpanProcessor (not Batch): a test worker that exits quickly would
// lose spans buffered in an unflushed batch. Exporting synchronously per-span
// keeps the e2e trace reliable without a forceFlush dance.
const sdk = new NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter())],
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

module.exports = { sdk };
