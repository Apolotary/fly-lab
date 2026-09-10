# A fly doing fly things, translated into piano

The artistic idea is to give a simulated fly a small environment to explore,
then translate its movement into musical events. Food changes its behavior;
the music follows. The instrument designer chooses how movement becomes sound.
This does not require the fly to understand music or learn to be a composer.

## Three documented precedents

| Project | What the source documents | What inspires Ableton Fly |
| --- | --- | --- |
| Céleste Boursier-Mougenot, *from here to ear* | Zebra finches move freely through an installation and perch on amplified electric guitars. | Ordinary animal behavior becomes musical material because of how the environment is arranged. |
| Wolfgang Buttress and collaborators, *BEAM* | A soundscape combines musicians' contributions with live bee vibrations, alongside scent and projections. | Let biological activity influence an artwork without attributing human musical intentions to the animals. |
| codebaard, *Synthesia* | Kinect hand positions pass through a Node server, which sends MIDI commands to Ableton and data to a Unity visualization. The code is MIT licensed. | Replace measured human gestures with the simulated fly's position, speed, turns and landings. |

Primary documentation: [MAAT's exhibition page](https://www.maat.pt/en/event/celeste-boursier-mougenot-here-ear),
[the BEAM artist's description](https://www.wolfgangbuttress.com/beam-soundscape),
and [Synthesia's source and architecture](https://github.com/codebaard/synthesia).
These works are conceptual references. No photographs, recordings, models, or
code from these three projects are included here. BEAM documents bee activity
and musical collaboration; it does not establish that bees compose music or
play guitars.

## The inexpensive implementation

The project combines a small spiking motor circuit with a simple virtual
environment and a movement-to-note mapping:

```text
fruit locations + exploration rules
        ↓ artificial sensory/descending input
selected fly motor circuit
        ↓ simulated motor population activity
virtual movement: position, speed, turning, pauses
        ↓ musical mapping chosen by us
piano note events → Ableton
```

The measured wiring comes from the MaleCNS locomotor subset distributed by
[DesktopFly](https://github.com/DenisSergeevitch/desktop-fly): 1,045 neurons and
17,224 directed connections. Its simulation code is MIT licensed; the specific
MaleCNS data file is CC BY 4.0. The original dataset's wiring constrains the
simulated responses, but physiology and the connection to the virtual body are
models. See [the retained attribution and data provenance](../THIRD_PARTY_NOTICES.md).

Fruit attraction, hunger, wandering and feeding pauses are engineered behavior
rules around this motor circuit. This subset does not supply a validated
olfactory system or reward-learning model. Changing fruit can therefore change
the artificial input, trajectory and resulting notes; it cannot demonstrate a
real fly's favorite fruit or an acquired taste for piano. No musical reward is
fed back into the circuit.

Position can choose a pitch from a restricted scale, speed can influence note
density and velocity, and a landing can mark a phrase boundary. Those choices
make the movement audible and keep the result playable. They are compositional
decisions made by the software's author. The fly's motion supplies the changing
input.

## Open-source alternatives for a more detailed body

| Software | What it supplies | Fit for this project |
| --- | --- | --- |
| [DesktopFly](https://github.com/DenisSergeevitch/desktop-fly) | Small connectome-derived circuits and modeled behavior; source code MIT, data licensed separately. | The existing circuit is the smallest integration. Our original 3D body avoids another runtime. |
| [NeuroMechFly / FlyGym](https://github.com/NeLy-EPFL/flygym) | An articulated biomechanical model and sensorimotor simulation framework, Apache-2.0. | A plausible later upgrade when physical foot contacts and joint dynamics matter. |
| [flybody](https://github.com/TuragaLab/flybody) | An anatomically detailed MuJoCo fly body, locomotion tasks and optional training components, Apache-2.0. | Useful for a physics experiment; a body model alone does not provide autonomous fruit seeking or a complete neural controller. |

NeuroMechFly also provides an official [browser viewer](https://neuromechfly.org/wasm/viewer/viewer.html)
and [browser game](https://neuromechfly.org/outreach/). Their
[source documentation](https://github.com/NeLy-EPFL/flygym/tree/main/wasm)
identifies MuJoCo compiled to WebAssembly for physics and Three.js for rendering.
The game uses CPG, tripod or individual-leg controls; its documentation describes
deliberately slowed physics playback. It is a good way to try the scientific
body without installing Python, but it is not a ready-made autonomous,
connectome-controlled fruit-foraging fly.

Three.js draws the scene; MuJoCo simulates mechanics. Neither package, on its own,
is a fly brain. We have not established which exact packages every linked social
video uses, and a similar-looking view is not evidence of the same simulation.

Sources checked September 10, 2026.
