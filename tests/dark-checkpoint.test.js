import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DarkLearner} from '../src/dark-learner.js';
import {loadDarkCheckpoint,saveDarkCheckpoint} from '../src/dark-checkpoint.js';
test('dark checkpoint round-trips learned weights and only expected report fields',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'fly-checkpoint-')),path=join(directory,'model.json');
  try{
    assert.equal(await loadDarkCheckpoint(path),undefined);
    const learner=new DarkLearner();learner.learn(learner.choose([.1,.2,.3,.2,.1,.4]),1);
    await saveDarkCheckpoint(path,{learner:learner.exportState(),report:{baselineScore:.4,trainedScore:.7,privateExtra:'not retained'}});
    const loaded=await loadDarkCheckpoint(path);
    assert.deepEqual(loaded.learner.weights,learner.exportState().weights);
    assert.equal(loaded.report.trainedScore,.7);
    assert.equal(loaded.report.privateExtra,undefined);
    await writeFile(path,'{"learner":{"weights":[]}}');
    await assert.rejects(loadDarkCheckpoint(path));
    await writeFile(path,'{}');
    await assert.rejects(loadDarkCheckpoint(path),/missing its learner/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
