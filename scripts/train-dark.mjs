import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {FlyGarden} from '../src/garden.js';
import {DarkLearner,scoreDarkPhrase} from '../src/dark-learner.js';
import {saveDarkCheckpoint} from '../src/dark-checkpoint.js';
import {encodeMidi,TEMPO} from '../src/midi-file.js';
import {createConnection} from 'node:net';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const count=process.argv[2]===undefined?128:Number(process.argv[2]);
if(!Number.isInteger(count)||count<1||count>4096)throw new Error('Use 1–4096 training phrases.');
const serverOpen=await new Promise((resolve,reject)=>{
  const socket=createConnection({host:'127.0.0.1',port:Number(process.env.FLY_PORT||9321)});
  socket.once('connect',()=>{socket.destroy();resolve(true);});
  socket.once('error',error=>error.code==='ECONNREFUSED'?resolve(false):reject(error));
  socket.setTimeout(2000,()=>{socket.destroy();reject(new Error('Could not verify that the dashboard is closed.'));});
});
if(serverOpen)throw new Error('Close the Fly launcher or rehearsal server before offline training, then restart it to load the new weights.');
const trainSeeds=[404,1701,2903,3907],testSeeds=[6101,7207,8311,9403];
const phraseSeconds=16, decisionSeconds=2;
function neuralTrace(seed) {
  const world=new FlyGarden({count:1,seed});
  const trace=[];
  // Warm up the one circuit, then sample its actual outputs every two seconds.
  for(let i=0;i<20;i++)world.step(50);
  for(let slot=0;slot<8;slot++){
    for(let i=0;i<40;i++)world.step(50);
    trace.push([...world.snapshot().activity]);
  }
  return trace;
}
function phrase(learner,trace) {
  const decisions=[],notes=[];
  trace.forEach((activity,slot)=>{
    if(activity.reduce((a,b)=>a+b,0)/6<.001)return;
    const decision=learner.choose(activity),action=decision.action;
    decisions.push(decision);
    for(const pitch of action.pitches){
      const previous=notes.findLast(note=>note.pitch===pitch);
      if(previous)previous.duration=Math.min(previous.duration,slot*decisionSeconds-previous.time);
      notes.push({pitch,velocity:action.velocity,duration:action.duration,time:slot*decisionSeconds,beat:slot*decisionSeconds*TEMPO/60});
    }
  });
  return {decisions,notes,...scoreDarkPhrase(notes,phraseSeconds)};
}
console.log('Collecting training activity from one simulated motor circuit at a time…');
const trainingTraces=trainSeeds.map(neuralTrace);
const learner=new DarkLearner({seed:1337}),baselineState=learner.exportState(),history=[];
for(let episode=1;episode<=count;episode++){
  const result=phrase(learner,trainingTraces[(episode-1)%trainingTraces.length]);
  for(const decision of result.decisions)learner.learn(decision,2*result.score-1);
  history.push({episode,score:result.score});
}
const trainedState=learner.exportState();
console.log('Evaluating once on new neural seeds, with paired random draws and learning frozen…');
const evaluation=[],baseline=new DarkLearner({state:baselineState}),trained=new DarkLearner({state:trainedState});
baseline.setLearning(false);trained.setLearning(false);
let beforeNotes,afterNotes;
for(const seed of testSeeds){
  const trace=neuralTrace(seed);
  for(let repetition=0;repetition<8;repetition++){
    const randomSeed=50000+seed+repetition*7919;
    baseline.resetRandom(randomSeed);trained.resetRandom(randomSeed);
    const before=phrase(baseline,trace),after=phrase(trained,trace);
    beforeNotes??=before.notes;afterNotes??=after.notes;
    evaluation.push({neuralSeed:seed,randomSeed,before:before.score,after:after.score,
      beforeComponents:before.components,afterComponents:after.components});
  }
}
const average=key=>evaluation.reduce((sum,row)=>sum+row[key],0)/evaluation.length;
const report={episodes:count,baselineScore:average('before'),trainedScore:average('after'),
  evaluationPhrases:evaluation.length,history,trainSeeds,testSeeds,evaluation,
  method:'Fixed measured motor circuit; REINFORCE-style learned readout. Authored MIDI-feature reward, no audio input.',
  limitations:'One policy training seed; held-out neural/noise seeds test this heuristic only, not aesthetic quality or biological learning.'};
const folder=resolve(root,'.local/dark-lab');await mkdir(folder,{recursive:true});
learner.resetRandom(2026);
await saveDarkCheckpoint(resolve(folder,'model.json'),{learner:learner.exportState(),report});
await writeFile(resolve(folder,'report.json'),JSON.stringify(report,null,2));
await writeFile(resolve(folder,'before.mid'),encodeMidi(beforeNotes,TEMPO));
await writeFile(resolve(folder,'after.mid'),encodeMidi(afterNotes,TEMPO));
console.log(JSON.stringify({phrases:count,heldOutPhrases:evaluation.length,before:report.baselineScore,after:report.trainedScore,
  delta:report.trainedScore-report.baselineScore,updates:learner.snapshot().updates,weightChange:learner.snapshot().weightChange}));
console.log('Local checkpoint, paired MIDI examples and evaluation report saved under .local/dark-lab/.');
