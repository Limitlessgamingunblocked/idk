# Sugar Shapes

A match-3 candy game where every candy is the logo. Swap neighbouring candies to line up three or more. 30 candy levels, plus 30 Furniture Mode levels.

| Match | Makes |
| --- | --- |
| 4 in a row | Striped candy: clears its row or column |
| 2×2 box | Unicorn candy: releases 3 flying unicorns that loop around the screen, then dive onto jelly, keys and goal candies |
| L or T | Wrapped candy: explodes around itself |
| 5 in a row, or any match of 6+ | Rainbow: clears every candy of one colour |

Swap two specials together for combos (for example unicorn + striped fires lasers wherever the unicorns land, rainbow + unicorn turns a whole colour into unicorns). The **rainbow meter** fills as you clear candies and drops a free rainbow when full. Candies with **gold keys** fill the **sugar chest**, which turns a candy into a special and pays out gold, sometimes with a booster too.

**Boosters** (bottom bar, saved between levels): Hammer, Free Swap, Rainbow Drop, Unicorn Stampede, +5 Moves and Sugar Party, which turns six candies into specials and sets them all off. You earn more from chests or buy them with gold.

**Gold bars** are the in-game currency (there are no real-money purchases). Win levels (more stars, more gold) and open chests to earn them. Spend them in the **Shop** on boosters, or to **revive** with +5 moves when you run out (30, then 60, then 90 gold within one attempt). The full rules and numbers are in [RULES.md](RULES.md).

**Furniture Mode** (levels 101–130, from the title screen or the Furniture tab on the level map) swaps the candies for sofas, armchairs, lamps, plants, beds and wardrobes, set in a cosy room on a parquet floor. Jelly becomes dust to clean, the rainbow becomes a disco ball, and specials become striped, gift-wrapped and unicorn-horned furniture.

The whole game is `index.html`, with its fonts in `fonts/`. The same file runs in a browser, as a home-screen app, and inside the native iPhone app in `ios/`.

## Put it on an iPhone

There are three ways, from easiest to most official.

### 1. Home-screen app (free, no Apple account)

1. One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then re-run the **Web app (GitHub Pages)** workflow, or push any commit.
2. On the iPhone, open **https://limitlessgamingunblocked.github.io/idk/** in Safari.
3. Tap **Share → Add to Home Screen**.

It gets its own icon, opens full screen without Safari's bars, and plays offline after the first visit.

### 2. Native app, sideloaded (free Apple ID, needs a computer)

Every push builds a real iPhone app (`SugarShapes.ipa`) with GitHub Actions. You can download it from the **Releases** page (the `latest` release) or from the run's artifacts under the **Actions** tab.

The build is unsigned, because Apple only lets an app install once someone's Apple ID signs it. [AltStore](https://altstore.io) or [Sideloadly](https://sideloadly.io) do that signing for you with your own Apple ID:

1. Install AltStore or Sideloadly on a Mac or Windows PC and connect the iPhone.
2. Open `SugarShapes.ipa` with it and sign in with your Apple ID.
3. On the iPhone: **Settings → General → VPN & Device Management**, then trust your Apple ID. On iOS 16 or later, also turn on **Settings → Privacy & Security → Developer Mode**.

With a free Apple ID the app stops opening after 7 days until you refresh it in AltStore or Sideloadly. A paid developer account extends that to a year.

The native app adds Taptic Engine haptics on matches and explosions, and hides the status bar.

### 3. App Store or TestFlight (paid Apple Developer account)

This needs the $99/year [Apple Developer Program](https://developer.apple.com/programs/) and a Mac with Xcode:

```sh
brew install xcodegen
cd ios && xcodegen generate
open SugarShapes.xcodeproj
```

In Xcode, select the **SugarShapes** target. Under **Signing & Capabilities**, pick your team and change the bundle identifier (`io.github.limitlessgamingunblocked.sugarshapes`) to one you own. Then use **Product → Archive** and **Distribute App** to upload to TestFlight or App Store Connect.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html` | The game: canvas rendering, turn flow, tutorials, synthesised audio. Built from itself plus `src/` by `tools/build.js` |
| `src/rules.js` | The rules engine, shared by the game and the simulator. `RULES.md` describes it |
| `src/levels.json` | The 60 levels (tuned). `src/levels-original.json` is the set before tuning |
| `test/` | One automated test per rule (`npm test`) |
| `sim/` | Bots, the level simulator, the tuner, and the economy and booster models. Results in `sim/results/` |
| `tools/` | `build.js`, `parity.js` (game vs simulator replay), `tutorials.js` (tutorial check), `timing.js` (timing harness), `cvd.js` (colour-blindness check) |
| `RULES.md`, `TIMING.md`, `TESTPLAN.md` | Rulebook, timing spec and measurements, and the device and playtest plan |
| `fonts/` | Lilita One and Nunito, SIL Open Font License |
| `icons/`, `manifest.webmanifest`, `sw.js` | Home-screen icon, app manifest and offline cache |
| `ios/` | Native SwiftUI wrapper (XcodeGen spec, a web view hosting `index.html`, native haptics) |
| `.github/workflows/ios.yml` | Builds `SugarShapes.ipa` on a macOS runner |
| `.github/workflows/pages.yml` | Publishes the web app to GitHub Pages |

Home-screen copies check for a newer version whenever they open with a connection, and fall back to the cached copy offline. If you add files the game needs offline, list them in `FILES` in `sw.js` and bump its `VERSION`.

## Balancing tools

Everything runs on Node 18+ and needs no install, except the browser tools, which use Playwright.

```sh
npm test                          # rebuild check + rule tests
node tools/build.js               # inline src/rules.js and src/levels.json into index.html (run after editing them)
node sim/run.js --games 1000      # bot win rates for all 60 levels (random, greedy, lookahead); --kit adds boosters
node sim/ablation.js              # how much each generous rule (meter, chests, boxes...) makes levels easier
node sim/tune.js && node sim/refine.js   # retune moves, goals and stars to the difficulty curve
node sim/boosters.js              # what each booster is worth on hard levels
node sim/economy.js current       # 20-minute session model of gold, boosters and revives
node tools/parity.js              # replays simulator games in the real game and compares every move
node tools/tutorials.js           # plays every first-time tutorial in the real game
node tools/timing.js              # measures the turn timing in a browser
node tools/cvd.js                 # colour-blindness check of the candy palette
```
