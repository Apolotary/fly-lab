# ableton-fly

**A fly doing fly things. Somehow, a piano.**

A simulated fruit fly explores a tiny garden, seeks fruit, lands, feeds and rests.
Its position, speed and turns become piano notes in Ableton Live. Put Live on the
left, the measured neural circuit and 3D habitat on the right, and record the
resulting small animal concert.

The project runs locally with a **1,045-neuron motor circuit**, an original
Three.js world, and a small macOS MIDI bridge. It needs no cloud GPU, API key,
third-party MIDI driver or whole-connectome download.

## Let the fly explore

Requires macOS, **Node.js 24.16+**, **Xcode Command Line Tools**, an
Extensions-compatible Ableton Live Suite beta, and your own
**Extensions SDK 1.0.0-beta.1 ZIP**. The SDK and Ableton sounds are not included.

1. Double-click **Setup Fly.command** once. Drag your SDK ZIP into the terminal
   when asked. Setup detects Live in Applications folders, including
   `Applications2` on an external drive, and builds the local MIDI bridge.
2. Open an **empty Live Set** with Extensions enabled. Save any existing work
   before switching Sets. Preparation sets this Set to **96 BPM**.
3. Double-click **Start Fly.command** and keep its terminal open.
4. In Live's MIDI settings, enable **Track** for the **Ableton Fly** input.
   This is a one-time routing step; the input appears while the extension runs.
   Close Settings afterward so the beta extension can continue.
5. Click **Prepare piano**. It creates one **Fly Piano** MIDI track, loads a
   local factory Grand Piano sample into Simpler, and creates an arrangement
   MIDI clip for the performance.
6. **Keep Live's transport stopped**, then click **Let fly explore**. The owned
   piano track is armed for incoming MIDI, so its notes sound immediately.

Choose **Banana**, **Apple** or **Grape**, then click the garden floor to place
fruit. There is room for six pieces. **Clear** removes the fruit and lets the fly
wander. Drag either 3D view to rotate it.

**Pause** stops incoming notes and disarms the piano track. You can then press
**Play in Live from bar 1** to replay the recorded arrangement clip. Keep the
transport stopped while the fly explores to avoid hearing the live notes and
clip playback together. **Save MIDI** downloads the generated performance as a
portable `.mid` file, including its 96 BPM tempo.

**Panic**, or **Escape**, stops live notes and mutes the Fly Piano track. Starting
again unmutes it. Closing the dashboard pauses the fly after ten seconds. Pause
before closing the launcher terminal. Other tracks are not adopted or controlled;
the extension never starts the transport or enables global recording.

Preparation is idempotent while the extension runs. After restarting it, preparing
creates a new owned piano track rather than identifying old tracks by name.
Restart the extension after changing Live Sets.

## The split-screen video

Open the local dashboard in **Chrome**. Click **Choose Ableton window** and select
Live in the browser's chooser. The left side shows that real window; the right
side shows the motor circuit and habitat. The screen stream stays inside your
browser. The app does not record or upload it. Use your usual screen recorder to
capture the completed layout.

If the sharing prompt does not open, focus the browser window and click again.
If window sharing is unavailable, select **Companion view** and place its window
to the right of the native Ableton window. The browser may need macOS Screen
Recording permission to share a window.

## What makes the music?

The MIT-licensed spiking simulator and measured circuit come from
[DesktopFly](https://github.com/DenisSergeevitch/desktop-fly). Its selected MaleCNS
motor circuit contains **1,045 neurons**, **17,224 directed connections**, and
**708,689 synaptic contacts**. This is a brain-to-leg subset, largely in the nerve
cord, rather than the whole brain.

Fruit locations and exploration rules supply artificial descending input. The
simulated circuit's motor population activity gates the fly's movement and
turning. A separate musical mapping translates that movement into notes:

| Animal state | Musical result |
| --- | --- |
| Horizontal position | Pitch from C-major pentatonic |
| Movement speed | Velocity and note density |
| Turning | Shorter, more frequent notes |
| Landing | A small chord |
| Feeding or resting | A musical rest |

Notes fall on an eighth-note grid at **96 BPM**. The performance is written into
Live's arrangement clip as it develops and can also be exported as MIDI. The
piece stops growing after 128 bars or the note limit. Musical rules, scale,
quantization and piano sound are chosen by the software's author.

Hunger, fruit seeking, feeding and flight height are **toy behavioral rules**
around the measured motor circuit. Fruit kinds are equally attractive; their
positions change the trajectory. There is no modeled favorite fruit, biological
olfactory system, reward learning or musical feedback. The fly does not hear the
piano or learn to compose.

The neural view plots the **880 neurons with measured soma coordinates**, colored
by simulated activity. The 165 neurons without positions still participate in
the circuit. The fly's displayed position follows the simulated world; its
anatomy, joint motion and wingbeats are original illustrative geometry rather
than a biomechanical physics model.

See [artistic inspiration](docs/INSPIRATION.md),
[the reference demo's OSS stack and alternatives](docs/OSS_OPTIONS.md), and
[full data provenance](THIRD_PARTY_NOTICES.md).

Suggested caption:

> I gave a simulated fruit fly a garden. Its movements play piano in Ableton.

## Local development

```sh
npm run setup -- /path/to/extensions-sdk.zip "/path/to/Ableton Live Beta.app"
npm start
```

To try the world without Live or the SDK:

```sh
npm install
npm run demo
```

Open [the local dashboard](http://127.0.0.1:9321), prepare the piano, then let the
fly explore. **Preview mode** plays a quiet synthesized piano-like sound in the
browser after you click **Let fly explore**. It does not control Live or use
Ableton samples.
You can mute the preview and still export its generated MIDI.

```sh
npm test
npm run build
npm run check:privacy -- --staged
```

The original Swift bridge uses Apple's CoreMIDI framework and creates the
**Ableton Fly** MIDI source. Its compiled binary and compiler cache stay in
ignored `.local/`. Notes have timed note-offs; pause, shutdown and panic send
cleanup messages. MIDI uses channel 1.

## Privacy and licenses

The server binds only to `127.0.0.1`, validates Host and Origin, and requires a
per-run token for control requests and MIDI export. There is no telemetry,
analytics, cloud processing or remote asset loading. Detailed errors stay in the
local terminal.

The piano sample is read from your installed Live factory content and is **never
redistributed**. Git excludes the proprietary SDK, local settings and installation
paths, dependencies, generated bundles and binaries, audio, MIDI exports, Live
Sets, logs and recordings.

Original code is MIT licensed; the measured MaleCNS data is CC BY 4.0. Attribution
is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Ableton's SDK and
factory content retain their own terms and must be supplied locally. This is an
independent project.
