# Plate Tracker

A phone-first calorie and training tracker made for dining halls. You log food in portions like
“half a plate of rice”, “a palm of chicken”, or “a scoop of mac and cheese”. You don’t need a scale.

- **No account and no server.** Everything is stored on your phone (IndexedDB), and the app works offline.
- **Fast logging:** type `half plate fried rice, palm of orange chicken, fist broccoli, 2 cookies`, check the preview, and tap Log.
- **Honest numbers:** totals show a ± range, like “≈ 2,300 kcal (±200)”, as a reminder that they’re estimates.
- **Ask Claude bridge:** Claude can estimate a nutrition label, a photo of your plate, or a description. You paste its reply back into the app.

---

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173 (also printed with your LAN address)
npm test           # unit tests (parser, portions, formulas, adaptive maintenance, Claude import, backup)
npm run build      # production build in dist/
npm run preview    # serve the production build (service worker included)
```

**Quick try on your phone over Wi-Fi:** `npm run dev` prints a `Network:` URL like `http://192.168.1.23:5173`.
Open it on your phone while it’s on the same Wi-Fi. Offline mode and the service worker only work on
the deployed HTTPS site, so use the deploy below for real daily use.

## Deploy free to GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests, builds, and publishes the app on every push to `main`,
and also on pushes to this project’s working branch.

1. On GitHub, open your repo, then go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to the **Actions** tab, open **Deploy to GitHub Pages**, and click **Run workflow**. Pushing a commit also works.
   If a run failed before you enabled Pages, just re-run it.
4. When the run turns green, the app is live at **`https://<your-username>.github.io/<repo-name>/`**
   (for this repo: `https://daijoubu8809.github.io/tracker/`).

If a deploy is rejected with “Branch … is not allowed to deploy to github-pages”, go to
**Settings → Environments → github-pages → Deployment branches** and add the branch, or merge into `main`.

**Vercel instead:** import the repo at vercel.com. The framework is **Vite**, the build command is `npm run build`,
and the output directory is `dist`. No base path is needed, because the app is served at the domain root.

## Add it to your home screen

**iPhone (Safari):** open the site, tap the **Share** button (square with an arrow), then tap **Add to Home Screen**, then **Add**.
It opens full screen like an app. Open it once while online, and after that it works offline.

**Android (Chrome):** open the site, tap the **⋮** menu, then **Add to Home screen** (or **Install app**), then **Install**.

Updates install themselves: after a new deploy, the next time you open the app (online) it picks up the new version.

## Back up your data

Your log lives only in this browser on this phone. If you delete the home-screen app, clear Safari website data,
or lose the phone, the log is gone unless you have a backup.

- **Settings → Backup → Export backup** creates `plate-tracker-backup-YYYY-MM-DD.json`. On a phone this opens the
  share sheet. Choose **Save to Files** (iCloud Drive) or Google Drive.
- **Import backup** merges a backup into what’s already on the phone. Rows are matched by ID: new ones are added,
  and when both sides have the same item, the newer edit wins. Importing the same file twice never creates duplicates,
  and anything you deleted stays deleted.
- If you haven’t backed up in 7 days, Today shows a gentle reminder. **Later** snoozes it for 3 days.

## Logging food

| Method | When to use it |
|---|---|
| **Quick text** (default) | Most meals. Type items separated by commas, check the preview, then tap Log. Tap any item to change the food or portion. |
| **Search** | Browse or search, pick a portion button (¼ ⅓ ½ full plate, palm, fist, scoop…), pick a size, then Add. Favorites (☆) and recent foods show first. |
| **Saved meals** | One tap for “My usual breakfast”. Create one from Today: **⋯** next to a meal, then **Save as meal…**. |
| **Label** | Type the numbers from a nutrition label. Servings can be fractions (½, 1 1/2). Saves as a custom food. |
| **Ask Claude / Paste** | Photos of labels or plates, or anything the local database doesn’t know. |

Quick-text words it understands:

- **Amounts:** `half`, `½`, `1/2`, `1.5`, `1 1/2`, `a couple`, `a few`, `two`, `x2`
- **Portions:** `plate`, `palm`, `fist`, `handful`/`cupped hand`, `thumb`, `scoop`, `ladle`, `bowl`, `clamshell`/`to-go box`, `slice`, `piece`, `can`, `cup`, `tbsp`, `oz`, `g`, `lb`
- **Sizes:** `small` ×0.75, `big`/`large` ×1.25, `heaping`/`huge` ×1.5
- **Typos and plurals** are fine (`brocoli`, `chiken nugets`). Anything the parser can’t match gets flagged, and you can pick a suggestion,
  make a custom food, or send it to Claude.

Every item can be edited, moved to a different meal or date, or deleted (with Undo). Use the date switcher (‹ Today ›)
to log a day you forgot. On Today, an empty meal has **Copy yesterday’s**.

### Portion guide

The **Foods → Portion guide** tab lists the references (½ plate of starch ≈ 1.5 cups, palm ≈ 4 oz, fist ≈ 1 cup,
scoop ≈ ½ cup, ladle ≈ ¾ cup, clamshell ≈ 3.5 cups…). If your plates or hands are different, change them under
**Settings → Portion sizes**.

## The Ask Claude flow

The app has no built-in AI. The Claude app acts as its scanner:

