"""Break the supplied Pashto VO take into 7 lines, clean it, place it on the
video timeline, retime the captions to the real speech and mix with the bed.

Usage: python3 src/vo_edit.py <raw_take.(m4a|wav)>
Outputs:
  vo/vo_processed_take.wav        cleaned full take (-16 LUFS)
  vo/lines/vo_01.wav … vo_07.wav  individual edited lines
  vo/vo_track_90s.wav             lines placed on the 90 s timeline
  out/mix_final.wav               VO + ducked music/sfx bed (-16 LUFS, -1.5 dBTP)
  src/timeline.json               captions retimed to the speech; vo placement stored
"""
import json, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
raw = Path(sys.argv[1])
vo = root / "vo"; (vo / "lines").mkdir(parents=True, exist_ok=True)
tl_path = root / "src" / "timeline.json"
TL = json.loads(tl_path.read_text(encoding="utf-8"))

def run(*a):
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *a], check=True)

def loudnorm_measure(path, pre=""):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af",
                        (pre + "," if pre else "") + "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind("{"):r.stderr.rfind("}") + 1]
    return json.loads(txt)

# ---- 1. clean the whole take once (consistent tone across lines) ----
CLEAN = ("highpass=f=75,"
         "afftdn=nr=8:nf=-52:tn=1,"                 # gentle broadband denoise
         "equalizer=f=250:t=q:w=1.0:g=-2,"          # reduce boxiness
         "equalizer=f=3500:t=q:w=1.2:g=2,"          # presence / intelligibility
         "deesser=i=0.35,"
         "acompressor=threshold=0.05:ratio=2.5:attack=8:release=140:makeup=1.5")
m = loudnorm_measure(raw, CLEAN)
ln = ("loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:"
      f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
      f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}")
proc = vo / "vo_processed_take.wav"
run("-i", str(raw), "-af", CLEAN + "," + ln, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", str(proc))

# ---- 2. line map (raw-take seconds), measured from the take's pause structure ----
# phrases: (start, end) of speech; captions = caption text index per phrase group
LINES = [
    # id, phrases in raw take,                     caption chunks: (raw_start, raw_end, caption_idx)
    (1, [(1.65, 3.65), (4.15, 7.80)],                [(1.65, 3.65, 0), (4.15, 7.80, 1)]),
    (2, [(10.90, 14.60), (15.20, 17.25)],            [(10.90, 14.60, 2), (15.20, 17.25, 3)]),
    (3, [(19.90, 23.30), (23.50, 27.55), (27.75, 30.75)], [(19.90, 23.30, 4), (23.50, 27.55, 5), (27.75, 30.75, 6)]),
    (4, [(36.00, 40.60)],                            [(36.00, 38.88, 7), (38.88, 40.60, 8)]),
    (5, [(44.55, 49.60), (50.05, 53.10)],            [(44.55, 49.60, 9), (50.05, 53.10, 10)]),
    (6, [(57.65, 64.05)],                            [(57.65, 61.56, 11), (61.56, 64.05, 12)]),
    (7, [(67.95, 71.40), (71.60, 75.30)],            [(67.95, 71.40, 13), (71.60, 75.30, 14)]),
]
# speech onset of each line on the video timeline (matched to the visuals)
ONSET = {1: 0.6, 2: 8.4, 3: 20.8, 4: 35.4, 5: 49.3, 6: 66.2, 7: 80.4}
PRE, POST = 0.15, 0.30

placements, caps = [], [list(c) for c in TL["captions"]]
for lid, phrases, chunks in LINES:
    a, b = phrases[0][0] - PRE, phrases[-1][1] + POST
    out = vo / "lines" / f"vo_{lid:02d}.wav"
    d = b - a
    run("-ss", f"{a:.3f}", "-t", f"{d:.3f}", "-i", str(proc),
        "-af", f"afade=t=in:st=0:d=0.06,afade=t=out:st={d - 0.12:.3f}:d=0.12",
        "-c:a", "pcm_s24le", str(out))
    shift = ONSET[lid] - phrases[0][0]
    placements.append({"line": lid, "file": f"vo/lines/{out.name}", "at": round(a + shift, 3),
                       "duration": round(d, 3), "speech": [round(p[0] + shift, 2) for p in phrases[:1]] + [round(phrases[-1][1] + shift, 2)]})
    for i, (s, e, ci) in enumerate(chunks):
        nxt = chunks[i + 1][0] + shift - 0.05 if i + 1 < len(chunks) else None
        cs = round(s + shift - 0.1, 2)
        ce = round(min(e + shift + 0.45, nxt) if nxt else e + shift + 0.45, 2)
        caps[ci][0], caps[ci][1] = cs, ce

TL["captions"] = caps
TL["vo"] = placements
tl_path.write_text(json.dumps(TL, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# ---- 3. VO track on the 90 s timeline ----
inputs, chains = [], []
for i, p in enumerate(placements):
    inputs += ["-i", str(root / p["file"])]
    ms = int(round(p["at"] * 1000))
    chains.append(f"[{i}:a]adelay={ms}|{ms}[d{i}]")
mixin = "".join(f"[d{i}]" for i in range(len(placements)))
track = vo / "vo_track_90s.wav"
run(*inputs, "-filter_complex",
    ";".join(chains) + f";{mixin}amix=inputs={len(placements)}:normalize=0,apad=whole_dur={TL['duration']},atrim=0:{TL['duration']}[o]",
    "-map", "[o]", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", str(track))

# ---- 4. final mix: bed ducked under the voice ----
bed = root / "out" / "mix_music_sfx.wav"
pre = root / "out" / "mix_pre.wav"
run("-i", str(track), "-i", str(bed), "-filter_complex",
    "[0:a]asplit=2[v][sc];[1:a]volume=1.6[b];"
    "[b][sc]sidechaincompress=threshold=0.02:ratio=4:attack=30:release=450:makeup=1[bd];"
    "[v]pan=stereo|c0=c0|c1=c0[vs];[vs][bd]amix=inputs=2:normalize=0[m]",
    "-map", "[m]", "-ar", "48000", "-c:a", "pcm_s24le", str(pre))
m2 = loudnorm_measure(pre)
run("-i", str(pre), "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:"
    f"measured_I={m2['input_i']}:measured_TP={m2['input_tp']}:measured_LRA={m2['input_lra']}:"
    f"measured_thresh={m2['input_thresh']}:offset={m2['target_offset']}",
    "-ar", "48000", "-c:a", "pcm_s24le", str(root / "out" / "mix_final.wav"))
pre.unlink()
print(json.dumps(placements, ensure_ascii=False, indent=1))
