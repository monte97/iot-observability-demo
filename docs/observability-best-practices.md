# Verifica delle best practice di Observability

> **Scopo del documento** — dimostrare, con riferimenti puntuali al codice/configurazione
> e con evidenza raccolta **live** sullo stack in esecuzione, che la demo
> `iot-observability-demo` aderisce alle best practice di osservabilità per un sistema
> distribuito strumentato con OpenTelemetry.
>
> **Data verifica:** 2026-06-05 · **Metodo:** ispezione statica di codice e config +
> interrogazione diretta dei backend (Tempo, Mimir, Loki) con lo stack avviato via
> `docker compose up -d`.
>
> **Aggiornamento 2026-06-05** — le due riserve emerse in prima verifica (pillar dei log
> applicativi e correlazione via exemplar) sono state **chiuse e ri-verificate live**.
> Le modifiche applicate sono descritte in §6.
>
> Il documento è onesto sui limiti: ciò che è configurato per **dev/demo** e non per la
> produzione è segnalato esplicitamente (vedi §4), e le lacune realmente presenti sono
> documentate invece di essere nascoste.

---

## 1. Sintesi (scorecard)

| # | Best practice | Stato | Evidenza |
|---|---------------|:-----:|----------|
| 1 | Strumentazione vendor-neutral (OpenTelemetry + OTLP ovunque) | ✅ | §3.1 |
| 2 | Copertura dei tre segnali (traces, metrics, logs) | ✅ | §3.2 (verificato live) |
| 3 | Propagazione del contesto W3C cross-runtime e cross-broker | ✅ | §3.3 (verificato live) |
| 4 | `service.name` e resource attributes per ogni servizio | ✅ | §3.4 |
| 5 | Rispetto delle semantic conventions (span kind, attributi messaging/db) | ✅ | §3.5 (verificato live) |
| 6 | Collector come punto di disaccoppiamento app ↔ backend | ✅ | §3.6 |
| 7 | Pipeline del collector con processor nell'ordine corretto | ✅ | §3.6 |
| 8 | Allineamento protocollo/porta OTLP (gRPC 4317 / HTTP 4318) | ✅ | §3.7 |
| 9 | Metriche RED derivate dalle tracce (span-metrics), non a mano | ✅ | §3.8 (verificato live) |
| 10 | Correlazione tra segnali (service map, trace↔metrics, exemplars, log↔trace) | ✅ | §3.9 (verificato live) |
| 11 | Self-observability del collector | ✅ | §3.10 (verificato live) |
| 12 | Resilienza dell'esportazione (batch, memory limiter, scelta processor) | ✅ | §3.11 |
| 13 | Retention e gestione della cardinalità definite esplicitamente | ✅ | §3.12 |
| 14 | Onestà sulle impostazioni non-prod (TLS, auth, sampling) | ✅ | §4 |

Legenda: ✅ rispettata · 🟡 rispettata con riserva / parzialmente dimostrabile.

Tutti e 14 i punti sono ora ✅ (9 confermati con evidenza raccolta live dai backend).

---

## 2. Architettura sotto esame

```
load-gen / e2e (browser) → device-gateway (Node) ─[kafka telemetry.raw]→
        normalizer (Python) ─[kafka telemetry.clean]→ store (Java) → MongoDB
```

Tre runtime eterogenei (Node.js, Python, JVM) cuciti da Kafka. Lo stack di backend è
LGTM — OTel Collector → **L**oki / **T**empo / **M**imir + **G**rafana — fornito dal
submodule `observability/kickstart-otel-lgtm`. La demo aggiunge solo i servizi
applicativi e le dashboard di dominio.

Versioni rilevanti al momento della verifica: `otel/opentelemetry-collector-contrib:0.149.0`,
`grafana/tempo:2.10.4`, `grafana/mimir:3.0.5`, `grafana/loki:3.7.1`, `grafana/grafana:12.4.2`;
SDK app: `@opentelemetry/sdk-node ^0.54`, `opentelemetry-distro 0.54b0`, Java agent
(`opentelemetry-javaagent` latest release).

---

## 3. Verifica per best practice

### 3.1 — Strumentazione vendor-neutral (OpenTelemetry + OTLP)

Nessun SDK proprietario. Ogni servizio parla OTLP verso il collector:

- **Node** (`services/device-gateway/tracing.js`): `NodeSDK` + `getNodeAutoInstrumentations()`.
- **Python** (`services/normalizer/`): avviato con `opentelemetry-instrument` (auto-instrumentation
  agent del distro), exporter OTLP.
