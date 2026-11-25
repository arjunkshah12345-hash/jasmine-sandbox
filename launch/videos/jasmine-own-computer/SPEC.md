# Jasmine: "its own computer" launch film

GOAL: someone scrolling X stops in the first 3 s, understands "Jasmine gives your AI agent its own computer, ready in a tenth of a second" in words a 5-year-old knows, and remembers the race.
Built on the lessons.sh launch-video notes: hook on a problem people feel (not a logo), the problem, ONE core feature, real product on screen, crisp real sound, a little controversy, something odd at the end.
OUTPUT: HyperFrames, 1920×1080, 30 fps, 29.2 s.

LOOK
- Ground #070807, ink #f4f5f0, dim #8a8f85, leaf #a6e86b, bud #f0b7cc. Geist 600 for type, Geist Mono for code and timers.
- Type is big: lines 120–170 px, chat bubbles 46 px, nothing under 28 px except the race footnote (24 px, a source line).
- One line of words on screen at a time. Words a 5-year-old knows: "run", "computer", "ready", "slow", "scary".
- Leaf is earned: it appears with "its own computer" and stays on Jasmine's lane and the end card.

SHOTS
| t (s) | Shot | Reads | Sound |
|---|---|---|---|
| 0–3.3 | hook: a chat with your AI agent. Frame 0 already shows "Cleaning up your project…" | agent: `$ rm -rf ~/` → "Deleting 14,382 files…" → you: "WAIT" "STOP STOP STOP" → freeze | pops on each bubble, record scratch on the freeze; no music yet |
| 3.3–10 | problem, one line at a time | "AI agents write code." "That code has to run somewhere." "Your laptop? Scary." "Someone's cloud? Slow." | music enters at 3.3; whip per line |
| 10–12.6 | reveal: leaf dither wipe | "Jasmine gives your agent its own computer." | impact + boom at 10.0 |
| 12.6–20.9 | the race, 4× slow motion, real medians from the site | Jasmine 100 ms, Modal 376 ms, E2B 793 ms, Daytona 1.25 s; "Jasmine: a tenth of a second." then "The others? Up to 12× slower." | pop on each finish, Jasmine's loudest |
| 20.8–24.8 | the real tryjasmine.dev hero; push into the install command; cursor clicks copy | "Free and open source. One command." | whoosh in, click on the click |
| 24.8–29.2 | end card: the flower blooms, wordmark, line, URL. Then a tiny kid pops out of a literal sandbox at the bottom right and says "hi" | "Give your agents their own computer." tryjasmine.dev | boom on the bloom, boing + "hi" for the kid |

NUMBERS: only the site's published medians (create → first command, self-run on aisandboxbench's open-source harness, 4 vCPU / 8 GB, 2026-11-21; others are their published results). The race says it is slowed 4×.
BANNED: a logo before 24 s; a feature list; invented UI (the chat is a generic agent chat, not a real product; the site is a real capture); synthesised dings; text moving while it is read.
SOUND: real recordings only, all CC0 (assets/CREDITS.md). Music "Awesome electronic beat" (125 bpm) from 3.3 s, held back for the hook.
