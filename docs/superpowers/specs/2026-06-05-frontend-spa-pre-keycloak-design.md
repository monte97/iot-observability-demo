# Small SPA (pre-Keycloak) — Design Spec

- **Data:** 2026-06-05
- **Stato:** Approvato (brainstorming) — pronto per implementazione autonoma via `/goal`
- **Repo:** iot-observability-demo
- **Out of scope:** integrazione Keycloak vera e propria (questa spec prepara solo il terreno)

## Contesto e motivazione

L'attuale `frontend/index.html` non è una SPA: è una fixture di test da 14 righe (un
bottone `send` + `window.__send()` che fa una `POST` cross-origin a `:8088/ingest`),
esiste solo per creare l'hop "browser" nella trace distribuita guidata dall'e2e Playwright.

Il futuro case study Keycloak "Caso B" (identità end-user, login authorization-code +
PKCE) presuppone una SPA reale su cui innestare `keycloak-js`. Questa spec definisce la
**costruzione di quella SPA SENZA Keycloak**, strutturata in modo che il login si agganci
poi in modo incrementale. Keycloak NON viene toccato qui.

## Obiettivi

1. Sostituire la fixture con una piccola SPA Vue reale (multi-view + router).
2. Predisporre i "seam" per l'auth (modulo `auth.js` stub, rotta `/callback`, header con
   stato utente, `api.send()` come punto d'innesto dell'`Authorization`).
3. **Non rompere** e2e, tracing distribuito, CORS/`traceparent`, né la pipeline.

## Non-obiettivi

- Nessuna integrazione `keycloak-js`, nessun realm, nessun token (fase successiva).
- Nessun cambiamento a gateway, servizi backend, collector, stack LGTM.
- Nessuna gestione stato avanzata (no Pinia).

## Vincoli — contratto e2e (DA PRESERVARE)

L'e2e (`e2e/ingest.spec.js`) si appoggia a un contratto preciso che **non deve cambiare**:

- La pagina è servita su `http://localhost:8090` (root).
- Espone `window.__send()` che ritorna lo **status HTTP numerico** (atteso `202`).
- La `fetch` va cross-origin a `http://localhost:8088/ingest` e **non** sovrascrive gli
  header iniettati da Playwright a livello di context (`traceparent` deve sopravvivere;
  la `fetch` deve impostare solo `content-type`).

Playwright fa `page.goto('http://localhost:8090')` poi `page.evaluate(() => window.__send())`.
Quindi `window.__send` deve essere disponibile subito al load, **indipendente dal ciclo di
vita dei componenti**.

## Decisioni tecniche

- **Vue 3 + Vite + Vue Router 4.** Versioni pinnate esatte in `package.json`.
- **Stato:** modulo `store.js` con `reactive()` (niente Pinia — YAGNI).
- **Build & serve:** Dockerfile multi-stage (`node` builda → `dist/` copiato in `nginx`).
  Il servizio `frontend` in `docker-compose.yml` passa da `image: nginx + volume mount` a
  **`build: ./frontend`**, mantenendo `ports: ["8090:80"]` e `networks: [observability]`.
- **nginx SPA fallback:** `frontend/nginx.conf` con `try_files $uri /index.html;` (serve a
  router e `/callback` per i deep-link).
- **`window.__send` decoupled:** assegnato in `main.js` subito dopo il mount, basato su
  `api.send()` con payload e2e-default `{ device_id: 'browser-e2e', value: 1 }`.

## Architettura / layout file

```
frontend/
  index.html              # entry Vite (#app)
  package.json            # versioni pinnate
  vite.config.js
  Dockerfile              # multi-stage: build -> nginx
  nginx.conf              # try_files fallback SPA
  src/
    main.js               # crea app, monta, espone window.__send (decoupled)
    router.js             # / -> Send, /history -> History, /callback -> Callback(stub)
    api.js                # send(payload): POST cross-origin :8088/ingest; registra nello store
    store.js              # reactive: { sends: [...] }
    auth.js               # STUB: { isAuthenticated:false, user:null, init(), login(), logout(), token() }
    App.vue               # layout: <AppHeader/> + <router-view/>
    components/
      AppHeader.vue       # nav (Send/History) + stato utente ("sign in" -> auth.login())
    views/
      SendView.vue        # form (device_id, value) + bottone -> api.send()
      HistoryView.vue     # tabella invii dallo store
      CallbackView.vue    # placeholder redirect OIDC (mostra "nessun login configurato")
```

