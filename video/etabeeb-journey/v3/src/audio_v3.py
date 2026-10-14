"""v3 sound: cinematic bed (score, ambience, restrained UI cues) under the
approved edited voice lines, side-chain ducked, written as one stereo master.

No third-party audio. The voice lines (../vo/lines/vo_0X.wav) are used
unaltered; they are only placed (v1 placement + OFFSET) and mixed.

usage: python audio_v3.py <out_dir>
  writes <out_dir>/mix_v3_raw.wav (48 kHz stereo, 24-bit) and stems
"""
import json, sys, wave
from pathlib import Path
import numpy as np

SR = 48000
OFF = 4.5
here = Path(__file__).resolve().parent
proj = here.parent.parent                      # video/etabeeb-journey
TL = json.loads((proj / "src" / "timeline.json").read_text(encoding="utf-8"))
DUR = TL["duration"] + OFF                     # 94.5 s
N = int(round(SR * DUR))
out = Path(sys.argv[1] if len(sys.argv) > 1 else here.parent / "assets" / "audio")
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261014)
T = np.arange(N) / SR


def butter_mag(f, fc, n, kind):
    r = (f / fc) ** (2 * n) if kind == "lp" else (fc / np.maximum(f, 1e-6)) ** (2 * n)
    return 1 / np.sqrt(1 + r)


def fft_filter(x, lo=None, hi=None, order=2):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if hi: g *= butter_mag(f, hi, order, "lp")
    if lo: g *= butter_mag(f, lo, order, "hp")
    return np.fft.irfft(X * g, n=len(x))


def env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na) ** 1.5
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


def add(buf, start, sig):
    i = int(round(start * SR))
    if i < 0: sig, i = sig[-i:], 0
    j = min(len(buf), i + len(sig))
    if i < len(buf): buf[i:j] += sig[: j - i]


def span_mask(spans, ramp=0.9):
    m = np.zeros(N)
    for a, b in spans:
        m = np.maximum(m, np.clip((T - a) / ramp, 0, 1) * np.clip((b - T) / ramp, 0, 1))
    return m


def read_wav(p):
    with wave.open(str(p), "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    assert sr == SR, (p, sr)
    if sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        v = np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)
    else:
        v = np.frombuffer(raw, dtype="<i2") / 32768.0
    v = v.reshape(-1, ch).mean(axis=1)
    return v


# ---------------- voice (unaltered lines, placed) ----------------
voice = np.zeros(N)
for v in TL["vo"]:
    add(voice, v["at"] + OFF, read_wav(proj / v["file"]))

# ---------------- score: slow warm pad + sparse low plucks ----------------
midi = lambda m: 440 * 2 ** ((m - 69) / 12)
# D minor colour, slow: Dm9 - Bbmaj7 - Fadd9 - C(sus)  (one chord per 4.8 s)
CH = [[38, 50, 57, 62, 64, 65], [34, 46, 53, 57, 62, 65], [41, 48, 55, 60, 62, 67], [36, 48, 55, 60, 62, 67]]
BAR = 4.8
score = np.zeros(N)
k = 0
for st in np.arange(0.4, DUR, BAR):
    ch = CH[k % 4]; k += 1
    n = int((BAR + 2.4) * SR); tt = np.arange(n) / SR
    pad = np.zeros(n)
    for j, m in enumerate(ch):
        fr = midi(m)
        amp = 0.55 if m < 45 else 0.32
        for det in (-0.0025, 0.0, 0.0031):              # gentle chorus
            ph = 2 * np.pi * fr * (1 + det) * tt + 0.4 * np.sin(2 * np.pi * (0.11 + 0.03 * j) * tt)
            pad += amp * (np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph))
    add(score, st, pad * env(n, 1.8, 2.4) * 0.010)
    if k % 2 == 0:                                       # sparse low pluck, felt more than heard
        for b, m in enumerate([ch[1] + 12, ch[3] + 12]):
            pn = int(2.2 * SR); pt = np.arange(pn) / SR
            pl = (np.sin(2 * np.pi * midi(m) * pt) + 0.25 * np.sin(4 * np.pi * midi(m) * pt)) * np.exp(-pt * 2.6)
            add(score, st + 0.6 + b * 1.2, pl * env(pn, 0.005, 0.3) * 0.020)
score = fft_filter(score, lo=45, hi=2400, order=2)
# arc: enters under the cold open, sits low in the story, lifts a little for the end card
arc = np.interp(T, [0, 0.6, 4.5, 6, 87.5, 89.5, 92.8, DUR], [0, 0.55, 0.9, 0.75, 0.75, 1.0, 0.85, 0.0])
score *= arc

# ---------------- ambience ----------------
def gusts(seed, rate):
    r = np.random.default_rng(seed)
    k = int(DUR * rate) + 3
    pts = r.uniform(0.35, 1.0, k)
    return np.interp(T, np.linspace(0, DUR, k), pts)

wind = fft_filter(rng.standard_normal(N), lo=60, hi=520, order=2)
wind_hi = fft_filter(rng.standard_normal(N), lo=1800, hi=4200, order=1) * 0.12   # leaf rustle air
wind = (wind + wind_hi) * gusts(3, 0.35)
wind /= np.abs(wind).max() + 1e-9
O = TL["layers"]["outdoor"]
court = span_mask([[-1, O[0][1] + OFF], [O[2][0] + OFF, O[2][1] + OFF]])
court_far = span_mask([[7.4 + OFF, 20.2 + OFF]]) * 0.35                       # phone close-up in the courtyard
room = fft_filter(rng.standard_normal(N), lo=80, hi=300, order=2)
room /= np.abs(room).max() + 1e-9
indoor = span_mask([[O[1][0] + OFF, O[1][1] + OFF], [31.4 + OFF, 79.4 + OFF]])
office = span_mask([[19.8 + OFF, 29.4 + OFF]])
amb = wind * (court + court_far) * 0.060 + room * (indoor * 0.016 + office * 0.022)
amb *= np.interp(T, [0, 1.2, DUR - 1.5, DUR], [0, 1, 1, 0])

