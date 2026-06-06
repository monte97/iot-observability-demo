// OTel Web: strumenta la SPA nel browser. Genera span reali del browser
// (document-load + ogni fetch) e propaga il traceparent verso /ingest e verso
// Keycloak (/auth): la traccia parte dal browser, arriva al backend e si cuce
// con lo span server di Keycloak — senza il test e2e.
import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Export same-origin: la nginx della SPA proxa /v1/ al collector (niente CORS).
// L'exporter del browser vuole un URL assoluto, quindi lo costruisco dall'origin.
// NB: senza `headers` nel config l'exporter usa navigator.sendBeacon → l'export
// sopravvive all'unload (il forceFlush su pagehide qui sotto è affidabile).
// Aggiungere `headers` lo farebbe regredire a XHR async, inaffidabile all'unload.
const exporter = new OTLPTraceExporter({ url: `${window.location.origin}/v1/traces` });

const provider = new WebTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'frontend-spa' }),
  // Batch corto: lo span della POST /token (una fetch di keycloak-js) si crea
  // attorno al redirect di login e col delay di default (5s) andrebbe perso prima
  // dell'export → la cucitura browser→Keycloak arriverebbe "monca" (solo il lato
  // server di Keycloak, senza il parent del browser che radica la trace).
  spanProcessors: [new BatchSpanProcessor(exporter, { scheduledDelayMillis: 1000 })],
});
provider.register({ contextManager: new ZoneContextManager() });

// Flush su uscita pagina: esporta gli span appena prima che il browser navighi
// via (es. click "sign in" → redirect a Keycloak).
window.addEventListener('pagehide', () => provider.forceFlush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') provider.forceFlush();
});

registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    // keycloak-js 26.x usa window.fetch per la POST /token (e per il refresh):
    // è la FetchInstrumentation a iniettare il traceparent. Essendo same-origin
    // (/auth via proxy) la propagazione è di default e senza CORS → la traccia
    // si cuce con lo span server di Keycloak.
    new FetchInstrumentation({
      // non tracciare la fetch dell'export OTLP stesso (evita auto-telemetria)
      ignoreUrls: [/\/v1\//],
    }),
  ],
});
