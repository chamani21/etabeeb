You are continuing a video-production job for **eTabeeb (ای طبیب)**, a telemedicine service of Kozhak Specialist Clinic, Chaman. A previous Claude Code session (in a cloud container **without** HyperFrames) produced v1 and v2 of a 9:16 Pashto explainer video. This machine **has HyperFrames installed**.

Your job:
1. Read everything below.
2. Inspect the project.
3. Read the installed HyperFrames skill/docs before using it. Do not guess HyperFrames commands; use only what its own docs and skill describe.
4. Produce **v3**: a more cinematic, film-like version with a short intro (the final request is at the end).

---------------------------------------------------------------------
## 1. Repository and files

- **Repo:** https://github.com/chamani21/etabeeb
- **Branch:** `claude/etabeeb-telemedicine-video-im2bha`. Work on this branch, or a new branch created from it.
- **Video project folder:** https://github.com/chamani21/etabeeb/tree/claude/etabeeb-telemedicine-video-im2bha/video/etabeeb-journey

Base URL for every file below: `https://github.com/chamani21/etabeeb/blob/claude/etabeeb-telemedicine-video-im2bha/`

**Approved deliverables (do NOT overwrite; save v3 separately):**
- v1 final, 90.0 s: `video/etabeeb-journey/deliverables/etabeeb-journey_1080x1920.mp4`
- v1 preview: `video/etabeeb-journey/deliverables/etabeeb-journey_preview_15s.mp4`
- v1 thumbnail: `video/etabeeb-journey/deliverables/etabeeb-journey_thumbnail.jpg`
- v1 Pashto captions: `video/etabeeb-journey/deliverables/etabeeb-journey_ps.srt`
- v2 final, 94.0 s, with 4 s trailer opening: `video/etabeeb-journey/deliverables/v2/etabeeb-journey-trailer-opening-v2.mp4`
- v2 12 s preview: `video/etabeeb-journey/deliverables/v2/etabeeb-journey-trailer-opening-v2_preview_12s.mp4`
- v2 captions (+4 s): `video/etabeeb-journey/deliverables/v2/etabeeb-journey-trailer-opening-v2_ps.srt`

**Editable sources (HTML/SVG + Playwright → FFmpeg pipeline built because HyperFrames was absent):**
- `video/etabeeb-journey/src/composition.html`: the whole story as HTML/CSS, driven by a deterministic `render(t)`.
- `video/etabeeb-journey/src/timeline.json`: the single source of timing (layers, screens, chat messages, taps, admin steps, call chips, captions, sound effects, voiceover placements).
- `video/etabeeb-journey/src/render.js`: frames → FFmpeg (libx264 CRF 17).
- `video/etabeeb-journey/src/v2.html` and `src/render_v2.js`: 4 s teaser + story in an iframe, shifted +4 s.
- `video/etabeeb-journey/src/audio.py`: synthesised music bed, ambience and sound effects (numpy; no third-party audio).
- `video/etabeeb-journey/src/teaser_audio.py`: v2 teaser audio + master mix.
- `video/etabeeb-journey/src/vo_edit.py`: voiceover clean-up, split, placement, ducking and final mix.

**Documentation:**
- `video/etabeeb-journey/README.md`: asset manifest, decisions, voiceover edit notes, v2 notes.
- `video/etabeeb-journey/NARRATION_SCRIPT.md`: Pashto script, meanings, slots.

`out/` and the large WAVs are git-ignored. Regenerate them with:

```bash
python3 src/audio.py out
python3 src/vo_edit.py vo/Chaman_6_original.m4a
```

---------------------------------------------------------------------
## 2. Assets supplied by the client (all in the repo; preserve byte-for-byte)

