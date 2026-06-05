// capture-trace.mjs - cattura il "waterfall" di UNA traccia (il filo unico browser/servizi/coda/db).
// Sceglie da solo la traccia piu' ricca che tocca tutti e 3 i servizi, poi la apre in Grafana Explore.
// Uso: node capture-trace.mjs   (stack su, playwright installato)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const GRAFANA = process.env.GRAFANA_URL || 'http://localhost:3000';
const OUT = process.env.OUT_DIR || 'linkedin/assets';
const THEME = process.env.THEME || 'light';
const NAME = process.env.NAME || '06-trace-waterfall';
// query di selezione: default = catena backend (load-gen). Per la variante E2E
// browser-rooted: SEARCH_Q='{ resource.service.name="browser-e2e" }' NAME=07-trace-e2e-browser
const SEARCH_Q = process.env.SEARCH_Q || '{ resource.service.name="store" }';

// 1) trova le tracce candidate (default: quelle che toccano 'store', il servizio piu' profondo)
const searchUrl = `${GRAFANA}/api/datasources/proxy/uid/tempo/api/search?q=${encodeURIComponent(SEARCH_Q)}&limit=20`;
const res = await fetch(searchUrl);
const { traces = [] } = await res.json();
// scegli quella col maggior numero totale di span sui 3 servizi (waterfall piu' "pieno")
const score = (t) => Object.values(t.serviceStats || {}).reduce((s, v) => s + (v.spanCount || 0), 0);
const has3 = (t) => ['device-gateway', 'normalizer', 'store'].every((n) => t.serviceStats?.[n]);
const best = traces.filter(has3).sort((a, b) => score(b) - score(a))[0] || traces[0];
if (!best) { console.error('Nessuna traccia trovata'); process.exit(1); }
console.log(`Traccia scelta: ${best.traceID}  (${score(best)} span, ${best.durationMs}ms)`);

// 2) costruisci la URL di Grafana Explore per quel traceID
const panes = {
  t1: {
    datasource: 'tempo',
    queries: [{ refId: 'A', datasource: { type: 'tempo', uid: 'tempo' }, queryType: 'traceql', query: best.traceID }],
    range: { from: 'now-6h', to: 'now' },
  },
};
const url = `${GRAFANA}/explore?schemaVersion=1&orgId=1&theme=${THEME}&panes=${encodeURIComponent(JSON.stringify(panes))}`;

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
// viewport alto: cosi' il pannello traccia (~690px) entra tutto, store incluso
const p = await b.newPage({ viewport: { width: 1600, height: 1300 }, deviceScaleFactor: 2 });
await p.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
await p.waitForTimeout(6000);
// ritaglia SOLO il pannello della traccia (niente editor query / sidebar Grafana)
const panel = p.locator('[data-testid="data-testid Panel header Trace"]');
await panel.scrollIntoViewIfNeeded();
await p.waitForTimeout(1500);
await panel.screenshot({ path: `${OUT}/${NAME}.png` });
console.log(`OK ${NAME}`);
await b.close();
