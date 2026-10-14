# eTabeeb Journey — 9:16 explainer video

A 90-second Pashto storytelling video. It follows one fictional Afghan patient through the real eTabeeb V1 flow:
WhatsApp intake → admin review → doctor confirmation → consultation link → prescription in the same chat.

## Deliverables (`deliverables/`)

| File | What it is |
|---|---|
| `etabeeb-journey_1080x1920.mp4` | **Final video.** H.264 High, 1080×1920, 30 fps, AAC 48 kHz stereo, 90.0 s. Pashto voiceover (supplied take `vo/Chaman_6_original.m4a`, edited), Pashto captions burned in and synced to the speech, ducked music bed and sound effects. -16 LUFS integrated, -2.5 dBTP. |
| `etabeeb-journey_thumbnail.jpg` | 1080×1920 thumbnail (patient in his courtyard, opening shot). |
| `etabeeb-journey_preview_15s.mp4` | Short representative preview covering booking, doctor connection and prescription delivery. |
| `etabeeb-journey_ps.srt` | Pashto captions as a sidecar file (same timings as the voiceover slots). |
| `../vo/lines/vo_01.wav … vo_07.wav` | The voiceover split into its 7 lines, cleaned and level-matched (48 kHz / 24-bit). |
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
| Patient (supplied) | `assets/patient/patient-ai__courtyard-messaging-01.webp` (941×1672) and `patient-ai__indoor-phone-01.webp` (1024×1536). These are AI-generated images of a fictional man, supplied by the client. | Opening and closing courtyard shots, the confirmation moment indoors, the call self-view tile and the admin avatar | Byte-for-byte copies. Shown with `cover`/crop only, never stretched; the courtyard image is upscaled 1.148× to fill the frame, with camera moves kept to ≤1.15×. Labelled «د AI جوړ انځور · فرضي ناروغ» on screen. Clearly different from the doctor (turban, older, grey beard). |
| eTabeeb logo (supplied) | `assets/brand/etabeeb-logo-official.webp` (1254×1254) | End card (full logo on a white card); emblem crop as the chat avatar, notification, waiting room and prescription header | Unaltered; only cropped and scaled. |
| Fonts | Noto Naskh Arabic 400/700 and Inter (SIL OFL, via `@fontsource`) | All text | All Pashto letters (ټ ډ ړ ښ ږ ځ څ ګ ڼ ې ۍ) were verified to render and join correctly. |
| Colours | `apps/web/public/doctors/dr-jalaluddin/index.html` Tailwind tokens: `#00523a`, `#006d4e`, `#0B3D2E`, `#cca72f`, `#F8F5ED` | Whole design | — |
| Audio | Synthesised in `src/audio.py` | Music, ambience, sound effects | Bed at about -26 LUFS, leaving room for the voiceover. |

SHA-256 of the copied doctor photos (identical to the sources):
- `992eed8b…a66f90` (clinical)
- `a4401b06…60f5` (headshot)

## Missing or unverified, and how each is handled

- **Official eTabeeb logo:** supplied and used (see the manifest).
- **WhatsApp number:** **+92 310 0006526**, as supplied by the client. It is shown on the end card. Note that it differs from the numbers in `README.md` and the public HTML pages, which may need updating.
- **Doctor qualifications:** the doctor profile page lists credentials, ratings and a licence ID, but it is a generated design mock-up, so none of them are verified. Only the name «ډاکټر جلال الدین / Dr. Jalaluddin» is shown.
- **Call modes:** the V1 backend uses an external https consultation link (`docs/ETABIB_V1_BACKEND.md` §9) and doesn't specify the modes. The video says "online consultation" and doesn't claim audio-or-video. The UI shows only a neutral room with mic and camera controls.
- **Prescription format:** there is no PDF renderer yet (§11; only a `pdf_key` column exists). The attachment is shown as a generic document «سند», with no format named. The preview is marked «نمونه» (sample), contains no medicines, doses or patient data, and has an empty verification-code box.
- **Fee, timetable, response time:** none are shown. The confirmation uses «وخت: ستاسو ټاکل شوی وخت» (your scheduled time).
- **Pashto voiceover:** supplied (`Chaman_6.m4a`) and edited; see "Voiceover edit" below. No speech-recognition model was reachable, so the take was mapped to the script by its pause structure (all 7 lines, with their sentence breaks, match). A Pashto speaker should still listen once to confirm the wording, especially line 4.
- **Patient:** the client supplied AI-generated images of a fictional patient. They are labelled as AI images of a fictional patient; no real patient data is shown.

