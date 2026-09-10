import { buildHtml } from '../scripts/ui.mjs';
import { FlyController } from './controller.js';
import { FlyGarden } from './garden.js';
import { PreviewInstrumentAdapter } from './instrument-adapter.js';
import { startServer } from './server.js';
import {loadDarkCheckpoint,saveDarkCheckpoint} from './dark-checkpoint.js';
import {fileURLToPath} from 'node:url';

const html = await buildHtml();
const port = Number(process.env.FLY_PORT || 9321);
const checkpointPath=fileURLToPath(new URL('../.local/dark-lab/model.json',import.meta.url));
let darkCheckpoint;
try {darkCheckpoint=await loadDarkCheckpoint(checkpointPath);} catch(error){console.error('Dark lab checkpoint could not load; starting an untrained readout.',error);}
const app = await startServer(new FlyController(new PreviewInstrumentAdapter(), { instrumentMode: 'dark', world: new FlyGarden({ count: 12 }),
  darkCheckpoint,saveLearning:data=>saveDarkCheckpoint(checkpointPath,data) }), html, { port });
console.log(`Fly Lab rehearsal (no Ableton connection): ${app.url}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
