const { test, expect } = require('@playwright/test');
const { trace } = require('@opentelemetry/api');
const { sdk } = require('./otel.setup');

test('ingest end-to-end (browser SPA -> backend, single-origin)', async ({ page }) => {
  const tracer = trace.getTracer('e2e');

  await tracer.startActiveSpan('e2e:ingest', async (span) => {
    // Build the W3C traceparent from the root span's context and inject it into
    // the browser's requests. The SPA fetch is now same-origin (:8090/ingest,
    // proxied to device-gateway), so there's no CORS preflight. The header is
    // extracted by device-gateway's HTTP auto-instrumentation, making the
    // backend trace a child of this test span.
    // NOTE: the SPA now self-instruments (OTel Web), so this manual injection is
    // redundant for real users — kept here only to root the *test* trace.
    const sc = span.spanContext();
    const tp = `00-${sc.traceId}-${sc.spanId}-0${sc.traceFlags.toString(16)}`;
    await page.context().setExtraHTTPHeaders({ traceparent: tp });

    // Real browser hitting the SPA on :8090 (same-origin: SPA + /ingest proxy).
    await page.goto('http://localhost:8090');

    // Fire the same-origin fetch; returns the backend HTTP status (202).
    const status = await page.evaluate(() => window.__send());
    expect(status).toBe(202);

    span.end();
  });
});

// SimpleSpanProcessor exports each span synchronously, so no forceFlush is
// needed; just shut the SDK down cleanly when the suite finishes.
test.afterAll(async () => {
  try {
    await sdk.shutdown();
  } catch (_) {}
});
