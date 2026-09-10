# From fruit to ear: an animal-driven virtual instrument

The original reference is Céleste Boursier-Mougenot’s *from here to ear v. 21* at
Copenhagen Contemporary. The installation placed zebra finches among electric
guitars and basses; their contact with the strings generated sound as they moved
freely. Visitors’ presence also changed the birds’ behavior.
[Primary exhibition description](https://copenhagencontemporary.org/en/celeste-boursier-mougenot/).

Our independent digital adaptation uses three simulated flies, a shared fruit
habitat and two contact instruments. **Fruit pads**, the default, makes a new
feeding visit audible. **Strings** retains six virtual strings that play when a
fly crosses or lands on one near the surface. Ableton supplies the instrument
sound. Free flight creates no notes. This carries over the idea of
an environment that makes ordinary behavior audible. It does not reproduce the
original work’s living animals, acoustic response, scale or recordings.

The fruit mode also takes inspiration from [Playtronica's Playtron](https://help.playtronica.com/devices/playtron/).
Its physical device uses wired conductive objects, including fruit, and human
contact completing an electrical circuit to generate MIDI. Ableton Fly uses
virtual feeding events instead. Its drawn wires and MIDI box explain the mapping;
they do not simulate conductivity or require Playtron hardware.

## Documented precedents

| Project | What the source documents | What inspires Ableton Fly |
| --- | --- | --- |
| Céleste Boursier-Mougenot, *from here to ear* | Zebra finches move freely through an installation and perch on amplified electric guitars. | Ordinary animal behavior becomes musical material because of how the environment is arranged. |
| Playtronica, *Playtron* | Wired conductive objects become MIDI controls through touch. | Give each fruit a note and make the sound's cause visible. |
| Wolfgang Buttress and collaborators, *BEAM* | A soundscape combines musicians' contributions with live bee vibrations, alongside scent and projections. | Let biological activity influence an artwork without attributing human musical intentions to the animals. |
| codebaard, *Synthesia* | Kinect hand positions pass through a Node server, which sends MIDI commands to Ableton and data to a Unity visualization. The code is MIT licensed. | Translate an observed interaction into MIDI and show its cause alongside Ableton. |

Primary documentation: [MAAT's exhibition page](https://www.maat.pt/en/event/celeste-boursier-mougenot-here-ear),
[the BEAM artist's description](https://www.wolfgangbuttress.com/beam-soundscape),
and [Synthesia's source and architecture](https://github.com/codebaard/synthesia).
These works are conceptual references. No photographs, recordings, models, logos,
or code from these projects are included here. BEAM documents bee activity
and musical collaboration; it does not establish that bees compose music or
play guitars.

## The inexpensive implementation

The project combines a small spiking motor circuit with a simple virtual
environment and contact-to-note mappings:

```text
fruit locations + exploration rules
        ↓ artificial descending input
three independent measured motor circuits
        ↓ simulated motor activity gates movement
virtual movement + feeding behavior
        ↓ chosen contact mode
fruit feeding visit OR low string contact → MIDI → Ableton instrument
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
real fly's favorite fruit or an acquired taste for the instrument. No musical reward is
fed back into the circuit.

In **Fruit pads**, banana plays C4 (MIDI 60), apple E4 (64), and grape G4 (67).
Each new feeding visit plays once; holding that feeding contact stays silent.
After leaving, a later visit can play again. The labels use scientific pitch
notation. These fruit-to-pitch assignments are authored choices.

In **Strings**, each string has a fixed pitch. Geometric crossings near the
surface and landings on strings trigger notes; speed influences velocity. A
stationary fly does not repeatedly pluck a string. The geometry, tuning and
sensitivity are authored choices, and the body-contact test is a simple proxy,
not a biomechanical or string-force simulation.

Both modes retain unsnapped contact timing. Switching modes is allowed only while
paused, preserves recorded notes, and establishes a fresh contact baseline. A
fly already feeding will not retrigger merely because the mode changed. The
mode does not replace the Live instrument: the default remains a local factory
acoustic-guitar sample, which the user can replace with a piano or another preset.

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
