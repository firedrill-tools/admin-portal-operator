import { join } from 'node:path';
import { initialize } from '../src/datasets.js';
import { startServer } from '../src/server.js';
import { Store } from '../src/state.js';
import { BrowserSession } from '../src/browser.js';
import { runOperator } from '../src/operator.js';
const [encoded, directory, model] = process.argv.slice(2);
const input = JSON.parse(encoded), file = join(directory, 'workspace.json');
const controller = new AbortController();
const stop = () => controller.abort(new Error('Browser target interrupted.'));
for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(name, stop);
let server, browser, failure;
const report = { executionKind: input.action === 'inspect' ? 'browser_inspection' : 'native_model_operator' };
try {
  initialize(input.caseId, file);
  report.before = new Store(file).read();
  controller.signal.throwIfAborted();
  server = await startServer(file, 0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  if (input.action === 'inspect') {
    browser = await BrowserSession.open(origin, join(directory, 'inspection'), { signal: controller.signal });
    report.observation = await browser.observe();
  } else report.operator = await runOperator(input.task, { baseUrl: origin, model: model || undefined, outputRoot: join(directory, 'evidence'), signal: controller.signal });
} catch (error) {
  failure = error;
  report.error = { message: error.message, ...(error.outputDir ? { outputDir: error.outputDir, result: error.result } : {}) };
} finally {
  try { if (browser) { await browser.close(); report.browserClosed = !browser.browser.isConnected(); } }
  catch (error) { failure ||= error; report.browserCleanupError = error.message; }
  try { if (server) { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); report.portalClosed = !server.listening; } }
  catch (error) { failure ||= error; report.portalCleanupError = error.message; }
  try { report.after = new Store(file).read(); } catch (error) { failure ||= error; report.stateError = error.message; }
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(name, stop);
}
console.log(JSON.stringify(report));
if (failure || controller.signal.aborted || report.portalClosed !== true || (input.action === 'inspect' && report.browserClosed !== true)) process.exitCode = 1;
