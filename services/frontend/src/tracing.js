// OTel Web: strumenta la SPA nel browser. Genera span reali del browser
// (document-load + ogni fetch) e propaga il traceparent verso /ingest, così la
// traccia parte dal browser e arriva fino al backend — senza il test e2e.
import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Export same-origin: la nginx della SPA proxa /v1/ al collector (niente CORS).
// L'exporter del browser vuole un URL assoluto, quindi lo costruisco dall'origin
// corrente (resta same-origin a prescindere da host/porta).
const exporter = new OTLPTraceExporter({ url: `${window.location.origin}/v1/traces` });

const provider = new WebTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'frontend-spa' }),
  spanProcessors: [new BatchSpanProcessor(exporter)],
});
provider.register({ contextManager: new ZoneContextManager() });

registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new FetchInstrumentation({
      // non tracciare la fetch dell'export OTLP stesso (evita auto-telemetria)
      ignoreUrls: [/\/v1\//],
    }),
  ],
});
