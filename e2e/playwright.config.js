// Set the OTel service name in the main process, before Playwright forks its
// worker (the worker inherits this env). Setting it inside otel.setup.js is too
// late - the resource detector has already resolved by then, and the root span
// falls back to "unknown_service:<node binary path>", which also leaks the local
// filesystem path into the trace view.
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'browser-e2e';

module.exports = { testDir: '.', timeout: 30000, reporter: 'list', use: { trace: 'off' } };