1. **Log → Ask Claude.** You can type a description (“a big apple and about a cup of trail mix”), then tap **Copy prompt for Claude**.
2. Open the **Claude app**, paste the prompt, and attach a **photo of the nutrition label or your plate** if you have one.
3. Claude explains its assumptions and replies with one ```` ```json ```` block in the `foodlog.v1` format.
4. Long-press Claude’s reply, copy the **whole message**, then go to **Log → Paste** and paste it in. Text around the JSON is fine.
5. Check the preview. You can scale an item (½×, 2×), edit the numbers, and tick **Save to my foods** so it shows up in local
   search next time. Then tap **Log**.

If the JSON is broken, the app tells you what’s wrong, for example “calories is missing” or “broken near line 3”.
It never crashes, and it never quietly skips an item.

**Barcode scanning:** Log → Label → **Scan barcode** uses your camera and the free Open Food Facts database to fill in the
label form. If the camera isn’t available, type the barcode number instead.

## How the numbers work

- **BMR:** Mifflin-St Jeor by default. Harris-Benedict (revised) and Katch-McArdle (needs body fat %) are also available.
  The optional East Asian adjustment is −5% (Mifflin/Harris only). **Settings → Show the math** shows every step.
- **Maintenance** = BMR × activity (1.2 / 1.375 / 1.55 / 1.725 / 1.9). The default is Very active.
- **Adaptive maintenance:** after ≥14 days of food logs and ≥7 weigh-ins spread over 14 days, the app works out your real
  maintenance from the last 28 days: average intake − (trend weight change per day × 3,500 kcal/lb). It appears next to the
  formula number (Progress or Settings), and you can switch to it with one tap.
- **Goals:** Cut (−400 by default), Maintain (with an optional offset), Lean bulk (+300), or a Custom number. **Phases**
  (Settings → Goal) switch the target automatically on their dates. Give a phase a goal weight to see “3.4 lb to go, on pace for …”.
- **Protein:** 0.8 g per lb of trend weight (editable), a single target.
- **Carbs & fat:** ranges (min–max), set as % of calories or grams in Settings → Goals. Defaults: fat 20–30% of calories;
  carbs = the calories left after protein and the middle of the fat range, ±15%. %-based ranges follow the calorie target
  (e.g. a phase change). Today shows “eaten / target” bars: neutral below the range, accent inside it, amber past the max
  with a small “+12 g over”. The calorie target is the day’s max (“1,353 / 2,652”). Progress charts the 7-day average of
  each macro against its target.
- **Safety:** a target below your BMR shows a warning. If your logged intake is under BMR for 3+ days in a row, Today shows
  a calm note. The app never praises eating less.
- **Exercise:** your activity multiplier already covers training, so workouts don’t add to your budget by default and their
  burn is shown for reference only. **Settings → Exercise calories → Sedentary + add exercise** switches to a 1.2 base plus
  your logged steps (above 4,000), runs, and lifts.
- **Uncertainty:** each food has a typical error (±15% for plain rice up to ±35–40% for fried, sauced, or mixed dishes). Day totals
  combine them as independent errors (root-sum-square).

## Training

- **Workout types and rotation:** Settings → Training lists your workouts (default: Triceps & Biceps → Chest & Shoulders →
  Abs & Back). Rename, add, delete or reorder them; the order is the rotation. **Log a lift** preselects the next one after
  your most recent lift (by workout date), plus the duration you used last time for that workout — tap another to override.
  “Next up” shows on Training and on Today’s Exercise tile.
- Deleting or renaming a type never touches past logs: old entries keep their original label (including v1 types like “Upper”).
- **Weekly summary:** runs (count, distance, average pace), each lift type’s count this week, and which types haven’t been
  done in 7+ days.

## Adding or fixing foods

- **In the app:** Foods → **+ Custom food**, or open any food and tap **Edit**. Built-in foods can be edited, hidden, or reset.
- **In the seed file:** `src/data/seedFoods.ts` holds the built-in database (about 250 foods, mostly US dining-hall items).
  Each line has nutrition per 100 g as eaten, plus the grams in one cup, piece, slice, or serving. Values come from USDA FoodData
  Central (SR Legacy / FNDDS) or typical brand labels, rounded, and each food’s `source` says which. A unit test checks that every food’s
  macros add up to its calories and that its default portion works.

## Project layout

```
src/
  data/seedFoods.ts      built-in food database (edit me)
  lib/                   pure logic, all unit-tested
    parser.ts            quick-text parser
    portions.ts          portion → grams → calories, ± totals
    energy.ts            BMR / TDEE / targets / exercise estimates
    trend.ts             weight trend, weekly rate, adaptive maintenance, phase pace
    claudeImport.ts      Ask-Claude prompt + reply importer (Zod)
    backup.ts            export / merge-import
    db.ts, types.ts      Dexie (IndexedDB) schema and data model
  screens/               Today, Log (+ tabs), Progress, Training, Foods, Settings
  components/            UI pieces, SVG charts
```

**Stack:** Vite, React, and TypeScript (strict), with Dexie for IndexedDB, Zod for validation, `vite-plugin-pwa` (Workbox) for offline support,
and Vitest for tests. The charts are small hand-written SVG instead of Recharts. They only need dots, lines, and bars, and skipping Recharts
keeps the app about 100 KB lighter, so it loads fast on dining-hall Wi-Fi.
