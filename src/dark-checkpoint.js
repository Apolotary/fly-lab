import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {DarkLearner} from './dark-learner.js';
import {randomUUID} from 'node:crypto';

function cleanReport(report) {
  if (!report || typeof report!=='object') return null;
  const score=value=>Number.isFinite(value)&&value>=0&&value<=1?value:null;
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  return {baselineScore:score(report.baselineScore),trainedScore:score(report.trainedScore),
    episodes:count(report.episodes),evaluationPhrases:count(report.evaluationPhrases),
    history:Array.isArray(report.history)?report.history.slice(-24).map(entry=>({episode:count(entry?.episode),score:score(entry?.score)})).filter(entry=>entry.score!==null):[]};
}
function validateLearner(data) {
  if (!data || typeof data.learner !== 'object' || data.learner === null) throw new Error('Dark lab checkpoint is missing its learner.');
  return new DarkLearner({state:data.learner});
}
export async function loadDarkCheckpoint(path) {
  let raw;
  try {raw=await readFile(path,'utf8');} catch(error){if(error.code==='ENOENT')return undefined;throw error;}
  if(raw.length>100000)throw new Error('Dark lab checkpoint is too large.');
  const data=JSON.parse(raw);
  const learner=validateLearner(data);
  return {learner:learner.exportState(),report:cleanReport(data.report)};
}
let writes=Promise.resolve();
export function saveDarkCheckpoint(path,data) {
  const learner=validateLearner(data);
  const captured=JSON.stringify({version:1,learner:learner.exportState(),report:cleanReport(data.report)},null,2);
  const next=writes.then(async()=>{await mkdir(dirname(path),{recursive:true});
    const temporary=path+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,captured,{mode:0o600});await rename(temporary,path);});
  writes=next.catch(()=>{});
  return next;
}
