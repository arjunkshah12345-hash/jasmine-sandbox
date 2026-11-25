"""Original score for the Jasmine Cloud launch film. Pure synthesis, no samples: python3 tools/score.py

120 bpm, D minor (Dm Bb F C), 37 s. Hits are placed on the picture's actions (see SPEC.md).
"""
import numpy as np
from scipy.signal import butter, sosfilt
import wave, sys, os

SR = 44100
DUR = 37.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(11)
L = np.zeros(N)
R = np.zeros(N)


def t_(d):
    return np.arange(int(d * SR)) / SR


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(f, d, detune=0.0):
    t = t_(d)
    ph = (f * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


# ---------- instruments ----------
def kick(big=False):
    d = 0.9 if big else 0.42
    t = t_(d)
    f = 44 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * (4 if big else 8.5))
    s[:60] += np.linspace(0.6, 0, 60)  # click
    return np.tanh(s * 1.6)


def hat(open_=False):
    d = 0.16 if open_ else 0.045
    n = rng.standard_normal(int(d * SR))
    n = filt(n, "highpass", 7500)
    return n * np.exp(-t_(d) * (22 if open_ else 90))


def clap():
    d = 0.22
    n = filt(rng.standard_normal(int(d * SR)), "bandpass", [900, 2600])
    env = np.exp(-t_(d) * 18)
    for k in (0.0, 0.011, 0.022):  # three smeared hits
        i = int(k * SR)
        env[i : i + 200] += 0.6
    return n * env * 0.7


def pluck(m, d=0.32):
    s = saw(hz(m), d) * 0.5 + saw(hz(m), d, 0.004) * 0.5
    s = filt(s, "lowpass", 3200)
    return s * np.exp(-t_(d) * 11)


def pad(notes, d):
    t = t_(d)
    s = sum(saw(hz(m), d, dt) for m in notes for dt in (-0.006, 0.0, 0.006))
    s = filt(s / (len(notes) * 3), "lowpass", 900)
    a = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.4)
    return s * a


def bassnote(m, d):
    s = saw(hz(m), d) * 0.7 + np.sin(2 * np.pi * hz(m) * t_(d)) * 0.6
    s = filt(s, "lowpass", 420)
    t = t_(d)
    return s * np.minimum(1, t / 0.005) * np.exp(-t * 3)


def riser(d=2.0):
    t = t_(d)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(n)
    seg = len(t) // 16
    for k in range(16):  # stepped sweep of the cutoff
        f = 300 * (9000 / 300) ** (k / 15)
        out[k * seg : (k + 1) * seg] = filt(n, "bandpass", [f * 0.7, min(f * 1.4, 20000)])[k * seg : (k + 1) * seg]
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * t / d)) / SR) * 0.25
    return (out * 0.6 + tone) * (t / d) ** 2


def impact():
    d = 2.6
    t = t_(d)
    n = filt(rng.standard_normal(len(t)), "lowpass", 2400) * np.exp(-t * 2.2) * 0.5
    return np.concatenate([kick(big=True), np.zeros(len(t) - int(0.9 * SR))]) * 1.1 + n


def pop(f0=1400):
    d = 0.09
    t = t_(d)
    f = f0 * (1 - 0.35 * t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40)


def tick():
    d = 0.02
    return filt(rng.standard_normal(int(d * SR)), "bandpass", [2500, 6000]) * np.exp(-t_(d) * 200)


def whoosh(d=0.45):
    t = t_(d)
    n = rng.standard_normal(len(t))
    a = filt(n, "bandpass", [500, 1500])
    b = filt(n, "bandpass", [1800, 5000])
    x = t / d
    return (a * (1 - x) + b * x) * np.sin(np.pi * x) ** 2 * 0.9


# ---------- arrangement ----------
CHORDS = [(50, [50, 53, 57]), (46, [46, 50, 53]), (53, [53, 57, 60]), (48, [48, 52, 55])]  # Dm Bb F C
ARP = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1]
duck = np.ones(N)


