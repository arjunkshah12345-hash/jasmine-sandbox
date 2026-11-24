"""Builds the to-camera recording scripts: python3 launch/scripts/build.py

These are for a talking-head launch video (camera, not slides). The slide talks
live in launch/studio and use the Recording Studio.
"""
import html, os, re

HERE = os.path.dirname(os.path.abspath(__file__))

# Each beat: (label, shot, [spoken lines], b-roll or None)
SCRIPTS = {
    "jasmine-launch": {
        "title": "Jasmine · Launch video",
        "sub": "Talking head, about 90 seconds. Read it once out loud, then talk it, don't recite it.",
        "beats": [
            ("Cold open", "Close-up, straight to lens", [
                "Every AI agent that writes code needs somewhere to run it.",
                "Today I'm open-sourcing that place. This is <b>Jasmine</b>.",
            ], None),
            ("The problem", "Medium", [
                "Agents write a lot of code now. Run it on your laptop, and one bad command can wreck your machine.",
                "Run it in a container, and it still shares a kernel with everything else on the box.",
            ], None),
            ("What it is", "Medium", [
                "Jasmine gives every agent task its own computer: a tiny virtual machine with its own kernel.",
                "And it's ready in about <b>a tenth of a second</b>.",
            ], "Launch film, cold-start moment (videos/jasmine-launch/renders/jasmine-launch.mp4)"),
            ("Why it's fast", "Close-up", [
                "It doesn't boot. It wakes up from a snapshot of a machine that already booted.",
                "Like opening a laptop lid instead of turning it on.",
            ], None),
            ("Proof", "Medium, then cut to cards", [
                "I ran aisandboxbench's open-source harness against the thirteen hosted providers they publish.",
                "Jasmine came first on <b>twelve of twenty-five</b> metrics.",
                "It's not first on everything. Big bursts and heavy disk writes are still weaker, and every result is on the site.",
            ], "social/card-1.png, then social/card-2.png"),
            ("Made for agents", "Medium", [
                "Pause a sandbox between an agent's turns, and it stops using CPU.",
                "Snapshot it, and start copies from that exact moment.",
            ], None),
            ("Setup", "Medium", [
                "You don't even have to set it up yourself.",
                "Paste one prompt into Claude Code, Codex or Cursor, and your agent installs it for you.",
            ], "Screen recording: pasting the setup prompt from the site"),
            ("Close", "Close-up. Smile on the last line.", [
                "It's open source, Apache two point oh, and it runs on any Linux machine with KVM.",
                "It's all at <b>tryjasmine.dev</b>.",
                "Give your agents their own computers.",
            ], None),
        ],
    },
    "jasmine-cloud": {
        "title": "Jasmine Cloud · Launch video",
        "sub": "One take, outdoors, about 55 seconds. Frame yourself centred, chest up, with sky or open space around your head: the captions sit beside and behind you. Talk it, don't recite it. The edit adds everything in \u201cOn screen\u201d.",
        "beats": [
            ("Cold open", "Full frame, straight to lens", [
                "Your agent just wrote a thousand lines of code.",
                "Where's it supposed to run them?",
            ], "Caption \u201ca thousand lines\u201d, a glass diff card (+1,024) floats in beside you"),
            ("The problem", "Full frame", [
                "Your laptop? Production?",
            ], "Two small glass cards pop in, \u201c~/laptop\u201d and \u201cproduction\u201d, each struck out"),
            ("Who", "Full frame", [
                "I'm [your name], and I built <b>Jasmine</b>.",
            ], "Lower third: your name · built Jasmine"),
            ("Recap", "Full frame", [
                "Two weeks ago we open-sourced it. Every agent task gets its own computer, ready in <b>a tenth of a second</b>.",
            ], "Caption \u201cits own computer.\u201d then \u201c0.09 s\u201d"),
            ("The ask", "Full frame, lean in a little", [
                "And the number one thing you told us was: \u201cI don't have a server for this.\u201d",
            ], "Big word \u201cserver.\u201d behind your head"),
            ("Launch", "Full frame. Pause before it.", [
                "So today, we're launching <b>Jasmine Cloud</b>.",
            ], "Caption \u201cJasmine Cloud.\u201d"),
            ("Demo", "You shrink to a card on the left; the product plays on the right", [
                "Sign in, make a key, and your agent has its own computer in a tenth of a second.",
                "Pause it between turns. Memory kept, billing stops.",
                "Fork it, and run ten copies from that exact moment.",
            ], "Dashboard: key created → sandbox running in 0.09 s → meter freezes on pause → one card splits into ten"),
            ("Price", "Still a card", [
                "It's <b>three cents an hour</b>. About eleven times less than E2B or Daytona.",
                "Prepaid, by the second. You can never owe money.",
            ], "Headline \u201cThree cents an hour.\u201d over the price bars; then \u201cYou can never owe money.\u201d"),
            ("Why", "Back to full frame", [
                "Models get smarter every month. But a smart agent with nowhere to run is just a chatbot.",
            ], "Caption \u201cnowhere to run\u201d"),
            ("Close", "Full frame. Smile on the last line.", [
                "So give yours a computer. Two dollars free at <b>tryjasmine.dev</b>.",
            ], "URL bar \u201ctryjasmine.dev\u201d with \u201cGet your key.\u201d, then the logo card: \u201cGive your agents a computer.\u201d"),
        ],
    },
}

