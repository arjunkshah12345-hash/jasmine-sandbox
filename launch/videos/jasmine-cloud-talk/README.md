# Jasmine Cloud: talking-head launch video

Format: one take of you outdoors, with kinetic captions beside you, glass cards, the shot shrinking into a card while
the product plays, then the URL bar and the logo. The script is `launch/scripts/jasmine-cloud.html`.

Right now `assets/footage.mp4` is a placeholder (a silhouette and a synthetic voice) so the edit can be previewed.

## Recording
- One take, 4K or 1080p, 30 fps, landscape. A lav or shotgun mic: the sound matters more than the picture.
- You centred, chest up, eye line about a third from the top. Open space either side of your head (sky, water, a wall):
  the captions sit there.
- Read the script once out loud, then talk it. Pause for a beat before "So today, we're launching Jasmine Cloud."
- Small ad-libs are fine. If you change a line a lot, edit its phrase in `tools/cues.py`.

## Dropping your take in
```sh
cp ~/path/to/take.mp4 assets/footage.mp4
ffmpeg -i assets/footage.mp4 -c:v libx264 -g 30 -crf 18 -c:a aac -b:a 192k /tmp/f.mp4 && mv /tmp/f.mp4 assets/footage.mp4  # keyframes every second, so seeking never freezes
npx hyperframes transcribe assets/footage.mp4 --model small.en   # word timings → assets/transcript.json
python3 tools/cues.py                                           # times every caption and card to your words
python3 tools/bed.py                                            # re-times the music bed
npm run check && npm run render
```
Set your name in the `name` variable (index.html, or the HyperFrames desktop app).

## Optional: words behind your head
For the captions that should sit behind you (like "server."), cut yourself out with
`npx hyperframes remove-background assets/footage.mp4` and stack the cutout above the captions (see the HyperFrames captions guide).
