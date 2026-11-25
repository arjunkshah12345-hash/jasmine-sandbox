# Jasmine Cloud launch film: SPEC

GOAL: the viewer remembers "change one line and get the same microVM sandboxes hosted, for 3 cents an hour", and goes to tryjasmine.dev.
OUTPUT: HyperFrames, 1920×1080, 30 fps.
TIME: 37.0 s × 30 = 1110 frames. 120 bpm: beat 15 frames, bar 60 frames. Every cut and landing sits on a beat.

LOOK
- (Retired) terminal look, kept for reference: ground #070807. A terminal pane 1500×740 px, radius 28, fill #0d0f0c, 2 px border rgba(244,245,240,.10), shadow 0 40px 80px rgba(0,0,0,.55). JetBrains Mono 46 px (2× real size), line height 1.5. Prompt `$` #6b7068, input #f4f5f0, errors #f0b7cc, success #a6e86b.
- World 2, price: full-frame leaf #a6e86b, ink #0b1006. Geist 600: price at 300 px, tracking -0.06em. Bars in ink; Jasmine's bar in #070807 with a leaf label.
- Type: Geist 600 titles at 120–150 px, tracking -0.045em, at most 6 words per line, one line at a time. Nothing under 28 px.
- Accent ration: leaf only on the URL, the success line, the meter digits, the price world and the end card.
- Dither: a 4×4 Bayer wipe in leaf, used only for the two world changes (8.0 s and 22.0 s).

OBJECTS
- The terminal: a real shell, with output a real system prints. The daemon's ExecStartPre prints "no /dev/kvm: this host cannot run microVMs" (dev/setup-host.sh). ls prints "cannot access '/dev/kvm': No such file or directory".
- The meter: a panel 640 px wide. Label "this sandbox · 4 vCPU · 8 GiB", digits in JetBrains Mono 88 px leaf, counting at $0.0000083/s ($0.030/h). Below it, state: running / paused · memory kept.
- The REPL: the real Python SDK API (Jasmine().create(), exec, pause, resume).

MOTION
- Enter: expo.out, 0.35–0.5 s. Exit: power3.in, 0.3 s. Camera: power3.inOut, 0.6 s.
- One hero move per shot; secondary moves travel 60% as far, starting 0.15 s later.

SHOTS
| t (s) | Shot | Hero move | Reads | Sound |
|---|---|---|---|---|
| 0–2 | open | first line already up on frame 0 (thumbnail); a large outline flower turns behind | "Sandboxes for AI agents." | sub pulse |
| 2–4 | speed | line swaps on the beat | "Ready in 0.09 seconds." | whoosh, pop |
| 4–6 | the catch | line swaps; "a server." is struck out in bud at 5.0 | "But you needed a server." | pop on the strike |
| 6–8 | the turn | one centred line, slow push | "Not anymore." | big kick, riser 7–8 |
| 8–10 | reveal | leaf dither wipe; the lockup blooms | "Jasmine Cloud" | drop + impact at 8.0 |
| 10–22 | the meter | one centred card counts the real per-second cost; headlines swap every bar | "Ready in 0.09 s." → "Billed by the second." → "Pause it. Memory kept." (meter freezes) → "Pick up where you left off." | pops, hats drop out while paused |
| 22–25 | payoff | the meter panel grows to full frame and turns leaf | "$0.030 / hour" | impact |
| 25–29 | compare | four ink bars grow from the left | Jasmine $0.030 · Boat $0.036 + $20/mo minimum · E2B $0.331 · Daytona $0.331 | ticks per bar |
| 29–32.5 | claim | lines replace each other on beats | "Prepaid. Per second." → "You can never owe money." → "$2 free. No card." | claps |
| 32.5–37 | end card | the mark blooms; the wordmark wipes; the URL rises | Jasmine Cloud · tryjasmine.dev · Live today. $2 free, no card. | impact, then a tail |

BANNED: the first film's dither-scramble titles (this film types, swaps and morphs); a dark void with small UI (the terminal fills ≥75% of the width); three cards; the logo docked in a corner; glow; text moving while it's read; invented numbers (only prices from docs.boat.dev/pricing, e2b.dev/docs/pricing and daytona.io/pricing, checked 2026-11-23, and our own rates).
QA: no code on screen anywhere. Frame 0 shows the first line; 5.4 the strike; 9.0 the title; 12.0 the meter running; 17.5 the meter frozen; 24.0 the price; 28.0 all bars with labels; 31.0 a claim line; 36.0 the end card complete.
