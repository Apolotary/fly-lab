# Third-party notices

## Three.js

The local 3D renderer uses [Three.js](https://threejs.org/), version 0.186.0,
under its MIT License (copyright Three.js authors). Its license notice is
retained in the compiled browser script and `ui/licenses/three.txt`.
The flies, guitar, garden, fruit, wires and virtual MIDI-box geometry
are original procedural artwork; no models or media from the reference videos
are copied.

## DesktopFly simulation code

`src/vendor/desktop-fly/locomotor.js` and `legdynamics.js` are copied unchanged
from [DesktopFly](https://github.com/DenisSergeevitch/desktop-fly), commit
`32b00011e83c3dc85fa3ea0b3934155b04f1635d`.

Copyright (c) 2026 Denis Shiryaev. Licensed under the MIT License; the full
upstream notice is in `src/vendor/desktop-fly/LICENSE`.

Ableton Fly's original wrapper supplies artificial descending-neuron stimulation
from a seeded, modeled environment. Simulated motor rates gate movement and
turning in the garden. Fly Tombola reuses these circuits for motor-driven steering
inside an original rotating enclosure. Initial launch energy, inertia, gravity
and moving-wall forces are authored toy physics and can move a silent circuit's
particle. Each fly carries an assigned note, played on a wall impact. This mode
takes conceptual inspiration from [Tombola](https://teenage.engineering/guides/op-1);
no Teenage Engineering artwork, sounds or code are included.
Ambient mode maps collective movement to performance controls over an
authored musical foundation, with accents from feeding visits. Fruit pads uses
feeding-contact rules, and Strings uses geometric string-contact tests to generate
MIDI notes. The standard launchers start twelve flies, each with independent state
and seeded stimulation using the same measured graph, with shared fruit. These
are copies of one anatomical subset, not twelve separate connectomes. The
displayed fly illustrates that simulated state. It does not reproduce
DesktopFly's articulated body or its female FlyWire brain model.

## MaleCNS v1.0 circuit data

`data/locomotor_circuit.json` is copied unchanged from DesktopFly's
`data/locomotor_circuit.json` at the commit above. SHA-256:

`8f76d94034dcf802453e3a0a8ed5342d122e57d37e2bb5ea28da66de0856f5d6`

The data are separately licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
Credit the MaleCNS collaboration: FlyEM at HHMI Janelia, the University of
Cambridge, MRC Laboratory of Molecular Biology, and Google Research.

Primary source: [MaleCNS data download](https://male-cns.janelia.org/download/).
Extraction and provenance:
[DesktopFly locomotor provenance](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/LOCOMOTOR_PROVENANCE.md)
and [reproducible extraction script](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/etl_malecns.py).
The circuit embeds original source URLs, byte sizes, SHA-256 digests, selection
rules, native body IDs, annotations and raw synaptic contact counts.

This is a selected graph of 1,045 neurons, 17,224 directed connections and
708,689 synaptic contacts. Edges retain at least five contacts at source synapse
confidence 0.5. The graph contains 16 descending, 622 selected VNC interneurons,
220 motor, 153 sensory and 34 ascending neurons. Many incoming connections are
omitted. Counts and annotations measure anatomy, not complete physiology.

Contact-count normalization, transmitter-effect signs, leaky-integrate-and-fire
dynamics, excitability, artificial stimulation, rate smoothing, music mapping,
and displayed movement are modeling choices. Acetylcholine is treated as
positive; GABA and glutamate as negative; unknown/modulatory transmitters have
zero direct current while their anatomical edges and raw counts are retained.
The simulation is not a whole fly brain, a biologically validated animal,
recorded consciousness, or a fly that has learned music.

The anatomical viewer uses `annotations.somaLocation` for 880 located neurons,
with the dataset's coordinate scale of 8 nm per unit. Neurons without positions
are omitted from the view but retained in the simulation. Point colors show
modeled firing rates, not recorded activity. Fruit attraction, hunger, feeding,
rest and flight height are engineered behavior rules. Fruit kinds have equal
attraction in the model. Olfactory circuitry, biological reward learning and
musical feedback are not modeled. Ambient's Cmaj9, Am9, Fmaj9 and G6/9 progression,
eight/sixteen-beat chord durations, soft four-beat attacks, upper ripples and swarm-to-sound mappings
are authored musical rules. The flies influence the arrangement and sound; they
do not learn or originate the underlying progression. Fruit pads maps new feeding visits to authored
pitches: banana C4 (MIDI 60), apple E4 (64), and grape G4 (67). Strings uses authored
pitch assignments and geometric contact thresholds. These are musical mappings,
not measured animal preferences or electrical-conductivity models.

No female FlyWire-derived data (which have different license terms) are bundled.
The upstream code license's older blanket data note is superseded for this
MaleCNS file by its [specific data license](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/DATA_LICENSE.md).


## Native MIDI bridge, ambient synthesis and preview instrument

`native/midi-bridge.swift` and its JavaScript wrapper are original MIT-licensed
project code. They use the CoreMIDI and Foundation frameworks provided by macOS;
those Apple frameworks are not redistributed. The locally compiled bridge
binary and compiler cache are excluded from Git.

Ambient's original waveform is generated locally by MIT-licensed project code.
The generation code is included; generated audio assets are excluded from Git.
Live plays the sample through Simpler and native Reverb. This waveform contains
no copied recordings or third-party samples. Harmony, soft attacks, bell-like
fruit accents, and brightness/density/space/pan mappings are original musical
design choices.

The browser preview instrument is an original oscillator-based sound, generated
locally through the Web Audio API. It contains no recorded piano samples.

## Ableton SDK and factory guitar sample

The Ableton Extensions SDK is proprietary and supplied by the user during local
setup. Its package archives, extracted packages and compiled extension bundles
are excluded from Git. No SDK source or documentation is redistributed here.

Fruit pads and Strings load an acoustic-guitar sample from the user's installed
Ableton factory content into Simpler. The sample remains local and is not copied
into this repository, bundled, uploaded or distributed with MIDI exports. Ableton
software and factory content retain their respective license terms. This project
is independent of Ableton.

## Artistic references

The Strings mode is inspired by Céleste Boursier-Mougenot’s *from here to ear*,
particularly the [Copenhagen Contemporary installation](https://copenhagencontemporary.org/en/celeste-boursier-mougenot/).
This project is an independent digital adaptation with original geometry and
code. No artwork photographs, exhibition recordings or other media are included.

Fruit pads mode takes conceptual inspiration from
[Playtronica's Playtron](https://help.playtronica.com/devices/playtron/), a physical
touch-to-MIDI instrument for conductive objects. This project's virtual feeding
contacts, wires and MIDI box use original code and geometry. No Playtron hardware,
SDK, code, product media or logo is included. The project is independent of Playtronica.