def chord_at(t):
    return CHORDS[int(t // 2) % 4]


def ducked(tb):
    e = int(tb * SR)
    n = min(int(0.22 * SR), N - e)
    if n > 0:
        duck[e : e + n] = np.minimum(duck[e : e + n], 0.35 + 0.65 * np.linspace(0, 1, n) ** 2)


for b in range(int(DUR // 2) + 1):
    t0 = b * 2.0
    root, tones = chord_at(t0)
    if t0 < 35:
        add(pad([m + 12 for m in tones], 2.05), t0, 0.14 if t0 < 8 else 0.2, 0)
    for k in range(4):
        tb = t0 + k * BEAT
        if tb >= DUR:
            break
        intro = tb < 4
        half = 4 <= tb < 6
        build = 6 <= tb < 8
        main = 8 <= tb < 28.5
        claim = 28.5 <= tb < 32.5
        paused = 16 <= tb < 19.5
        if intro:  # sub pulse under the opening lines
            add(np.sin(2 * np.pi * hz(root - 24) * t_(0.3)) * np.exp(-t_(0.3) * 9), tb, 0.5)
        if (half and k in (0, 2)) or build or main or claim:
            add(kick(), tb, 0.95 if not paused else 0.6)
            ducked(tb)
        if (main or claim) and k in (1, 3) and not paused:
            add(clap(), tb, 0.55 if claim else 0.45, 0.1)
        if (build or main) and not paused:
            add(hat(), tb + 0.25, 0.3, 0.35)
            if main:
                add(hat(), tb, 0.12, -0.35)
                if k == 3:
                    add(hat(True), tb + 0.25, 0.14, 0.3)
    # bass: 8ths from the drop; held while the sandbox is paused
    if 8 <= t0 < 32.5:
        if 16 <= t0 < 19.5:
            add(bassnote(root - 24, 2.0) * 0.8, t0, 0.45)
        else:
            for k in range(8):
                add(bassnote(root - 24 + (12 if k in (3, 7) else 0), 0.24), t0 + k * 0.25, 0.42)
    # pluck arp: 16ths from the drop, 8ths under the end card
    if 10 <= t0 < 32 or 33 <= t0 < 36:
        step = 0.125 if t0 < 32 else 0.25
        for k in range(int(2 / step)):
            m = tones[ARP[k % 16]] + 12 + (12 if (k // 4) % 2 and t0 >= 22 else 0)
            g = (0.08 if 16 <= t0 < 19.5 else 0.15) if t0 < 32 else 0.11
            add(pluck(m), t0 + k * step, g, 0.25 if k % 2 else -0.25)
            add(pluck(m), t0 + k * step + 0.375, g * 0.35, -0.5 if k % 2 else 0.5)

# ---------- hits on picture ----------
add(whoosh(0.35), 1.9, 0.3)       # "Ready in 0.09 seconds."
add(pop(1500), 2.25, 0.3)
add(whoosh(0.35), 3.9, 0.3)       # "But you needed a server."
add(pop(480), 5.0, 0.45)          # struck out
add(kick(big=True), 6.0, 0.6)     # "Not anymore."
add(riser(1.0), 7.0, 0.7)
add(impact(), 8.0, 0.85)          # Jasmine Cloud
add(whoosh(0.3), 9.92, 0.35)      # leaf dithers off
add(pop(1500), 10.9, 0.4)         # meter starts
add(pop(1700), 13.05, 0.3)        # "Billed by the second."
add(pop(800), 16.2, 0.4)          # pause: meter freezes
add(pop(1400), 19.6, 0.4)         # resume
add(riser(1.0), 21.0, 0.55)
add(impact(), 22.0, 0.8)          # leaf world
add(kick(big=True), 22.85, 0.5)   # price lands
add(whoosh(0.5), 25.0, 0.4)
for i in range(4):                 # bars
    add(tick(), 25.35 + i * 0.25, 0.35, -0.3 + i * 0.2)
add(whoosh(0.4), 28.5, 0.4)       # dark wipe back
for at in (28.9, 29.7, 30.5):      # claims land
    add(tick(), at, 0.3)
add(riser(1.0), 31.5, 0.55)
add(impact(), 32.5, 0.9)          # end card
add(pop(1700), 33.5, 0.3)         # tryjasmine.dev

# ---------- mix ----------
music_duck = duck
L *= music_duck * 0.92 + 0.08
R *= music_duck * 0.92 + 0.08
mix = np.stack([L, R], axis=1)
# master fade-out on the tail
t = np.arange(N) / SR
fade = np.clip((DUR - t) / 2.6, 0, 1)
mix *= fade[:, None]
mix = filt(mix.T, "highpass", 28).T
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.25) / np.tanh(1.25) * 0.89  # soft limit, ~ -1 dBFS
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "assets", "audio", "score.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", out, f"{DUR}s")
