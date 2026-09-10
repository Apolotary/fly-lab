import { initialize, Simpler } from '@ableton-extensions/sdk';
import { FlyController } from './controller.js';
import { FlyGarden } from './garden.js';
import { LiveInstrumentAdapter } from './instrument-adapter.js';
import { MidiOutput } from './midi-output.js';
import { startServer } from './server.js';
import html from '../ui/index.html';
import {dirname,join} from 'node:path';
import {loadDarkCheckpoint,saveDarkCheckpoint} from './dark-checkpoint.js';

let app;
let shutdownPromise;
async function shutdown() { shutdownPromise ??= app?.close(); await shutdownPromise; }
export async function activate(activation) {
  const context = initialize(activation, '1.0.0');
  const midi = new MidiOutput({ binaryPath: __FLY_MIDI_PATH__ });
  await midi.open();
  const checkpointPath=join(dirname(__FLY_DARK_PATH__),'..','dark-lab','model.json');
  let darkCheckpoint;
  try {darkCheckpoint=await loadDarkCheckpoint(checkpointPath);} catch(error){console.error('Dark lab checkpoint could not load; starting an untrained readout.',error);}
  const controller = new FlyController(new LiveInstrumentAdapter(context, { midi, samplePath: __FLY_SAMPLE_PATH__, ambientSamplePath: __FLY_AMBIENT_PATH__,darkSamplePath:__FLY_DARK_PATH__,
    resolveSimpler: device => context.getObjectFromHandle(device.handle, Simpler) }), { mode: 'live', instrumentMode: 'dark', world: new FlyGarden({ count: 12 }),
      darkCheckpoint,saveLearning:data=>saveDarkCheckpoint(checkpointPath,data) });
  midi.onError = error => { controller.pending = controller.fail(error); };
  try { app = await startServer(controller, html); } catch (error) { await midi.close(); throw error; }
  console.log(`Ableton Fly connected: ${app.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    shutdown().then(() => process.exit(0), () => process.exit(1));
  });
  return app;
}
export async function deactivate() { await shutdown(); }
