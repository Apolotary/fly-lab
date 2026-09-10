import { FlyBrain } from './brain.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

// A human-authored musical mapping. The input is simulated motor population activity.
export function mapMusic(brain, previous) {
  const activity = brain.activity.map(v => clamp(v, 0, 1));
  const mean = activity.reduce((a, b) => a + b, 0) / 6;
  const target = 105 + mean * 90;
  const thresholds = [0.12, 0.12, 0.28, 0.115, 0.115, 0.17];
  const tempo = Math.round(clamp(target, previous.tempo - 2, previous.tempo + 2) * 10) / 10;
  return {
    tempo: clamp(tempo, 100, 145),
    voices: previous.voices.map((voice, i) => ({
      name: voice.name,
      active: activity[i] > thresholds[i] + (voice.active ? -0.01 : 0.01),
      pan: clamp((activity[i] - activity[(i + 3) % 6]) * 2.2 + brain.turn * 0.35, -0.65, 0.65),
      level: clamp(0.16 + activity[i] * 0.7, 0.12, 0.48),
    })),
  };
}

export class FlyController {
  constructor(adapter, { mode = 'demo', brain = new FlyBrain() } = {}) {
    this.adapter = adapter;
    this.mode = mode;
    this.brain = brain;
    this.running = false;
    this.busy = false;
    this.error = null;
    this.events = [];
    this.pending = Promise.resolve();
    this.lastSeen = Date.now();
    this.lastApply = 0;
    this.timer = null;
    this.addEvent(mode === 'live' ? 'Connected to Live. Build the demo in an empty Set.' : 'Rehearsal mode. Ableton is not connected.');
  }
  addEvent(text) {
    this.events.unshift({ time: new Date().toLocaleTimeString('en-GB'), text });
    this.events.length = Math.min(this.events.length, 12);
  }
  snapshot() {
    return { mode: this.mode, connection: !this.error, prepared: this.adapter.prepared,
      running: this.running, busy: this.busy, error: this.error,
      brain: this.brain.snapshot(), music: this.adapter.snapshot(), events: this.events };
  }
  heartbeat() { this.lastSeen = Date.now(); }
  async action(input) {
    if (this.closing) throw new Error('The fly is shutting down.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an action object.');
    const { action } = input;
    if (!['prepare', 'start', 'stop', 'panic', 'stimulus'].includes(action)) throw new Error('Unknown action.');
    if (this.busy) throw new Error('Still finishing the previous action.');
    if (action === 'stimulus') {
      for (const key of ['drive', 'turn']) if (input[key] !== undefined && !Number.isFinite(input[key])) throw new Error('Stimulus must be a finite number.');
      this.brain.setStimulus({ drive: input.drive, turn: input.turn });
      return this.snapshot();
    }
    this.busy = true;
    let actionFinished;
    this.actionDone = new Promise(resolve => { actionFinished = resolve; });
    // Stop simulation first; drain an in-flight write before restoring or muting.
    if (action !== 'start') this.running = false;
    try {
      await this.pending;
      if (action === 'prepare') {
        await this.adapter.prepare();
        this.addEvent('Six fly tracks ready. Press Play in Live from bar 1, then release the fly.');
      } else if (action === 'start') {
        if (!this.adapter.prepared) throw new Error('Build the demo first.');
        this.running = true;
        this.lastApply = 0;
        this.heartbeat();
        this.addEvent('The fly has the mixer. Neural activity controls all six voices.');
      } else if (action === 'stop') {
        await this.adapter.restore();
        this.addEvent('Fly frozen. Original tempo restored. Live playback stays under your control.');
      } else {
        await this.adapter.panic();
        await this.adapter.restore();
        this.addEvent('Fly tracks muted. Press Stop in Live to stop the transport.');
      }
      this.error = null;
    } catch (error) {
      this.running = false;
      // Do not put SDK errors (which may contain private project paths) into the browser.
      this.error = action === 'start' && !this.adapter.prepared ? 'Build the demo first.' : 'Live action failed. Stop playback and check the local terminal.';
      if (this.mode === 'demo') this.error = error.message;
      console.error('Ableton Fly action failed:', error);
      throw new Error(this.error);
    } finally { this.busy = false; actionFinished(); }
    return this.snapshot();
  }
  tick(now = Date.now()) {
    if (!this.running || this.busy) return;
    // A browser crash or closed recording window must not leave autonomous writes running.
    if (now - this.lastSeen > 10000) {
      this.action({ action: 'stop' }).catch(() => {});
      this.addEvent('Dashboard disconnected; fly paused automatically.');
      return;
    }
    this.brain.step(50);
    if (now - this.lastApply < 1000 || this.applying) return;
    this.lastApply = now;
    this.applying = true;
    this.pending = this.adapter.apply(mapMusic(this.brain.snapshot(), this.adapter.snapshot()))
      .catch(async error => {
        this.running = false;
        this.error = 'Lost control of Live. Stop playback and reconnect the extension.';
        this.addEvent(this.error);
        console.error('Ableton Fly modulation failed:', error);
        await Promise.allSettled([this.adapter.panic(), this.adapter.restore()]);
      }).finally(() => { this.applying = false; });
  }
  startTimer() { this.timer ??= setInterval(() => this.tick(), 50); }
  async close() {
    this.closing = true;
    clearInterval(this.timer);
    this.running = false;
    await this.actionDone;
    this.running = false;
    await this.pending;
    await this.adapter.restore();
  }
}
