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
