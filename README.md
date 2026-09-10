# ableton-fly

**An ambient garden performed by twelve simulated flies.**

Twelve simulated fruit flies walk, fly, seek fruit and feed in a small habitat.
In the default **Ambient** mode, their collective movement changes the brightness,
density, space and pan of a musical bed in Ableton. Fruit visits add bell-like
accents. **Lively** is the default: faster body movement, five-second chord changes
and rippling high notes shaped by the crowd. Switch **Calm / Lively / Wild** while
playing, or press **Fresh fruit** to give the flies new destinations.

The harmony and rhythm are authored: Cmaj9 → Am9 → Fmaj9 → G6/9, with eight beats
per chord in Lively/Wild, sixteen in Calm, and soft attacks every four beats. The flies influence the performance;
they do not learn music or compose this progression. A quiet foundation continues
when the flies are still.

**Fruit pads** and **Strings** remain available for contact-only performances.
Fruit pads plays a note when a fly begins feeding. Original wires connect the
fruit to a virtual MIDI box, and the touched fruit's label flashes.

The fruit instrument takes inspiration from [Playtronica's Playtron](https://help.playtronica.com/devices/playtron/),
which connects conductive objects to MIDI through human touch. Here, simulated
feeding contacts trigger notes; no physical hardware or electrical conductivity
is modeled.

The preserved **Strings** mode is inspired by Céleste Boursier-Mougenot’s
**from here to ear**, in which zebra finches move freely and make sound by touching amplified guitar strings.
[Copenhagen Contemporary’s exhibition description](https://copenhagencontemporary.org/en/celeste-boursier-mougenot/)
is the reference for this independent digital adaptation. No exhibition images,
recordings, or models are copied.

The project runs locally: Three.js, twelve independent copies of a small measured motor
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
   loads an original locally generated ambient sound into Simpler, adds Live's
   native Reverb, and creates **Ableton Fly · ambient garden** in Arrangement.
6. Keep Live’s transport **stopped**, then click **Let flies explore**.

Choose Banana, Apple or Grape, then click the habitat to place fruit. Up to six
pieces share the space. **Clear** removes the fruit. The flies continue exploring.
The performance plays Live's MIDI input immediately on channel 1. The instrument is
armed for monitoring; the extension does not start the transport or global recording.

**Ambient** is selected by default. Pause to switch between **Ambient**,
**Fruit pads** and **Strings**. Switching keeps the recorded notes and establishes a fresh contact
baseline: a fly already feeding does not make a new note simply because the mode
changed. Ambient uses the original synthesized sample and swarm-controlled
effects; Fruit pads and Strings use a local factory acoustic-guitar sample.

**Pause** releases notes and disarms the track. Press **Play in Live from bar 1**
to replay its recorded clip. Stop the transport before resuming the flies.
**Save MIDI** exports `ableton-fly.mid`, including its timing and tempo.
**Panic** or Escape releases notes and mutes the owned track; Start unmutes it.
Closing the dashboard pauses the flies after ten seconds.

The clip stores notes; MIDI export also includes tempo. Continuous filter, pan and Reverb
changes are performed live; replay uses the current instrument settings. Capture
the shared audio/video to keep the performance as heard.

To hear a piano instead, select Fruit pads or Strings, pause, and replace the
Fly Instrument track's instrument in Live with a piano preset. Contact MIDI can
play that preset. Keep that mode for the take; restarting in a new empty Set
rebuilds the default setup. Ambient's controls require the original Simpler.

Preparation creates a single owned track per running extension. Restarting the
extension and preparing again creates a new track. For another take, pause,
close the launcher, save your Set, open a new empty Set and restart the launcher.
Complete any save prompt before preparing. Restart after changing Sets.

## Make the split-screen video

In Chrome, click **Choose Ableton window** and select Live. The left side shows
the actual Live window; the right side shows fly 01’s measured motor circuit and
the swarm in the habitat. Drag either 3D view to rotate it.

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

## What changes the music?

**Ambient** combines an authored musical foundation with the swarm's activity:

- Cmaj9, Am9, Fmaj9 and G6/9 repeat: eight beats per chord in Lively/Wild, sixteen in Calm.
- Soft attacks every four beats keep a gentle foundation audible.
- Lively adds an authored ripple every beat; Wild uses half-beats. Fly activity and
  position shape its register, strength and chord-tone choice. Calm has no ripples.
- Collective movement influences brightness, note density, spatial effects and pan.
  Denser voicings add the upper chord tones.
- New feeding visits add fruit accents; continuing to feed does not repeat them.

Energy changes the toy body's movement gain (1× / 1.65× / 2.25×), steering and
behavior pacing. It does not speed up or replace the measured neural circuit.
Fresh fruit changes the shared food layout without resetting the animals or notes.

One generated sample supplies warm lower tones and brighter upper-register
chimes through the same Simpler; the sound is not split across multiple tracks.

The base harmony, pulse, sound synthesis and control mappings are original
musical decisions. Fruit placement changes the flies' trajectories and therefore
the modulation. The foundation can sound without a contact; this is an ambient
performance driven in part by the simulation.

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

Fruit pads and Strings preserve contact timing rather than snapping notes to a
musical grid. Those two modes have no backing bed and remain silent without
contact. 96 BPM is the clip/export time reference for all modes. Capture stops at
128 bars or the note limit.

The musical timeline follows elapsed time while the performance is running.
Each delayed timer update advances at most 250 ms of neural simulation, keeping
catch-up work bounded. Under load, the fly simulation can therefore run more
slowly while generated note positions retain the 96 BPM performance timeline.
A delayed callback can still play a note late. Pause freezes the musical timeline;
resuming or changing instrument mode keeps the current position and recorded notes.

Each fly runs an independent copy of DesktopFly’s **1,045-neuron MaleCNS motor
subset**, with **17,224 directed connections** and **708,689 synaptic contacts**.
The default twelve flies use the same measured wiring with different seeded
inputs: twelve independent simulations of one anatomical subset. The anatomy
counts describe each copy, not twelve separately measured animals. Simulated motor
activity gates movement and turning. Disabling the measured synapses stops motion
and contact-generated music in tests; the authored Ambient foundation is separate.

Fruit sensing, shared food, hunger, walking/flight intervals and steering are
engineered behavioral rules. All fruit kinds are equally attractive. There is no
biological olfactory model, musical reward or learned composition; the flies do
not hear or understand the music.

## Is the brain view real?

The view shows **fly 01's motor circuit**: 880 measured soma (cell-body) positions,
colored by simulated firing activity. All 1,045 neurons participate in that fly's
model; 165 lack displayed positions. The coordinates and retained wiring come
from MaleCNS, while firing dynamics and artificial inputs are modeled.
[The pinned upstream provenance](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/LOCOMOTOR_PROVENANCE.md)
documents that distinction.

This is a nerve-cord-heavy locomotor subset shown as cell-body dots. Some videos
show branching neuron skeletons and anatomical surfaces instead. For example,
[Flyhard's PyVista/VTK renderer](https://github.com/MarkUnthank/flyhard/blob/main/src/flyhard/cns_view.py)
draws measured neurites and neuropil geometry colored by model states. This app
does not draw those neurites or a complete brain, and neither display is a live
recording of a biological animal's thoughts.

See [the artistic inspiration](docs/INSPIRATION.md),
[OSS choices](docs/OSS_OPTIONS.md), and [data provenance](THIRD_PARTY_NOTICES.md).

Suggested caption:

> I wrote an ambient track and let twelve simulated flies perform it.

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
The ambient waveform is generated locally from original synthesis code; generated
audio stays out of Git. The guitar sample is read from your installed Live factory
content and is never redistributed. The native bridge uses Apple's installed
CoreMIDI framework and a single MIDI port; no additional MIDI driver is required.

Original code is MIT licensed; the measured MaleCNS extract is CC BY 4.0.
Attribution is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Ableton’s SDK and factory sounds must be supplied locally under their own terms.