# ---------------- cues (restrained) ----------------
sfx = np.zeros(N)
def tone(freqs, dur, decay, amp):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * fr * tt) for fr in freqs) / len(freqs)
    return s * np.exp(-tt * decay) * env(n, 0.004, 0.03) * amp

pop_out = lambda: np.concatenate([tone([700], 0.05, 30, 0.10), tone([980], 0.08, 30, 0.10)])
pop_in = lambda: np.concatenate([tone([1180], 0.06, 30, 0.09), tone([880], 0.10, 25, 0.09)])
def tap():
    n = int(0.03 * SR)
    return fft_filter(rng.standard_normal(n), hi=2500, order=1) * env(n, 0.001, 0.02) * 0.16
chime = lambda a: tone([880, 1318.5, 1760], 1.6, 3.0, a)
def air(dur, amp, peak):
    n = int(dur * SR)
    x = fft_filter(rng.standard_normal(n), lo=300, hi=2600, order=2)
    e = np.interp(np.arange(n) / SR, [0, dur * peak, dur], [0, 1, 0]) ** 1.6
    return x / (np.abs(x).max() + 1e-9) * e * amp

S = lambda st: st + OFF
for m in TL["messages"]:
    add(sfx, S(m["t"]), pop_out() if m["dir"] == "out" else pop_in())
    if m.get("kind") in ("confirm", "doc"): add(sfx, S(m["t"]) + 0.12, chime(0.06))
for tp in TL["taps"]: add(sfx, S(tp["t"]), tap())
for s in TL["sfx"]:
    if s["type"] == "notify": add(sfx, S(s["t"]), tone([1046.5, 1568], 0.7, 6, 0.08))
    if s["type"] == "connect":
        add(sfx, S(s["t"]), tone([659.3], 0.25, 8, 0.08)); add(sfx, S(s["t"]) + 0.22, tone([987.8], 0.45, 6, 0.08))
    if s["type"] == "chime_soft": add(sfx, S(s["t"]), chime(0.045))
for c in TL["callChips"]: add(sfx, S(c["t"]), tone([1320], 0.12, 25, 0.03))
for st in TL["admin"]["steps"]: add(sfx, S(st["t"]), tone([1500], 0.1, 30, 0.035))
# cold open: a breath of air under the title, a soft bell on the logo, air on the hand-off
add(sfx, 0.55, air(1.6, 0.05, 0.7))
add(sfx, 2.85, chime(0.035))
add(sfx, 3.95, air(1.3, 0.045, 0.55))
# scene hand-offs to/from the photographs: very soft air
for t0 in (S(7.2), S(19.5), S(28.8), S(31.0), S(78.8), S(83.6)):
    add(sfx, t0, air(0.9, 0.025, 0.5))

# ---------------- side-chain duck under the voice ----------------
def follower(x, att=0.04, rel=0.45):
    e = np.abs(x)
    # windowed RMS then asymmetric smoothing (vectorised via cumulative max over short blocks)
    w = int(0.03 * SR)
    c = np.cumsum(np.concatenate([[0], e ** 2]))
    rms = np.sqrt(np.maximum((c[w:] - c[:-w]) / w, 0))
    rms = np.concatenate([rms, np.full(N - len(rms), rms[-1] if len(rms) else 0)])
    # smooth with exponential release using a decimated loop (fast)
    hop = 240
    r = rms[::hop]
    out_ = np.empty_like(r); acc = 0.0
    a_up = np.exp(-hop / (att * SR)); a_dn = np.exp(-hop / (rel * SR))
    for i, v in enumerate(r):
        a = a_up if v > acc else a_dn
        acc = a * acc + (1 - a) * v; out_[i] = acc
    return np.interp(np.arange(N), np.arange(len(r)) * hop, out_)

# bed levels (set by measurement: open ~-23 LUFS, ~13 dB under speech after mastering)
score *= 6.3; amb *= 5.0; sfx *= 2.5

ve = follower(voice)
ve = np.clip(ve / (np.percentile(ve[ve > 1e-4], 90) + 1e-9), 0, 1)
duck = 1 - 0.75 * ve                     # about -12 dB under speech

# ---------------- stereo + write ----------------
def width(x, ms):
    return x, np.roll(x, int(ms * SR / 1000))
sl, sr_ = width(score * duck, 11)
al, ar = width(amb * duck, 17)
L = voice + sl + al + sfx * (1 - 0.45 * ve)
R = voice + sr_ + ar + sfx * (1 - 0.45 * ve)

def write(name, l, r):
    x = np.clip(np.stack([l, r], axis=1), -1, 1)
    v = (x * 8388607).astype(np.int32)
    b = np.empty((v.size, 3), dtype=np.uint8)
    f = v.reshape(-1)
    b[:, 0] = f & 0xFF; b[:, 1] = (f >> 8) & 0xFF; b[:, 2] = (f >> 16) & 0xFF
    with wave.open(str(out / name), "wb") as w:
        w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR); w.writeframes(b.tobytes())

write("stem_voice_v3.wav", voice, voice)
write("stem_bed_v3.wav", sl + al + sfx * (1 - 0.45 * ve), sr_ + ar + sfx * (1 - 0.45 * ve))
write("mix_v3_raw.wav", L, R)
print(f"ok duration={DUR}s peak={max(np.abs(L).max(), np.abs(R).max()):.3f} -> {out}")
