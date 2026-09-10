import test from 'node:test';
import assert from 'node:assert/strict';
import {DarkComposer} from '../src/dark-instrument.js';
import {DarkLearner,DARK_ACTIONS} from '../src/dark-learner.js';
import {FlyController} from '../src/controller.js';
import {FlyGarden} from '../src/garden.js';
import {PreviewInstrumentAdapter} from '../src/instrument-adapter.js';
const world=(time,activity=[.2,.4,.3,.25,.5,.2])=>({time,flies:[{id:'fly-1',activity}]});

test('Dark lab adapts the readout at phrase end but freezes weights during performance',()=>{
  const composer=new DarkComposer();composer.prime(world(0));
  for(let t=.05;t<16;t+=.05)composer.step(world(t));
  assert.ok(composer.notes.length>0);
  const before=composer.learner.exportState().weights;
  composer.step(world(16.1));
  assert.equal(composer.snapshot().training.episodes,1);
  assert.ok(composer.snapshot().training.updates>0);
  assert.notDeepEqual(composer.learner.exportState().weights,before);
  composer.setLearning(false);
  const frozen=structuredClone(composer.learner.exportState().weights);
  for(let t=16.2;t<50;t+=.05)composer.step(world(t));
  assert.deepEqual(composer.learner.exportState().weights,frozen);
  assert.throws(()=>composer.reward(1),/Enable/);
  assert.equal(composer.midiFile().toString('ascii',0,4),'MThd');
});
test('silent motor output generates neither notes nor training decisions',()=>{
  const composer=new DarkComposer();composer.prime(world(0,Array(6).fill(0)));
  for(let t=.1;t<=32;t+=.1)composer.step(world(t,Array(6).fill(0)));
  assert.equal(composer.notes.length,0);
  assert.equal(composer.snapshot().training.updates,0);
  assert.throws(()=>composer.reward(1),/Let the fly/);
});
test('reward scoring uses actual shortened gates when a MIDI key is retriggered',context=>{
  const composer=new DarkComposer(),action=DARK_ACTIONS.find(action=>action.duration>2&&action.pitches.length);
  assert.ok(action);
  const learner=new DarkLearner(),decision=learner.choose([.2,.3,.4,.2,.1,.3]);
  context.mock.method(composer.learner,'choose',()=>({...decision,action}));
  composer.prime(world(0));composer.step(world(.1));composer.step(world(2.1));
  const pitch=action.pitches[0],notes=composer.notes.filter(note=>note.pitch===pitch);
  assert.equal(notes[0].duration,2);
  assert.equal(composer.phraseEvents.find(event=>event.id===notes[0].id).duration,2);
});
test('Dark lab runs one independent circuit and preserves its readout when returning from the swarm',async()=>{
  let saved;
  const garden=new FlyGarden({count:12}),adapter=new PreviewInstrumentAdapter();
  const controller=new FlyController(adapter,{world:garden,instrumentMode:'dark',saveLearning:async data=>{saved=data;}});
  const brain=controller.world.worlds[0].brain,composer=controller.composer;
  assert.equal(controller.snapshot().brain.flyCount,1);
  await controller.action({action:'prepare'});
  await controller.action({action:'start'});
  controller.tick(controller.lastTick+250);await controller.pending;
  assert.equal(garden.worlds[0].brain.timeMs,0,'the other twelve circuits do not advance');
  await controller.action({action:'learning',enabled:false});
  await controller.action({action:'stop'});
  assert.ok(saved.learner);
  await controller.action({action:'mode',mode:'tombola'});
  assert.equal(controller.snapshot().brain.flyCount,12);
  await controller.action({action:'mode',mode:'dark'});
  assert.equal(controller.world.worlds[0].brain,brain);
  assert.equal(controller.composer,composer);
  assert.equal(controller.snapshot().music.training.enabled,false);
});

test('rapid mode return does not shorten a preserved key below the MIDI gate minimum',context=>{
  const composer=new DarkComposer(),action=DARK_ACTIONS.find(action=>action.pitches.length===1&&action.pitches[0]===48);
  const decision=new DarkLearner().choose([.2,.3,.4,.2,.1,.3]);
  context.mock.method(composer.learner,'choose',()=>({...decision,action}));
  composer.notes=[{id:1,pitch:48,velocity:48,duration:2.9,beat:0,channel:0}];
  composer.prime(world(0));
  assert.deepEqual(composer.step(world(.05)),[]);
  assert.equal(composer.notes[0].duration,2.9);
  composer.step(world(2.05));
  assert.equal(composer.notes.length,2);
  assert.ok(composer.notes.every(note=>note.duration>=.1));
});