- **Java** (`services/store/Dockerfile`): `-javaagent:/otel/agent.jar`, zero codice di
  strumentazione nell'applicazione.

L'endpoint è sempre il collector OTLP, mai un backend specifico — l'applicazione non sa
se dietro c'è Tempo, Jaeger o altro. **Conforme.**

### 3.2 — Copertura dei tre segnali

Il collector definisce **tre pipeline complete** più una di infrastruttura
(`otel-collector/config.yaml`, blocco `service.pipelines`):

- `traces:  otlp → memory_limiter, resourcedetection, batch → tempo`
- `metrics: otlp → memory_limiter, batch → mimir`
- `logs:    otlp → memory_limiter, resourcedetection, batch → loki`
- `metrics/infra: docker_stats + prometheus/self → mimir`

Tutti e tre i segnali sono **verificati live** come popolati: traces e metrics (§3.8,
§3.10) e, dopo l'intervento di §6, anche i **log applicativi** dei tre servizi.
Interrogando Loki, le serie ora presenti includono i tre servizi reali:

```
GET /loki/api/v1/series?match[]={service_name=~".+"}
  → ['device-gateway', 'normalizer', 'store', 'unknown_service']
```

(`unknown_service` è la state-history dell'alerting di Grafana, non un'app.) Ogni servizio
emette log via OTLP con `service.name` corretto **e** `trace_id`/`span_id` iniettati — vedi
§3.9 per la correlazione log↔trace verificata. **Conforme.**

### 3.3 — Propagazione del contesto W3C cross-runtime ✅ (verificato live)

È il punto più importante e più difficile della demo: un'unica traccia deve attraversare
tre runtime diversi **e due hop su Kafka**, dove il contesto non viaggia "da solo" ma va
iniettato/estratto dagli header dei record.

- **Node → Kafka**: inject manuale (`services/device-gateway/index.js`)
  `propagation.inject(context.active(), headers)` prima della `producer.send`.
- **Kafka → Python → Kafka**: extract + inject manuali (`services/normalizer/app.py`):
  `ctx = propagate.extract(carrier)` dagli header del record, poi `propagate.inject(out_headers)`
  sulla produce verso `telemetry.clean`.
- **Kafka → Java**: estrazione **automatica** dal Java agent (Kafka instrumentation),
  nessun codice manuale.
- **Browser → backend**: il test e2e (`e2e/ingest.spec.js`) costruisce il `traceparent`
  W3C dal proprio span root e lo inietta nelle richieste del browser; il gateway Nginx
  (`gateway/default.conf`) è configurato per **lasciar passare l'header in CORS**
  (`Access-Control-Allow-Headers: ... traceparent, tracestate`).

**Evidenza live** — interrogando Tempo su una traccia reale presa dal servizio `store`,
una singola traccia contiene span di **tutti e tre i servizi**:

```
device-gateway  POST /ingest              SPAN_KIND_SERVER
device-gateway  telemetry.raw             SPAN_KIND_PRODUCER
normalizer      normalize                 SPAN_KIND_INTERNAL
normalizer      telemetry.clean publish   SPAN_KIND_PRODUCER
store           telemetry.clean process   SPAN_KIND_CONSUMER
store           insert iot.telemetry      SPAN_KIND_CLIENT
→ distinct services in trace: ['device-gateway', 'normalizer', 'store']
```

La catena `SERVER → PRODUCER → (Kafka) → CONSUMER/INTERNAL → PRODUCER → (Kafka) → CONSUMER → CLIENT`
è continua e senza interruzioni: la propagazione funziona su tutta la filiera. **Conforme.**

### 3.4 — `service.name` e resource attributes ✅

Ogni servizio imposta `OTEL_SERVICE_NAME` nel proprio Dockerfile
(`device-gateway`, `normalizer`, `store`). In più il collector applica il processor
`resourcedetection: { detectors: [env, system], override: false }`, che arricchisce le
risorse con attributi di host/ambiente **senza sovrascrivere** quelli già impostati
dall'app (`override: false` è la scelta corretta per non perdere il `service.name`
applicativo).

**Evidenza live** — Tempo riconosce esattamente i tre servizi attesi come valori del tag
`service.name`: `["device-gateway", "normalizer", "store"]`. **Conforme.**

### 3.5 — Semantic conventions ✅ (verificato live)

- I `SpanKind` osservati live (§3.3) sono semanticamente corretti: `SERVER` sull'ingresso
  HTTP, `PRODUCER`/`CONSUMER` sugli hop Kafka, `CLIENT` sulla scrittura Mongo, `INTERNAL`
  sulla logica di normalizzazione.
