"""Synthesise the music bed, ambience and UI sound effects from timeline.json.

No external audio is used. Output: 48 kHz stereo WAV stems + a mix.
Music sits low so a Pashto voiceover can be laid on top later.
"""
import json, sys, wave
from pathlib import Path
import numpy as np

SR = 48000
src = Path(__file__).parent
TL = json.loads((src / "timeline.json").read_text(encoding="utf-8"))
DUR = TL["duration"]
N = int(SR * DUR)
out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else src.parent / "out")
out_dir.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR


def env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def lowpass(x, cutoff):
    # one-pole low-pass, applied twice
    a = np.exp(-2 * np.pi * cutoff / SR)
    for _ in range(2):
        y = np.empty_like(x); acc = 0.0
        for i in range(len(x)):
            acc = (1 - a) * x[i] + a * acc; y[i] = acc
        x = y
    return x


def add(buf, start, sig):
    i = int(start * SR)
    j = min(len(buf), i + len(sig))
    if i < len(buf): buf[i:j] += sig[: j - i]


# ---------- music: warm pad + sparse plucks, 72 bpm, D minor-ish ----------
music = np.zeros(N)
f = lambda m: 440 * 2 ** ((m - 69) / 12)
chords = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 61]]  # Dm Bb C A
bar = 60 / 72 * 4
k = 0
for start in np.arange(0, DUR, bar):
    ch = chords[k % 4]; k += 1
    n = int((bar + 1.2) * SR); tt = np.arange(n) / SR
    pad = sum(np.sin(2 * np.pi * f(m) * tt + 0.3 * np.sin(2 * np.pi * 0.2 * tt)) * 0.5 +
              0.25 * np.sin(2 * np.pi * f(m) * 2.003 * tt) for m in ch)
    add(music, start, pad * env(n, 1.0, 1.2) * 0.05)
    # plucks (arpeggio on beats 1,2,3,4 an octave up), soft
    for b in range(4):
        m = ch[(b + 1) % 4] + 12
        pn = int(1.4 * SR); pt = np.arange(pn) / SR
        pl = (np.sin(2 * np.pi * f(m) * pt) + 0.3 * np.sin(2 * np.pi * f(m) * 2 * pt)) * np.exp(-pt * 4.5)
        add(music, start + b * bar / 4, pl * 0.035)
music = lowpass(music, 2600)
music *= np.clip(t_all / 2.5, 0, 1) * np.clip((DUR - t_all) / 3.0, 0, 1)

# ---------- ambience: soft wind on outdoor shots ----------
amb = lowpass(rng.standard_normal(N), 380) * 0.9
mask = np.zeros(N)
for a, b in TL["layers"]["outdoor"]:
    mask += np.clip((t_all - a) / 0.8, 0, 1) * np.clip((b - t_all) / 0.8, 0, 1) * ((t_all >= a) & (t_all <= b))
amb *= np.clip(mask, 0, 1) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * t_all))
amb *= 0.08 / (np.abs(amb).max() + 1e-9)

# ---------- sfx ----------
sfx = np.zeros(N)
def tone(freqs, dur, decay, amp):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * fr * tt) for fr in freqs) / len(freqs)
    return s * np.exp(-tt * decay) * env(n, 0.004, 0.02) * amp

pop_out = lambda: np.concatenate([tone([700], 0.05, 30, 0.22), tone([980], 0.08, 30, 0.22)])
pop_in = lambda: np.concatenate([tone([1180], 0.06, 30, 0.2), tone([880], 0.10, 25, 0.2)])
tap = lambda: lowpass(rng.standard_normal(int(0.03 * SR)), 2500) * env(int(0.03 * SR), 0.001, 0.02) * 0.35
chime = lambda a: tone([880, 1318.5, 1760], 1.4, 3.2, a)

for m in TL["messages"]:
    add(sfx, m["t"], pop_out() if m["dir"] == "out" else pop_in())
    if m.get("kind") in ("confirm", "doc"):
        add(sfx, m["t"] + 0.12, chime(0.16))
for tp in TL["taps"]:
    add(sfx, tp["t"], tap())
for s in TL["sfx"]:
    if s["type"] == "notify": add(sfx, s["t"], tone([1046.5, 1568], 0.6, 6, 0.18))
    if s["type"] == "connect":
        add(sfx, s["t"], tone([659.3], 0.25, 8, 0.18)); add(sfx, s["t"] + 0.22, tone([987.8], 0.4, 6, 0.18))
    if s["type"] == "chime_soft": add(sfx, s["t"], chime(0.10))
for c in TL["callChips"]:
    add(sfx, c["t"], tone([1320], 0.12, 25, 0.07))
for st in TL["admin"]["steps"]:
    add(sfx, st["t"], tone([1500], 0.1, 30, 0.08))


def write(name, *chans):
    x = np.stack(chans, axis=1) if len(chans) > 1 else np.stack([chans[0], chans[0]], axis=1)
    x = np.clip(x, -1, 1)
    with wave.open(str(out_dir / name), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())

# gentle stereo: decorrelate music slightly
music_l, music_r = music, np.roll(music, int(0.012 * SR))
write("stem_music.wav", music_l, music_r)
write("stem_ambience_sfx.wav", amb + sfx)
mix_l, mix_r = music_l + amb + sfx, music_r + amb + sfx
peak = max(np.abs(mix_l).max(), np.abs(mix_r).max())
g = 0.7 / peak if peak > 0.7 else 1.0
write("mix_music_sfx.wav", mix_l * g, mix_r * g)
print("ok", out_dir)
