const { test, expect } = require('@playwright/test');
const { trace } = require('@opentelemetry/api');
const { sdk } = require('./otel.setup');

test('ingest end-to-end (browser -> CORS gateway -> backend)', async ({ page }) => {
  const tracer = trace.getTracer('e2e');

  await tracer.startActiveSpan('e2e:ingest', async (span) => {
    // Build the W3C traceparent from the root span's context and inject it
    // into the browser's requests. It rides the cross-origin fetch, triggers
    // the CORS preflight on the Nginx gateway (which now allows traceparent),
    // and is extracted by device-gateway's HTTP auto-instrumentation, making
    // the backend trace a child of this test span.
    const sc = span.spanContext();
    const tp = `00-${sc.traceId}-${sc.spanId}-0${sc.traceFlags.toString(16)}`;
    await page.context().setExtraHTTPHeaders({ traceparent: tp });

    // Real browser on a different origin (:8090) than the gateway (:8088).
    await page.goto('http://localhost:8090');

    // Fire the cross-origin fetch; returns the backend HTTP status (202).
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