| Asset | Path | Notes |
|---|---|---|
| Official logo | `video/etabeeb-journey/assets/brand/etabeeb-logo-official.webp` | 1254×1254, white background. Wordmark "etabeeb" + «ای طبیب», tagline "CARE BEYOND BORDERS", sub-line "PEOPLE • HEALTH • A BRIGHTER TOMORROW". Colours teal → navy blue with gold accents. The emblem sits roughly in the square (302,90)–(962,750) of the 1254 px image. |
| Dr. Jalaluddin, headshot | `video/etabeeb-journey/assets/doctor/dr-jalaluddin__headshot-white-coat-01.png` | 1254×1254 PNG, real authorised photo. Originally from `apps/web/public/doctors/dr-jalaluddin/`. |
| Dr. Jalaluddin, clinical portrait | `video/etabeeb-journey/assets/doctor/dr-jalaluddin__clinical-white-coat-01.png` | 1122×1402 PNG, real authorised photo. |
| Patient, courtyard | `video/etabeeb-journey/assets/patient/patient-ai__courtyard-messaging-01.webp` | 941×1672. **AI-generated fictional patient** (client-supplied): middle-aged Afghan man, cream turban, grey-flecked beard, brown waistcoat, sitting on a charpai in a mud-walled courtyard with mountains, typing on his phone. |
| Patient, indoor | `video/etabeeb-journey/assets/patient/patient-ai__indoor-phone-01.webp` | 1024×1536. Same fictional man indoors on carpets by a window, holding his phone and looking at the camera. |
| Voiceover | `video/etabeeb-journey/vo/Chaman_6_original.m4a` | Client's human Pashto recording: 77.4 s, mono, 48 kHz AAC, raw level -28 LUFS. |
| Edited voiceover lines | `video/etabeeb-journey/vo/lines/vo_01.wav` … `vo_07.wav` | 48 kHz/24-bit, cleaned, -16 LUFS. **Use these.** |

**Approved WhatsApp number (client-confirmed): +92 310 0006526.**
- The client first typed +92 310 3336526 and corrected it. Use only 0006526.
- The repo's `README.md` (0333 2357055) and public HTML pages (+93 700699337) contain other numbers. Do **not** use those.

**Fonts:** `video/etabeeb-journey/assets/fonts/`
- Noto Naskh Arabic 400/700 (verified to render and join every Pashto letter: ټ ډ ړ ښ ږ ځ څ ګ ڼ ې ۍ).
- Inter 400/600/800.

**Brand colours:**
- Website green tokens: `#00523a`, `#006d4e`, `#0B3D2E`, gold `#cca72f`, ivory `#F8F5ED`.
- Logo palette: teal → navy `#0b3a5c`, with gold.

---------------------------------------------------------------------
## 3. Verified service facts (from the code: `docs/ETABIB_V1_BACKEND.md`, `apps/web/src/lib/etabib/messages.ps.ts`)

**One fixed doctor:** Dr. Jalaluddin («ډاکټر جلال الدین»). No doctor selection.

**One eTabeeb WhatsApp identity throughout.** The bot is deterministic (no AI) and asks only for:
1. the patient's **name**, then
2. a **phone number**,

then sends an acknowledgement.

**After the acknowledgement, a human admin:**
- collects age, sex, who the consultation is for, location, main complaint and history;
- confirms the fee **manually** (Easypaisa or other);
- requests the doctor's approval of a proposed time.

**Doctor approval** sends the patient a confirmation with the time and an **https consultation link**, in the same WhatsApp chat.

**Prescription:** after the consultation it is sent as an attachment in the same chat.
- There is **no PDF renderer yet**, so the format is unverified. Show a generic document.

**Do NOT claim** any of the following:
- native WhatsApp calls;
- specific call modes (audio/video is unverified, so say "online consultation");
- fees, timetables or response times;
- qualifications. The doctor profile page's "MD • FCPS", "MoPH: AF-84920", "14 years", ratings and "300 AFN" come from a generated mock-up and are unverified; never use them.

**Bot texts used on screen (shortened from `messages.ps.ts`):**
- «السلام علیکم! ای طبیب ته ښه راغلاست. مهرباني وکړئ د ناروغ بشپړ نوم ولیکئ.»
- «مننه احمد ګل. اوس مهرباني وکړئ د اړیکې د تلیفون شمېره ولیکئ.»
- «مننه! ستاسو معلومات ترلاسه شول. زموږ همکار به له تاسو سره اړیکه ونیسي.» ("ډېر ژر" removed, so no response time is promised)
- Confirmation: «ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه.» + «وخت: ستاسو ټاکل شوی وخت» + link «د مشورې لینک خلاص کړئ»
- «ستاسو نسخه چمتو ده او له دې پیغام سره درلېږل کېږي.» + attachment «نسخه — نمونه»

**Fictional data:**
- Patient name «احمد ګل»
- Masked number `07•• ••• •••`
- Sample prescription with no medicines, doses or patient data, watermarked «نمونه»

---------------------------------------------------------------------
## 4. Narration (recorded; keep the wording and timing)

