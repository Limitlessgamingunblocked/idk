# Sugar Shapes rulebook

The rules live in one file, `src/rules.js`. The game (`index.html`) and the simulator (`sim/`) both run that same code, so what the bots measure is what players get. `test/rules.test.js` checks each rule below; run `node --test test/rules.test.js`.

## Board

- 8×8 cells. A level uses 5 or 6 colours.
- A new board has no ready-made matches, at least 3 legal moves and exactly 2 key candies (on rows 2–7).
- All rule randomness (refills, keys, chest rewards, shuffles, unicorn tie-breaks, rainbow combo stripe directions) comes from one seeded generator per attempt. The same seed and the same moves replay the same game.

## Moves

- Swap two neighbouring candies. The swap is legal if it makes a match, or if both candies are specials, or if either is a rainbow (a combo).
- An illegal swap bounces back and costs nothing.
- If no legal move exists at the end of a turn, the board shuffles until it has no matches and at least one move.

## Matches and the specials they make

Matches are lines of 3+ and 2×2 boxes of one colour. Shapes that share a cell merge into one group. Each group makes at most one special, in this priority order:

| Group | Special |
| --- | --- |
| 5+ in a line, or any group of 6+ candies | Rainbow (no colour; never matches) |
| A horizontal and a vertical line together (L or T) | Wrapped |
| 4 in a line | Striped. A horizontal 4 makes a column-clearing stripe; a vertical 4 makes a row-clearing stripe |
| A 2×2 box (alone or with a line of 3) | Unicorn |

The special appears on the swapped cell if that cell is in the group. Otherwise it goes where the lines cross (wrapped) or in the middle of the longest line. A cell that already holds a special is never chosen. Jelly under the new special counts as cleared.

## What specials do when they go off

| Special | Clears |
| --- | --- |
| Striped | Its whole row or column (8 cells) |
| Wrapped | A diamond of radius 2 around it (13 cells, fewer at edges) |
| Unicorn | Launches 3 unicorns. Each picks a target (jelly first, ×10 per layer; then keys, +8; then candies a collect goal still needs, +6; specials are avoided, −4; ties broken at random) and clears it plus its 4 neighbours |
| Rainbow (set off by a blast) | Every candy of the most common colour left on the board |

A special caught in another special's blast goes off too (chain reaction).

## Combos (swap two specials, or a rainbow with anything)

| Swap | Effect |
| --- | --- |
| Rainbow + rainbow | Clears the whole board |
| Rainbow + plain candy | Clears every candy of that colour |
| Rainbow + striped / wrapped / unicorn | Turns every candy of that colour into that special, then sets them all off |
| Striped + striped | A cross: the row and column through the swap |
| Striped + wrapped | A cross 3 rows and 3 columns wide |
| Wrapped + wrapped | A 5×5 square |
| Unicorn + unicorn | 7 unicorns |
| Unicorn + striped / wrapped | 3 unicorns that fire a stripe or a wrapped blast where they land |

## Cascades and scoring

- After a clear, candies fall and new ones drop in. Any new matches resolve as the next cascade step.
- Each cleared candy scores 20 × the cascade step (capped at 8).
- Making a special adds 120 (striped), 200 (wrapped), 150 (unicorn) or 500 (rainbow). Setting one off adds 100, 180, 150 or 300.
- A new candy carries a key with 4% chance (`TUNE.keyChance`) while fewer than 3 keys are on the board (not after the level is won).

## Goals

- **Score:** reach the target.
- **Collect:** clear the given number of a colour (rainbows don't count).
- **Jelly / dust:** clear every layer. Each clear on a cell removes one layer.
- **Furniture Mode spreading dust:** on levels marked `spread`, a turn that cleans no dust lets dust creep onto one clean tile next to existing dust (the goal grows by one).
- The level ends as soon as every goal is met. Leftover moves become striped candies that all go off (Sugar Rush, +150 points each), which only affects stars.
- Stars: 1 for winning, 2 and 3 at the level's score thresholds.

## Keys, chests and the rainbow meter

- Clearing a key candy adds a key to the chest. The first chest needs 3 keys and each later one needs one more (up to 6).
- An opened chest turns one random plain candy into a random special (rainbow, unicorn, wrapped or striped) and gives 1–3 gold. One chest in four (`TUNE.econ.chestBoosterChance`) also gives a booster. (`TUNE.chestRewards = 'rainbow+2'` restores the original rainbow plus two specials.)
- Every 150 candies cleared (`TUNE.meterMax`, before the level is won) fills the rainbow meter, which drops a free rainbow on a random candy.
- Chests open and meter rainbows drop at the end of a turn, only while the level is still being played.

## Boosters

| Booster | Effect | Costs a move? |
| --- | --- | --- |
| Hammer | Clears one candy (a special goes off) | No |
| Free Swap | Swaps any two neighbours, even without a match | No |
| Rainbow Drop | Turns one candy into a rainbow | No |
| Unicorn Stampede | Launches 6 unicorns (`TUNE.stampede`) | No |
| +5 Moves | Adds 5 moves | — |
| Sugar Party | Turns 6 random candies into specials and fires them (`TUNE.party = 'specials'`; `'board'` hits every candy once instead) | No |

Booster strength, prices, rewards and revive costs are all in `TUNE` in `src/rules.js`.

## Gold, prices and revives

Gold bars are earned in the game only; there are no real-money purchases.

| | Value |
| --- | --- |
| New player | 30 gold and one each of Hammer, Free Swap, Rainbow Drop, Unicorn Stampede and +5 Moves |
| Winning a level | 1 + 1 per star, +2 the first time it is cleared (2–6 gold) |
| Chest | 1–3 gold, and a booster one time in four |
| Shop | Hammer 35, Free Swap 35, Rainbow Drop 50, +5 Moves 45, Unicorn Stampede 60, Sugar Party 140 |
| Revive (+5 moves) | 30 gold, then 60, then 90 within one attempt |

`sim/economy.js` models 20-minute sessions under these values and `sim/boosters.js` measures how much each booster helps.
