import json, re, sys, time, glob, os
from faster_whisper import WhisperModel
import wave, numpy as np
def load(f):
    w = wave.open(f); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0; return a
texts = json.load(open('texts.json'))
truth = {'r1': 't1', 'r2': 't1', 'r3': 't2', 'r4': 't2', 'r5': 't3', 'r6': 't4'}
norm = lambda s: re.sub(r"[^a-z0-9' ]", ' ', s.lower().replace('-', ' ')).split()
def wer(ref, hyp):
    r, h = norm(ref), norm(hyp); d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]; d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1])); prev = cur
    return d[len(h)] / max(1, len(r))
out = {}
for name in sys.argv[1:]:
    t0 = time.time(); m = WhisperModel(name, device='cpu', compute_type='int8', cpu_threads=2); load_s = time.time() - t0
    for f in sorted(glob.glob('r*.wav')):
        k = f[:2]; t0 = time.time()
        segs, info = m.transcribe(load(f), language='en', beam_size=5, vad_filter=True, condition_on_previous_text=False,
            initial_prompt='A Singapore secondary school student is speaking. Write exactly what is said, including grammar mistakes.')
        hyp = ' '.join(s.text.strip() for s in segs); dt = time.time() - t0
        out.setdefault(name, {})[f] = {'secs': round(dt, 1), 'audio': round(info.duration, 1), 'wer': round(wer(texts[truth[k]], hyp), 3) if k in truth else None, 'text': hyp}
        print(name, f, 'time', round(dt, 1), 'wer', out[name][f]['wer'], '|', hyp[:110], flush=True)
    out[name]['_load'] = round(load_s, 1)
json.dump(out, open('whisper-results.json', 'w'), indent=1)
