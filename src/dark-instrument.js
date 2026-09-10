import { encodeMidi, TEMPO, MAX_BEATS, MAX_NOTES } from './midi-file.js';
import { DarkLearner, scoreDarkPhrase } from './dark-learner.js';

export const DARK_PHRASE_SECONDS = 16;
export const DARK_DECISION_SECONDS = 2;

/**
 * A trainable musical readout of one fixed fly motor circuit. The readout learns
 * among authored note gestures; it does not modify anatomical synapses, listen
 * to audio, or represent biological reward learning.
 */
export class DarkComposer {
  constructor({ learnerState, report } = {}) {
    this.learner = new DarkLearner(learnerState ? { state: learnerState } : {});
    this.report = report ?? null;
    this.notes = [];
    this.complete = false;
    this.lastTime = null;
    this.nextDecision = 0;
    this.phraseStart = 0;
    this.phraseEvents = [];
    this.decisions = [];
    this.lastDecision = null;
    this.history = Array.isArray(report?.history) ? report.history.slice(-24).map(entry => ({...entry})) : [];
    this.episodes = Number.isSafeInteger(report?.episodes) ? report.episodes : 0;
    this.lastScore = null;
    this.lastReward = null;
    this.decisionLabel = 'Waiting for the motor circuit';
    this.ambience = {brightness:.18, space:.85, pan:0, activity:0};
  }

  prime(world) {
    const time = Number.isFinite(world?.time) ? Math.max(0, world.time) : 0;
    this.lastTime = time;
    this.nextDecision = time;
    this.phraseStart = time;
    this.phraseEvents = [];
    this.decisions = [];
    this.lastDecision = null;
  }

  setLearning(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Learning must be on or off.');
    this.learner.setLearning(enabled);
    // Never retrospectively train choices made while frozen, or choices from
    // before the user changed the learning setting.
    this.decisions = [];
    this.lastDecision = null;
    this.phraseEvents = [];
    this.phraseStart = this.lastTime ?? 0;
    return this.snapshot();
  }

  reward(value) {
    if (value !== 1 && value !== -1) throw new RangeError('Reward must be 1 or -1.');
    if (!this.learner.snapshot().enabled) throw new Error('Enable learning before giving feedback.');
    if (!this.lastDecision) throw new Error('Let the fly choose a phrase before giving feedback.');
    this.learner.learn(this.lastDecision, value);
    this.lastReward = value;
    return this.snapshot();
  }

  finishPhrase() {
    const result = scoreDarkPhrase(this.phraseEvents, DARK_PHRASE_SECONDS);
    this.lastScore = result.score;
    this.lastReward = result.score * 2 - 1;
    for (const decision of this.decisions) this.learner.learn(decision, this.lastReward);
    this.history.push({episode:++this.episodes,score:result.score});
    this.history = this.history.slice(-24);
    this.phraseEvents = [];
    this.decisions = [];
  }

  step(world) {
    const time = world?.time;
    if (!Number.isFinite(time) || time < 0 || this.complete || time <= (this.lastTime ?? -1)) return [];
    this.lastTime = time;
    if (time * TEMPO / 60 >= MAX_BEATS || this.notes.length >= MAX_NOTES) {this.complete=true;return [];}
    if (time - this.phraseStart >= DARK_PHRASE_SECONDS) {
      this.finishPhrase();
      this.phraseStart = time;
    }
    if (time + 1e-9 < this.nextDecision) return [];
    this.nextDecision = time + DARK_DECISION_SECONDS;
    const fly = world.flies?.[0] ?? world;
    const activity = Array.from({length:6}, (_, i) => Math.min(1, Math.max(0, Number(fly.activity?.[i]) || 0)));
    this.ambience.activity = activity.reduce((sum,x)=>sum+x,0)/6;
    if (this.ambience.activity < .001) {this.decisionLabel='Motor silence · no note';this.lastDecision=null;return [];}
    const decision = this.learner.choose(activity), action = decision.action;
    this.lastDecision = decision;
    if (this.learner.snapshot().enabled) this.decisions.push(decision);
    this.decisionLabel = action.label;
    this.ambience = {brightness:action.brightness,space:action.space,
      pan:Math.max(-1,Math.min(1,(activity.slice(0,3).reduce((a,b)=>a+b,0)-activity.slice(3).reduce((a,b)=>a+b,0))*1.5)),
      activity:this.ambience.activity};
    const created=[];
    for (const pitch of action.pitches) {
      if (this.notes.length>=MAX_NOTES) break;
      const beat=time*TEMPO/60, duration=Math.min(action.duration,(MAX_BEATS-beat)*60/TEMPO);
      if(duration<.1)continue;
      const previous=this.notes.findLast(note=>note.pitch===pitch);
      if(previous){const gap=(beat-previous.beat)*60/TEMPO;
        if(gap<.1-1e-9)continue;
        if(gap>0){previous.duration=Math.min(previous.duration,Math.max(.1,gap));
        const event=this.phraseEvents.findLast(item=>item.id===previous.id);if(event)event.duration=previous.duration;}}
      const note={id:this.notes.length+1,pitch,velocity:action.velocity,duration,beat,channel:0,
        instrumentMode:'dark',voice:'dark',flyId:fly.id??'fly-1',actionId:action.id,
        reason:'Learned musical readout',authored:true};
      this.notes.push(note);created.push(note);
      this.phraseEvents.push({...note,time:time-this.phraseStart,beat:(time-this.phraseStart)*TEMPO/60});
    }
    if(this.notes.length>=MAX_NOTES)this.complete=true;
    return created;
  }

  snapshot() {
    const learner=this.learner.snapshot();
    return {instrumentMode:'dark',tempo:TEMPO,noteCount:this.notes.length,
      recentNotes:this.notes.slice(-24).map(note=>({...note})),contacts:[],complete:this.complete,
      decisionLabel:this.decisionLabel,lastGesture:this.decisionLabel,ambience:{...this.ambience},
      training:{...learner,episodes:this.episodes,lastReward:this.lastReward,lastScore:this.lastScore,
        baselineScore:this.report?.baselineScore??null,trainedScore:this.report?.trainedScore??null,
        history:this.history.map(entry=>({...entry}))}};
  }
  exportLearning() {return {learner:this.learner.exportState(),report:{...this.report,episodes:this.episodes,history:this.history}};}
  midiFile() {return encodeMidi(this.notes,TEMPO);}
}
