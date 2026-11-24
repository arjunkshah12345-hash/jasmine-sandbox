"""A quiet original music bed for the talk, with whooshes on the card moves: python3 tools/bed.py

Run after tools/cues.py (it reads assets/cues.js). Pure synthesis, no samples. 92 bpm, F major
(F C Dm Bb). It sits well under the voice: no drums until the close.
"""
import json, os, re, wave
import numpy as np
from scipy.signal import butter, sosfilt

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
js = open(os.path.join(ROOT, "assets", "cues.js")).read()
C = json.loads(re.search(r"window.CUES = (\{.*?\});", js).group(1))
END_AT = float(re.search(r"window.END_AT = ([0-9.]+)", js).group(1))
DUR = float(re.search(r"window.TOTAL = ([0-9.]+)", js).group(1))

SR = 44100
N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(5)
BEAT = 60 / 92
CHORDS = [(53, [65, 69, 72]), (48, [64, 67, 72]), (50, [62, 65, 69]), (46, [62, 65, 70])]
ARP = [0, 1, 2, 1, 2, 0, 1, 2]


def t_(d):
    return np.arange(int(d * SR)) / SR


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i < 0:
        return
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


hz = lambda m: 440 * 2 ** ((m - 69) / 12)


def pad(notes, d):
    t = t_(d)
    s = sum(np.sin(2 * np.pi * hz(m) * t) + 0.4 * np.sin(2 * np.pi * hz(m) * 2.003 * t) for m in notes)
    env = np.minimum(1, t / 0.8) * np.minimum(1, (d - t) / 0.8)
    return filt(s * env / len(notes), "lowpass", 1800)


def pluck(m, d=0.6):
    t = t_(d)
    return (np.sin(2 * np.pi * hz(m) * t) + 0.3 * np.sin(4 * np.pi * hz(m) * t)) * np.exp(-t * 7)


def whoosh(d=0.6):
    t = t_(d)
    n = filt(rng.standard_normal(len(t)), "bandpass", [500, 5000])
    return n * np.sin(np.pi * t / d) ** 2 * 0.5


def kick():
    t = t_(0.35)
    return np.sin(2 * np.pi * (45 + 90 * np.exp(-t * 30)) * t) * np.exp(-t * 9)


bar = 4 * BEAT
k = 0
while k * bar < DUR:
    t0 = k * bar
    root, tones = CHORDS[k % 4]
    add(pad(tones + [root], bar + 0.4), t0, 0.16)
    add(pad([root - 12], bar + 0.4), t0, 0.14)
    if t0 >= C["open"][1]:  # a soft arp once the hook has landed
        for j in range(8):
            add(pluck(tones[ARP[j]] + 12), t0 + j * BEAT / 2, 0.05, -0.3 if j % 2 else 0.3)
    if t0 >= C["why"][0]:  # a heartbeat kick for the close
        for j in range(4):
            add(kick(), t0 + j * BEAT, 0.22)
    k += 1

for at in (C["signin"][0] - 0.15, C["price"][0] - 0.1, C["why"][0] - 0.55):
    add(whoosh(0.7), at, 0.35)
add(whoosh(0.5), C["url"][0] - 0.35, 0.25)
add(kick(), END_AT, 0.5)

mix = np.stack([L, R], axis=1)
t = np.arange(N) / SR
mix *= np.clip((DUR - t) / 1.8, 0, 1)[:, None]
mix = filt(mix.T, "highpass", 30).T
mix = mix / np.max(np.abs(mix)) * 0.30  # about -10 dBFS peak: a bed, under the voice
with wave.open(os.path.join(ROOT, "assets", "bed.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"wrote assets/bed.wav {DUR:.2f}s")
