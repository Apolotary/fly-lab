import { spawn } from 'node:child_process';

const READY_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 1200;

export class MidiOutput {
  constructor({ binaryPath, onError = () => {}, spawnProcess = spawn, readyTimeoutMs = READY_TIMEOUT_MS,
    closeTimeoutMs = CLOSE_TIMEOUT_MS } = {}) {
    this.binaryPath = binaryPath;
    this.onError = onError;
    this.connected = false;
    this._spawn = spawnProcess;
    this._readyTimeoutMs = readyTimeoutMs;
    this._closeTimeoutMs = closeTimeoutMs;
    this._child = null;
    this._closing = false;
  }

  async open() {
    if (this.connected) return;
    if (this._opening) return this._opening;
    if (this._child || this._closing) throw new Error('MIDI bridge is shutting down.');
    if (typeof this.binaryPath !== 'string' || !this.binaryPath) throw new Error('Run Setup Fly to build the MIDI bridge.');
    this._failed = false;
    let child;
    try { child = this._spawn(this.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { throw new Error('The MIDI bridge could not start. Run Setup Fly again.'); }
    this._child = child;
    this._exited = new Promise((resolve) => { this._resolveExit = resolve; });
    let buffer = '';
    const opening = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
    this._opening = opening;
    this._readyTimer = setTimeout(() => this._fail('The MIDI bridge did not become ready.'), this._readyTimeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 16384) return this._fail('The MIDI bridge sent an invalid response.');
      let boundary;
      while ((boundary = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        let event;
        try { event = JSON.parse(line); }
        catch { this._fail('The MIDI bridge sent an invalid response.'); return; }
        if (!event || typeof event !== 'object') {
          this._fail('The MIDI bridge sent an invalid response.');
          return;
        }
        if (event.type === 'ready' && !this._closing && !this._failed) {
          clearTimeout(this._readyTimer);
          this.connected = true;
          this._resolveReady?.();
          this._resolveReady = this._rejectReady = null;
        } else if (event.type === 'error') {
          this._fail('The MIDI bridge reported an error.');
        }
      }
    });
    // Compiler/runtime diagnostics may contain local paths; never forward them to the dashboard.
    child.stderr.resume();
    child.stdin.on('error', () => this._fail('The MIDI connection closed.'));
    child.stdout.on('error', () => this._fail('The MIDI connection closed.'));
    child.once('error', () => this._fail('The MIDI bridge could not start. Run Setup Fly again.'));
    child.once('close', () => {
      clearTimeout(this._readyTimer);
      this.connected = false;
      if (!this._closing) this._fail('The MIDI bridge stopped.');
      else this._rejectReady?.(new Error('The MIDI bridge was closed.'));
      this._resolveReady = this._rejectReady = null;
      if (this._child === child) this._child = null;
      this._resolveExit?.();
    });
    try { await opening; }
    finally { this._opening = null; }
  }

  note({ pitch, velocity, duration, channel = 0 } = {}) {
    if (!Number.isInteger(pitch) || pitch < 48 || pitch > 84 || !Number.isInteger(velocity)
      || velocity < 1 || velocity > 100 || !Number.isFinite(duration) || duration < 0.1 || duration > 3 || channel !== 0) return false;
    return this._send({ type: 'note', pitch, velocity, duration, channel });
  }

  panic() { return this._send({ type: 'panic' }); }

  _send(command) {
    if (!this.connected || this._closing || !this._child?.stdin.writable) return false;
    if (this._child.stdin.writableLength > 65536) {
      this._fail('The MIDI connection could not keep up.');
      return false;
    }
    try {
      this._child.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
        if (error) this._fail('The MIDI connection closed.');
      });
      return true;
    } catch {
      this._fail('The MIDI connection closed.');
      return false;
    }
  }

  _fail(message) {
    this.connected = false;
    clearTimeout(this._readyTimer);
    this._rejectReady?.(new Error(message));
    this._resolveReady = this._rejectReady = null;
    if (this._closing || this._failed) return;
    this._failed = true;
    try { this.onError(new Error(message)); } catch { /* An observer cannot interrupt cleanup. */ }
    // The native SIGTERM handler sends note-offs before disposing its MIDI endpoint.
    try { this._child?.kill('SIGTERM'); } catch { /* The process may already have exited. */ }
  }

  async close() {
    if (this._closePromise) return this._closePromise;
    const child = this._child;
    if (!child) return;
    this._closing = true;
    this.connected = false;
    clearTimeout(this._readyTimer);
    this._rejectReady?.(new Error('The MIDI bridge was closed.'));
    this._resolveReady = this._rejectReady = null;
    this._closePromise = (async () => {
      try { child.stdin.end(`${JSON.stringify({ type: 'quit' })}\n`); }
      catch { try { child.kill('SIGTERM'); } catch {} }
      const termTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, this._closeTimeoutMs);
      const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, this._closeTimeoutMs + 500);
      try { await this._exited; }
      finally { clearTimeout(termTimer); clearTimeout(killTimer); }
    })();
    try { await this._closePromise; }
    finally { this._closing = false; this._closePromise = null; }
  }
}
