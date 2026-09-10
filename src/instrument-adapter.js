import { MAX_BEATS, TEMPO } from './midi-file.js';

const NEUTRAL_LEVEL = .62;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function parameterValue(parameter, amount) { return parameter.min + (parameter.max - parameter.min) * amount; }
async function finishWrites(writes) {
  const results = await Promise.allSettled(writes);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

export class LiveInstrumentAdapter {
  constructor(context, { midi, samplePath, ambientSamplePath, resolveSimpler = device => device } = {}) {
    this.context = context;
    this.midi = midi;
    this.samplePath = samplePath;
    this.ambientSamplePath = ambientSamplePath;
    this.instrumentMode = 'fruit';
    this.controlParameters = {};
    this.parameterBounds = new WeakMap();
    this.resolveSimpler = resolveSimpler;
    this.prepared = false;
    this.muted = true;
    this.songRef = null;
    this.record = null;
    this.tail = Promise.resolve();
  }
  snapshot() { return { tempo: TEMPO, source: 'Fly Instrument', midiConnected: Boolean(this.midi?.connected), muted: this.muted,
    liveControls: { brightness: Boolean(this.controlParameters.brightness), space: Boolean(this.controlParameters.space), pan: Boolean(this.controlParameters.pan) } }; }
  enqueue(operation) {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => {});
    return next;
  }
  writeBatch(operation) {
    return this.context.withinTransaction ? this.context.withinTransaction(operation) : operation();
  }
  song() {
    const song = this.context.application.song;
    if (this.songRef && song !== this.songRef) throw new Error('Live Set changed. Restart the fly for this Set.');
    return song;
  }
  prepare({ mode = 'fruit' } = {}) {
    return this.enqueue(async () => {
      const song = this.song();
      if (this.prepared) return;
      if (!this.midi?.connected) throw new Error('MIDI port is not ready.');
      this.songRef = song;
      try {
        if (!this.record) this.record = { track: await song.createMidiTrack(), device: null, rawDevice: null, sampleReady: false, clip: null };
        const record = this.record;
        song.tempo = TEMPO;
        record.track.name = 'Fly Instrument';
        record.track.arm = false;
        record.track.mute = true;
        await record.track.mixer.volume.setValue(parameterValue(record.track.mixer.volume, NEUTRAL_LEVEL));
        if (!record.rawDevice) record.rawDevice = await record.track.insertDevice('Simpler', 0);
        if (!record.device) record.device = this.resolveSimpler(record.rawDevice);
        record.track.arm = false;
        if (!record.sampleReady) { await record.device.replaceSample(mode === 'ambient' ? this.ambientSamplePath : this.samplePath); record.sampleReady = true; }
        if (!record.clip) record.clip = await record.track.createMidiClip(0, MAX_BEATS);
        record.clip.name = 'Ableton Fly · contact notes';
        await this.configureMode(mode, true);
        record.track.arm = false;
        record.track.mute = false;
        this.muted = false;
        this.prepared = true;
      } catch (error) {
        if (this.record) {
          this.record.sampleReady = false;
          try { this.record.track.arm = false; this.record.track.mute = true; } catch {}
        }
        this.controlParameters = {};
        this.muted = true;
        throw error;
      }
    });
  }
  parameter(device, names) {
    const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    const allowed = names.map(normalize);
    return device?.parameters?.find(parameter => allowed.includes(normalize(parameter.name)));
  }
  async setParameter(parameter, value) {
    if (parameter) {
      const { min, max } = this.bounds(parameter);
      await parameter.setValue(clamp(value, min, max));
    }
  }
  bounds(parameter) {
    // In this SDK even min/max are synchronous calls into Live. Read them once
    // per parameter instead of blocking the neural/MIDI timer on every update.
    if (!this.parameterBounds.has(parameter)) this.parameterBounds.set(parameter, { min: parameter.min, max: parameter.max });
    return this.parameterBounds.get(parameter);
  }
  async setAmount(parameter, amount) {
    if (parameter) await this.setParameter(parameter, parameterValue(this.bounds(parameter), clamp(amount, 0, 1)));
  }
  async configureMode(mode, sampleLoaded = false) {
    const record = this.record;
    if (!record) { this.instrumentMode = mode; return; }
    const ambient = mode === 'ambient';
    if (!sampleLoaded && (ambient !== (this.instrumentMode === 'ambient'))) {
      await record.device.replaceSample(ambient ? this.ambientSamplePath : this.samplePath);
    }
    if (ambient && !record.reverb) record.reverb = await record.track.insertDevice('Reverb', 1);
    const brightness = this.parameter(record.rawDevice, ['Filter Freq', 'Filter Frequency', 'Filter Cutoff', 'Filter Cutoff Frequency']);
    const attack = this.parameter(record.rawDevice, ['Ve Attack', 'Amp Attack', 'Amp Envelope Attack Time']);
    const release = this.parameter(record.rawDevice, ['Ve Release', 'Amp Release', 'Amp Envelope Release Time']);
    const wet = this.parameter(record.reverb, ['Dry/Wet']);
    const decay = this.parameter(record.reverb, ['DecayTime', 'Decay Time']);
    await this.writeBatch(() => finishWrites([
      // SDK parameters use normalized native ranges, not the displayed Hz/ms.
      this.setAmount(attack, ambient ? .58 : 0),
      this.setAmount(release, ambient ? .67 : .2),
      this.setAmount(brightness, ambient ? .69 : 1),
      this.setAmount(this.parameter(record.reverb, ['Device On']), ambient ? 1 : 0),
      this.setAmount(wet, ambient ? .42 : 0),
      this.setAmount(decay, .6),
      ...(ambient ? [this.setAmount(this.parameter(record.rawDevice, ['Voices']), 1)] : []),
      record.track.mixer.volume.setValue(parameterValue(record.track.mixer.volume, ambient ? .7 : NEUTRAL_LEVEL)),
    ]));
    this.controlParameters = ambient ? { brightness, space: wet, pan: record.track.mixer.panning } : {};
    if (!ambient) await this.setAmount(record.track.mixer.panning, .5);
    this.instrumentMode = mode;
    record.clip.name = mode === 'tombola' ? 'Ableton Fly · fly tombola' : ambient ? 'Ableton Fly · ambient garden' : 'Ableton Fly · contact notes';
  }
  setMode(mode) {
    if (!['ambient', 'fruit', 'strings', 'tombola'].includes(mode)) return Promise.reject(new Error('Unknown instrument mode.'));
    return this.enqueue(async () => {
      this.song();
      this.midi?.panic();
      if (this.record) this.record.track.arm = false;
      const previousMode = this.instrumentMode;
      try { await this.configureMode(mode); }
      catch (error) {
        // A failed SDK write may have changed only part of the instrument.
        // Require a full prepare before it can sound again.
        this.prepared = false;
        this.instrumentMode = previousMode;
        this.muted = true;
        this.controlParameters = {};
        if (this.record) {
          this.record.sampleReady = false;
          try { this.record.track.arm = false; this.record.track.mute = true; } catch {}
        }
        throw error;
      }
    });
  }
  modulate(ambience) {
    if (this.instrumentMode !== 'ambient' || !this.prepared || !ambience) return Promise.resolve();
    return this.enqueue(async () => {
      this.song();
      for (const key of ['brightness', 'space', 'pan']) if (!Number.isFinite(ambience[key])) throw new Error('Invalid ambient control.');
      await this.writeBatch(() => finishWrites([
        this.setAmount(this.controlParameters.brightness, .4 + .45 * clamp(ambience.brightness, 0, 1)),
        this.setAmount(this.controlParameters.space, .28 + .38 * clamp(ambience.space, 0, 1)),
        this.setAmount(this.controlParameters.pan, .5 + clamp(ambience.pan, -1, 1) * .325),
      ]));
    });
  }
  start() {
    return this.enqueue(async () => {
      this.song();
      if (!this.prepared || !this.midi.connected) throw new Error('Prepare the instrument and MIDI port first.');
      this.midi.panic();
      this.record.track.mute = false;
      // This owned track is armed only for monitoring the virtual MIDI input.
      // The transport and global recording switch are never changed.
      this.record.track.arm = true;
      this.muted = false;
    });
  }
  play(notes) {
    this.song();
    if (!this.prepared || !this.midi.connected) throw new Error('MIDI port disconnected.');
    for (const note of notes) {
      if (!this.midi.note({ pitch: note.pitch, velocity: note.velocity, duration: note.duration, channel: 0 })) {
        throw new Error('MIDI note could not be sent.');
      }
    }
  }
  recordNotes(notes) {
    // Capture a stable copy before joining the serial SDK queue.
    const captured = notes.map(n => ({ pitch: n.pitch, velocity: n.velocity, startTime: n.beat,
      duration: clamp(n.duration * TEMPO / 60, .01, MAX_BEATS - n.beat) }));
    return this.enqueue(async () => {
      this.song();
      const signature = JSON.stringify(captured);
      if (this.record?.clip && this.record.notesSignature !== signature) {
        this.record.clip.notes = captured;
        this.record.notesSignature = signature;
      }
    });
  }
  stop() {
    // Note-offs should be immediate, even if a clip write is in flight.
    this.midi?.panic();
    return this.enqueue(async () => { this.song(); if (this.record) this.record.track.arm = false; });
  }
  panic() {
    this.midi?.panic();
    return this.enqueue(async () => {
      this.song();
      if (this.record) { this.record.track.arm = false; this.record.track.mute = true; }
      this.muted = true;
    });
  }
  async close() { try { await this.stop(); } finally { await this.midi?.close(); } }
}

export class PreviewInstrumentAdapter {
  constructor() { this.prepared = false; this.muted = true; }
  snapshot() { return { tempo: TEMPO, source: 'Browser rehearsal', midiConnected: false, muted: this.muted }; }
  async prepare() { this.prepared = true; this.muted = false; }
  async start() { if (!this.prepared) throw new Error('Prepare the instrument first.'); this.muted = false; }
  play() {}
  async recordNotes() {}
  async stop() {}
  async panic() { this.muted = true; }
  async close() { await this.stop(); }
}
