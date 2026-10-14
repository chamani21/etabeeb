#!/usr/bin/env python3
"""Generate the v3 HyperFrames compositions from src/index.template.html.

  v3/index.html          the full film (94.5 s)
  v3/preview/index.html  15 s preview: cold open 0-6 s, a WhatsApp beat
                         (15.5-20.0 s) and the doctor beat (54.0-58.5 s)

The story timing comes from ../../src/timeline.json (the approved v1
timeline); OFFSET shifts it behind the 4.5 s cinematic cold open.
"""
import json, shutil, subprocess
from pathlib import Path

OFFSET = 4.5
v3 = Path(__file__).resolve().parent.parent
proj = v3.parent
TL = json.loads((proj / "src" / "timeline.json").read_text(encoding="utf-8"))
DUR = TL["duration"] + OFFSET
tpl = (v3 / "src" / "index.template.html").read_text(encoding="utf-8")

PREVIEW = [[0.0, 0.0, 6.0], [6.0, 15.5, 4.5], [10.5, 54.0, 4.5]]   # [out, src, len]

GRAIN = """<div id="grain-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100">
    <div class="grain-texture"></div>
  </div>
  <style>
  @keyframes hf-grain-noise{0%,100%{transform:translate(0,0)}10%{transform:translate(-5%,-5%)}20%{transform:translate(-10%,5%)}30%{transform:translate(5%,-10%)}40%{transform:translate(-5%,15%)}50%{transform:translate(-10%,5%)}60%{transform:translate(15%,0)}70%{transform:translate(0,10%)}80%{transform:translate(-15%,0)}90%{transform:translate(10%,5%)}}
  #grain-overlay .grain-texture{position:absolute;top:-50%;left:-50%;width:200%;height:200%;
    background:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity:.055;animation:hf-grain-noise .5s steps(1) infinite}
  </style>"""
VIGNETTE = '<div id="hf-vignette" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:90"></div>'
LEAK = ('<div id="leakWrap"><div id="leak1" data-composition-id="organic-light-leak-overlay" '
        'data-composition-src="compositions/organic-light-leak-overlay.html" data-start="3.4" '
        'data-duration="2" data-width="1080" data-height="1920" data-track-index="9"></div></div>')


def page(dur, remap, audio_src):
    audio = (f'<audio id="mix" src="{audio_src}" data-start="0" data-duration="{dur}" '
             f'data-track-index="20" data-volume="1"></audio>')
    return (tpl.replace("__TL__", json.dumps(TL, ensure_ascii=False))
               .replace("__OFF__", str(OFFSET)).replace("__DUR__", str(dur))
               .replace("__REMAP__", json.dumps(remap)).replace("__GRAIN__", GRAIN)
               .replace("__VIGNETTE__", VIGNETTE).replace("__LEAK__", LEAK)
               .replace("__AUDIO__", audio))


(v3 / "index.html").write_text(page(DUR, None, "assets/audio/mix_v3.wav"), encoding="utf-8")

# preview project: same composition, time-remapped; its own copies of assets (git-ignored)
pv = v3 / "preview"
pv.mkdir(exist_ok=True)
for sub in ("assets/brand", "assets/doctor", "assets/patient", "assets/fonts", "assets/vendor", "compositions"):
    shutil.copytree(v3 / sub, pv / sub, dirs_exist_ok=True)
for f in ("hyperframes.json", "package.json", "meta.json"):
    shutil.copy2(v3 / f, pv / f)
(pv / "assets/audio").mkdir(parents=True, exist_ok=True)
pdur = sum(p[2] for p in PREVIEW)
parts, flt = [], []
for i, (_, src, ln) in enumerate(PREVIEW):
    parts += ["-ss", str(src), "-t", str(ln), "-i", str(v3 / "assets/audio/mix_v3.wav")]
    flt.append(f"[{i}:a]afade=t=in:d=0.02,afade=t=out:st={ln - 0.03}:d=0.03[a{i}]")
flt.append("".join(f"[a{i}]" for i in range(len(PREVIEW))) + f"concat=n={len(PREVIEW)}:v=0:a=1[o]")
subprocess.run(["ffmpeg", "-v", "error", "-y", *parts, "-filter_complex", ";".join(flt), "-map", "[o]",
                "-c:a", "pcm_s24le", str(pv / "assets/audio/preview_mix.wav")], check=True)
(pv / "index.html").write_text(page(pdur, PREVIEW, "assets/audio/preview_mix.wav"), encoding="utf-8")
print("full", DUR, "s; preview", pdur, "s")
