# Dark lab: one fly and a trainable musical readout

Dark lab lets one simulated motor circuit influence dark ambient in Ableton.
It learns which of ten authored musical gestures to choose from the circuit's
current activity. The measured anatomy stays fixed; the learned part is a small
musical policy attached after the neural simulation.

## Play, teach, freeze

1. Start the extension in an empty Live Set and select **Dark lab** (the default).
2. Click **Prepare instrument**, keep Live's transport stopped, and start the fly.
3. Listen for at least one sixteen-second phrase. Automatic learning favors the
   authored preferences described below. The latest gesture appears in the panel.
4. With learning enabled, press **More like this** or **Less like this** to reinforce
   or discourage the latest musical choice. This feedback is immediate and applies
   to that choice, not the whole recording or an arbitrary earlier sound.
5. Click **Freeze learning** when you want a take with fixed musical weights.
   Performance continues, including stochastic choices and fly movement.
   **Start learning** enables updates again.

Place fruit to change the fly's artificial sensory input and path. Banana, apple
and grape have equal attraction. Feeding does not directly trigger notes or
deliver a learning reward in Dark lab.

The phrase score and its graph report an authored MIDI-feature preference, not
a listening test. **Updates** counts weight updates. **Weight movement** accumulates
the absolute movement of all weights across all updates (cumulative L1 movement);
it is not the net distance from the initial weights.

The policy is saved locally when pausing, changing the learning or preference
controls, switching modes, and closing normally. Relaunching loads that checkpoint.
Recorded notes stay in the current Live Set; they are separate from the policy.
Changing modes keeps the existing notes and the Dark lab policy.

## What actually learns?

```text
fruit + authored behavior → artificial input
                                   ↓
                    fixed 1,045-neuron motor circuit
                                   ↓ six motor activity values
                    70-weight musical readout + seeded randomness
                                   ↓ one choice every two seconds
                    authored notes + filter, reverb and pan → Ableton
                                   ↑
              sixteen-second phrase reward + your More / Less feedback
```

The circuit has **1,045 neurons, 17,224 directed connections and 708,689 synaptic
contacts**. The viewer places **880** cell bodies at measured positions; the other
165 neurons remain simulated without displayed positions. It is a locomotor
subset, not a whole fly brain. The original data and simulator attribution are
in [the third-party notices](../THIRD_PARTY_NOTICES.md), with
[pinned upstream provenance](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/LOCOMOTOR_PROVENANCE.md).

Six motor outputs are centered and combined with one bias, giving seven inputs
to each of ten action logits: **7 × 10 = 70 trainable weights**. A softmax converts
the logits to probabilities and a seeded random draw selects an action. Weights
start near zero in a fresh checkout. No anatomical synaptic weight is trained.
If the motor outputs are silent, new choices and notes are suppressed.

The gestures are rest, low C, a C-minor interval, an open fifth, B-flat, D-flat
tension, a tritone, a high spark, a dense cluster and a minor veil. Their pitches,
velocities, durations and effect settings are authored. Learning changes their
probabilities in response to neural activity, rather than creating new pitches,
recordings or gesture definitions. Pan also follows left/right motor activity.

The update uses a sampled-action policy gradient, a running reward baseline and
a small entropy term to discourage collapse onto a single action. It is a small
REINFORCE-style experiment, based on the algorithm family introduced by
[Ronald J. Williams (1992), *Simple statistical gradient-following algorithms for
connectionist reinforcement learning*](https://doi.org/10.1007/BF00992696).
It is not a model of biological reward learning.

## What does the reward prefer?

Every sixteen seconds, an explicit scoring function evaluates that phrase's MIDI
events. It favors lower registers, long notes, soft velocity, moderate note
density, pitch variety and occasional tension outside the chosen C-minor colors.
Coverage reduces the reward for near-silence; variety reduces the appeal of
repeating only one low root. A silent phrase scores zero.

The phrase's score is mapped from 0–1 to a reward from −1 to +1 and applied to
the sampled choices made while learning was enabled. Preference buttons add
an immediate +1 or −1 update for the latest choice. Freezing stops both kinds of
weight update. Re-enabling learning starts a fresh phrase of training decisions,
so choices made while frozen are not retrospectively trained.

There is **no audio input, microphone, genre classifier, language model or
listening critic**. The reward does not evaluate Ableton's rendered sound. A
higher score establishes better fit to these programmed preferences; it does
not establish better art, understanding of music, or a biological fly composing.

## Reproduce the local training experiment

Stop the extension and browser demo before running:

```sh
npm run train:dark
```

The default runs 128 training phrases. For a different length, use
`npm run train:dark -- 256` (1–4,096 phrases). This command needs Node and project
dependencies, but no running Live, SDK connection, Python environment or GPU.
It refuses to train while the dashboard port is in use, so an older running
session cannot later overwrite the newly trained checkpoint. Close the launcher
or demo, run training, then restart it.
It writes these files under the Git-ignored `.local/dark-lab/` directory:

| File | Contents |
| --- | --- |
| `model.json` | Validated policy state, random state and compact score history; loaded on the next launch. |
| `report.json` | Training history, seeds and per-rollout evaluation scores and components. |
| `before.mid`, `after.mid` | The first paired held-out MIDI examples, not recordings of Live audio. |

The command replaces the local policy checkpoint. Save a copy of `model.json`
first if you want to preserve a policy taught with the preference buttons.
Training runs locally; no trained checkpoint is distributed with the source.
An ordinary launch loads your existing checkpoint or starts untrained if none
is present. Live and the browser rehearsal share this checkpoint location.

The reference run used policy-training seed **1337**, four training neural seeds
**404, 1701, 2903, 3907**, and four unseen evaluation neural seeds
**6101, 7207, 8311, 9403**. Each neural trace is collected from one simulated
motor circuit after a short warm-up, then sampled every two seconds. Training
cycles through the four collected traces for 128 phrases.

Evaluation freezes both the initial and trained policies. Each of four unseen
traces receives eight paired rollouts, using the same random seed for the before
and after policy in each pair: **32 paired rollouts** total. The random seeds are
`50000 + neuralSeed + repetition * 7919`, for repetitions 0–7. All scores and
components are retained in the generated report.

| Result | Reference run |
| --- | ---: |
| Mean initial held-out score | 0.7286550064749391 |
| Mean trained held-out score | 0.8375974430026107 |
| Training phrases | 128 |
| Weight updates | 896 |
| Cumulative L1 weight movement | 75.510 (rounded) |

This is one policy-training seed, evaluated on four unseen neural traces with
multiple paired random draws. It does not establish robustness across independent
training seeds, live improvisation quality, or biological learning. The held-out
score displayed in the dashboard describes that saved offline experiment; it is
not recomputed after every later preference click or phrase.

## Sound and recording

The source is an original deterministic C4/MIDI-60 waveform with slowly beating
partials and quiet filtered noise. It is generated locally into
`.local/audio/dark-lab.wav` and played through one Simpler and native Reverb on
the owned **Fly Instrument** track. Low notes, soft envelopes, dark filtering and
long space are part of the authored instrument. It uses no copied recordings.

MIDI accumulates in **Ableton Fly · dark lab** at the existing 96 BPM timeline.
The clip and MIDI export retain notes. Continuous filter, pan and Reverb changes
are performed live and are not saved as clip automation. Use shared audio/video
capture to keep the sound as performed; see [the recording instructions](../README.md#make-the-split-screen-video).
The browser rehearsal uses its own original oscillator sound and does not control
Ableton.
