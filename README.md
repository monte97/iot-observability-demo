# IoT Observability Demo + Content

Progetto **autonomo e staccabile**: un mini sistema distribuito generico ("dispositivi
IoT sul campo") strumentato con OpenTelemetry.

Lo stack di osservabilità LGTM **non è incluso qui**: arriva dal repo
[`kickstart-otel-lgtm`](https://github.com/monte97/kickstart-otel-lgtm), agganciato come
git submodule sotto `observability/`. La demo fornisce solo i servizi applicativi e le
dashboard specifiche del dominio IoT, e si appoggia al collector/backend del kickstart.

## Architettura

```
load-gen → device-gateway (Node) →[kafka telemetry.raw]→ normalizer (Python)
                                       →[kafka telemetry.clean]→ store (Java) → MongoDB
   e2e (Playwright strumentato) ─┘ colpisce il gateway
```

Tre runtime eterogenei cuciti da Kafka; il trace context W3C viaggia negli **header
dei record Kafka** (inject/extract manuale su Node/Python, automatico via Java agent su
JVM). Backend LGTM dal submodule `kickstart-otel-lgtm` (OTel Collector → Tempo, Mimir,
Loki + Grafana); le RED metrics sono derivate dal metrics-generator di Tempo.

## Struttura

```
.
├── docker-compose.yml          # servizi app (Kafka, Mongo, 3 servizi, load-gen, gateway, frontend)
│                               #   + include dello stack LGTM dal submodule kickstart
├── docker-compose.grafana.yml  # override: inietta le dashboard IoT nella Grafana del kickstart
├── .env                        # COMPOSE_FILE: unisce i due file → `docker compose up` singolo
├── observability/
│   ├── grafana/                # dashboard IoT della demo, iniettate nella Grafana del kickstart
│   │   ├── dashboards/         # 3 dashboard generiche (iot-*.json)
│   │   └── provisioning/dashboards/dashboards.yaml  # provider combinato (Observability + IoT)
│   └── kickstart-otel-lgtm/    # submodule: stack LGTM (collector, tempo, mimir, loki, grafana)
├── Makefile                    # up / seed / down
├── services/
│   ├── device-gateway/         # Node/Express, producer Kafka
│   ├── normalizer/             # Python, consumer/producer
│   ├── store/                  # Java plain + Java agent, consumer → Mongo
│   ├── load-gen/               # generatore di traffico sintetico (busybox + gen.sh)
│   └── frontend/               # SPA statica / fixture e2e (nginx :8090)
└── e2e/                        # test Playwright strumentato
```

> I contenuti editoriali (blog, post LinkedIn, case study) vivono in ``, tenuta
> **solo in locale e non tracciata** (vedi `.gitignore`).

## Uso

Il backend LGTM è un git submodule: al primo clone va inizializzato (incluso il suo
submodule annidato `grafana-dashboards`).

```bash
# clone del repo con i submodule
git clone --recurse-submodules <repo-url>
# oppure, se già clonato:
git submodule update --init --recursive

make up      # stack + servizi (build immagini, primo avvio scarica le immagini)
make seed    # assicura il load-gen attivo (traffico continuo)
make down    # tear down (rimuove i volumi)
```

`make up` legge `.env` (`COMPOSE_FILE`) e unisce automaticamente lo stack della demo e
quello del kickstart in un solo `docker compose`.

Grafana su `http://localhost:3000` (login anonimo), gateway su `:8080/ingest`. Le
dashboard della demo sono nella cartella **IoT**.

## Scopo

1. Generare **screenshot Grafana pubblicabili** con nomi di dominio generici.
2. Essere un **case study riproducibile** a 3 runtime: `make up` e gira.

## Stato

Implementato e verificato live: pipeline end-to-end (browser/e2e → gateway → Kafka →
normalizer → Kafka → store → Mongo) con un singolo trace che attraversa i 3 runtime, 3
dashboard popolate e 3 screenshot puliti generati.

## War story riprodotte

Il demo riproduce **fedelmente** due war story ricorrenti del tracing distribuito su
stack eterogeneo:

- **Bug #3 — propagazione browser → gateway con CORS preflight su `traceparent`.**
  Una SPA statica (`services/frontend/`, su origin `:8090`) chiama il backend attraverso un
  gateway Nginx (`gateway/`, su origin `:8088`) che fa reverse proxy a `device-gateway`.
  La fetch cross-origin porta l'header `traceparent` per propagare la trace dal browser;
  poiché `traceparent` **non** è CORS-safelisted, scatta un preflight `OPTIONS`. Il
  `gateway/default.conf` elenca `traceparent`/`tracestate` in `Access-Control-Allow-Headers`,
  così il preflight passa e il context attraversa l'hop. Rimuovendo quell'header il
  preflight non autorizza più `traceparent`, la fetch fallisce in CORS (`Failed to fetch`)
  e la trace si spezza al primo hop — esattamente il sintomo del bug originale.
- **`SimpleSpanProcessor` nei worker di test.** Il setup OTel
  dell'E2E (`e2e/otel.setup.js`) usa `SimpleSpanProcessor` (esportazione sincrona per
  span) anziché `BatchSpanProcessor`: un processo di test che termina in fretta perderebbe
  gli span bufferizzati in un batch non flushato. Niente più `forceFlush`; basta uno
  `sdk.shutdown()` pulito a fine suite.

L'E2E passa da un **browser reale** (`page.goto` → `window.__send()` → fetch cross-origin
al gateway): il `traceparent` costruito dallo span root del test viene iniettato via
`setExtraHTTPHeaders`, sopravvive al preflight CORS e viene estratto dall'auto-instrumentation
HTTP di `device-gateway`, che diventa così figlio dello span `e2e`. In Tempo una singola
trace contiene `e2e`, `device-gateway`, `normalizer` e `store`: prova della propagazione
end-to-end browser → gateway → backend.

### Scelte di semplificazione

Il demo è uno **stack generico** e deliberatamente minimale. Le semplificazioni **non
cambiano le decisioni né le war story dimostrate sopra**:

- Runtime plain **Node / Python / Java** (il Java agent si comporta identico su una JVM
  Scala/Pekko o Java plain — l'auto-instrumentation è a bytecode).
- Payload **JSON** sui topic Kafka (il `traceparent` viaggia negli header W3C del record
  a prescindere dal formato del payload: Avro, Protobuf o JSON).
- Nomi di dominio neutri (dispositivi IoT generici).