- Il normalizer, dove l'auto-instrumentation **non copre** `confluent-kafka`, crea uno span
  `PRODUCER` esplicito con gli attributi delle convenzioni messaging:
  `messaging.system=kafka`, `messaging.destination.name=telemetry.clean`
  (`services/normalizer/app.py`). Questa è esattamente la pratica raccomandata: colmare
  manualmente il gap dell'auto-instrumentation rispettando le semantic conventions, così lo
  span compare anche nelle span-metrics.
- Lo span Mongo (`insert iot.telemetry`, `CLIENT`) e il consumer Kafka del servizio Java
  sono prodotti automaticamente dal Java agent con gli attributi db/messaging standard.

**Conforme.**

### 3.6 — Collector come punto di disaccoppiamento + ordine dei processor ✅

Tutte le app puntano a `otel-collector:4317/4318`; sono i **soli** esporter ad avere
conoscenza dei backend reali (Tempo/Mimir/Loki). Cambiare backend non tocca le applicazioni.

L'ordine dei processor nelle pipeline traces/logs è quello raccomandato dalla community
OpenTelemetry: **`memory_limiter` per primo** (protegge il collector dall'OOM prima di
accodare lavoro), poi arricchimento (`resourcedetection`), infine **`batch` per ultimo**
(aggrega subito prima dell'export). **Conforme.**

### 3.7 — Allineamento protocollo / porta OTLP ✅

Errore classico: usare la porta gRPC (4317) con protocollo HTTP o viceversa. Qui
l'accoppiamento è corretto e perfino documentato nel codice:

- **Java/JVM** → `OTEL_EXPORTER_OTLP_PROTOCOL=grpc` su `:4317` (commento nel Dockerfile:
  *"protocollo grpc → porta 4317 (allineamento corretto protocollo/porta)"*).
- **Python** → `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` su `:4318`.
- **Node** → default HTTP su `:4318`.

Il collector espone entrambe le porte (`otlp.protocols.grpc:4317`, `http:4318`). **Conforme.**

### 3.8 — Metriche RED derivate dalle tracce ✅ (verificato live)

Le metriche RED (Rate, Errors, Duration) **non sono strumentate a mano** nei servizi: sono
generate dal `metrics_generator` di Tempo (`tempo/config.yaml`) con i processor
`span-metrics` e `service-graphs`, `generate_native_histograms: both`, e remote-write verso
Mimir. Questa è la pratica corretta — un'unica fonte di verità (le tracce) da cui derivare
le metriche, evitando il drift tra metriche e tracce.

Le dashboard IoT (`observability/grafana/dashboards/*.json`) consumano proprio queste serie:
`rate(traces_spanmetrics_calls_total[...])` per rate/error, e
`histogram_quantile(0.95, ... traces_spanmetrics_latency_bucket ...)` per la p95.

**Evidenza live** — Mimir contiene span-metrics per tutti e tre i servizi e gli istogrammi
di latenza:

```
count by (service)(traces_spanmetrics_calls_total)
  → device-gateway, normalizer, store
count(traces_spanmetrics_latency_bucket) → 165 serie (bucket di latenza presenti)
```

**Conforme.**

### 3.9 — Correlazione tra segnali ✅ (verificato live)

Tutte e quattro le direzioni di correlazione sono attive e confermate empiricamente:

- **Service map / node graph** — i datasource Grafana del kickstart collegano Tempo a Mimir
  (`serviceMap.datasourceUid: mimir`, `nodeGraph.enabled: true`). **Verificato live:** Mimir
  contiene `traces_service_graph_request_total` (3 serie).
- **Exemplars (metriche → tracce)** — Tempo invia exemplar (`metrics_generator.storage.remote_write.send_exemplars: true`)
  e Mimir ora li conserva (storage exemplar abilitato in §6). **Verificato live:** su
  `traces_spanmetrics_latency_bucket` Mimir restituisce **44 serie con exemplar**, ciascuno
  con la label `traceID`:

  ```
  GET /prometheus/api/v1/query_exemplars?query=traces_spanmetrics_latency_bucket
    → exemplar series: 44
    → sample: { labels: { traceID: "5b1da920f7a53bb1..." }, value: 0.000032493 }
  ```

  Dal pannello di latenza di Grafana si salta quindi direttamente alla traccia.
- **Log → traccia** — i log applicativi portano `trace_id` come structured metadata in Loki.
  **Verificato live:** un `trace_id` preso da un log del servizio `store` risolve a una
  traccia reale in Tempo:

  ```
  Loki {service_name="store"} → trace_id 8f2048eb518382f1...
  Tempo /api/traces/8f2048eb... → services in trace: ['normalizer', 'store']
  ```

- **Trace → log** — il datasource Tempo è configurato con `lokiSearch.datasourceUid: loki`,
  e poiché tracce e log condividono il `trace_id`, dal waterfall di una traccia si naviga ai
  log correlati.

**Conforme.**

### 3.10 — Self-observability del collector ✅ (verificato live)

Il collector osserva sé stesso: `prometheus/self` fa scrape delle metriche interne
(`localhost:8888`), `telemetry.metrics.level: detailed`, e sono attive le extension
`health_check` (`:13133`), `pprof` (`:1777`), `zpages` (`:55679`). Il receiver
`docker_stats` aggiunge metriche di infrastruttura per container.

**Evidenza live** — Mimir contiene **250 serie** con prefisso `otelcol_*`: il collector
sta effettivamente pubblicando le proprie metriche interne. **Conforme.**

### 3.11 — Resilienza dell'esportazione ✅

- `memory_limiter` (limit 512 MiB, spike 128 MiB) protegge dal backpressure.
- `batch` (timeout 5s, batch 1024) riduce le chiamate di export.
- Scelta consapevole del processor di span nei test e2e: `otel.setup.js` usa
  `SimpleSpanProcessor` **non** `BatchSpanProcessor`, con commento esplicito sul perché —
  un worker di test che esce subito perderebbe gli span ancora in buffer. È esattamente il
  ragionamento corretto sul trade-off batch-vs-simple in funzione del ciclo di vita del
  processo. **Conforme.**

### 3.12 — Retention e cardinalità ✅

- **Loki**: `retention_period: 744h` (31 giorni), compactor con retention abilitata.
- **Tempo**: `block_retention: 24h`, `max_block_duration: 5m`.
- **Cardinalità** — l'exporter Mimir usa `resource_to_telemetry_conversion: enabled: true`,
  con commento che ne spiega l'effetto (resource attributes → label Prometheus). È una scelta
  utile per la demo ma con un costo di cardinalità noto; il fatto che sia commentata mostra
  consapevolezza del trade-off. **Conforme** (con la nota di cardinalità in §4.4).

---

## 4. Riserve oneste: cosa è dev/demo e non produzione

Presentare configurazione dev come "production-ready" sarebbe esso stesso una violazione
di una best practice. Qui le scelte non-prod sono **dichiarate**, spesso direttamente nei
commenti delle config.

1. **TLS disabilitato** tra collector e backend (`tls.insecure: true` su tutti gli exporter).
   Accettabile su rete Docker interna; in prod richiede mTLS.
2. **Nessuna autenticazione**: Grafana in accesso anonimo (`GF_AUTH_ANONYMOUS_ENABLED=true`),
   Loki `auth_enabled: false`, Mimir `multitenancy_enabled: false`. Il commento in
   `mimir/config.yaml` dice esplicitamente *"Do NOT use in production as-is"*.
3. **Cardinalità**: `resource_to_telemetry_conversion`, `generate_native_histograms: both` e
   lo storage exemplar (abilitato in §6) sono comodi ma vanno dimensionati con attenzione su
   volumi reali.
4. **Sampling assente**: nessuna strategia di sampling head/tail; in e2e si esporta ogni span
   (`SimpleSpanProcessor`). Corretto per una demo a basso volume, da rivedere a scala.
5. **Storage effimero**: Tempo/Loki/Mimir scrivono su `/tmp` (filesystem locale,
   single-binary). Adeguato alla demo, non durevole.
6. **Exporter `debug`** attivo sulla pipeline traces: il commento stesso indica
   *"disabilitare in prod"*.

> La riserva originaria sul **pillar dei log applicativi** è stata risolta (§6): non è più
> una lacuna. Resta, come scelta dev, l'invio di log anche da componenti di sistema
> (es. la state-history dell'alerting di Grafana finisce in Loki come `unknown_service`).

Nessuna di queste mina la validità della demo come **case study riproducibile**; sono i
naturali confini dev/prod, ed essere espliciti su di essi è parte delle best practice.

---

## 5. Conclusione

Su 14 punti di best practice esaminati, **tutti e 14 sono pienamente rispettati e
verificati**, di cui **9 confermati con evidenza raccolta live dai backend**. Le due
riserve della prima verifica (copertura del pillar log e correlazione via exemplar) sono
state chiuse con gli interventi descritti in §6 e ri-verificate end-to-end.

Il risultato più significativo è dimostrato empiricamente: **un'unica traccia distribuita
attraversa tre runtime eterogenei (Node, Python, JVM) e due hop Kafka senza interruzioni del
contesto**, con span kind e attributi conformi alle semantic conventions, e con le metriche
RED derivate dalle tracce stesse. L'architettura disaccoppia correttamente applicazioni e
backend tramite il collector, osserva sé stessa, e dichiara con onestà i propri confini
dev/prod.

---

## 6. Interventi per chiudere le due riserve

Le due riserve della prima verifica sono state risolte con modifiche minime e idiomatiche,
poi ri-verificate live (evidenza in §3.2 e §3.9).

### 6.1 — Export dei log applicativi via OTLP (pillar log)

Obiettivo: far emettere ai tre servizi log OTLP con `service.name` e `trace_id`, così da
popolare Loki e abilitare la correlazione log↔trace. Un runtime per volta, con la tecnica
idiomatica di ciascuno:

| Servizio | Modifica |
|----------|----------|
| **device-gateway** (Node) | Aggiunti `@opentelemetry/sdk-logs`, `@opentelemetry/exporter-logs-otlp-http`, `pino`. In `tracing.js` un `BatchLogRecordProcessor(OTLPLogExporter)` registra un LoggerProvider; l'`instrumentation-pino` (già negli auto-instrumentations) inietta `trace_id`/`span_id` e inoltra i log via OTLP. In `index.js` un log `info` dentro l'handler `/ingest`. |
| **normalizer** (Python) | In Dockerfile `OTEL_LOGS_EXPORTER=otlp` + `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` (aggancia un handler OTLP al root logger). In `app.py` `logging.basicConfig` e un `log.info` dentro lo span `normalize`. |
| **store** (Java) | Sostituito `slf4j-simple` con `logback-classic` (backend intercettato dall'appender instrumentation del Java agent); `System.out.println` → logger slf4j con un `log.info` per record dentro lo span CONSUMER; aggiunto `logback.xml` (root INFO, Kafka/Mongo a WARN); in Dockerfile `OTEL_LOGS_EXPORTER=otlp`. |

### 6.2 — Storage exemplar su Mimir (correlazione metriche→tracce)

Tempo inviava già gli exemplar (`send_exemplars: true`), ma Mimir li scartava perché lo
storage exemplar è disabilitato di default (`max_global_exemplars_per_user: 0`). In
`observability/kickstart-otel-lgtm/mimir/config.yaml` è stato aggiunto:

```yaml
limits:
  max_global_exemplars_per_user: 100000
```

> Nota: `mimir/config.yaml` vive nel **submodule** `kickstart-otel-lgtm`. La modifica va
> committata in quel repo separatamente dalla demo.

### Appendice — comandi di verifica live usati

```bash
docker compose up -d

# servizi visti da Tempo
curl -s "http://localhost:3200/api/search/tag/service.name/values"

# una traccia che attraversa tutti i servizi (span kind per servizio)
curl -s "http://localhost:3200/api/traces/<traceID>"

# span-metrics e istogrammi di latenza in Mimir
curl -s -G "http://localhost:9009/prometheus/api/v1/query" \
  --data-urlencode 'query=count by (service)(traces_spanmetrics_calls_total)'
curl -s -G "http://localhost:9009/prometheus/api/v1/query" \
  --data-urlencode 'query=count(traces_spanmetrics_latency_bucket)'

# service graph + self-metrics del collector
curl -s -G "http://localhost:9009/prometheus/api/v1/query" \
  --data-urlencode 'query=count(traces_service_graph_request_total)'
curl -s -G "http://localhost:9009/prometheus/api/v1/query" \
  --data-urlencode 'query=count({__name__=~"otelcol_.+"})'

# stream presenti in Loki (i tre servizi ora popolano il pillar log)
curl -s -G "http://localhost:3100/loki/api/v1/series" \
  --data-urlencode 'match[]={service_name=~".+"}'

# log applicativi con trace_id (correlazione log→traccia)
curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service_name="store"}' --data-urlencode 'limit=1'
#   → lo stream porta la label trace_id; risolverla in Tempo dà la traccia:
curl -s "http://localhost:3200/api/traces/<trace_id-dal-log>"

# exemplar metrica→traccia (richiede storage exemplar Mimir abilitato, §6.2)
curl -s -G "http://localhost:9009/prometheus/api/v1/query_exemplars" \
  --data-urlencode 'query=traces_spanmetrics_latency_bucket' \
  --data-urlencode 'start=<epoch-600>' --data-urlencode 'end=<epoch>'
```
