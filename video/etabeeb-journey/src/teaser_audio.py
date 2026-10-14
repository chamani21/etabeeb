"""Audio for the 4 s trailer opening (v2) and the v2 master mix.

Uses only project-owned audio: a slice of our synthesised music stem (out/stem_music.wav,
36.0-40.9 s, which ends on the same Dm bar the story's music starts on, so they overlap in phase)
plus synthesised accents in the same style as src/audio.py. Nothing is downloaded.

Cues (teaser time): 0.00 soft opening accent | 1.00 message sent | 1.65 transition accent 1
                    2.60 attachment arrives | 3.25 transition accent 2 (logo)
Teaser music ducks smoothly to zero 3.6-4.7 s, under the narration that starts at 4.6 s.

Usage: python3 src/teaser_audio.py   ->  out/v2_teaser.wav, out/v2_mix.wav
"""
import json, subprocess, wave
from pathlib import Path
import numpy as np

SR = 48000
root = Path(__file__).resolve().parent.parent
out = root / "out"
rng = np.random.default_rng(11)
TEASER = 4.0
LEN = 4.9                                   # music tail overlaps the story start, then is gone


def read(p):
    w = wave.open(str(p)); ch = w.getnchannels(); sw = w.getsampwidth()
    b = w.readframes(w.getnframes())
    if sw == 2: x = np.frombuffer(b, "<i2") / 32768
    else:
        a = np.frombuffer(b, np.uint8).reshape(-1, 3)
        x = (a[:, 0].astype(np.int32) | (a[:, 1].astype(np.int32) << 8) | (a[:, 2].astype(np.int32) << 16))
        x = np.where(x >= 2 ** 23, x - 2 ** 24, x) / 2 ** 23
    return x.reshape(-1, ch)


def env(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def tone(freqs, dur, decay, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * t) for f in freqs) / len(freqs)
    return s * np.exp(-t * decay) * env(n, 0.004, 0.03) * amp


def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y


def swell(dur, peak_at, amp, fc):
    """soft filtered-air rise and fall (no whoosh-boom)"""
    n = int(dur * SR); t = np.arange(n) / SR
    e = np.where(t < peak_at, (t / peak_at) ** 2, np.exp(-(t - peak_at) * 9))
    return lp(rng.standard_normal(n), fc) * e * amp


N = int(LEN * SR)
mono = np.zeros(N)
def add(at, sig):
    i = int(at * SR); j = min(N, i + len(sig)); mono[i:j] += sig[: j - i]

# accents
add(0.00, tone([523.25, 784.0, 1046.5], 1.3, 3.0, 0.10))                                 # soft opening accent
add(0.00, swell(0.6, 0.05, 0.06, 1800))
add(1.00, np.concatenate([tone([700], 0.05, 30, 0.20), tone([980], 0.08, 30, 0.20)]))          # message sent
add(1.58, swell(0.35, 0.07, 0.07, 2600))                                                         # transition accent 1
add(2.60, np.concatenate([tone([1180], 0.06, 30, 0.18), tone([880], 0.10, 25, 0.18)]))         # attachment arrives
add(2.72, tone([880, 1318.5, 1760], 1.0, 3.6, 0.10))
add(3.18, swell(0.45, 0.09, 0.07, 2200))                                                         # transition accent 2
add(3.27, tone([659.25, 987.77], 1.2, 3.0, 0.07))

# music slice
m = read(out / "stem_music.wav")
mus = m[int(36.0 * SR): int(36.0 * SR) + N].copy()
t = np.arange(N) / SR
mus *= (np.clip(t / 0.06, 0, 1) * (1 - np.clip((t - 3.6) / 1.1, 0, 1)) ** 1.5)[:, None] * 2.2

teaser = mus + mono[:, None]
teaser[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
with wave.open(str(out / "v2_teaser.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(teaser, -1, 1) * 32767).astype("<i2").tobytes())

# master: teaser + the approved story mix (out/mix_final.wav) delayed by exactly 4.0 s, untouched
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(out / "v2_teaser.wav"), "-i", str(out / "mix_final.wav"), "-filter_complex",
                "[1:a]adelay=4000|4000[s];[0:a][s]amix=inputs=2:normalize=0:duration=longest[m]",
                "-map", "[m]", "-ar", "48000", "-c:a", "pcm_s24le", str(out / "v2_mix.wav")], check=True)
print("ok")