CSS = """
@font-face { font-family: "Geist"; src: url("fonts/Geist-Regular.woff2") format("woff2"); font-weight: 400; }
@font-face { font-family: "Geist"; src: url("fonts/Geist-SemiBold.woff2") format("woff2"); font-weight: 600; }
@font-face { font-family: "Geist Mono"; src: url("fonts/GeistMono.woff2") format("woff2"); font-weight: 400; }
:root { --paper: #f6f7f2; --ink: #11130f; --ink2: #4a4f46; --dim: #8a8f85; --leaf: #5c9a1f; --line: #e2e4dc; }
* { box-sizing: border-box; margin: 0; }
body { background: var(--paper); color: var(--ink); font-family: "Geist", sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 72px 32px 120px; }
.kick { font-family: "Geist Mono", monospace; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--leaf); }
h1 { font-size: 44px; font-weight: 600; letter-spacing: -.035em; margin-top: 10px; }
.sub { color: var(--ink2); font-size: 18px; margin-top: 12px; line-height: 1.5; }
.meta { font-family: "Geist Mono", monospace; font-size: 13px; color: var(--dim); margin-top: 16px; }
.beat { display: grid; grid-template-columns: 170px 1fr; gap: 28px; padding: 34px 0; border-top: 1px solid var(--line); }
.beat:first-of-type { margin-top: 48px; }
.lab { font-weight: 600; font-size: 15px; }
.n { font-family: "Geist Mono", monospace; color: var(--dim); font-size: 13px; display: block; margin-bottom: 6px; }
.shot { color: var(--dim); font-size: 13px; margin-top: 8px; line-height: 1.4; }
.say p { font-size: 27px; line-height: 1.42; letter-spacing: -.01em; }
.say p + p { margin-top: 14px; }
.say b { font-weight: 600; color: var(--leaf); }
.broll { font-family: "Geist Mono", monospace; font-size: 13px; color: var(--ink2); margin-top: 18px; padding: 10px 14px; border-left: 3px solid var(--leaf); background: #fff; }
@media print { main { padding-top: 24px; } .beat { break-inside: avoid; } }
"""


def page(s):
    words = sum(len(re.sub("<[^>]+>", "", l).split()) for b in s["beats"] for l in b[2])
    secs = round(words / 150 * 60)  # natural talking pace
    beats = []
    for i, (lab, shot, lines, broll) in enumerate(s["beats"], 1):
        say = "".join(f"<p>{l}</p>" for l in lines)
        br = f'<div class="broll">On screen · {html.escape(broll)}</div>' if broll else ""
        beats.append(f'<section class="beat"><div><span class="n">{i:02d}</span><div class="lab">{lab}</div><div class="shot">{shot}</div></div><div class="say">{say}{br}</div></section>')
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>{s['title']}</title><style>{CSS}</style></head>
<body><main>
<div class="kick">Recording script · to camera</div>
<h1>{s['title']}</h1>
<p class="sub">{s['sub']}</p>
<p class="meta">{words} words · about {secs} s at a natural pace</p>
{''.join(beats)}
</main></body></html>
"""


for slug, s in SCRIPTS.items():
    open(os.path.join(HERE, f"{slug}.html"), "w").write(page(s))
    print(slug)
