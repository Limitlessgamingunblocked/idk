# Timing spec

How fast each part of a turn should feel, why, and how the game measures against it. The game's timing constants are in `TIMING` in `index.html`; `tools/timing.js` measures the real game in a browser and writes `sim/results/timing.json`.

## Where the targets come from

These targets come from published game-feel and perception research, not from measurements of Candy Crush. Frame-by-frame Candy Crush footage wasn't available to analyse here. Measuring it is step 1 of the test plan in `TESTPLAN.md`; replace these targets with those numbers once you have them.

- **Response:** about 100 ms reads as instantaneous; much longer and the player notices a delay (Card, Moran & Newell, *The Psychology of Human-Computer Interaction*, 1983; Nielsen, *Usability Engineering*, 1993).
- **Readable motion:** game-feel practice keeps short state changes in the 100–250 ms range, long enough to see and short enough not to wait on (Swink, *Game Feel*, 2008).
- **Impact:** a brief freeze on big hits ("hit-stop") plus a short screen shake sells weight (Nijman, *The Art of Screenshake*, 2013; Jonasson & Purho, *Juice it or lose it*, 2012).
- **Audio and picture:** viewers notice sound more than about 45 ms early or 125 ms late relative to the picture (ITU-R BT.1359-1).

## Targets

| Moment | Target | Why |
| --- | --- | --- |
| Touch to visible movement | Same frame the swipe is recognised (≤ 17 ms at 60 Hz); never above 100 ms | Feels instant |
| Swap slide | 120–200 ms | Readable, not sluggish |
| Illegal swap, there and back | ≤ 350 ms | The player is blocked while it plays |
| Swap end to first pop | ≤ 50 ms | Matches resolve on contact |
| One pop | 150–250 ms | Readable burst |
| Cascade step to next step | 350–600 ms, steady | A rhythm the eye can follow |
| Dead time inside a turn | No gap over 150 ms where nothing moves | Never feels stalled |
| A plain one-match turn, swap to ready | ≤ 1.3 s median | Keeps the loop brisk |
| Hit-stop on wrapped / rainbow / combos | 50–120 ms | Weight without stutter |
| Sound vs its visual | within ±20 ms (outer limit −45 / +125 ms) | Stays in sync |
| Frame time on target phone | 16.7 ms (60 Hz); 99th percentile ≤ 20 ms during the biggest combos | No visible hitches |

## How the game meets them

- Sounds are started in the same frame as the visual they belong to, so sync depends only on the device's audio output latency. `tools/timing.js` reports it, and an iPhone has to be measured for real.
- Hit-stop pauses the game clock (tweens, timers, particles) while drawing continues: 50–80 ms for wrapped and rainbow blasts, 80–120 ms for combos.

## Measurements

Filled in from `sim/results/timing.json`, measured in headless Chromium on a desktop CPU. These numbers describe the game's own timing logic. They do not describe iPhone frame rates; see `TESTPLAN.md`.

| Moment | Target | First measurement | After fixes |
| --- | --- | --- | --- |
| Swap slide | 120–200 ms | 160 ms | 160 ms |
| Illegal swap, there and back (median) | ≤ 350 ms | 405 ms ✗ | 341 ms ✓ (bounce 240 → 180 ms) |
| Plain one-match turn, swap to ready (median / 90th pct) | ≤ 1.3 s | 678 / 786 ms | 642 / 755 ms ✓ |
| Cascade step to next step (10th / median / 90th pct) | 350–600 ms | 500 / 550 / 633 ms ✗ | 467 / 517 / 600 ms ✓ (post-blast wait 260 → 220 ms) |
| Longest stretch with nothing moving | ≤ 150 ms | 1,401 ms ✗ | 20 ms ✓ |
| Frame time (median / 99th pct), headless Chromium | 16.7 / ≤ 20 ms | 16.7 / 16.8 ms | 16.7 / 16.8 ms |
| Audio output latency (sound after its visual) | ≤ 20 ms | 42 ms (10 base + 32 output) | unchanged; device-specific, see below |

What the longest-gap fix involved:

1. The first harness counted only swaps, pops and falls as activity. Unicorn flights (about 1 s looping round the screen), key and goal-candy flights, chest sparks, gold bars and the dust-spread puff are all visible motion, so they are now marked as activity too.
2. With those counted, the one real dead spot was a 200 ms pause after a chest finished paying out. It is gone.

Audio: in this environment the sound starts 42 ms after its visual. That is inside the 125 ms "late" limit people tolerate, but above the 20 ms target. It comes from the audio device's output buffer, not the game, and differs per device. Check it on an iPhone (TESTPLAN.md, section 2). If it is noticeably late there, the fix is to start each pop sound `outputLatency` seconds before its pop, which the game can do because pop times are planned in advance.

Hit-stop (50–120 ms freezes on wrapped, rainbow, hammer and combo impacts) is implemented as specified. It is not in the table because it is a deliberate pause, not dead time.