## Workflow fidelity

The on-screen flow mirrors the V1 state machine:
- The bot asks for the **name**, then the **phone** (`whatsapp.ts`).
- The admin completes age, sex, location and complaint, confirms payment manually, and requests doctor approval.
- The doctor approves, and the patient receives the confirmation with time and link from the same WhatsApp identity.
- The prescription arrives as an attachment in that same chat.

Internal admin and doctor notifications are shown only on the admin panel, never as patient-facing messages. There is one eTabeeb chat identity throughout, and no native WhatsApp call buttons appear.

## Voiceover edit (`src/vo_edit.py`)

1. **Clean (whole take, so the tone stays consistent):**
   - 75 Hz high-pass
   - gentle FFT denoise (noise floor down about 4 dB)
   - -2 dB at 250 Hz (boxiness) and +2 dB at 3.5 kHz (clarity)
   - light de-esser
   - 2.5:1 compression
   - two-pass loudness normalisation to -16 LUFS / -1.5 dBTP (the raw take was -28 LUFS)
2. **Split:** 7 lines cut at the natural pauses, with 0.15 s pre-roll, 0.30 s tail and short fades. Every cut was checked to start and end below -34 dB, so no word is clipped; the head of line 3 is a soft breath. The opening click (0–0.45 s) and the long silences between lines were removed.
3. **Place:** each line starts with its scene (speech onsets at 0.6, 8.4, 20.8, 35.4, 49.3, 66.2 and 80.4 s). The captions were retimed to the actual speech phrases, and the end card moved 0.4 s earlier to meet the spoken disclaimer.
4. **Mix:** the music and sound-effect bed is side-chain ducked under the voice (voice about 12 dB above the bed). The final mix is loudness-normalised to -16 LUFS integrated.

Re-run: `python3 src/vo_edit.py vo/Chaman_6_original.m4a`, then render and mux.

## v2: trailer-style opening (`deliverables/v2/`)

`etabeeb-journey-trailer-opening-v2.mp4` is 94.0 s, 1080×1920, 30 fps, H.264 High and AAC 48 kHz, at -16.1 LUFS. It is the approved story with a 4.0 s teaser in front. The original deliverables are unchanged.

| Teaser time | Shot | Title |
|---|---|---|
| 0.00–0.85 | Closer crop of the indoor patient photo, push-in 1.42→1.56× toward his face and phone | «ډاکټر ته تګ درته ګران دی؟» |
| 0.85–1.65 | Tight crop of the real chat UI (story 8.9 s); the patient's message arrives at 1.00 | «په واټساپ کې پیغام» |
| 1.65–2.45 | Consultation mock (story 49.2 s), static doctor photo with its «پروفایل انځور» label; scale 1.42→1.50 | «له ډاکټر سره مشوره» |
| 2.45–3.25 | Same chat (story 67.75 s); the «نسخه — نمونه» attachment arrives at 2.60, crop enlarges 1.80→2.06 | «نسخه په واټساپ کې» |
| 3.25–4.00 | Official logo in for about 0.5 s while the courtyard photo pulls back 1.32→1.00, landing exactly on the story's first frame | — |

**How it's built**
- `src/v2.html` wraps the **unmodified** `src/composition.html` in an iframe. Teaser shots freeze the composition at the story times above, with story captions hidden.
- From 4.0 s the iframe plays `render(t − 4)`. Only the story's original 0.8 s fade-from-black is suppressed.
- `src/render_v2.js` serves the project on localhost and renders the frames.

**Audio** (`src/teaser_audio.py`)
- A slice of the project's own music stem (36.0–40.9 s), which ends on the bar the story's music starts on.
- Five synthesised cues: an opening accent, the message sound, two transition accents (1.58 s and 3.18 s) and the attachment arrival.
- The teaser music ducks to silence between 3.6 and 4.7 s, under the first word at 4.6 s. The approved story mix is added after a 4.000 s delay and is otherwise untouched; it is bit-exact from story 0.7 s onward.
- The teaser plays at -19.2 LUFS against -14.4 LUFS for the speech section.

**Checks:** story frames compared with the approved MP4 at +4 s give a PSNR of 47–55 dB (encoder noise only). Captions are shifted by +4 s in `etabeeb-journey-trailer-opening-v2_ps.srt`.

Re-render:
```bash
python3 src/teaser_audio.py
node src/render_v2.js video out/v2_silent.mp4 0 94 4
```
