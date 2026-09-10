import { buildHtml } from '../scripts/ui.mjs';
import { FlyController } from './controller.js';
import { FlyGarden } from './garden.js';
import { PreviewInstrumentAdapter } from './instrument-adapter.js';
import { startServer } from './server.js';

const html = await buildHtml();
const port = Number(process.env.FLY_PORT || 9321);
const app = await startServer(new FlyController(new PreviewInstrumentAdapter(), { instrumentMode: 'ambient', world: new FlyGarden({ count: 12 }) }), html, { port });
console.log(`Ableton Fly rehearsal (no Ableton connection): ${app.url}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
