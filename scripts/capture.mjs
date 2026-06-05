// capture.mjs - cattura le dashboard demo in PNG puliti
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const GRAFANA = process.env.GRAFANA_URL || 'http://localhost:3000';
const OUT = process.env.OUT_DIR || 'linkedin/assets';
const RANGE = process.env.RANGE || 'from=now-1h&to=now';
const THEME = process.env.THEME || 'light'; // light per coerenza con le card; THEME=dark per il vecchio look
// name = nome file di output (prefisso numerato per ordinarli, vedi assets/)
const shots = [
  { uid: 'iot-service-overview', name: '03-iot-service-overview' },
  { uid: 'iot-pipeline', name: '04-iot-pipeline' },
  { uid: 'iot-e2e', name: '05-iot-e2e-tests' },
];
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
for (const s of shots) {
  try {
    await p.goto(`${GRAFANA}/d/${s.uid}?kiosk&theme=${THEME}&${RANGE}`, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(5000);
    await p.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log(`OK ${s.name}`);
  } catch (e) { console.log(`ERR ${s.name}: ${e.message}`); }
}
await b.close();
