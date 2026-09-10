# Third-party notices

## Three.js

The local 3D renderer uses [Three.js](https://threejs.org/), version 0.186.0,
under its MIT License (copyright Three.js authors). Its license notice is
retained in the compiled browser script and `ui/licenses/three.txt`.
The fly, garden and fruit geometry
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
turning; an original gesture mapping converts the resulting world state into
piano notes. Its displayed fly illustrates that simulated state. It does not reproduce
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
musical feedback are not modeled.

No female FlyWire-derived data (which have different license terms) are bundled.
The upstream code license's older blanket data note is superseded for this
MaleCNS file by its [specific data license](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/DATA_LICENSE.md).


## Native MIDI bridge and preview instrument

`native/midi-bridge.swift` and its JavaScript wrapper are original MIT-licensed
project code. They use the CoreMIDI and Foundation frameworks provided by macOS;
those Apple frameworks are not redistributed. The locally compiled bridge
binary and compiler cache are excluded from Git.

The browser preview instrument is an original oscillator-based sound, generated
locally through the Web Audio API. It contains no recorded piano samples.

## Ableton SDK and factory piano sample

The Ableton Extensions SDK is proprietary and supplied by the user during local
setup. Its package archives, extracted packages and compiled extension bundles
are excluded from Git. No SDK source or documentation is redistributed here.

The Live piano instrument loads a Grand Piano sample from the user's installed
Ableton factory content into Simpler. The sample remains local and is not copied
into this repository, bundled, uploaded or distributed with MIDI exports. Ableton
software and factory content retain their respective license terms. This project
is independent of Ableton.
