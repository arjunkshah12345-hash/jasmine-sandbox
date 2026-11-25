"""Times every caption and card to the spoken words: python3 tools/cues.py

1. Put your take at assets/footage.mp4.
2. npx hyperframes transcribe assets/footage.mp4 --model small.en   (writes assets/transcript.json)
3. python3 tools/cues.py                                              (writes assets/cues.js, sets durations)

Each cue is a phrase from the script. It is found in the transcript by its letters and digits only,
in order, so punctuation, hyphens and "TryJasmine.dev" vs "try jasmine dot dev" style splits don't matter.
If you ad-lib and a phrase can't be found, its time is estimated from its neighbours and a warning is printed:
edit the phrase below to what you actually said.
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
TAIL = 3.2  # seconds of end card after the footage ends

CUES = [
    ("open", "your agent just wrote"),
    ("thousand", "a thousand lines of code"),
    ("where", "where's it supposed to run them"),
    ("laptop", "your laptop"),
    ("prod", "production"),
    ("name", "and i built jasmine"),
    ("recap", "two weeks ago"),
    ("own", "its own computer"),
    ("tenth", "ready in a tenth of a second"),
    ("server", "i don't have a server for this"),
    ("launch", "so today we're launching jasmine cloud"),
    ("signin", "sign in make a key"),
    ("running", "your agent has its own computer in a tenth of a second"),
    ("pause", "pause it between turns"),
    ("kept", "memory kept billing stops"),
    ("fork", "fork it and run ten copies"),
    ("moment", "from that exact moment"),
    ("price", "three cents an hour"),
    ("eleven", "about eleven times less"),
    ("prepaid", "prepaid by the second"),
    ("owe", "you can never owe money"),
    ("why", "models get smarter every month"),
    ("chatbot", "nowhere to run is just a chatbot"),
    ("give", "so give yours a computer"),
    ("url", "two dollars free at tryjasmine dev"),
]

norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())


def main():
    d = json.load(open(os.path.join(ROOT, "assets", "transcript.json")))
    words = d if isinstance(d, list) else d["words"]
    # one string of letters and digits, and for each character the word it came from
    chars, owner = [], []
    for i, w in enumerate(words):
        for c in norm(w["text"]):
            chars.append(c)
            owner.append(i)
    text = "".join(chars)

    out, cur, missing = {}, 0, []
    for cid, phrase in CUES:
        p = norm(phrase)
        k = text.find(p, cur)
        if k < 0:
            missing.append(cid)
            out[cid] = None
            continue
        a, b = owner[k], owner[k + len(p) - 1]
        out[cid] = [round(words[a]["start"], 3), round(words[b]["end"], 3)]
        cur = k + len(p)

    # estimate anything we couldn't find from its neighbours
    ids = [c for c, _ in CUES]
    for cid in missing:
        i = ids.index(cid)
        prev = next((out[ids[j]] for j in range(i - 1, -1, -1) if out[ids[j]]), [0, 0])
        nxt = next((out[ids[j]] for j in range(i + 1, len(ids)) if out[ids[j]]), [prev[1] + 2, prev[1] + 2])
        mid = (prev[1] + nxt[0]) / 2
        out[cid] = [round(mid, 3), round(mid + 1.2, 3)]
        print(f"warning: couldn't find '{cid}' ({dict(CUES)[cid]!r}); estimated at {mid:.2f}s. Edit the phrase in tools/cues.py.", file=sys.stderr)

    media = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                           os.path.join(ROOT, "assets", "footage.mp4")]).decode().strip())
    last = max(w["end"] for w in words if w["end"] <= media + 0.05)
    end_at = round(min(media, last + 0.7), 3)
    total = round(end_at + TAIL, 3)

    with open(os.path.join(ROOT, "assets", "cues.js"), "w") as f:
        f.write("// Written by tools/cues.py from assets/transcript.json. Don't edit by hand.\n")
        f.write(f"window.CUES = {json.dumps(out)};\nwindow.MEDIA = {media};\nwindow.END_AT = {end_at};\nwindow.TOTAL = {total};\n")

    # every host spans the whole film; the footage plays to the end card
    p = os.path.join(ROOT, "index.html")
    s = open(p).read()
    s = re.sub(r'(data-span="total"[^>]*?data-duration=")[0-9.]+', lambda m: m.group(1) + str(total), s)
    s = re.sub(r'(data-span="media"[^>]*?data-duration=")[0-9.]+', lambda m: m.group(1) + str(end_at), s)
    s = re.sub(r'(id="end"[^>]*?data-start=")[0-9.]+', lambda m: m.group(1) + str(end_at), s)
    s = re.sub(r'(id="end"[^>]*?data-duration=")[0-9.]+', lambda m: m.group(1) + str(TAIL), s)
    open(p, "w").write(s)
    print(f"{len(CUES) - len(missing)}/{len(CUES)} cues found · footage {media:.2f}s · end card at {end_at:.2f}s · film {total:.2f}s")


main()
