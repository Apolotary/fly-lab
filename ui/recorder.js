// Local recording of the visible simulation and an explicitly shared Live
// window. Audio comes from that sharing stream or the browser preview synth.
const WIDTH = 1280, HEIGHT = 720, MAX_SECONDS = 120;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function fitImage(context, source, x, y, width, height) {
  const sw = source?.videoWidth || source?.width, sh = source?.videoHeight || source?.height;
  if (!sw || !sh) return false;
  const scale = Math.min(width / sw, height / sh), w = sw * scale, h = sh * scale;
  try {context.drawImage(source, x + (width - w) / 2, y + (height - h) / 2, w, h); return true;} catch {return false;}
}

export function createDemoRecorder({getState, video, brainCanvas, flyCanvas, onChange = () => {}, onError = () => {}}) {
  let recorder = null, canvas = null, context = null, outputStream = null, timer = null, chunks = [], startedAt = 0;
  let active = false, stopping = false, lastSecond = -1, audioSource = 'none', ending = '', mimeType = '', byteCount = 0;
  const status = () => ({active, stopping, seconds: active ? Math.min(MAX_SECONDS, Math.floor((performance.now() - startedAt) / 1000)) : 0, audioSource});
  const emit = () => onChange(status());
  function cleanTracks() {outputStream?.getTracks().forEach(track => track.stop()); outputStream = null;}
  function draw() {
    if (!active || !context) return;
    const state = getState() || {}, music = state.music || {}, fruitMode = music.instrumentMode !== 'strings', isLive = state.mode === 'live';
    const title = fruitMode ? 'FRUIT → MIDI' : 'FROM FRUIT TO EAR', seconds = Math.floor((performance.now() - startedAt) / 1000);
    const sharedVideo = video?.srcObject && video.readyState >= 2 && video.videoWidth > 0;
    const ctx = context;
    ctx.fillStyle = '#050606'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const text = (value, x, y, size = 13, color = '#91a194') => {ctx.fillStyle = color; ctx.font = `${size}px ui-monospace, Menlo, monospace`; ctx.fillText(value, x, y);};
    text('ABLETON FLY', 30, 30, 20, '#e2eae1'); text(title, 232, 30, 13, '#bdf0a8');
    ctx.textAlign = 'right'; text(`${number(music.noteCount)} NOTES  ·  ${number(music.tempo, 96)} BPM`, 1250, 30, 13, '#e2eae1'); ctx.textAlign = 'left';
    ctx.fillStyle = '#26342c'; ctx.fillRect(30, 57, 1220, 1);
    const pane = (x,y,w,h,label) => {ctx.fillStyle = '#090e0b'; ctx.fillRect(x,y,w,h); ctx.strokeStyle = '#29372e'; ctx.strokeRect(x+.5,y+.5,w-1,h-1); text(label,x+12,y+16,11);};
    if (sharedVideo) {
      pane(30, 77, 818, 555, '01 / SHARED ABLETON LIVE WINDOW');
      fitImage(ctx, video, 40, 109, 798, 513);
      pane(866, 77, 384, 239, '02 / FLY 01 · MOTOR CIRCUIT');
      fitImage(ctx, brainCanvas, 875, 107, 366, 200);
      pane(866, 334, 384, 298, fruitMode ? '03 / FRUIT TOUCH INSTRUMENT' : '03 / SIX VIRTUAL STRINGS');
      fitImage(ctx, flyCanvas, 875, 364, 366, 259);
    } else {
      pane(30, 77, 818, 555, fruitMode ? '01 / THREE FLIES · FRUIT TOUCH INSTRUMENT' : '01 / THREE FLIES · SIX VIRTUAL STRINGS');
      fitImage(ctx, flyCanvas, 42, 110, 794, 510);
      pane(866, 77, 384, 401, '02 / FLY 01 · MOTOR CIRCUIT');
      fitImage(ctx, brainCanvas, 876, 109, 364, 359);
      text('1,045 MODELED NEURONS', 879, 510, 16, '#dbe7d5'); text('880 located soma positions', 879, 538, 12);
      text(isLive ? 'LIVE MIDI · WINDOW NOT SHARED' : 'BROWSER PREVIEW', 879, 580, 13, '#e2bf82');
      text(isLive ? 'Instrument audio requires capture.' : 'Synthesized instrument sound', 879, 605, 11);
    }
    text(fruitMode ? 'BANANA C4  ·  APPLE E4  ·  GRAPES G4' : 'C3  ·  G3  ·  C4  ·  E4  ·  G4  ·  C5', 30, 654, 13, '#dfe8dc');
    ctx.textAlign = 'right'; text(fruitMode ? 'ONE VISIT → ONE NOTE' : 'ONE STRING TOUCH → ONE NOTE', 1250, 654, 12, '#bdf0a8'); ctx.textAlign = 'left';
    const soundLabel = audioSource === 'shared' ? 'SHARED AUDIO' : audioSource === 'preview' ? 'BROWSER PREVIEW AUDIO' : 'VIDEO ONLY · NO AUDIO CAPTURED';
    text(`${soundLabel}  ·  ${state.running ? 'FLIES EXPLORING' : 'PAUSED'}  ·  ${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`, 30, 691, 10, audioSource === 'none' ? '#e2bf82' : '#91a194');
    ctx.textAlign = 'right'; text('MEASURED MOTOR CIRCUITS · MODELED FRUIT SEEKING', 1250, 691, 9); ctx.textAlign = 'left';
    if (seconds !== lastSecond) {lastSecond = seconds; emit();}
  }
  function stop(reason = '') {
    if (!active || stopping) return;
    ending = reason; stopping = true; clearTimeout(timer); timer = null; emit();
    if (recorder?.state !== 'inactive') recorder.stop();
  }
  function start({audioTracks = [], source = 'none'} = {}) {
    if (active) return;
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') throw new Error('This browser cannot record a canvas. Open this page in Chrome.');
    if ([brainCanvas, flyCanvas].some(view => !view || view.hidden || view.style?.display === 'none' || !(view.width > 0 && view.height > 0))) throw new Error('Both 3D views must be available before recording. Reload this page in Chrome with hardware acceleration enabled.');
    canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
    context = canvas.getContext('2d', {alpha: false});
    if (!context) throw new Error('A video recording canvas could not be created.');
    const tracks = audioTracks.filter(track => track.kind === 'audio' && track.readyState === 'live');
    audioSource = tracks.length ? source : 'none'; chunks = []; byteCount = 0; stopping = false; ending = ''; lastSecond = -1;
    outputStream = canvas.captureStream(30);
    try {
      tracks.forEach(track => {
        const copy = track.clone();
        copy.addEventListener('ended', () => stop(source === 'shared' ? 'Shared audio ended. The completed video was saved.' : 'Preview audio ended. The completed video was saved.'), {once: true});
        outputStream.addTrack(copy);
      });
      const types = tracks.length ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/mp4', 'video/webm'] : ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'];
      recorder = null;
      for (const type of types) {
        if (!MediaRecorder.isTypeSupported(type)) continue;
        try {recorder = new MediaRecorder(outputStream, {mimeType: type, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000}); break;} catch {}
      }
      recorder ||= new MediaRecorder(outputStream, {videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000});
      mimeType = recorder.mimeType || 'video/webm';
      recorder.addEventListener('dataavailable', event => {if (event.data?.size) {chunks.push(event.data); byteCount += event.data.size; if (byteCount > 96 * 1024 * 1024) stop('Recording reached its file-size limit.');}});
      recorder.addEventListener('error', () => {onError('Video recording was interrupted. Any completed video will be saved.'); stop();});
      recorder.addEventListener('stop', () => {
        clearTimeout(timer); timer = null; cleanTracks();
        const blob = chunks.length ? new Blob(chunks, {type: mimeType}) : null;
        chunks = []; active = false; stopping = false; recorder = null; canvas = null; context = null;
        if (blob?.size) {
          const url = URL.createObjectURL(blob), link = document.createElement('a');
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          link.href = url; link.download = `ableton-fly-${stamp}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`; link.hidden = true;
          document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
          onChange({...status(), saved: true, message: ending || 'Video saved to your browser’s downloads.'});
        } else {onError('No video frames were recorded. Keep the browser visible and try again.'); emit();}
      }, {once: true});
      startedAt = performance.now(); active = true; draw(); recorder.start(1000);
      timer = setTimeout(() => stop('Two-minute recording saved.'), MAX_SECONDS * 1000); emit();
    } catch (error) {
      active = false; stopping = false; cleanTracks(); canvas = null; context = null; recorder = null; throw error;
    }
  }
  function dispose() {clearTimeout(timer); if (active) stop(); cleanTracks();}
  return {start, stop, draw, dispose, get active() {return active;}, get stopping() {return stopping;}};
}
