# eTabeeb Journey — Pashto Narration Script and Voiceover Slots

**Status: a human Pashto voiceover is still needed.** No authorised Pashto voice or reliable Pashto TTS was reachable from the production environment, because the network policy blocks the neural TTS endpoint. The delivered MP4 carries Pashto on-screen captions, a quiet music bed and UI sound effects. It has **no narration track**.

Record each line below inside its slot. The slots match the burned-in captions and `out/etabeeb-journey_ps.srt`.

- **Voice:** natural Pakistani/Afghan Pashto; warm, calm and reassuring; mid tempo.
- **Do not** clone or imitate Dr. Jalaluddin's voice.
- **Format:** 48 kHz WAV, mono or stereo, one file per line (`vo_01.wav` … `vo_07.wav`) or one continuous take.
- **Mix:** voice around -16 LUFS integrated. The music and sound-effect bed (`out/mix_music_sfx.wav`) sits around -26 LUFS. If you lay the voice over the final MP4 rather than the stems, duck its audio by 4–6 dB under the voice.

| # | Slot (s) | Scene | Pashto line (to record) | Meaning |
|---|---|---|---|---|
| 1 | 0.5 – 7.0 | Patient at home, remote courtyard | ډاکټر ته تګ درته ګران دی؟ له ای طبیب سره له خپل ځایه طبي مشوره ترلاسه کولی شئ. | Is travelling to a doctor difficult? With eTabeeb, you can get medical advice from where you are. |
| 2 | 7.8 – 19.6 | WhatsApp chat: greeting, name, phone | په واټساپ کې ای طبیب ته پیغام واستوئ او خپل نوم ولیکئ. ستاسو د مشورې غوښتنه ثبتېږي. | Message eTabeeb on WhatsApp and write your name. Your consultation request is registered. |
| 3 | 20.6 – 33.9 | Admin review, then confirmation in the same chat | اډمین ستاسو معلومات او د فیس ورکړه تاییدوي. بیا د مشورې وخت له ډاکټر سره برابرېږي او تاسو ته په همدې واټساپ کې خبر درکول کېږي. | The admin verifies your information and fee payment. The consultation time is then arranged with the doctor, and you are told in this same WhatsApp chat. |
| 4 | 34.8 – 47.6 | Tap link, consultation room | په ټاکلي وخت د مشورې لینک خلاص کړئ او له ډاکټر سره آنلاین مشوره وکړئ. | At the scheduled time, open the consultation link and have your online consultation with the doctor. |
| 5 | 48.8 – 64.4 | Consultation screen, Dr. Jalaluddin photo | خپلې نښې، پخوانۍ ناروغۍ او کارېدونکي درمل له ډاکټر سره شریک کړئ. که پخواني راپورونه لرئ، هغه هم ورولېږئ. | Share your symptoms, past illnesses and current medicines with the doctor. If you have previous reports, send them too. |
| 6 | 65.6 – 78.6 | Prescription attachment arrives, sample preview | له مشورې وروسته، ډاکټر نسخه او لازمې لارښوونې چمتو کوي او په همدې واټساپ کې یې ترلاسه کوئ. | After the consultation, the doctor prepares the prescription and necessary instructions, and you receive them in this same WhatsApp chat. |
| 7 | 79.6 – 89.4 | Patient calm, then end card | د مشورې لپاره ای طبیب ته په واټساپ کې پیغام واستوئ. دا خدمت د بیړنیو حالاتو لپاره نه دی. | For a consultation, message eTabeeb on WhatsApp. This service is not for emergencies. |

## Changes from the brief, and why

1. **Line 1:** «ګران دي» was changed to «ګران دی». «تګ» is singular masculine, so the singular copula «دی» is the grammatical form.
2. **Line 4:** the brief's «… غږیزه یا ویډیويي مشوره وکړئ» was replaced with «… آنلاین مشوره وکړئ». The V1 backend (`docs/ETABIB_V1_BACKEND.md` §9) stores an https consultation link supplied by the doctor or admin. It does not state which call modes that link supports, so the narration does not claim audio-or-video until that is verified. If both modes are confirmed, restore the original wording; it fits the same slot.
3. **Brand spelling:** «ای طبیب» (with a space) and "eTabeeb" are used, as in `README.md` and the WhatsApp bot messages (`apps/web/src/lib/etabib/messages.ps.ts`). No official logo file exists in the repository; confirm the spelling against the logo when it is supplied.

## On-screen chat text (illustrative)

The automated bot messages shown are taken from the live message catalogue (`messages.ps.ts`), lightly shortened:
- Ask for name
- Ask for phone
- Acknowledgement (the word «ډېر ژر» / "very soon" was dropped, so no response time is promised)
- Consultation confirmed, with the time and link
- Prescription ready

The patient name «احمد ګل», the masked number `07•• ••• •••`, the time text and the sample prescription are all fictional. The real workflow asks only for the **name** and then the **phone**; the admin collects age, sex, location and complaint separately. The video shows exactly that.