| # | Raw-take speech (s) | v1 onset (s) | Line |
|---|---|---|---|
| 1 | 1.65–7.80 | 0.6 | ډاکټر ته تګ درته ګران دی؟ له ای طبیب سره له خپل ځایه طبي مشوره ترلاسه کولی شئ. |
| 2 | 10.90–17.25 | 8.4 | په واټساپ کې ای طبیب ته پیغام واستوئ او خپل نوم ولیکئ. ستاسو د مشورې غوښتنه ثبتېږي. |
| 3 | 19.90–30.75 | 20.8 | اډمین ستاسو معلومات او د فیس ورکړه تاییدوي. بیا د مشورې وخت له ډاکټر سره برابرېږي او تاسو ته په همدې واټساپ کې خبر درکول کېږي. |
| 4 | 36.00–40.60 | 35.4 | په ټاکلي وخت د مشورې لینک خلاص کړئ او له ډاکټر سره آنلاین مشوره وکړئ. |
| 5 | 44.55–53.10 | 49.3 | خپلې نښې، پخوانۍ ناروغۍ او کارېدونکي درمل له ډاکټر سره شریک کړئ. که پخواني راپورونه لرئ، هغه هم ورولېږئ. |
| 6 | 57.65–64.05 | 66.2 | له مشورې وروسته، ډاکټر نسخه او لازمې لارښوونې چمتو کوي او په همدې واټساپ کې یې ترلاسه کوئ. |
| 7 | 67.95–75.30 | 80.4 | د مشورې لپاره ای طبیب ته په واټساپ کې پیغام واستوئ. دا خدمت د بیړنیو حالاتو لپاره نه دی. |

- In v2, add +4.0 s to every onset.
- The lines were mapped to the script by pause structure, because no speech-recognition model was available.
- A Pashto speaker should confirm line 4 says «آنلاین مشوره».
- Earlier grammar decision: «ګران دی», not «دي».
- **Voiceover processing already applied:** 75 Hz high-pass, light FFT denoise, -2 dB at 250 Hz, +2 dB at 3.5 kHz, de-esser, 2.5:1 compression, -16 LUFS.
- **Music bed:** side-chain ducked under the voice (about 12 dB below).
- **Do not** speed up speech, cut words, or clone or imitate the doctor's voice.

---------------------------------------------------------------------
## 5. Current story (v1 timing; v2 = +4 s) and the rules it follows

| Time (s) | Scene |
|---|---|
| 0–7.8 | Courtyard patient photo, gentle push-in. Hook. |
| 7.4–20.2 | Phone mock-up with the WhatsApp-style chat. Bot asks for the name, the patient types the name, the bot asks for the phone, the masked number is sent, acknowledgement. |
| 19.8–29.4 | Admin panel: checklist (name and phone, age/sex/location, complaint, fee confirmed, doctor approved the time). "Sent to patient on the same WhatsApp." |
| 29–31.8 | Indoor patient photo with an eTabeeb notification. |
| 31.4–38.2 | Confirmation message with the time placeholder and the link; tap on the link. |
| 38.2–48 | Browser "consultation room": doctor headshot, waiting → "doctor ready", join button. |
| 48–65.2 | Consultation mock: doctor's **real static photo** labelled «د ډاکټر پروفایل انځور»; patient self-view tile «تاسو»; chips نښې / پخوانۍ ناروغۍ / کارېدونکي درمل / پخواني راپورونه; minimal controls. |
| 65.2–71.4 | Back in the same chat: prescription message + «نسخه — نمونه» attachment; tap. |
| 71.4–79.4 | Sample prescription viewer, watermark «نمونه». |
| 79–84.4 | Courtyard patient, calm. |
| 84–90 | End card: official logo, doctor portrait, "Dr. Jalaluddin", CTA «په واټساپ کې ای طبیب ته پیغام واستوئ», green button **+92 310 0006526**, disclaimer «دا خدمت د بیړنیو حالاتو لپاره نه دی.» |

**On-screen honesty chips:**
- «د AI جوړ انځور · فرضي ناروغ» on patient photos.
- «انځوریز مثال · ټول معلومات فرضي دي» on interface scenes.

**v2 teaser (0–4 s):**
1. Indoor patient close crop with the hook title.
2. Chat crop with the message arriving, «په واټساپ کې پیغام».
3. Consultation mock, «له ډاکټر سره مشوره».
4. Attachment arriving, «نسخه په واټساپ کې».
5. Logo pull-back into the courtyard frame.

