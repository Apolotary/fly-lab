import { buildHtml } from '../scripts/ui.mjs';
import { FlyController } from './controller.js';
import { DemoAdapter } from './live-adapter.js';
import { startServer } from './server.js';

const html = await buildHtml();
const app = await startServer(new FlyController(new DemoAdapter()), html);
console.log(`Ableton Fly rehearsal (no Ableton connection): ${app.url}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
