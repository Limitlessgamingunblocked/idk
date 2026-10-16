# Test plan: what has to be checked outside the simulator

The simulator shows the rules are consistent and the levels sit on the difficulty curve *for bots*. Three things need real hardware and real people: how the game feels on an iPhone, how humans compare to the bots, and the Candy Crush timing reference. Each section says what to do, what to record, and what counts as a pass.

## 1. Candy Crush timing reference (about 30 minutes)

Goal: replace the research-based targets in `TIMING.md` with measured ones.

1. On an iPhone, open **Settings → Camera → Record Slo-mo** and choose **1080p at 240 fps**.
2. Point a second phone (or a tripod-mounted one) at a phone playing Candy Crush Saga, and record 10 turns: 5 plain three-matches and 5 that cascade.
3. On a computer, step through the clip frame by frame (QuickTime: arrow keys). At 240 fps each frame is 4.17 ms.
4. For each turn, write down the frame numbers for: finger lift, candies start moving, swap finished, first candy starts to pop, each cascade step's first pop, board fully still.
5. Repeat for Sugar Shapes on the same phone.

Record per turn: swap duration, swap end to first pop, cascade step interval, total turn time. **Pass:** Sugar Shapes is within 20% of Candy Crush on each, or you've decided where you want it to differ. Put the numbers into the `TIMING` constants in `index.html` and the targets table in `TIMING.md`.

## 2. iPhone performance (about 20 minutes)

Use the oldest iPhone you can get, ideally an iPhone 11 or SE (2nd gen).

1. On the Mac: **Safari → Settings → Advanced → Show features for web developers**. On the iPhone: **Settings → Safari → Advanced → Web Inspector** on.
2. Open the game on the iPhone (the home-screen app or the GitHub Pages URL) and plug it into the Mac.
3. On the Mac: **Safari → Develop → [your iPhone] → Sugar Shapes**. Open the **Timelines** tab, enable **Rendering Frames** and **JavaScript & Events**, and press record.
4. Play level 12 and set off the biggest combo you can make: swap two rainbows together, or a rainbow with a unicorn. Then trigger Sugar Party.
5. Stop recording.

Record: the frame-time chart during the combo, the longest frame, and any frames over 33 ms. **Pass:** 99% of frames at or under 20 ms, nothing over 50 ms, and no stutter you can see.

Also check, by ear, that pops and explosions sound in time with what you see. If they lag, note the device and iOS version.

For the native app the steps are the same: in Xcode, run on the device and use **Debug → Attach to Process**, or Instruments → **Core Animation FPS**.

## 3. Five first-time players (about 15 minutes each)

Pick five people who haven't seen the game. Give them a phone with a fresh install (delete the app first, or use a private Safari tab) and say only: "Play this however you like; think out loud if you can." Don't help.

Record the screen and their voice (iPhone **Control Centre → Screen Recording**, long-press for **Microphone On**).

Watch for, and note the time of:

| What | Why it matters |
| --- | --- |
| Do they complete each tutorial step without help? | The tutorial is the only teaching |
| Do they understand what a striped, wrapped, unicorn and rainbow candy do after the tutorial? Ask after level 5. | Specials are the core of the game |
| Do they ever try a move the game rejects, and look confused? | Input clarity |
| Where do they first fail a level? Levels 10 and 15 are meant to be hard. | Compare with the bot curve |
| Do they notice keys and the chest? Do they understand the rainbow meter? | Secondary systems |
| Do they buy a revive? Do they say anything about gold? | Economy feel |
| In Furniture Mode: do they understand that dust spreads? | The mode's twist |
| At 15 minutes: "Would you keep playing?" Then let them choose. | The main signal |

**Pass:** at least 4 of 5 finish the tutorials unaided, and at least 3 of 5 choose to keep playing.

**Calibrating the bots:** write down each player's win or loss on levels 1–15. Compare their win rate per level with the greedy and lookahead bot columns in the report. If humans are consistently above the greedy bot, the curve is easier than intended for people; shift the targets in `sim/designs.js` and rerun `node sim/tune.js`.
