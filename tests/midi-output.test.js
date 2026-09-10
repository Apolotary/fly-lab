import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { MidiOutput } from '../src/midi-output.js';

function fixture({ ready = true, quit = true, stubborn = false } = {}) {
  const child = new EventEmitter();
  const commands = [];
  const signals = [];
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    queueMicrotask(() => child.emit('close', 0));
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, encoding, done) {
      for (const line of String(chunk).trim().split('\n')) {
        const command = JSON.parse(line);
        commands.push(command);
        if (command.type === 'quit' && quit) finish();
      }
      done();
    },
  });
  child.kill = (signal) => {
    signals.push(signal);
    if (!stubborn || signal === 'SIGKILL') finish();
    return true;
  };
  const failures = [];
  const midi = new MidiOutput({
    binaryPath: '/test/bridge', spawnProcess: () => {
      if (ready) queueMicrotask(() => child.stdout.write('{"type":"ready","name":"Ableton Fly"}\n'));
      return child;
    },
    onError: (error) => failures.push(error.message), readyTimeoutMs: 20, closeTimeoutMs: 20,
  });
  return { midi, child, commands, signals, failures, finish };
}

test('MIDI waits for readiness, emits bounded notes, and closes with quit', async () => {
  const { midi, child, commands } = fixture({ ready: false });
  const opening = midi.open();
  assert.equal(midi.connected, false);
  assert.equal(midi.note({ pitch: 60, velocity: 70, duration: 0.5 }), false);
  // A readiness message may arrive split across pipe reads.
  child.stdout.write('{"type":"rea');
  child.stdout.write('dy","name":"Ableton Fly"}\n');
  await opening;
  assert.equal(midi.connected, true);
  assert.equal(midi.note({ pitch: 60, velocity: 70, duration: 0.5 }), true);
  assert.equal(midi.panic(), true);
  await midi.close();
  assert.equal(midi.connected, false);
  assert.equal(midi.note({ pitch: 60, velocity: 70, duration: 0.5 }), false);
  assert.deepEqual(commands, [
    { type: 'note', pitch: 60, velocity: 70, duration: 0.5, channel: 0 },
    { type: 'panic' }, { type: 'quit' },
  ]);
});

test('MIDI rejects invalid note ranges and other channels before writing', async () => {
  const { midi, commands } = fixture();
  await midi.open();
  for (const invalid of [{ pitch: 47 }, { pitch: 85 }, { pitch: 60.1 }, { velocity: 0 },
    { velocity: 101 }, { velocity: NaN }, { duration: 0.09 }, { duration: Infinity }, { channel: 1 }]) {
    assert.equal(midi.note({ pitch: 60, velocity: 70, duration: 0.5, ...invalid }), false);
  }
  assert.deepEqual(commands, []);
  await midi.close();
});

test('MIDI startup timeout rejects and terminates the unready child', async () => {
  const { midi, signals, failures } = fixture({ ready: false });
  await assert.rejects(midi.open(), /did not become ready/);
  assert.equal(midi.connected, false);
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(failures.length, 1);
  await midi.close();
});

test('MIDI connection loss reports a sanitized error once and disables notes', async () => {
  const { midi, child, failures, signals } = fixture();
  await midi.open();
  child.stdin.emit('error', new Error('EPIPE with a sensitive local path'));
  child.emit('error', new Error('another private diagnostic'));
  assert.equal(midi.connected, false);
  assert.deepEqual(failures, ['The MIDI connection closed.']);
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(midi.panic(), false);
  await midi.close();
});

test('MIDI unexpected native exit disconnects the controller', async () => {
  const { midi, failures, finish } = fixture();
  await midi.open();
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(midi.connected, false);
  assert.deepEqual(failures, ['The MIDI bridge stopped.']);
  await midi.close();
});

test('MIDI close falls back to SIGTERM if quit is ignored', async () => {
  const { midi, signals, failures } = fixture({ quit: false });
  await midi.open();
  await midi.close();
  assert.deepEqual(signals, ['SIGTERM']);
  assert.deepEqual(failures, []);
});

test('MIDI native error details do not leak into callback messages', async () => {
  const { midi, child, failures } = fixture();
  await midi.open();
  child.stdout.write('{"type":"error","message":"private diagnostic"}\n');
  assert.deepEqual(failures, ['The MIDI bridge reported an error.']);
  await midi.close();
});

test('MIDI malformed native status fails safely without an event-handler exception', async () => {
  const { midi, child, failures } = fixture();
  await midi.open();
  child.stdout.write('null\n');
  assert.equal(midi.connected, false);
  assert.deepEqual(failures, ['The MIDI bridge sent an invalid response.']);
  await midi.close();
});
