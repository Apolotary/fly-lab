# Open-source parts for Fly Lab

Checked against upstream source on 10 September 2026.

## The reference video

The author of the [driving-fly video](https://x.com/alright_mark/status/2097800377080889409) links to [MarkUnthank/flyhard](https://github.com/MarkUnthank/flyhard). Its stack is:

| Part | Software | What it does |
| --- | --- | --- |
| Neural controller | PyTorch and MaleCNS connectivity | A trainable rate model with 165,122 traced neurons and 25,563,197 measured neuron-pair connections. |
| Fly body | FlyGym / NeuroMechFly 2.1.0 and MuJoCo | A scientific body model with joint actuation and physical contact with a steering wheel. |
| Brain picture | PyVista / VTK | Draws measured neuron skeletons and neuropil surfaces, colored by recorded model states. |
| Car | CARLA | Runs the driving environment. |

These are separate components assembled for that experiment. Flyhard's code is MIT; its MaleCNS data and geometry are CC BY 4.0; FlyGym's body assets and code are Apache 2.0. See its [attribution file](https://github.com/MarkUnthank/flyhard/blob/main/THIRD_PARTY.md) for the distinctions, including CARLA's separately licensed assets.

The published steering skill uses supervised training against demonstrated joint actions, with a requested wheel angle as an input. It is not evidence of a fly learning visual driving or biological reward learning. The [training script](https://github.com/MarkUnthank/flyhard/blob/main/scripts/train_wheel.py) and [motor interface](https://github.com/MarkUnthank/flyhard/blob/main/src/flyhard/motor_policy.py) make those engineered choices explicit.

The exact packaged demo targets NVIDIA machines: the [brain renderer](https://github.com/MarkUnthank/flyhard/blob/main/src/flyhard/cns_view.py) even checks for an NVIDIA OpenGL renderer. Its full installation is not the simplest setup alongside Ableton on an 8 GB M1 Mac. This is a runtime assessment, not a claim that its individual libraries cannot run on a Mac.

## The lightweight choice here

Fly Lab combines [DesktopFly](https://github.com/DenisSergeevitch/desktop-fly)'s
JavaScript locomotor simulator and MaleCNS extract with
[Three.js](https://github.com/mrdoob/three.js). An original miniature world supplies
fruit locations and modeled behavior. The default **Dark lab** mode advances one
motor circuit and trains an original 70-weight musical readout using explicit
MIDI-feature rewards and human preference buttons. **Fly Tombola** adds an
original rotating hexagonal particle enclosure: each fly carries a note and wall
impacts play it. **Ambient** lets twelve
independent simulations influence an authored musical bed. Feeding visits add
accents. **Fruit pads** and **Strings** preserve the contact-only instruments.
Notes reach Live through Apple's CoreMIDI framework; no physical fruit controller
or additional MIDI driver is required.

| Part | Implementation in this project |
| --- | --- |
| Measured wiring | 1,045 selected neurons, 17,224 directed connections and 708,689 synaptic contacts. MIT simulator code; the particular MaleCNS extract is CC BY 4.0. |
| Animal world | Dark lab advances one active motor circuit; the other modes use twelve independent instances of the same measured motor graph, with shared fruit and different seeded inputs. Original rules supply exploration, equal fruit attraction, hunger, feeding, rest and flight height. Actual simulated motor output gates translation and turning. |
| Visible body and instrument | Original articulated Three.js flies, fruit, wires, MIDI box and guitar geometry illustrate the simulation and its contacts. There are no electrical, foot-force or aerodynamic dynamics. |
| Dark lab (default) | Six motor outputs plus a bias feed 70 trainable weights selecting ten authored gestures. A REINFORCE-style update uses sixteen-second MIDI-feature rewards and More / Less feedback. Measured synapses stay fixed; there is no audio listening or biological reward-learning model. |
| Fly Tombola | Original fixed-step particle physics in a rotating hexagon. Motor output nudges steering; launch momentum, gravity and moving-wall impulses are external forces. A wall impact plays the fly's scale note; no collisions means no notes. |
| Ambient | An authored Cmaj9 → Am9 → Fmaj9 → G6/9 bed changes chord every eight beats in Lively/Wild or sixteen in Calm, with soft attacks every four beats. Lively/Wild add upper ripples every beat/half-beat. Collective movement affects note choice, density, brightness, space and pan. Feeding visits add higher-register accents. |
| Fruit pads | A new feeding visit triggers the fruit's pitch: banana C4/60, apple E4/64, grape G4/67. Holding contact stays silent; leaving and revisiting can retrigger. |
| Strings | Six strings have fixed pitches. Low-height crossings and landings trigger notes through a geometric body proxy; contact speed affects velocity. |
| Live instrument | An original Swift bridge sends channel-1 MIDI through one Fly Lab port to one owned Fly Lab track. Ambient and Dark lab use different original locally generated samples in Simpler plus native Reverb. Fly Tombola, Fruit pads and Strings use a local factory acoustic-guitar sample. |
| Reusable performance | Notes accumulate in an arrangement clip at 96 BPM; standard MIDI export also includes tempo. Live filter, pan and Reverb changes are not stored in that clip or MIDI file. Shared audio/video capture preserves those performed changes. The browser preview uses original synthesis. |

This setup runs without a Python physics environment or GPU training job. It is
an animal-driven virtual instrument: the software author chooses harmony, rhythm,
geometry, tuning and control mappings. Ambient's quiet foundation continues even
without fly motion. Dark lab's separate musical readout learns probabilities of
authored gestures; the other modes have fixed musical mappings and do not learn
the underlying chord progression. Twelve swarm model instances use one
anatomical subset; they do not represent twelve separately measured connectomes.

Mode switching is available while paused. It preserves recorded notes and resets
the contact baseline, so an already-feeding fly does not retrigger on switching.
Fruit pads and Strings preserve unsnapped contact timing and have no backing bed.
Switching among Dark lab, Ambient and a contact mode also changes the sample and effects.
MIDI replay uses the current instrument parameters. For a piano contact piece,
select Fruit pads or Strings, pause, replace the instrument, and stay in that mode
for the take. Restarting in a new empty Set rebuilds the default setup.

Ambient and Dark lab's synthesis code is original and MIT licensed; generated audio stays local
and is excluded from Git. The factory guitar sample and proprietary Ableton SDK
are supplied by the user's installation and are not redistributed.

Dark lab's musical reward is an authored MIDI-feature heuristic, not an audio
listener or model of biological learning. Its method, local checkpoint and
held-out results are in [DARK_LAB.md](DARK_LAB.md). There is no modeled learned
fruit preference. Fruit location changes the artificial input and resulting
movement; banana, apple and grape have equal attraction in these toy rules.

The neural visualization uses actual measured soma positions for 880 neurons of
fly 01, with colors tied to their modeled activity. Its other 165 neurons remain
simulated but lack displayed positions. These are cell-body dots, unlike the
neurite skeletons and anatomical surfaces drawn by Flyhard's PyVista/VTK renderer.
The view does not add a whole-brain outline to a nerve-cord-dominated subset.
Full scientific limits and data provenance are
in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). DesktopFly's older female
FlyWire data has different, noncommercial terms and is not included here.

See [the artistic precedents](INSPIRATION.md), including Céleste Boursier-Mougenot's
*from here to ear* and [Playtronica's touch-to-MIDI fruit instrument](https://help.playtronica.com/devices/playtron/).
These are conceptual references; the project includes no Playtron hardware,
electrical-conductivity model, copied device code or media.

## Useful alternatives

| Project | License / runtime | Fit |
| --- | --- | --- |
| [FlyGym / NeuroMechFly](https://github.com/NeLy-EPFL/flygym) | Apache 2.0; Python with MuJoCo, plus an official WebAssembly viewer | Best option if physical legs and contact become part of the experiment. Its [browser viewer](https://neuromechfly.org/wasm/viewer/viewer.html) lets you try the same body family immediately. It supplies a body and control tools, not a ready-made autonomous fruit-seeking fly. |
| [Flybody](https://github.com/TuragaLab/flybody) | Apache 2.0; MuJoCo, optional ML dependencies | Another anatomical body model. The core can display the model without training, but integrating a new embodied controller adds work. Flyhard lists it as a research reference, not its current body. |
| [FlyWireSim](https://github.com/manuqwert1234/FlyWiresim) | Browser application; author reports an 8 GB M1 Mac | A useful separate experiment with selected walking, odor-following, and modeled plasticity circuits. No root license was present when checked, so its public source should not be treated as permissively licensed code to copy into this repo. |

FlyGym's [installation guide](https://neuromechfly.org/installation/) distinguishes its CPU installation from optional NVIDIA acceleration. Its [outreach game](https://neuromechfly.org/outreach/) also runs the NeuroMechFly model in a browser using MuJoCo WebAssembly and Three.js. The [browser source documentation](https://github.com/NeLy-EPFL/flygym/tree/main/wasm) describes CPG, tripod and individual-leg controls with deliberately slowed physics playback; it is not a complete autonomous fruit-foraging controller.

## Geometry already available

The bundled MaleCNS subset retains measured soma locations for **880 of its 1,045 neurons** in `annotations.somaLocation`. Coordinates are raw 8 nm voxel coordinates; missing somata remain missing. Most selected neurons are in locomotor circuits in the ventral nerve cord, so this subset does not form a complete brain portrait. An anatomical display should preserve that distinction.

Flyhard's [geometry acquisition script](https://github.com/MarkUnthank/flyhard/blob/main/scripts/acquire_cns_geometry.py) documents the public MaleCNS skeleton and neuropil endpoints. Those CC BY 4.0 assets are an option for a future anatomical display; downloading the whole connectome is unnecessary just to draw selected skeletons. Any illustrative layout should be labeled as such, and activity must stay tied to the simulated neurons that actually drive the music.