**Hard rules (from the client brief, keep all of them):**
- Preserve the doctor's photo exactly: no face generation, no lip or mouth animation, no fake "live video" look, no stretching.
- Follow the same patient throughout, clearly different from the doctor. Don't exaggerate poverty or distress.
- One WhatsApp number and identity. A consultation link is shared inside that chat.
- No invented credentials, fees, times, URLs, diagnoses, medicines, cures or outcome promises.
- Right-to-left Pashto with properly joined letters. Mobile-safe text, kept clear of platform UI (keep important text out of the bottom ~320 px and the right ~120 px).
- No flashes, glitch effects, camera shake or spinning phones. Restrained transitions.
- **Output spec:** 1080×1920, 9:16, 30 fps, H.264 High yuv420p MP4, AAC 48 kHz stereo, about -16 LUFS integrated, true peak ≤ -1.5 dBTP. Don't upscale sources unnecessarily (the courtyard image already needs 1.148× to fill the frame).
- Preserve originals and save new versions separately. Probe media, write a timeline and asset manifest, render a short preview first, and inspect the frames: RTL text, doctor photo, cuts.
- Report honestly what you verified and what you could not.

---------------------------------------------------------------------
## 6. Known limitations from the previous session

- HyperFrames was not installed in the cloud container, so the existing build is custom HTML + Playwright + FFmpeg.
- Pashto neural TTS and speech-recognition model downloads were blocked by that network. That is why the human voiceover was used and mapped by pause structure.
- Sound is synthesised (no licensed sound-effect library existed in the project). If you have licensed SFX or music available locally, you may use them; never download unverified material.
- The current look is clean but reads as "motion graphics / animated UI", which the client wants to move away from.

---------------------------------------------------------------------
## 7. YOUR TASK: v3, a better, movie-type video

Using HyperFrames (read its installed skill and instructions first) and the same approved assets, narration and facts, make **v3** feel like a short **cinematic film**, not an animated slideshow of interface graphics. Keep the story order, the narration lines and their meaning, and all the hard rules above.

**1. Short cinematic intro (about 4–6 s) replacing the v2 teaser look**
- A cold open on the patient: slow, motivated camera movement on the courtyard photo (gentle push, subtle parallax by separating foreground and background layers *only* if it doesn't warp his face), natural light and dust/air feel, quiet ambience.
- One or two elegant title beats in refined Pashto typography, then a graceful logo moment that resolves into the story. No full-screen logo pause; keep it moving.
- The first narration line may begin over or right after the intro, but must not be cut or sped up.

**2. Film language across the whole piece**
- Motivated camera moves.
- Shallow depth-of-field feel on backgrounds (never on the doctor's face).
- A consistent warm, natural colour grade.
- Light film grain and a subtle vignette.
- Gentle light leaks only if tasteful (no flashes).
- Cuts timed to the narration phrasing.
- Fewer on-screen boxes and pills.

**3. Less "UI animation", more realism**
- Present WhatsApp moments as real-looking phone close-ups: shallow focus, slight perspective and hand context where possible, using the existing patient photos and interface designs as the source.
- Keep the chat readable and RTL-correct.
- Keep the admin step brief and believable.

**4. Doctor scene**
- Keep Dr. Jalaluddin's real photo static and unaltered inside the consultation interface (labelled as a profile photo).
- Make it feel cinematic through framing and grade, not by animating his face.

**5. Typography**
- Fewer, larger, better-crafted Pashto titles and captions (Noto Naskh Arabic or another properly joined Pashto font). Keep them consistent with the brand teal/navy/gold and green.
- Keep the honesty labels («د AI جوړ انځور · فرضي ناروغ», «نمونه» on the prescription), but make them discreet.

**6. Sound**
- Build a cinematic bed under the existing edited voiceover (`vo/lines/vo_0X.wav`): soft score, real-feeling ambience (wind, courtyard), restrained UI sounds.
- Duck under speech.
- -16 LUFS, ≤ -1.5 dBTP.

**7. Ending**
- Official logo, the doctor's real portrait, CTA text, **+92 310 0006526**, and the emergency disclaimer. Clean, premium, readable.

**Process**
1. Inspect the repo and HyperFrames docs.
2. Write a v3 plan and timeline into `video/etabeeb-journey/v3/` (manifest + timeline).
3. Render a **12–15 s preview** covering the intro, a WhatsApp beat and the doctor beat.
4. Inspect frames: Pashto joining, doctor photo integrity, patient identity, safe areas, sound balance.
5. Fix any issues, then render the final:
   - `video/etabeeb-journey/deliverables/v3/etabeeb-journey-cinematic-v3.mp4`
   - a thumbnail
   - shifted `.srt` captions
6. Don't touch the v1 or v2 deliverables.
7. Commit and push to the branch.
8. Report: final duration, exact changes from v2, output paths, and anything you could not verify.
