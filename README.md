# Knowledge Kingdom — website

The website for *Knowledge Kingdom: An Illustrated Guide to Understanding the World*, built from the manuscript in Google Docs. English and Bulgarian.

## How the manuscript is organised

The book is far too big for one Google Doc (which stops at about 1 million characters), so `manuscript/` holds several `.docx` files that the importer reads together as one book:

- `Knowledge_Kingdom_Master_Manuscript_22.docx`: the title page, the note to the reader, chapters 1–22, their answer key and flashcards, and the roadmap ("Where the book stands").
- One file per chapter from chapter 23 on, each with the chapter, its own answer key and its own flashcard table.

File names don't matter: the file with the title page is read first, then the rest in chapter order. If the same chapter is in two files, **the most recently saved file wins**, so to revise a chapter just add the new file (the report notes which copy was used). Delete old copies you no longer need so it stays clear.

**`content-meta/book-settings.json`** holds what chapter files don't say themselves:
- `edition`: the edition number shown on the site. Raise it by one each time you publish new or changed chapters, so "Recently updated" knows what's new.
- `parts`: which chapters belong to which Part. When chapter 42 starts Part IV, add `{ "number": 4, "title": "…", "chapters": [42, 52] }`.

## Updating the site after you add or change chapters

1. Save the new chapter as `.docx` (from ChatGPT, Word or Google Docs: **File → Download → Microsoft Word (.docx)**). Check the figures are visible in it.
2. Put it in `manuscript/`, and raise `edition` in `content-meta/book-settings.json`.
3. Run:

   ```
   npm run update
   ```

   This runs the three steps below one after the other:
   - `npm run import`: reads every `.docx` in `manuscript/` and regenerates the English pages. Read **`IMPORT_REPORT.md`** afterwards; it lists the files it read, counts, new or changed sections, and anything that needs a look. If the figure count drops or there are "Figure Caption without an image" warnings, the file lost its pictures: don't publish it.
   - `npm run translate`: translates new or changed text into Bulgarian on your computer (free, offline, no account). Only changed sentences are translated, so it takes seconds after the first run. See `content-meta/translations/REPORT.md`.
   - `npm run og`: redraws the link-preview images (`public/og/`) for chapters whose title changed. It needs Chrome or Edge installed, and skips itself if neither is found.