### Responsabilità per unità

- **`api.js`** — *cosa:* invia telemetria al gateway e registra l'esito; *uso:*
  `await send({device_id, value}) -> number (status)`; *dipende da:* `store.js`. È il punto
  unico dove in futuro si aggiungerà `Authorization: Bearer`. Non imposta header oltre a
  `content-type`.
- **`store.js`** — *cosa:* stato reattivo condiviso degli invii; *uso:* `store.sends`,
  `store.record({...})`; *dipende da:* nulla.
- **`auth.js`** — *cosa:* interfaccia auth stub che `keycloak-js` riempirà; *uso:*
  `auth.isAuthenticated`, `auth.user`, `auth.login()`, `auth.logout()`, `auth.token()`;
  *dipende da:* nulla. Oggi: `isAuthenticated=false`, `login()` logga "stub".
- **`main.js`** — *cosa:* bootstrap app + espone `window.__send`; *dipende da:* `api.js`.
- **viste/componenti** — presentazione; dipendono da `api`, `store`, `auth`.

## Data flow

1. Utente (o e2e) attiva l'invio → `api.send(payload)`.
2. `api.send` esegue `fetch('http://localhost:8088/ingest', { method:'POST',
   headers:{'content-type':'application/json'}, body: JSON.stringify(payload) })`.
3. Ritorna `res.status`; chiama `store.record({ ts, device_id, status })`.
4. `HistoryView` mostra reattivamente `store.sends`.
5. `window.__send()` = `() => api.send({device_id:'browser-e2e', value:1})` → ritorna lo
   status all'e2e. Il `traceparent` iniettato da Playwright viaggia automaticamente
   (context-level header) e non viene toccato.

## Auth seam (oggi stub, domani Keycloak)

- `AppHeader` mostra "sign in" quando `!auth.isAuthenticated`, altrimenti `auth.user`.
- `/callback` esiste già come rotta (redirect URI OIDC futuro).
- `api.send` è il seam per `Authorization`.
- Quando arriverà Keycloak: `auth.js` diventa wrapper `keycloak-js` (`init({onLoad:'check-sso',
  pkceMethod:'S256'})`), `login()` redirige, `api.send` aggiunge il bearer. Nessun altro file
  cambia struttura.

## Cosa NON cambia

- `e2e/*` invariati (contratto preservato). Router e History sono additivi.
- `gateway/default.conf`, CORS, `traceparent`, collector, LGTM, servizi backend: invariati.
- Porte/instradamenti: `frontend` resta su `:8090`.

## Testing & verifica

- **Guardiano:** l'e2e esistente deve passare invariato (`status === 202`, trace
  browser→gateway→backend intatta).
- **Verifica live (acceptance):**
  1. `make up` builda l'immagine frontend e serve la SPA su `:8090`.
  2. `:8090` carica la SPA; nav Send/History funziona; `/history` raggiungibile via deep-link
     (fallback nginx).
  3. In console/Playwright `window.__send()` ritorna `202`.
  4. La trace su Tempo continua a mostrare `browser-e2e → device-gateway → normalizer → store`.
  5. `cd e2e && npx playwright test` passa.

## Criteri di accettazione

1. SPA Vue+Vite+Router servita su `:8090` via build multi-stage (compose `build: ./frontend`).
2. Viste Send + History + Callback(stub) e header con stato utente.
3. `window.__send()` ritorna `202` e l'e2e Playwright passa **senza modifiche al test**.
4. Trace distribuita intatta (verificata su Tempo).
5. Seam auth presenti (`auth.js` stub, `/callback`, `api.send` agganciabile) — nessun
   `keycloak-js` ancora.
6. Versioni pinnate; `make up`/`make down` funzionano end-to-end.
```
