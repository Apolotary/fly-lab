import { MAX_BEATS, TEMPO } from './midi-file.js';

const NEUTRAL_LEVEL = .62;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function parameterValue(parameter, amount) { return parameter.min + (parameter.max - parameter.min) * amount; }

export class LiveInstrumentAdapter {
  constructor(context, { midi, samplePath, resolveSimpler = device => device } = {}) {
    this.context = context;
    this.midi = midi;
    this.samplePath = samplePath;
    this.resolveSimpler = resolveSimpler;
    this.prepared = false;
    this.muted = true;
    this.songRef = null;
    this.record = null;
    this.tail = Promise.resolve();
  }
  snapshot() { return { tempo: TEMPO, source: 'Fly Instrument', midiConnected: Boolean(this.midi?.connected), muted: this.muted }; }
  enqueue(operation) {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => {});
    return next;
  }
  song() {
    const song = this.context.application.song;
    if (this.songRef && song !== this.songRef) throw new Error('Live Set changed. Restart the fly for this Set.');
    return song;
  }
  prepare() {
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
        if (!record.sampleReady) { await record.device.replaceSample(this.samplePath); record.sampleReady = true; }
        if (!record.clip) record.clip = await record.track.createMidiClip(0, MAX_BEATS);
        record.clip.name = 'Ableton Fly · contact notes';
        record.track.arm = false;
        record.track.mute = false;
        this.muted = false;
        this.prepared = true;
      } catch (error) {
        if (this.record) { try { this.record.track.arm = false; this.record.track.mute = true; } catch {} }
        this.muted = true;
        throw error;
      }
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
      if (this.record?.clip) this.record.clip.notes = captured;
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
