# eTabeeb Journey v3: cinematic cut (plan, timeline and asset manifest)

v3 is the approved v1/v2 story re-shot as a short film. The story order, the seven recorded narration lines, every on-screen fact and every hard rule are kept. What changes is the film language: the opening, framing, camera, depth, grade, texture, typography and sound.

- **Built with:** HyperFrames 0.8.152 (installed plugin, `general-video` workflow)
- **Project root:** `video/etabeeb-journey/v3/`
- **Output:** `deliverables/v3/etabeeb-journey-cinematic-v3.mp4`, 1080×1920, 30 fps, H.264 High yuv420p, AAC 48 kHz stereo, -16 LUFS, ≤ -1.5 dBTP

## Concept

*One quiet afternoon, one man, one chat.* The camera behaves like a patient observer: it starts on the man in his courtyard, and when he types, it moves in over his shoulder onto his phone. The interface is always seen *on a phone in his world* (his courtyard, then his room, softly out of focus behind it), never as floating graphics. Light is warm and natural throughout.

## Timing

- `OFFSET = 4.5 s`: the cinematic cold open occupies 0–4.5 s.
- Every approved story time from `../src/timeline.json` (v1) plays at `story + 4.5 s`.
- Speech onsets are 5.1, 12.9, 25.3, 39.9, 53.8, 70.7 and 84.9 s.
- No narration is cut, moved relative to its scene, or sped up.

| Video time (s) | Story time (s) | Shot | Camera and film language | Narration |
|---|---|---|---|---|
| 0.0–4.5 | — | **Cold open.** Courtyard, patient on the charpai typing | Fade from black; slow push 1.00→1.035 toward his hands and phone; foreground/background depth by a masked soft-focus layer (no geometry warp); drifting dust in the light; wind. **Title 1** «له خپل ځایه، طبي مشوره» (from line 1) 0.8–2.7. **Logo moment**: the official logo on an ivory card rises in over 2.8–3.4 and keeps drifting up, out by 4.7. A warm light leak passes over 3.4–5.4. | — |
| 4.5–12.3 | 0–7.8 | Courtyard continues | Push continues to 1.06 on the face and phone (same total upscale as v1) | 1 |
| 11.9–24.7 | 7.4–20.2 | **Phone close-up I.** Same chat, his courtyard blurred behind | Phone in slight perspective (rotateY −7°→−2°, rotateX 3°), slow dolly-in; background at blur 24 px, warm | 2 |
| 24.3–33.9 | 19.8–29.4 | **Admin desk.** The same review checklist on a monitor in a dim, warm office (bokeh) | Monitor at 4°, slow push; five factual steps unchanged | 3a |
| 33.5–36.3 | 29.0–31.8 | **Indoor.** The patient with his phone; eTabeeb notification | Gentle pull-back 1.06→1.00 | 3b |
| 35.9–83.9 | 31.4–79.4 | **Phone close-up II.** His room blurred behind. Confirmation and link tap → waiting room → consultation (doctor's real static photo labelled «د ډاکټر پروفایل انځور») → prescription in the same chat → sample viewer «نمونه» | Perspective drifts between beats; slow push on the consultation to 1.07; never any face animation | 3c, 4, 5, 6 |
| 83.5–88.9 | 79.0–84.4 | Courtyard, calm | Slow pull-back 1.06→1.00 | 7 |
| 88.5–94.5 | 84.0–90.0 | **End card.** Official logo, doctor's real portrait, CTA, **+92 310 0006526**, disclaimer | Static, premium; fade to black at the end | 7 (end) |

## Film language (applies throughout)

- **Grade.** A warm Natural Portrait treatment on the two patient photos only, via HyperFrames media-treatment `data-color-grading`. The doctor's photos, the logo and the UI pixels are never graded.
- **Depth.** Soft-focus background layers (CSS blur on duplicate layers, per the HyperFrames depth-of-field rule). There is no segmentation and no warping, and faces always stay sharp.
- **Texture.** The registry blocks `grain-overlay` (opacity 0.055) and `vignette` (warm, light), plus one `organic-light-leak-overlay` in the cold-open hand-off.
- **No flashes, glitches, shake or spinning phones.**
- **Captions.** Fewer boxes: Pashto captions in Noto Naskh Arabic 700, 46 px, white with a soft shadow, no pill. They sit inside the safe area (above y = 1600 and ≥ 120 px from both edges). The final disclaimer is printed on the end card instead.
- **Honesty labels.** Discreet, small, unboxed at the top: «د AI جوړ انځور · فرضي ناروغ» on the photos and «انځوریز مثال · ټول معلومات فرضي دي» on interface shots. The red «نمونه» on the prescription stays.

## Sound

`src/audio_v3.py` (numpy) synthesises everything; no third-party audio is used.

- **Score:** slow warm pad with sparse low plucks.
- **Ambience:** courtyard wind, and indoor room tone.
- **UI sounds:** restrained message, tap, notify, connect and chime cues at the shifted story times.
- **Intro:** a soft swell under the title and a breath of air on the logo hand-off.

The bed is side-chain ducked under the existing edited voice lines `vo/lines/vo_0X.wav` (unaltered, placed at the v1 placement + 4.5 s), then the master is normalised to -16 LUFS integrated with a true peak of -1.5 dBTP.

## Asset manifest (all byte-identical copies, verified with `cmp`)

| Asset | v3 path | Treatment |
|---|---|---|
| Official logo | `assets/brand/etabeeb-logo-official.webp` | Unaltered. Shown whole on an ivory card (intro, end card); emblem crop for the chat avatar, notification and prescription header (as in v1). |
| Dr. Jalaluddin headshot | `assets/doctor/dr-jalaluddin__headshot-white-coat-01.png` | Static, ungraded, `object-fit: cover` crop only, labelled as a profile photo |
| Dr. Jalaluddin clinical portrait | `assets/doctor/dr-jalaluddin__clinical-white-coat-01.png` | End card, native 4:5, downscale only |
| Patient, courtyard (AI, fictional) | `assets/patient/patient-ai__courtyard-messaging-01.webp` | Cover at 1.148×, push ≤ 1.06× (as v1); warm grade; labelled |
| Patient, indoor (AI, fictional) | `assets/patient/patient-ai__indoor-phone-01.webp` | Crop/cover; warm grade; blurred as the phone-scene background; labelled |
| Fonts | `assets/fonts/` (Noto Naskh Arabic 400/700, Inter) | Pashto letter joining verified in v1 and rechecked in v3 frames |
| Voice | `../vo/lines/vo_01–07.wav` | Unaltered lines, placed and mixed |

## Facts kept exactly (from v1/v2)

One doctor and one WhatsApp identity. The bot asks for the name, then the phone, then acknowledges. The admin then checks the details and fee and requests the doctor's approval. The confirmation and the https consultation link arrive in the same chat, followed by the generic «نسخه — نمونه» attachment.

- **Not claimed:** no fees, times, credentials, call modes, response times or outcomes.
- **WhatsApp number:** +92 310 0006526 only.
