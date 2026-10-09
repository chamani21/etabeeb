# eTabib V1 — low-bandwidth calls and Audio Only

Voice first: the consultation must survive weak 3G, unstable 4G, high latency and
short outages. Video is optional and is reduced, then paused, before audio is
affected. Nothing here changes the case lifecycle: joining, leaving, dropping or
reconnecting never starts, completes or cancels a consultation (only the doctor's
explicit actions do).

Code: `apps/web/src/components/video/` — `callConfig.ts` (LiveKit options),
`networkPolicy.ts` (AUTO policy, pure), `callController.ts` (publishing,
subscriptions, modes, reconnect), `useCallController.ts`, `VideoRoom.tsx` (UI),
`labels.ts` (Pashto/English), `callLog.ts` (diagnostics, no personal data).

## Modes

| Mode | Our camera | Remote video | Mic / remote audio |
|---|---|---|---|
| AUTO (default) | 360p@15 + 180p@10 simulcast; paused only under sustained severe degradation | capped to the low layer when weak; paused (server stops forwarding) when very weak | always on |
| Audio Only (manual, both sides) | camera muted (capture stopped, nothing sent) | **unsubscribed** (nothing downloaded) | always on |

Audio Only stays on until the user turns it off (also across a rejoin). Leaving it
restarts video at the low layer. The network policy never leaves Audio Only and
never turns on a camera the user switched off.

## LiveKit settings (livekit-client 2.22.3)

- Capture 640×360 @ 15 fps; top encoding ≤ 300 kbps / 15 fps; one simulcast layer
  320×180 @ 10 fps ≤ 80 kbps; VP8; no backup codec.
- Audio: Opus speech preset (24 kbps), DTX, RED, mono, echo cancellation, noise
  suppression, AGC; mic track kept alive while muted.
- `adaptiveStream: { pixelDensity: 1, pauseVideoInBackground: true }`, `dynacast: true`.
- Reconnect: LiveKit's built-in recovery with a 2-minute budget (SDK default ≈ 45 s).
- The mic is published before the camera; a camera failure never ends the call.

Who adapts what: the browser's congestion control drops our upper layer when the
uplink is short; dynacast stops layers nobody watches (e.g. the other side is in
Audio Only); adaptiveStream sizes the received layer to the screen; the AUTO policy
caps or pauses received video based on LiveKit's connection-quality score and the
measured loss of the audio we receive. Connection quality is a coarse score, not a
bandwidth measurement.

## AUTO policy (debounced)

- weak (LiveKit "poor", or 5–12 % received-audio loss) for 8 s → standard → low.
  Weak alone never pauses video.
- very weak ("lost", or ≥ 12 % audio loss) for 6 s → one step down (… → paused).
- good for 20 s → low → standard; good for 30 s → paused → low.
- A downgrade within 60 s of an upgrade doubles the recovery hold (max 120 s).
- While reconnecting nothing changes; afterwards video resumes at most at low.
- Chrome/Android only: a `2g`/`slow-2g` Network Information hint starts the call
  with audio first and tells the patient.

## Reconnect and retry

- `Reconnecting`/`SignalReconnecting` → "Connection interrupted. Reconnecting…"; the
  mode and the user's camera/mic choices are kept; LiveKit retries for 2 minutes and
  also retries immediately when the browser comes back online.
- During the call the server refreshes the participant token, so the 15-minute
  token TTL does not limit in-call reconnects.
- After the budget the page shows "connection lost — the consultation has not
  ended" and a Retry button. Retry uses the existing secure paths (patient link →
  `POST /api/video/patient/token`; doctor dashboard → doctor token route). The
  patient page re-reads the server status first, so it only says "ended" when the
  case really is completed/cancelled.
- LiveKit's `participant_left` / `room_finished` webhooks remain audit-only.

## Server requirements (not in this repository — verify on the deployment)

The repository contains no LiveKit server or TURN configuration and the client
does not override ICE servers: it uses the STUN/TURN servers LiveKit returns.

- **LiveKit Cloud**: TURN/TLS on 443 is provided. Nothing to configure here.
- **Self-hosted LiveKit**: enable the embedded TURN with TLS on 443 (or 5349) plus
  TURN/UDP 3478, keep `rtc.tcp_port` (7881) and the UDP media ports open, so
  callers behind strict NAT/firewalls or UDP-blocking mobile networks still connect.
- The app reads `LIVEKIT_URL`; `docker-compose.yml` passes `NEXT_PUBLIC_LIVEKIT_URL`
  instead. If production uses that compose file, video reports "not configured".
- LiveKit webhook → `https://<app>/api/hooks/livekit` (join/leave audit).

## Network test plan (two phones)

Browser DevTools throttling only slows HTTP/WebSocket — **it does not shape WebRTC
media (UDP/TURN)**. Shape the phone's real traffic:

- **Linux laptop as Wi-Fi hotspot** (phone joins it) and `tc` on the hotspot
  interface — commands below. Works for Android and iPhone.
- **iPhone only**: Settings → Developer → Network Link Conditioner (needs Developer
  Mode, enabled once via Xcode). Profiles "3G", "Edge", "Very Bad Network",
  "100% Loss"; custom profiles allow separate up/down bandwidth, delay and loss.
- **Mac**: Network Link Conditioner on a Mac sharing its internet over Wi-Fi.
- A real weak SIM in the border area is the final check.

### Linux traffic shaping (`wlan0` = hotspot interface the phone is on)

