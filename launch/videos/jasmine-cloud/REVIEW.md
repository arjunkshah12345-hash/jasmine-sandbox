# Review: Jasmine Cloud launch film

`npx hyperframes check`: ok (0 errors, 0 warnings). Frames checked at the SPEC's QA times.

Fixed during review:
- The price panel grew by animating left/top/width/height (snaps to whole pixels). It now grows with clip-path.
- The claims replaced each other faster than they could be read (under 1 s each). They now stack: each line stays up 2–3.3 s.
- The price sub-line rendered at 24 px after the price stepped back. Raised to 58 px (29 px after scaling).
- The price sources footnote was on screen 2.8 s. It now arrives with the price and stays about 5.5 s.
- The REPL lines were spread out by template whitespace under `white-space: pre`. Fixed.
- "Jasmine Cloud" wrapped in the price table. The name column is wider and the bars are rescaled (still proportional to the listed prices).

Choices:
- Numbers on screen are real: our rates ($0.0045/vCPU-h + $0.0015/GiB-h = $0.030/h for 4 vCPU · 8 GiB) and list prices checked 2026-11-23. The meter counts at the true per-second rate, so it shows small numbers on purpose.
- The terminal error is the daemon's real message (dev/setup-host.sh). The REPL uses the real Python SDK (create, exec, pause, resume).

Render: `npm run render` (about 25 MB at the default quality).

## Revision 2026-11-24: launch-y, no code
- The terminal opener is gone. It now opens on type: "Sandboxes for AI agents." → "Ready in 0.09 seconds." → "But you needed a server." (struck out) → "Not anymore." → the reveal.
- The Python REPL is gone. The middle is one centred cost meter with plain headlines.
- The end card shows tryjasmine.dev instead of the export line.
- Score re-cued to the new picture (tools/score.py). `npx hyperframes check` passes.
