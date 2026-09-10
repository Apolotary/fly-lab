import { initialize } from '@ableton-extensions/sdk';
import { FlyController } from './controller.js';
import { LiveAdapter } from './live-adapter.js';
import { startServer } from './server.js';
import html from '../ui/index.html';

let app;
let shutdownPromise;
async function shutdown() {
  shutdownPromise ??= app?.close();
  await shutdownPromise;
}
export async function activate(activation) {
  const context = initialize(activation, '1.0.0');
  app = await startServer(new FlyController(new LiveAdapter(context), { mode: 'live' }), html);
  console.log(`Ableton Fly connected: ${app.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    shutdown().then(() => process.exit(0), () => process.exit(1));
  });
  return app;
}
export async function deactivate() { await shutdown(); }