```bash
# one-time: downstream (to the phone) on wlan0, upstream (from the phone) via ifb0
sudo modprobe ifb numifbs=1 && sudo ip link set ifb0 up
sudo tc qdisc add dev wlan0 root handle 1: htb default 10
sudo tc class add dev wlan0 parent 1: classid 1:10 htb rate 8mbit
sudo tc qdisc add dev wlan0 parent 1:10 handle 10: netem delay 20ms
sudo tc qdisc add dev wlan0 handle ffff: ingress
sudo tc filter add dev wlan0 parent ffff: protocol all u32 match u32 0 0 action mirred egress redirect dev ifb0
sudo tc qdisc add dev ifb0 root handle 1: htb default 10
sudo tc class add dev ifb0 parent 1: classid 1:10 htb rate 3mbit
sudo tc qdisc add dev ifb0 parent 1:10 handle 10: netem delay 20ms

# apply a profile: DOWN / UP rate, one-way delay ± jitter, loss
p() {  # p <down> <up> <delay> <jitter> <loss>
  sudo tc class change dev wlan0 parent 1: classid 1:10 htb rate $1
  sudo tc class change dev ifb0  parent 1: classid 1:10 htb rate $2
  sudo tc qdisc change dev wlan0 parent 1:10 handle 10: netem delay $3 $4 loss $5
  sudo tc qdisc change dev ifb0  parent 1:10 handle 10: netem delay $3 $4 loss $5
}
p 8mbit   3mbit   20ms  5ms   0%     # A good 4G
p 1500kbit 500kbit 40ms 15ms  1%     # B weak 4G
p 750kbit 250kbit 75ms  25ms  2%     # C 3G
p 400kbit 150kbit 150ms 50ms  3%     # D slow 3G
p 1mbit   500kbit 50ms  10ms  12%    # E severe packet loss
p 1mbit   400kbit 400ms 100ms 1%     # F 500–1000 ms RTT
p 8mbit   3mbit   20ms  5ms   100%   # G outage (then re-apply A after 10/30/90/150 s)

# asymmetric: only the patient's uplink is bad
sudo tc class change dev ifb0 parent 1: classid 1:10 htb rate 120kbit

# remove everything
sudo tc qdisc del dev wlan0 root; sudo tc qdisc del dev wlan0 ingress; sudo tc qdisc del dev ifb0 root
```

Delays are one way per direction (RTT ≈ 2 × delay). netem jitter also reorders
packets, which is realistic for mobile networks.

### Setup

- Staging only, synthetic patient (your own WhatsApp number), never a real patient.
- Phone P = patient (Android Chrome first, then iPhone Safari) on the shaped hotspot,
  opening the `/consult/<token>` link from WhatsApp.
- Phone D = doctor, logged in to the dashboard on normal mobile data.
- Observe: on Android open `chrome://webrtc-internals` in a second tab (bitrate,
  `qualityLimitationReason`, frame size); console lines `[etabib:call] …` via
  `chrome://inspect` (Android) or Safari Web Inspector (iPhone).

### Steps and expected results

1. **Good (A)**: both join, two-way audio and video; patient video ≈ 360p ≤ ~300 kbps
   after ~20 s (starts at the low layer).
2. **Audio Only on P**: P's camera light goes off; P's inbound video drops to 0 B/s
   (webrtc-internals), D sees "camera off"; audio continues both ways; the doctor's
   prescription and case pages keep working; case status unchanged.
3. **Back to video on P**: no rejoin; video returns at 320×180 first, then 360p after
   ~20 s of good network.
4. **Audio Only on D** (doctor side): same as 2 in the other direction.
5. **3G (C)**: call stays up, "Weak connection" shown, received video drops to the
   low layer within ~10 s, speech remains clear.
6. **Slow 3G (D)** and **severe loss (E)**: within ~15 s "Video has been paused so your
   audio consultation can continue"; audio continues. Restore A: video returns only
   after ~30 s of stable network (no flapping).
7. **Latency (F)**: conversation is slower but intelligible; no mode flapping.
8. **Uplink-only throttle (120 kbit)**: P's sent video reduces (browser
   `qualityLimitationReason = bandwidth`); audio still reaches D.
9. **Outage 10 s (G)**: "Connection interrupted. Reconnecting…", then "Connection
   restored." in the same room, same mode.
10. **Outage 30 s**: same as 9 (LiveKit rejoins with a refreshed token).
11. **Outage 150 s**: after ~2 min "connection lost — the consultation has not ended"
    with Retry; Retry rejoins via the same WhatsApp link; the case stays
    IN_CONSULTATION.
12. **Wi-Fi → mobile data and back** on P mid-call: brief reconnecting banner, call
    continues.
13. **Camera permission denied** (block camera for the site): pre-join offers "Join
    with audio only"; the consultation works with audio.
14. **Camera taken by another app / revoked mid-call**: "The camera is not available.
    The consultation continues with audio."; audio unaffected.
15. **Microphone denied**: clear message; no call without a mic (expected).
16. **iPhone Safari**: if "Tap here to turn on sound" appears, one tap enables audio;
    lock/unlock the screen and check audio resumes (iOS may pause the camera in the
    background).
17. **Prescription during Audio Only**: create and send the prescription — delivery
    to WhatsApp unchanged.
18. **Completion**: doctor completes → the room closes for both; the patient page
    shows "consultation ended" only after the server says so. A network drop alone
    must never show "ended".

## Rollback

All changes are client-side (no migrations, no server config). Revert the commit
(`git revert <commit>`) and redeploy the web app.
