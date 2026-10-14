# eTabeeb Journey — 9:16 explainer video

A 90-second Pashto storytelling video. It follows one fictional Afghan patient through the real eTabeeb V1 flow:
WhatsApp intake → admin review → doctor confirmation → consultation link → prescription in the same chat.

## Deliverables (`out/`)

| File | What it is |
|---|---|
| `etabeeb-journey_1080x1920.mp4` | **Final video.** H.264 High, 1080×1920, 30 fps, AAC 48 kHz stereo, 90.0 s. Pashto captions burned in; music and sound effects; **no voiceover yet**. |
| `etabeeb-journey_thumbnail.jpg` | 1080×1920 thumbnail, taken from the consultation scene. |
| `etabeeb-journey_preview_15s.mp4` | Short representative preview covering booking, doctor connection and prescription delivery. |
| `etabeeb-journey_ps.srt` | Pashto captions as a sidecar file (same timings as the voiceover slots). |
| `mix_music_sfx.wav`, `stem_music.wav`, `stem_ambience_sfx.wav` | Audio bed and stems for the voiceover mix. |
| `../NARRATION_SCRIPT.md` | Full Pashto narration, meanings and timed voiceover slots. |

## Tooling

**HyperFrames was not installed** in this environment, and no video-editing skill was available. The same HTML-to-frames approach was built with the tools that were installed:
- `src/composition.html`: every visual is HTML, CSS and SVG, driven by a deterministic `render(t)` function.
- `src/render.js`: the pre-installed Playwright Chromium screenshots each frame and pipes it to FFmpeg (libx264). It renders 4 segments in parallel, then a lossless concat.
- `src/audio.py`: the music bed, wind ambience and UI sound effects, synthesised with numpy (no third-party audio).
- `src/timeline.json`: the single source of timing for visuals, captions and sound effects.

```bash
node src/render.js stills preview 34 60 75          # inspect frames
node src/render.js video out/video_silent.mp4 0 90 4 # silent video
python3 src/audio.py out                            # audio stems + mix
```

## Asset manifest

| Asset | Source | Use | Treatment |
|---|---|---|---|
| Dr. Jalaluddin headshot | `apps/web/public/doctors/dr-jalaluddin/dr-jalaluddin__headshot-white-coat-01.png` (1254×1254 PNG), copied byte-for-byte | Waiting room (circle), consultation tile | `object-fit: cover`: cropped, never stretched; no retouching, no animation, no mouth movement. Labelled «د ډاکټر پروفایل انځور» (doctor profile photo) on the call screen. |
| Dr. Jalaluddin clinical portrait | `…/dr-jalaluddin__clinical-white-coat-01.png` (1122×1402 PNG), copied byte-for-byte | End card | Displayed at its native 4:5 ratio (420×525), downscaled only. |
| Patient | Original SVG illustration (fictional adult Afghan man, about 55: pakol, grey-flecked short beard, waistcoat and patu) | Every patient shot and the self-view tile | Clearly different from the doctor (age, beard, cap, illustrated rather than photographic). Labelled «انځوریز فرضي ناروغ». |
| Fonts | Noto Naskh Arabic 400/700 and Inter (SIL OFL, via `@fontsource`) | All text | All Pashto letters (ټ ډ ړ ښ ږ ځ څ ګ ڼ ې ۍ) were verified to render and join correctly. |
| Colours | `apps/web/public/doctors/dr-jalaluddin/index.html` Tailwind tokens: `#00523a`, `#006d4e`, `#0B3D2E`, `#cca72f`, `#F8F5ED` | Whole design | — |
| Audio | Synthesised in `src/audio.py` | Music, ambience, sound effects | Bed at about -26 LUFS, leaving room for the voiceover. |

SHA-256 of the copied doctor photos (identical to the sources):
- `992eed8b…a66f90` (clinical)
- `a4401b06…60f5` (headshot)

## Missing or unverified, and how each is handled

- **Official eTabeeb logo:** not in the repository. The end card uses a dashed box labelled «د رسمي لوګو ځای · LOGO PLACEHOLDER», and the chat avatar is a neutral «ای» monogram. Supply the logo (SVG or PNG) to replace both.
- **Approved WhatsApp number:** the repository contains conflicting numbers (`README.md`: 0333 2357055; public HTML pages: +93 700699337). No number is shown; the end card has a labelled placeholder «[ تایید شوې واټساپ شمېره ] PLACEHOLDER».
- **Doctor qualifications:** the doctor profile page lists credentials, ratings and a licence ID, but it is a generated design mock-up, so none of them are verified. Only the name «ډاکټر جلال الدین / Dr. Jalaluddin» is shown.
- **Call modes:** the V1 backend uses an external https consultation link (`docs/ETABIB_V1_BACKEND.md` §9) and doesn't specify the modes. The video says "online consultation" and doesn't claim audio-or-video. The UI shows only a neutral room with mic and camera controls.
- **Prescription format:** there is no PDF renderer yet (§11; only a `pdf_key` column exists). The attachment is shown as a generic document «سند», with no format named. The preview is marked «نمونه» (sample), contains no medicines, doses or patient data, and has an empty verification-code box.
- **Fee, timetable, response time:** none are shown. The confirmation uses «وخت: ستاسو ټاکل شوی وخت» (your scheduled time).
- **Pashto voiceover:** a human recording is needed; see `NARRATION_SCRIPT.md`.
- **Patient footage:** none was supplied, so a tasteful illustrated fictional patient is used.

## Workflow fidelity

The on-screen flow mirrors the V1 state machine:
- The bot asks for the **name**, then the **phone** (`whatsapp.ts`).
- The admin completes age, sex, location and complaint, confirms payment manually, and requests doctor approval.
- The doctor approves, and the patient receives the confirmation with time and link from the same WhatsApp identity.
- The prescription arrives as an attachment in that same chat.

Internal admin and doctor notifications are shown only on the admin panel, never as patient-facing messages. There is one eTabeeb chat identity throughout, and no native WhatsApp call buttons appear.
