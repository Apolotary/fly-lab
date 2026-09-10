# Third-party notices

## Three.js

The local 3D renderer uses [Three.js](https://threejs.org/), version 0.186.0,
under its MIT License (copyright Three.js authors). Its license notice is
retained in the compiled browser script and `ui/licenses/three.txt`.
The fly and miniature mixer geometry
are original procedural artwork; no models or media from the reference videos
are copied.

## DesktopFly simulation code

`src/vendor/desktop-fly/locomotor.js` and `legdynamics.js` are copied unchanged
from [DesktopFly](https://github.com/DenisSergeevitch/desktop-fly), commit
`32b00011e83c3dc85fa3ea0b3934155b04f1635d`.

Copyright (c) 2026 Denis Shiryaev. Licensed under the MIT License; the full
upstream notice is in `src/vendor/desktop-fly/LICENSE`.

Ableton Fly's original wrapper supplies seeded artificial descending-neuron
stimulation and converts the simulated motor rates into musical control values.
Its arena fly is an illustration driven by those values. It does not reproduce
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

No female FlyWire-derived data (which have different license terms) are bundled.
The upstream code license's older blanket data note is superseded for this
MaleCNS file by its [specific data license](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/DATA_LICENSE.md).
