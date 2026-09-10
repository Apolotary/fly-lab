import { FlyWorld } from './world.js';
import { GestureComposer } from './gesture-composer.js';

export class FlyController {
  constructor(adapter, { mode = 'demo', world = new FlyWorld(), composer = new GestureComposer() } = {}) {
    Object.assign(this, { adapter, mode, world, composer });
    this.running = false;
    this.busy = false;
    this.error = null;
    this.events = [];
    this.pending = Promise.resolve();
    this.lastSeen = Date.now();
    this.lastSave = 0;
    this.timer = null;
    this.addEvent(mode === 'live' ? 'Connected to Live. Prepare the piano in an empty Set.' : 'Browser rehearsal. Prepare the piano to hear the movement mapping.');
  }
  addEvent(text) {
    this.events.unshift({ time: new Date().toLocaleTimeString('en-GB'), text });
    this.events.length = Math.min(this.events.length, 12);
  }
  snapshot() {
    return { mode: this.mode, connection: !this.error, prepared: this.adapter.prepared,
      running: this.running, busy: this.busy, error: this.error,
      brain: this.world.snapshot(), music: { ...this.adapter.snapshot(), ...this.composer.snapshot() }, events: this.events };
  }
  heartbeat() { this.lastSeen = Date.now(); }
  midiFile() { return this.composer.midiFile(); }
  async action(input) {
    if (this.closing) throw new Error('The fly is shutting down.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an action object.');
    const { action } = input;
    if (!['prepare', 'start', 'stop', 'panic', 'stimulus', 'fruit', 'clearFruit'].includes(action)) throw new Error('Unknown action.');
    if (this.busy && action === 'panic') {
      this.running = false;
      this.adapter.midi?.panic();
      await this.actionDone;
      return this.action(input);
    }
    if (this.busy) throw new Error('Still finishing the previous action.');
    if (action === 'stimulus') { this.world.setStimulus({ drive: input.drive }); return this.snapshot(); }
    if (action === 'fruit') {
      this.world.addFruit({ x: input.x, y: input.y, kind: input.kind });
      this.addEvent('Fruit placed. Its scent changes the fly’s route.');
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
        await this.adapter.prepare();
        this.addEvent('Piano ready at 96 BPM. Keep Live stopped; the fly plays its MIDI input directly.');
      } else if (action === 'start') {
        if (this.composer.complete) throw new Error('Piece complete. Save MIDI and restart for another piece.');
        await this.adapter.start();
        this.running = true;
        this.lastSave = 0;
        this.lastTick = Date.now();
        this.heartbeat();
        this.addEvent('Exploring. Position becomes pitch; movement and landings make the rhythm.');
      } else {
        try { await this.adapter.recordNotes(this.composer.notes); }
        finally {
          if (action === 'panic') await this.adapter.panic();
          else await this.adapter.stop();
        }
        this.addEvent(action === 'panic' ? 'Piano muted and all notes released.' : 'Fly paused. Notes saved in Live; press Play there to replay, or Save MIDI.');
      }
      this.error = null;
    } catch (error) {
      this.running = false;
      this.adapter.midi?.panic();
      this.error = !this.adapter.prepared ? 'Prepare the piano first. Check the local terminal if setup failed.' : 'Live action failed. Check the local terminal and reconnect if the Set changed.';
      if (this.mode === 'demo' || this.composer.complete) this.error = error.message;
      console.error('Ableton Fly action failed:', error);
      throw new Error(this.error);
    } finally { this.busy = false; actionFinished(); }
    return this.snapshot();
  }
  fail(error) {
    this.running = false;
    this.error = 'Piano connection lost. Reconnect the extension before continuing.';
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
      const elapsed = Math.min(250, Math.max(0, now - (this.lastTick ?? now - 50)));
      this.lastTick = now;
      this.world.step(elapsed);
      const notes = this.composer.step(this.world.snapshot());
      if (notes.length) this.adapter.play(notes);
      if (this.composer.complete) { this.action({ action: 'stop' }).catch(() => {}); return; }
    } catch (error) { this.pending = this.fail(error); return; }
    if (now - this.lastSave < 2000 || this.saving) return;
    this.lastSave = now;
    this.saving = true;
    this.pending = this.adapter.recordNotes(this.composer.notes)
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