4. Run `npm run dev` and check the site at http://localhost:4321. Search only works on a built site, so to try it run `npm run build` then `npm run preview`.
5. Commit and push (for example in VS Code's Source Control panel, or `git add -A`, `git commit -m "Edition 26"`, `git push`). GitHub builds and publishes the site in about two minutes. You can watch it under the repository's **Actions** tab.

The live site is **https://knowledgekingdom.github.io/**. The `.docx` files are never published: `manuscript/` is excluded from the website repository because the manuscript still contains editorial notes. Instead, `manuscript/` is backed up to its own **private** repository, https://github.com/knowledgekingdom/manuscript, which only you can see. `npm run update` uploads new or changed files there at the end (or run `npm run backup` on its own). Every earlier version stays in that repository's history, so if a broken file ever replaces a good one, the good one can be recovered.

## Visitor statistics

The site counts visits with [GoatCounter](https://www.goatcounter.com): free, no cookies, no personal data, so no cookie banner is needed. See your numbers at **https://semirk24.goatcounter.com**. Bulgarian pages show up with paths starting `/bg/`. Visits from your own computer while testing (localhost) are not counted. To turn it off, set `goatcounter: ''` in `src/site.config.ts`.

**Reading the dashboard:** the main graph is page views per day; below it, **Pages** lists the most-read pages, and the **Sizes** box shows phones vs tablets vs computers (by screen width). Feature use appears in **Pages** as *events* (marked with an "event" label), named after what happened: `flashcards-start/002` (someone started chapter 002's flashcards), `progress-export`, `progress-import`, and later `review-start`, `game-play/…`, `map-open`, `listen-start`. Each is counted at most once per page view. Event counting can be switched off with `analyticsEvents: false` in `src/config/features.ts`.

## The knowledge files (dates, places, key terms)

Newer features (timeline, games, maps, term previews) need facts the book states but doesn't list in a
structured way. They live in **`content-meta/knowledge/`**, as plain text files you can read and edit:

- `events.yaml`: dated events (`date: "c. 3100 BCE"`, how precise it is, region, place)
- `places.yaml`: real places with coordinates (from Wikidata, which is public domain)
- `routes.yaml`: trade and travel routes as a list of places
- `concepts.yaml`: key terms with a short definition and the section that defines them

Every entry names the section(s) where the book says it, and has English and Bulgarian text. Claude
proposes entries from the book; **only entries you approve appear on the live site** (`npm run dev`
also shows proposed ones, so you can see them in place).

To review: open **`docs/knowledge-review.md`** (one list per chapter, with links). Fix or delete
anything wrong in the YAML files (or tell Claude), then approve a whole chapter:

```
npm run knowledge approve 009 010 011
npm run knowledge review        (refreshes docs/knowledge-review.md)
```

The build stops with a clear message if an entry points to a section that no longer exists, has a date
the script can't read, or uses an id twice. After each import, `npm run import` lists entries whose
sections were revised in the new edition, so they can be re-checked. If a section was renamed,
`npm run knowledge fix` updates the entries that cite it.

## The game content (Fallacy Detective)

`content-meta/games/fallacies.yaml` lists the fallacies (with Chapter 002's own explanation and the section that teaches each) and the game's rounds. Rounds marked `source: "book: …"` are the book's own examples; `drafted` ones were written for the game and are fictional. As with the knowledge files, only **approved** rounds are played on the live site:

```
npm run games review          (writes docs/games-review.md)
npm run games approve all     (or: npm run games approve rude-economist five-trades …)
```

Chapter regions for the "Around the world" seal are in `content-meta/book-settings.json` under `regions`.

## Renaming a page without breaking links

If a section's title changes, its address changes too, and old links would hit the "page isn't here" page. To forward the old address, add it to `redirects` in **`content-meta/slug-overrides.json`** (`IMPORT_REPORT.md` lists removed and new addresses after each import):

```json
"redirects": [{ "from": "/001-old-section-address/", "to": "/001-new-section-address/" }]
```

The Bulgarian page is forwarded too. Alternatively, keep the old address by pinning the section's slug under `sections` in the same file.

When the importer itself changes an address (it did once, in November 2026, for 21 addresses that ended mid-phrase, like `…-claim-and-a/`), it records the move under `moved` in `content-meta/slugs.json` and the old address forwards automatically. Readers' "read" ticks follow the move.

## What readers get (and where it comes from)

- **Reading progress.** A section counts as read when the reader reaches its end (after at least 10 seconds on the page) or presses **Mark as read**. Ticks show in the sidebar and chapter contents, chapter cards get a progress bar, and the homepage offers **Continue reading**. It's stored in the reader's own browser only: nothing is sent anywhere, and English and Bulgarian share it. Everything the site remembers (progress, flashcard piles, theme, palette) goes through one module, `src/lib/reader-state.ts`; the homepage's **Your progress** box saves it all to a file and loads it on another device.
- **Updates page and RSS feed** (`/updates/`, `/rss.xml`, and the Bulgarian `/bg/…` versions): what each edition added or revised, built automatically from the import history in `content-meta/manifest.json`. Raising `edition` in `content-meta/book-settings.json` starts a new entry.
- **Related sections** at the end of each section, found by comparing the text of every section on your computer during `npm run import` (`importer/related.py`, free and offline). They update by themselves as chapters are added.
- **The Kingdom Map** (homepage): the book as an illustrated kingdom. Each Part is its own land (with capes, bays and islets, and open sea between neighbouring Parts, which the road crosses by a sea lane), each chapter a town with its own emblem, and each section a building that lights up when it's read. Roads join the towns in reading order, and dashed "bridges" join the chapters the related-sections data links most. Fog covers what the reader hasn't reached and clears as they read. A finished chapter raises a banner over its town, and a finished Part wins its crest. Chapters still being written are fogged towns, and later roadmap groups are islands marked "coming soon": the next one sits where its land will rise, at the end of an uncharted lane, and the rest lie in a ring round the known world. Seen from far away, each land carries its name across it in large letters. Readers drag, pinch, use Ctrl + scroll or the +/− and arrow keys, use **Fly to** (which flies in close enough to see a town's buildings), and on desktop a mini-map. Tapping a town opens a panel (a bottom sheet on phones) with its standfirst, progress and links. It loads after the page has appeared; the chapter list below it stays as the version without the map. It is generated from the book by `scripts/map-layout.mjs` (runs before every build), so new chapters appear by themselves. `content-meta/map-layout.json` keeps what must not change on its own (its `version` says which world layout it belongs to; a layout from an older version is re-placed once): where each town and land sits, each chapter's emblem (ids from `src/map/emblems.ts`) and its short map name in English and Bulgarian. A new chapter gets a place automatically and a plain banner emblem until you choose one there.
- **Living emblems, flights and celebrations** (Motion & Story, M2). Every chapter's emblem has its own motion (`EMBLEM_MOTION` in `src/map/emblems.ts`, keyframes in `src/styles/emblems.css`): the scales tip, the dice tumble, the hourglass turns over, ships rock, flames flicker. They come alive when you hover a town on the Kingdom Map, and in each chapter's header, where the emblem draws itself in. Following a town from the map dives into it: the map zooms in towards the town while its emblem flies into the chapter header; coming back, the map starts over that town and pulls back. Sections turn like pages. Finishing a chapter stamps a wax seal with its emblem (with the next chapter one tap away); finishing a Part plays a short film (its region traced in gold, a banner over every town, the crest forged). Each celebration happens once (remembered in the reader's progress) and is calm under "reduce motion". Switch off with `celebrations` in `src/config/features.ts`.
- **A living Kingdom Map** (Motion & Story, M3). The map keeps the reader's own hour: dawn, day, dusk and night from the local clock, with the sun or moon crossing the sky, lanterns lit in the towns the reader has reached, mist over Part I, warm haze over Part II, smoke from the chimneys, glints on the water, flocks of birds and gulls over the coast (`src/map/atmosphere.ts`, loaded only on the homepage after the map). A chip in the corner names the hour; tapping it previews the others. On the first visit the Kingdom awakens: the map unrolls, the compass spins in, the crests stamp down and the camera settles on the reader's Part (any key, click or scroll skips it; it plays once). The layer thins itself out on slow devices, rests when the map is off screen, and under "reduce motion" keeps only the still light of the hour.
- **Chapter trailers** ("Watch the trailer" on every chapter page): a short film of the chapter, generated from the book's own data. The chapter's emblem draws itself and its title is set letter by letter; the timeline zooms in to the chapter's time; the camera flies over the Atlas's world to its places; routes draw themselves with ships sailing them, empires bloom, and each event pulses with a caption while a date counter runs (without places, the story runs along the timeline instead); key terms float in; the sections roll past like credits; then "Start reading". Pause, scrub, Space, arrow keys and Home; the **Storyboard** button shows the same story as text, and "reduce motion" opens the storyboard first. Data per chapter at `/trailers/en/027.json` (built from the knowledge files, approved entries only on the live site), so new chapters get trailers by themselves; the player (`src/trailer/player.ts`) downloads only when the button is pressed. A narrator (the UK English Male voice) reads a short script over the film, written per chapter in `content-meta/trailer-scripts.json` as [scene, text] lines; each scene lasts as long as its line needs and the picture waits for the voice, so they stay in step. A **Narration** button turns it off (remembered), and the storyboard shows the script as text. Chapters without a script play silently. Switch off with `trailers` in `src/config/features.ts`.
- **Atlas** (`/atlas/`): a world map with a time slider. The book's places, routes and empires (from `content-meta/knowledge/places.yaml` and `routes.yaml`, approved ones only) fade in and out as the year changes; press **Play** to watch the centuries go by. A place with dates in the book uses them; otherwise it shows while the chapters that discuss it are in view. Empires are never drawn as borders: each is a soft, labelled-approximate area around the key cities the book names (`type: empire`, `extent: [cities]`; a city can join at a year the book gives, e.g. `cairo@1517`). Tapping a place lists every section that mentions it and the events the book places there; it links to the timeline, and timeline events with a place link back (`/atlas/?place=melaka&year=1511`). Below the map, every place is listed by region with a search box, which also works without JavaScript. The base map is Natural Earth (public domain), simplified once into `public/atlas/geo.json` by `scripts/atlas-geo.mjs` (see the comment at its top to rebuild it); coordinates come from Wikidata (public domain).
- **Timeline** (`/timeline/`): the *Living Timeline*. Every approved event from `content-meta/knowledge/events.yaml` on one zoomable line, with a lane per region (Africa, West Asia, Mediterranean & Europe, …), the book's chapters as coloured bands on top, soft edges for dates the book gives only roughly, a **Meanwhile…** view (tap any moment to see every region at that time), a **Highlight what I have read** overlay, and shareable views (`/timeline/?from=-600&to=200&lanes=africa,west-asia`). Drag, pinch, scroll or use the arrow and +/− keys. Below it, the same events as a filterable list, which also works without JavaScript. Chapter pages link to their slice (`/timeline/#ch-012`). To add moments, add or approve events in the knowledge files; the region of each history chapter (for the lanes and the "Around the world" seal) is in `content-meta/book-settings.json`. `/timeline/?stress=3000` is a speed self-test with 3,000 synthetic moments.
- **Key-term previews:** the first mention of up to five key terms in a section (from `content-meta/knowledge/concepts.yaml`, approved ones only) gets a dotted underline; tapping or hovering shows the book's short definition and a link to where it's explained. Everyday words such as "flow" or "system" are marked `link: chapter` there, so they're only linked inside their own chapter.
- **Link previews:** hovering (or pressing and holding on a phone) a citation, a "Down the rabbit hole" card, previous/next, the chapter contents or a timeline link shows the page's title and first ~40 words, or the cited source. The data is small per-chapter files (`/previews/en/001.json`), fetched only when needed.
- **Down the rabbit hole:** three related sections at the end of each section, preferring other chapters and sections that share key terms.
- **Listen:** the "Listen" button reads a section aloud with the browser's own voices (free; hidden if the browser has no voice for the language), highlights the sentence being read, and can carry on with the next section. English is read by two British voices only, **UK English Male** and **UK English Female** (Google's in Chrome; the nearest British pair elsewhere, such as Ryan and Sonia in Edge); Bulgarian pages use the browser's Bulgarian voices. Speed and voice are remembered. The voice sits behind one small interface (`src/scripts/listen-engine.ts`), so recorded audio could replace it later.
- **Offline and installable:** the site can be installed as an app (phones: "Add to Home screen"). Pages you read are kept for offline use (the latest 150), and each chapter page has **Save chapter for offline**. After a new edition is published, saved chapters update themselves the next time you're online.
- **Bookmarks** (`/bookmarks/`), **progress rings** on chapter cards, a progress bar per Part, and **Continue reading** returns to the exact place on the page.
- **Share cards:** every section has its own link-preview image (`public/og/s/`, drawn by the GitHub build with `npm run og:sections` and cached there, not stored in git). Each paragraph and heading has a link button that copies a link straight to it.
- **Page transitions** follow the book: next section slides in from the right, previous from the left; chapter cards grow into the chapter page and figures into the full-size view. With "reduce motion" turned on in the device settings, everything simply fades.
- **Support link:** set `supportUrl` in `src/site.config.ts` (for example a "Buy me a coffee" page) and a quiet link appears in the footer and on the About page. Empty = hidden.
- **Practice & play** (`/play/`):
  - **Daily review** (`/review/`): one flashcard review across every chapter the reader has started (or the chapters they pick), scheduled with FSRS (`ts-fsrs`, free and offline): each card comes back just before it would be forgotten. Again / Hard / Good / Easy by button, keys 1–4 or swipes; 20 new cards a day by default. The chapter flashcard pages feed the same schedule.
  - **Which came first?** (`/play/which-came-first/`): two events from the book's timeline, tap the earlier. Only *approved* events from `content-meta/knowledge/events.yaml` are used, and events whose dates could overlap (including "c." dates) are never paired. A second mode asks for five events in order.
  - **Fallacy Detective** (`/play/fallacy-detective/`): ten short arguments, name the fallacy; feedback quotes Chapter 002 and links to it; the result can be shared as an image. Content lives in **`content-meta/games/fallacies.yaml`** (see below).
  - **Your journey** (`/journey/`): the reader's own stats and **seals** (badges) for milestones such as finishing a Part, a seven-day streak or 100 reviewed cards. No points, no leaderboards, all kept in the reader's browser.
- **Explorable diagrams:** 13 interactive versions of figures (fraud alarm and base rates, compounding, expected value, streaks, a cropped axis, a hidden third variable, feedback loops, the delayed-delivery shop, Mercator, the Persian relay, trade risk, Mongol forage, three million years in a month). Each sits right after its static figure (which stays, for print and without JavaScript), starts from the book's own numbers, and loads only when it scrolls into view. Which figure gets which diagram is set in **`content-meta/explorables.yaml`** (with the English and Bulgarian title, instruction and "What to notice" text); the code is in `src/explorables/`. To switch them all off: `explorables: false` in `src/config/features.ts`.
- **Print / Save as PDF** on every section: the printout drops the navigation, uses black on white even in dark mode, opens all model answers, and prints flashcards as a list.

## Security

See [SECURITY.md](SECURITY.md): how to report a problem privately, and what protects the site (a Content Security Policy on every page, no scripts from other sites, pinned build tools, a protected `main` branch, secret scanning).

## Improving the Bulgarian translation

The book text is machine-translated, and those pages show a small notice saying so. Titles and the interface were translated by hand. To correct any sentence or title, add it to **`content-meta/translations/bg-overrides.json`**:

```json
{
  "Exact English sentence or title.": "Вашият по-добър превод."
}
```

Then run `npm run translate`. Your version always wins and survives future editions. The interface text (buttons and menus) is in `src/i18n/ui.ts`.

## What not to edit by hand

These folders are regenerated on every run, so any change you make there is overwritten:

- `src/content/`, `src/data/`, `src/assets/figures/` (from the importer)
- `src/content/bg/`, `src/data/bg/` (from the translator)

These are kept and safe to edit:

- `content-meta/book-settings.json`: edition number and which chapters belong to which Part
- `content-meta/timeline.json`: corrections for the timeline
- `content-meta/map-layout.json`: the Kingdom Map's town positions, emblems and short town names
- `content-meta/knowledge/*.yaml`: dates, places, routes and key terms (see above)
- `src/config/features.ts`: switch any feature off with one word (`false`) if it ever misbehaves
- `content-meta/slug-overrides.json`: change a page's URL, or add a redirect after renaming a section
- `content-meta/translations/bg-overrides.json`: your Bulgarian corrections
- `src/site.config.ts`: site URL, footer line, analytics, the default colour palette, and whether readers can pick another

## First-time setup on a new computer

You need [Node.js](https://nodejs.org) 22.23 or later, [Python](https://www.python.org) 3.10 or later, [Git](https://git-scm.com) and the [GitHub CLI](https://cli.github.com). Sign in with `gh auth login`, then:

```
git config --global core.longpaths true
git clone https://github.com/knowledgekingdom/knowledgekingdom.github.io.git knowledge-kingdom
cd knowledge-kingdom
npm install
git clone https://github.com/knowledgekingdom/manuscript.git manuscript
```

The first line lets Windows handle the long file names of some section pages. The last line brings back the manuscript files from the private backup.

**Windows note:** if Windows' Smart App Control is on, it blocks three of the website's helper programs. `npm run dev`, `build` and `check` detect this and quietly install free WebAssembly versions of them (only on that computer; `package.json` is not changed), so nothing needs switching off.

The first `npm run translate` creates a small Python environment (`.venv-translate`) and downloads the 70 MB translation model. Neither is committed to git.

## Commands

| Command | What it does |
|---|---|
| `npm run update` | import, translate, redraw link-preview images, then back up the manuscript |
| `npm run backup` | upload new or changed manuscript files to the private backup |
| `npm run import` | all `.docx` in `manuscript/` → English content + `IMPORT_REPORT.md` |
| `npm run translate` | English → Bulgarian (offline) |
| `npm run og` | redraw link-preview images for changed chapters |
| `npm run og:sections` | draw every section's link-preview image (the GitHub build does this; optional locally) |
| `npm run dev` | local preview with live reload (no search) |
| `npm run build` | build the static site into `dist/` and its search index |
| `npm run preview` | serve the built site locally (search works here) |
| `npm run audit` | Lighthouse scores for key pages (run while `preview` is running) |
| `npm run games` | game content: `check`, `review`, `approve all` |
| `npm run knowledge` | knowledge files: `check`, `review`, `approve 009`, `changed`, `fix` |
| `npm test` | all tests (reader state, knowledge files, importer, translator) |
| `npm run test:importer` | importer and translator tests only |
| `npm run check` | type-check the site |

## How it fits together

- `importer/`: Python, standard library only. `import_manuscript.py` walks the `.docx` by paragraph style (Title, Heading 1–3, Normal, tables), and `patterns.py` holds the detection and slug rules. `translate.py` holds the Bulgarian pipeline.
- `.github/workflows/deploy.yml`: builds and publishes to GitHub Pages on every push to `main`.
- `src/`: an [Astro](https://astro.build) static site. `views/` holds page templates shared by `/…` and `/bg/…`, `components/` the flashcards, practice lab, sources and so on, and `styles/` the design system and palettes.
- **Licences:** fonts are Source Serif 4 and Inter (SIL Open Font License, self-hosted). The translation model is OPUS-MT en→bg (CC-BY 4.0), by Tiedemann and Thottingal, packaged by Argos Translate.
