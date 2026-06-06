// OTel Web: strumenta la SPA nel browser. Genera span reali del browser
// (document-load + ogni fetch) e propaga il traceparent verso /ingest, così la
// traccia parte dal browser e arriva fino al backend — senza il test e2e.
import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Export same-origin: la nginx della SPA proxa /v1/ al collector (niente CORS).
// L'exporter del browser vuole un URL assoluto, quindi lo costruisco dall'origin
// corrente (resta same-origin a prescindere da host/porta).
const exporter = new OTLPTraceExporter({ url: `${window.location.origin}/v1/traces` });

const provider = new WebTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'frontend-spa' }),
  // Batch corto: gli span creati subito prima di una navigazione (il redirect
  // di login OIDC, la POST /token) verrebbero persi col delay di default (5s).
  spanProcessors: [new BatchSpanProcessor(exporter, { scheduledDelayMillis: 1000 })],
});
provider.register({ contextManager: new ZoneContextManager() });

// Flush su uscita pagina: assicura l'export degli span appena prima che il
// browser navighi via (es. click "sign in" -> redirect a Keycloak).
window.addEventListener('pagehide', () => provider.forceFlush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') provider.forceFlush();
});

registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new FetchInstrumentation({
      // non tracciare la fetch dell'export OTLP stesso (evita auto-telemetria)
      ignoreUrls: [/\/v1\//],
    }),
    // keycloak-js usa XHR per la POST /token: senza questa instrumentation il
    // traceparent non verrebbe iniettato e la cucitura browser->Keycloak non
    // avverrebbe. Same-origin (/auth via proxy) => propagazione di default.
    new XMLHttpRequestInstrumentation({
      ignoreUrls: [/\/v1\//],
    }),
  ],
});
