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
   SPA nel browser (OTel Web, single-origin :8090) ─┘ entra nella stessa traccia
```

Tre runtime eterogenei cuciti da Kafka; il trace context W3C viaggia negli **header
dei record Kafka** (inject/extract manuale su Node/Python, automatico via Java agent su
JVM), e ora anche dal **browser** via OTel Web nella SPA. Backend LGTM dal submodule `kickstart-otel-lgtm` (OTel Collector → Tempo, Mimir,
Loki + Grafana); le RED metrics sono derivate dal metrics-generator di Tempo.

## Struttura

```
.
├── docker-compose.yml          # servizi app (Kafka, Mongo, 3 servizi, load-gen, frontend, keycloak)
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
│   └── frontend/               # SPA Vue/Vite + OTel Web + auth Keycloak (nginx :8090: serve SPA + proxa /ingest, /v1, /auth)
├── keycloak/                   # realm-iot.json (client public PKCE, importato all'avvio)
└── e2e/                        # test Playwright strumentato
```

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

SPA su `http://localhost:8090` (con login Keycloak, utente `demo`/`demo`), Grafana su
`http://localhost:3000` (login anonimo), device-gateway su `:8080/ingest`. Le dashboard
della demo sono nella cartella **IoT**. Admin Keycloak su `:8090/auth/admin` (`admin`/`admin`).

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

- **Propagazione dal browser e la gotcha CORS sul `traceparent`.** Strumentando la SPA con
  OTel Web, il `traceparent` deve viaggiare dal browser fino al backend. Nella versione
  cross-origin (SPA `:8090` → gateway `:8088`) quell'header **non** è CORS-safelisted →
  scatta un preflight `OPTIONS`; senza `traceparent` in `Access-Control-Allow-Headers` la
  fetch fallisce (`Failed to fetch`) e la trace si spezza al primo hop. **È il motivo per
  cui il demo è passato a single-origin**: la nginx della SPA (`services/frontend/`) serve
  la SPA *e* proxa `/ingest` (e l'export OTLP `/v1/`) → niente cross-origin, niente
  preflight. Il racconto completo — frontend instrumentation + le due gotcha CORS — è nel
  case study dedicato. (Quel gateway cross-origin separato è stato poi **ritirato**: la
  stessa scelta single-origin si è estesa anche all'auth — vedi *Auth con Keycloak* sotto.)
- **`SimpleSpanProcessor` nei worker di test.** Il setup OTel
  dell'E2E (`e2e/otel.setup.js`) usa `SimpleSpanProcessor` (esportazione sincrona per
  span) anziché `BatchSpanProcessor`: un processo di test che termina in fretta perderebbe
  gli span bufferizzati in un batch non flushato. Niente più `forceFlush`; basta uno
  `sdk.shutdown()` pulito a fine suite.

L'E2E passa da un **browser reale** (`page.goto :8090` → `window.__send()` → fetch
**same-origin** a `/ingest`): la SPA ora si auto-strumenta (OTel Web), quindi una richiesta
reale genera già la traccia `frontend-spa → device-gateway → normalizer → store`. Il test
inietta il proprio `traceparent` solo per radicare la trace del *test*. In Tempo una singola
trace attraversa il browser e i 3 runtime: prova della propagazione end-to-end.

## Auth con Keycloak (tracing attraverso l'auth)

La SPA si autentica con **Keycloak** via `keycloak-js` (OIDC Authorization Code + PKCE,
public client). Keycloak è servito **same-origin** dietro l'edge nginx (`/auth`): la stessa
scelta single-origin applicata all'auth. Così la `POST /token` del browser resta same-origin,
il `traceparent` viaggia senza CORS, e — con Keycloak strumentato OTel (`KC_TRACING_*`,
sampler `parentbased_always_on`) — lo span server di Keycloak si **cuce** con la trace del
browser: un waterfall `frontend-spa → keycloak (token endpoint)`.

Dettagli che contano (e diventano contenuto):

- **`parentbased_always_on` lato Keycloak**: fa rispettare il `traceparent` in ingresso, così
  lo span server di Keycloak diventa figlio dello span del browser invece di aprire una trace
  nuova. È il pezzo lato server della cucitura.
- **Propagazione via `FetchInstrumentation`**: keycloak-js 26.x usa `window.fetch` per la
  `POST /token`; essendo same-origin (`/auth`) il `traceparent` è iniettato di default, niente
  CORS. (Non serve l'XHR instrumentation: il token endpoint passa per `fetch`.)
- **Flush su `pagehide`/`visibilitychange`** + batch corto in `tracing.js`: lo span del token,
  creato attorno al redirect di login, andrebbe perso col `BatchSpanProcessor` di default → lo
  si esporta prima che il browser navighi via. È il pezzo lato client della cucitura.
- **`check-sso` non forzante**: la SPA è navigabile da anonima e il mount avviene subito (auth
  in background). Ma **inviare** dati richiede un token: il browser via login utente, i device
  via client-credentials.

**Validazione (chi può scrivere).** Il `device-gateway` valida il JWT — firma + issuer +
scadenza, via JWKS — su `POST /ingest`: senza token valido → `401`. Due flussi di emissione:
il **browser** ottiene il token via Authorization Code (client `iot-frontend`), i **device**
(es. il load-gen) via **client-credentials** (service account `iot-device`; a tema IoT: i
device hanno un'identità). Split-horizon: il gateway scarica le chiavi dall'URL **interno**
(`keycloak:8080`) ma verifica l'issuer **pubblico** (`:8090/auth`), quello nel claim `iss`.

Trade-off e semplificazioni **dichiarati** (è un demo didattico):

- **Public client** (browser): l'access token vive nel browser (XSS = esfiltrazione). In
  **produzione** si userebbe un **BFF** (cookie `httpOnly`); il pattern di tracing resta
  identico, cambia solo *dove* nasce lo span client.
- **Secret del device in chiaro**: `iot-device` usa un secret da demo nel realm/compose. In
  produzione: secret manager + rotazione.
- **H2 in-memory** (`start-dev`): il realm è re-importato a ogni avvio (riproducibile), ma lo
  stato runtime (utenti/sessioni) è effimero. Produzione: DB esterno + `start`.
- **Primo avvio ~30s**: Keycloak importa il realm; il login funziona dopo (la SPA resta usabile
  anonima nel frattempo). Con `parentbased_always_on` le tracce *keycloak-only* allo startup
  sono attese — filtra per `service.name` in Grafana.

Login demo: `demo`/`demo`. Admin: `:8090/auth/admin` (`admin`/`admin`).

### Scelte di semplificazione

Il demo è uno **stack generico** e deliberatamente minimale. Le semplificazioni **non
cambiano le decisioni né le war story dimostrate sopra**:

- Runtime plain **Node / Python / Java** (il Java agent si comporta identico su una JVM
  Scala/Pekko o Java plain — l'auto-instrumentation è a bytecode).
- Payload **JSON** sui topic Kafka (il `traceparent` viaggia negli header W3C del record
  a prescindere dal formato del payload: Avro, Protobuf o JSON).
- Nomi di dominio neutri (dispositivi IoT generici).
