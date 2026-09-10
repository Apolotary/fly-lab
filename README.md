# ableton-fly

**From fruit to ear. Three flies, a fruit instrument, Ableton.**

Three simulated fruit flies explore a small habitat. They walk, fly, seek fruit
and feed. In the default **Fruit pads** mode, beginning to feed plays the fruit's
MIDI note in Ableton Live. Original wires connect the fruit to a virtual MIDI box,
and the touched fruit's note label flashes. Moving fruit changes the performance.

The fruit instrument takes inspiration from [Playtronica's Playtron](https://help.playtronica.com/devices/playtron/),
which connects conductive objects to MIDI through human touch. Here, simulated
feeding contacts trigger notes; no physical hardware or electrical conductivity
is modeled.

The preserved **Strings** mode is inspired by Céleste Boursier-Mougenot’s
**from here to ear**, in which zebra finches move freely and make sound by touching amplified guitar strings.
[Copenhagen Contemporary’s exhibition description](https://copenhagencontemporary.org/en/celeste-boursier-mougenot/)
is the reference for this independent digital adaptation. No exhibition images,
recordings, or models are copied.

The project runs locally: Three.js, three copies of a small measured motor
circuit, and an original macOS MIDI bridge. No cloud GPU, API key, third-party
MIDI driver or whole-connectome download is needed.

## Start the installation

Requires macOS, **Node.js 24.16+**, **Xcode Command Line Tools**, an
Extensions-compatible Ableton Live Suite beta, and your own
**Extensions SDK 1.0.0-beta.1 ZIP**. Ableton’s SDK and sounds are not included.

1. Double-click **Setup Fly.command** once and drag your SDK ZIP into the terminal
   when asked. Setup detects Live in Applications folders, including
   `Applications2` on an external drive, and compiles the local MIDI bridge.
2. Open an **empty Live Set** with Extensions enabled. Save existing work before
   switching Sets and finish any save dialog. Preparation sets this Set to 96 BPM.
3. Double-click **Start Fly.command** and keep its terminal open. The launcher
   opens Chrome when installed, with your default browser as a fallback.
4. In Live’s **Tempo & MIDI** settings, enable **Track** for **Ableton Fly** if it
   is not already enabled. Close Settings afterward so the beta can continue.
5. Click **Prepare instrument**. This creates one **Fly Instrument** MIDI track,
   loads a local factory acoustic-guitar sample into Simpler, and creates an
   arrangement clip named **Ableton Fly · contact notes** for the performance.
6. Keep Live’s transport **stopped**, then click **Let flies explore**.

Choose Banana, Apple or Grape, then click the habitat to place fruit. Up to six
pieces share the space. **Clear** removes the fruit. The flies continue exploring.
Their feeding contacts play Live’s MIDI input immediately. The instrument is
armed for monitoring; the extension does not start the transport or global recording.

**Fruit pads** is selected by default. Pause to switch between **Fruit pads** and
**Strings**. Switching keeps the recorded notes and establishes a fresh contact
baseline: a fly already feeding does not make a new note simply because the mode
changed. The mode changes what triggers MIDI, while the Live instrument stays the same.

**Pause** releases notes and disarms the track. Press **Play in Live from bar 1**
to replay its recorded clip. Stop the transport before resuming the flies.
**Save MIDI** exports `ableton-fly.mid`, including its timing and tempo.
**Panic** or Escape releases notes and mutes the owned track; Start unmutes it.
Closing the dashboard pauses the flies after ten seconds.

To hear a piano instead, replace the Fly Instrument instrument in Live with a piano
preset. Both contact modes can play it. Pause before editing the instrument.

Preparation creates a single owned track per running extension. Restarting the
extension and preparing again creates a new track. For another take, pause,
close the launcher, save your Set, open a new empty Set and restart the launcher.
Complete any save prompt before preparing. Restart after changing Sets.

## Make the split-screen video

In Chrome, click **Choose Ableton window** and select Live. The left side shows
the actual Live window; the right side shows fly 01’s measured motor circuit and
all three flies in the habitat. Drag either 3D view to rotate it.

The screen stream stays inside your browser. Enable audio in the sharing picker
to include Live's sound, then click **Record video** and **Let flies explore**.
Move or replenish fruit during the take. **Stop & save** downloads a landscape
video with the Live window, circuit, and habitat; recording also stops after two
minutes. The recorder never uploads anything or uses the microphone.

The recording status reports whether shared audio is available. If it says
**Video only**, the file has no sound: export the performance's audio from Live
separately. Browser rehearsal can record its own synthesized preview sound.
Recording does not start the flies or Live's transport automatically.

If the sharing prompt does not open, bring Chrome forward and click again.
**Companion view** also lets you place the habitat beside native Live without
window sharing. Keep the browser visible while recording.

## What makes a note?

**Fruit pads** maps banana to C4 (MIDI 60), apple to E4 (64), and grape to G4 (67).
These are scientific pitch labels; Live's octave labels differ. Each fly's new
feeding visit produces one attack. Continuing to feed stays silent. Leaving and
revisiting the fruit can trigger another note. Passing nearby or flying above
fruit does not play it.

**Strings** uses six visible strings with fixed pitches: C3, G3, C4, E4, G4 and C5
(MIDI 48, 55, 60, 64, 67 and 72).

- Crossing a finite string near the surface, or descending onto it, creates a note.
- Touch speed affects note strength. Holding still on a string does not repeat notes.
- Flight above the strings is silent.

String contacts use simple geometric tests against the displayed segments and a
small height threshold. They approximate body contact; they do not solve leg
forces, string mechanics or aerodynamics. Fruit contacts come from the modeled
feeding state. Pitches, sensitivity and sound are instrument-design choices.
This is a toy virtual installation.

Both modes preserve contact timing rather than snapping notes to a musical grid.
There are no automatic turns, landing chords or backing tracks. 96 BPM is the
clip/export time reference. Capture stops at 128 bars or the note limit.

Each fly runs an independent copy of DesktopFly’s **1,045-neuron MaleCNS motor
subset**, with **17,224 directed connections** and **708,689 synaptic contacts**.
All three use the same measured wiring with different seeded inputs. The anatomy
counts describe each copy, not three different measured animals. Simulated motor
activity gates movement and turning. Disabling the measured synapses stops motion
and contact-generated music in tests.

Fruit sensing, shared food, hunger, walking/flight intervals and steering are
engineered behavioral rules. All fruit kinds are equally attractive. There is no
biological olfactory model, musical reward or learned composition; the flies do
not hear or understand the music. The brain display shows fly 01 only: 880 actual
soma positions, with the other 165 neurons still included in its simulation.

See [the artistic inspiration](docs/INSPIRATION.md),
[OSS choices](docs/OSS_OPTIONS.md), and [data provenance](THIRD_PARTY_NOTICES.md).

Suggested caption:

> Three simulated flies go looking for fruit. The fruit plays Ableton.

## Development and preview

```sh
npm run setup -- /path/to/extensions-sdk.zip "/path/to/Ableton Live Beta.app"
npm start
```

Without Live or its SDK: `npm install`, then `npm run demo` and open
[the local dashboard](http://127.0.0.1:9321). Prepare the instrument and start the
flies to unlock the browser’s original synthesized preview. Preview mode never
controls Live and contains no Ableton samples. MIDI export also works there.

```sh
npm test
npm run build
npm run check:privacy -- --staged
```

## Privacy and licenses

The server binds to `127.0.0.1`, validates Host and Origin, and requires a per-run
token for actions and MIDI export. There is no telemetry, remote asset loading,
cloud processing or upload. Detailed errors remain in the local terminal.

Git excludes the proprietary SDK, settings and installation paths, dependencies,
bundles, native binaries, audio, MIDI exports, Live Sets, logs and recordings.
The guitar sample is read from your installed Live factory content and is never
redistributed. The native bridge uses Apple’s installed CoreMIDI framework.

Original code is MIT licensed; the measured MaleCNS extract is CC BY 4.0.
Attribution is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Ableton’s SDK and factory sounds must be supplied locally under their own terms.
