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

The site counts visits with [GoatCounter](https://www.goatcounter.com): free, no cookies, no personal data, so no cookie banner is needed. See your numbers at **https://knowledgekingdom.goatcounter.com**. Bulgarian pages show up with paths starting `/bg/`. Visits from your own computer while testing (localhost) are not counted. To turn it off, set `goatcounter: ''` in `src/site.config.ts`.

## Renaming a page without breaking links

If a section's title changes, its address changes too, and old links would hit the "page isn't here" page. To forward the old address, add it to `redirects` in **`content-meta/slug-overrides.json`** (`IMPORT_REPORT.md` lists removed and new addresses after each import):

```json
"redirects": [{ "from": "/001-old-section-address/", "to": "/001-new-section-address/" }]
```

The Bulgarian page is forwarded too. Alternatively, keep the old address by pinning the section's slug under `sections` in the same file.

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

The first `npm run translate` creates a small Python environment (`.venv-translate`) and downloads the 70 MB translation model. Neither is committed to git.

## Commands

| Command | What it does |
|---|---|
| `npm run update` | import, translate, redraw link-preview images, then back up the manuscript |
| `npm run backup` | upload new or changed manuscript files to the private backup |
| `npm run import` | all `.docx` in `manuscript/` → English content + `IMPORT_REPORT.md` |
| `npm run translate` | English → Bulgarian (offline) |
| `npm run og` | redraw link-preview images for changed chapters |
| `npm run dev` | local preview with live reload (no search) |
| `npm run build` | build the static site into `dist/` and its search index |
| `npm run preview` | serve the built site locally (search works here) |
| `npm run audit` | Lighthouse scores for key pages (run while `preview` is running) |
| `npm run test:importer` | importer and translator tests |
| `npm run check` | type-check the site |

## How it fits together

- `importer/`: Python, standard library only. `import_manuscript.py` walks the `.docx` by paragraph style (Title, Heading 1–3, Normal, tables), and `patterns.py` holds the detection and slug rules. `translate.py` holds the Bulgarian pipeline.
- `.github/workflows/deploy.yml`: builds and publishes to GitHub Pages on every push to `main`.
- `src/`: an [Astro](https://astro.build) static site. `views/` holds page templates shared by `/…` and `/bg/…`, `components/` the flashcards, practice lab, sources and so on, and `styles/` the design system and palettes.
- **Licences:** fonts are Source Serif 4 and Inter (SIL Open Font License, self-hosted). The translation model is OPUS-MT en→bg (CC-BY 4.0), by Tiedemann and Thottingal, packaged by Argos Translate.
