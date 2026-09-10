# ableton-fly

**1,045 neurons. Zero music theory.**

A simulated fruit-fly circuit gets six tracks and the mixer in Ableton Live.
Watch a cute 3D fly with giant red eyes, translucent wings and tiny headphones
work a miniature mixer while its motor-neuron activity changes the music.
A very small DJ with absolutely no qualifications.

This is a local, supervised performance toy for a meme video. No cloud service,
LLM, API key, MIDI driver, or giant whole-brain download is needed.

## The easy setup (macOS)

You need **Node.js 24.16+**, an Extensions-compatible **Ableton Live Suite beta**
with Operator, and your own **Extensions SDK 1.0.0-beta.1 ZIP** from Ableton.
The SDK is deliberately not included here.

1. Clone this repository and double-click **Setup Fly.command**. Drag your SDK
   ZIP into the terminal when asked, then press Return. The setup detects Live
   in Applications folders, including `Applications2` on an external SSD.
2. Open an **empty Live Set**. In Live's Extensions settings, enable Developer
   Mode, then close Settings. Keep the beta open.
3. Double-click **Start Fly.command**. A local dashboard opens. Keep its terminal
   open during the performance.
4. Click **Build demo**. This adds six MIDI tracks with Operator and a 128-bar
   arrangement starting at bar 1. No presets or sample packs are needed.
5. In Live, switch to Arrangement View with **Tab**, return to **bar 1**, and
   press **Play**. In the dashboard, click **Release the fly**.

Move **Drive** to stimulate the circuit and **Turn** to bias left/right input.
Use **Recording view** for a clean frame. Screen-record the dashboard beside
Live's mixer so viewers can see what the fly is actually changing.

**Freeze fly** stops modulation and restores the tempo from before the fly
took over. **Mute fly tracks** (or **Escape** in the dashboard) also silences the
six tracks. **Use Live's Stop button to stop playback.** Closing the dashboard
pauses modulation after 10 seconds. Freeze before closing the terminal; a forced
process kill cannot reliably restore Live's tempo.

Build is idempotent within one running extension. Restarting the extension
creates a new controller: start in a fresh empty Set for a new demo. Save any
Set you want to keep using Live's normal Save command.

Terminal equivalents:

```sh
npm run setup -- /path/to/extensions-sdk.zip "/path/to/Ableton Live Beta.app"
npm start
```

To see the fly without Ableton or the SDK:

```sh
npm install
npm run demo
```

Open [the local dashboard](http://127.0.0.1:9321). Rehearsal mode is clearly
labeled and makes no sound or Ableton changes.

## What the fly controls

| Circuit output | Musical mapping |
| --- | --- |
| Six leg motor populations | Six track levels and activity gates |
| Left/right activity differences | Stereo panning |
| Mean motor activity | Bounded tempo changes, at most 2 BPM per update |
| Modeled descending-neuron stimulation | Drive and steering inputs |

The model runs on a fixed simulation step; Live receives at most one batch of
mixer changes per second. Ableton handles note timing. Notes, instruments and
the conversion from neural activity into musical controls are human-authored.
The SDK used here does not expose transport or clip launching, so Play/Stop
stays in Live. This project does not require an MCP client.

The controller keeps references only to the tracks it created. It never chooses
your tracks by a name prefix, removes tracks, edits your clips, changes routing,
arms recording, or reads your sample library. Tempo affects the entire Set,
which is why an empty Set is the recommended playground.

## Is it a real fly brain?

It uses **measured wiring from a selected male fruit-fly locomotor circuit**:
1,045 neurons, 17,224 directed connections and 708,689 synaptic contacts. It is
an extracted brain-to-leg network, not the entire brain.

The graph and lightweight spiking simulator come from
[DesktopFly](https://github.com/DenisSergeevitch/desktop-fly), pinned to a specific
commit. The original connectome is [MaleCNS](https://male-cns.janelia.org/download/).
Neuron dynamics, artificial stimulation, the arena movement and the musical
mapping are models. The fly has not learned music or developed consciousness.
The neural tests include disabling synaptic propagation: the same input then
produces no motor spikes.

Video caption you can use:

> I gave 1,045 simulated fly neurons control of Ableton. They have no music theory.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution, data
licensing, the pinned commit, checksums, and modeling limitations.

## Privacy and sharing

The dashboard listens only on `127.0.0.1`, rejects foreign origins and Host
headers, and requires a per-run token for control requests. It has no telemetry,
external fonts, analytics or remote assets. The dashboard displays only the
fly's own data. Detailed SDK errors stay in your local terminal.

Git excludes the SDK ZIP/TGZ packages, local installation path/settings,
dependencies, generated extension bundle, logs, Live Sets and recordings.
The public-source circuit and its licenses are intentionally included.

This repository was requested as **private**. A private repository link is only
viewable by you and invited collaborators; your GitHub profile can still be
linked in the video. Before making the repo public, review the current beta's
sharing terms and your video frame for private material. This is an independent
project, not an Ableton product or endorsement.

## Development

```sh
npm test
npm run build                    # requires the local SDK setup
npm run check:privacy -- --staged # audit exactly what will be committed
```

Original code is MIT licensed; the bundled MaleCNS circuit is CC BY 4.0. The
Ableton SDK retains its own license and is installed locally from your ZIP.

If the launcher cannot connect, check that the correct beta is running and
Developer Mode is enabled. Close any `npm run demo` process using port 9321.
If an SDK call fails, freeze the fly, stop Live playback and inspect the local
terminal. Restart in a fresh Set if the demo's tracks were deleted or the Set
was replaced. A failed partial build can be retried in the same extension.
