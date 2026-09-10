import { FlyGarden } from './garden.js';
import { StringComposer } from './string-instrument.js';
import { FruitComposer } from './fruit-instrument.js';
import { AmbientComposer } from './ambient-instrument.js';

function makeComposer(mode, energy = 'lively') {
  if (!['ambient', 'fruit', 'strings'].includes(mode)) throw new Error('Choose Ambient, Fruit pads or Strings.');
  return mode === 'ambient' ? new AmbientComposer({ energy }) : mode === 'fruit' ? new FruitComposer() : new StringComposer();
}

export class FlyController {
  constructor(adapter, { mode = 'demo', world = new FlyGarden(), composer, instrumentMode = 'fruit', energy = 'lively' } = {}) {
    if (!['calm', 'lively', 'wild'].includes(energy)) throw new Error('Choose Calm, Lively or Wild.');
    composer ??= makeComposer(instrumentMode, energy);
    Object.assign(this, { adapter, mode, world, composer, instrumentMode, energy });
    this.world.setEnergy?.(energy);
    this.composer.setEnergy?.(energy);
    this.performanceTime = Math.max(0, Number(this.world.snapshot().time) || 0);
    this.modeRevision = 0;
    this.composer.prime?.(this.musicWorld());
    this.running = false;
    this.busy = false;
    this.error = null;
    this.events = [];
    this.pending = Promise.resolve();
    this.lastSeen = Date.now();
    this.lastSave = 0;
    this.lastModulation = 0;
    this.timer = null;
    this.addEvent(mode === 'live' ? 'Connected to Live. Prepare the instrument in an empty Set.' : 'Browser rehearsal. Each fruit visit can play a note.');
  }
  musicWorld() { return { ...this.world.snapshot(), time: this.performanceTime }; }
  addEvent(text) {
    this.events.unshift({ time: new Date().toLocaleTimeString('en-GB'), text });
    this.events.length = Math.min(this.events.length, 12);
  }
  snapshot() {
    return { mode: this.mode, connection: !this.error, prepared: this.adapter.prepared,
      running: this.running, busy: this.busy, error: this.error,
      brain: this.world.snapshot(), music: { ...this.adapter.snapshot(), ...this.composer.snapshot(), energy: this.energy, performanceTime: this.performanceTime, instrumentMode: this.instrumentMode, modeRevision: this.modeRevision }, events: this.events };
  }
  heartbeat() { this.lastSeen = Date.now(); }
  midiFile() { return this.composer.midiFile(); }
  async action(input) {
    if (this.closing) throw new Error('The fly is shutting down.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an action object.');
    const { action } = input;
    if (!['prepare', 'start', 'stop', 'panic', 'stimulus', 'fruit', 'clearFruit', 'refreshFruit', 'mode', 'energy'].includes(action)) throw new Error('Unknown action.');
    if (this.busy && action === 'panic') {
      this.running = false;
      this.adapter.midi?.panic();
      await this.actionDone;
      return this.action(input);
    }
    if (this.busy) throw new Error('Still finishing the previous action.');
    if (action === 'mode') {
      if (this.running) throw new Error('Pause the flies before changing instruments.');
      if (!['ambient', 'fruit', 'strings'].includes(input.mode)) throw new Error('Choose Ambient, Fruit pads or Strings.');
      if (input.mode === this.instrumentMode) return this.snapshot();
      const next = makeComposer(input.mode, this.energy);
      next.notes = this.composer.notes;
      next.complete = this.composer.complete;
      next.prime?.(this.musicWorld());
      this.busy = true;
      let finishMode;
      this.actionDone = new Promise(resolve => { finishMode = resolve; });
      try { await this.pending; await this.adapter.setMode?.(input.mode); }
      catch (error) {
        this.error = 'Instrument change failed. Prepare the instrument again before playing.';
        console.error('Ableton Fly instrument change failed:', error);
        throw new Error(this.error);
      }
      finally { this.busy = false; finishMode(); }
      this.composer = next;
      this.instrumentMode = input.mode;
      this.modeRevision++;
      this.error = null;
      this.addEvent(input.mode === 'ambient' ? 'Ambient garden: authored harmony, performed through fly movement and fruit visits.' : input.mode === 'fruit' ? 'Fruit pads: banana C, apple E, grapes G. One note per visit.' : 'Strings selected. Low string contacts play notes; earlier notes are kept.');
      return this.snapshot();
    }
    if (action === 'energy') {
      if (!['calm', 'lively', 'wild'].includes(input.energy)) throw new Error('Choose Calm, Lively or Wild.');
      this.world.setEnergy?.(input.energy);
      this.composer.setEnergy?.(input.energy);
      this.energy = input.energy;
      this.addEvent(`${input.energy[0].toUpperCase() + input.energy.slice(1)} energy: movement and musical response updated.`);
      return this.snapshot();
    }
    if (action === 'refreshFruit') {
      this.world.refreshFruit();
      this.addEvent('Fresh fruit placed. The flies choose new routes.');
      return this.snapshot();
    }
    if (action === 'stimulus') { this.world.setStimulus({ drive: input.drive }); return this.snapshot(); }
    if (action === 'fruit') {
      this.world.addFruit({ x: input.x, y: input.y, kind: input.kind });
      this.addEvent('Fruit placed. Its scent changes the flies’ routes.');
      return this.snapshot();
    }
    if (action === 'clearFruit') { this.world.clearFruit(); return this.snapshot(); }
    this.busy = true;
    let actionFinished;
    this.actionDone = new Promise(resolve => { actionFinished = resolve; });
    if (action !== 'start') this.running = false;
    // Send note-offs immediately, before waiting for any SDK clip write.
    if (action === 'stop' || action === 'panic') this.adapter.midi?.panic();
    try {
      await this.pending;
      if (action === 'prepare') {
        await this.adapter.prepare({ mode: this.instrumentMode });
        this.addEvent('Instrument ready. Keep Live stopped; contacts play its MIDI input directly.');
      } else if (action === 'start') {
        if (this.composer.complete) throw new Error('Piece complete. Save MIDI and restart for another piece.');
        await this.adapter.start();
        this.running = true;
        this.lastSave = 0;
        this.lastModulation = 0;
        this.lastTick = Date.now();
        this.heartbeat();
        this.addEvent(this.instrumentMode === 'ambient' ? 'Ambient garden playing. Flies shape the sound; fruit visits add high accents.' : this.instrumentMode === 'fruit' ? 'Exploring. A fruit visit plays its note; feeding stays quiet afterward.' : 'Exploring. Flies touching strings make notes; free flight is silent.');
      } else {
        try { await this.adapter.recordNotes(this.composer.notes); }
        finally {
          if (action === 'panic') await this.adapter.panic();
          else await this.adapter.stop();
        }
        this.addEvent(action === 'panic' ? 'Instrument muted and all notes released.' : 'Flies paused. Notes saved in Live; press Play there to replay, or Save MIDI.');
      }
      this.error = null;
    } catch (error) {
      this.running = false;
      this.adapter.midi?.panic();
      this.error = !this.adapter.prepared ? 'Prepare the instrument first. Check the local terminal if setup failed.' : 'Live action failed. Check the local terminal and reconnect if the Set changed.';
      if (this.mode === 'demo' || this.composer.complete) this.error = error.message;
      console.error('Ableton Fly action failed:', error);
      throw new Error(this.error);
    } finally { this.busy = false; actionFinished(); }
    return this.snapshot();
  }
  fail(error) {
    this.running = false;
    this.error = 'Instrument connection lost. Reconnect the extension before continuing.';
    this.addEvent(this.error);
    console.error('Ableton Fly performance failed:', error);
    return this.adapter.panic().catch(() => {});
  }
  tick(now = Date.now()) {
    if (!this.running || this.busy) return;
    if (now - this.lastSeen > 10000) {
      this.action({ action: 'stop' }).catch(() => {});
      this.addEvent('Dashboard disconnected; fly paused automatically.');
      return;
    }
    try {
      const wallElapsed = Math.max(0, now - (this.lastTick ?? now - 50));
      const elapsed = Math.min(250, wallElapsed);
      this.lastTick = Math.max(now, this.lastTick ?? now);
      // Sample contacts after each world round, even when a timer wakes late.
      let remaining = elapsed;
      do {
        const step = Math.min(50, remaining);
        this.world.step(step);
        // Limit neural catch-up work without stretching the MIDI clock when
        // Live or a screen recording delays this host's JavaScript timer.
        this.performanceTime += elapsed ? wallElapsed * step / elapsed / 1000 : 0;
        const notes = this.composer.step(this.musicWorld());
        if (notes.length) this.adapter.play(notes);
        remaining -= step;
      } while (remaining > 0 && !this.composer.complete);
      if (this.composer.complete) { this.action({ action: 'stop' }).catch(() => {}); return; }
    } catch (error) { this.pending = this.fail(error); return; }
    const saveNotes = now - this.lastSave >= 2000;
    const modulate = this.instrumentMode === 'ambient' && now - this.lastModulation >= 500;
    if ((!saveNotes && !modulate) || this.saving) return;
    if (saveNotes) this.lastSave = now;
    if (modulate) this.lastModulation = now;
    this.saving = true;
    this.pending = (async () => {
      if (modulate) await this.adapter.modulate?.(this.composer.snapshot().ambience);
      if (saveNotes) await this.adapter.recordNotes(this.composer.notes);
    })()
      .catch(error => this.fail(error)).finally(() => { this.saving = false; });
  }
  startTimer() { this.timer ??= setInterval(() => this.tick(), 50); }
  async close() {
    this.closing = true;
    clearInterval(this.timer);
    this.running = false;
    this.adapter.midi?.panic();
    await this.actionDone;
    this.running = false;
    await this.pending;
    try { await this.adapter.recordNotes(this.composer.notes); } finally { await this.adapter.close(); }
  }
}
