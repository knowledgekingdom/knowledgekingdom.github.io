# Licences of everything the site uses that the project didn't create

Rule (v2 plan §0.8): only original, public-domain or openly licensed material. No copyleft (GPL,
CC BY-SA) or non-commercial (CC BY-NC) material without asking Semir first.

| What | Used for | Licence | Attribution needed |
|---|---|---|---|
| Book text and figures | the whole site | © Semir | — |
| Source Serif 4 (Adobe), via @fontsource-variable | body and headings | SIL Open Font License 1.1 | no (licence file shipped with the package) |
| Inter (Rasmus Andersson), via @fontsource-variable | interface text | SIL Open Font License 1.1 | no |
| Icons in `src/components/Icon.astro` | interface | drawn for this site | — |
| Kingdom Map drawing, emblems, scenery and textures (`src/map/`) | homepage map | drawn and generated for this site | — |
| App icons (`public/icons/`) and link-preview cards | install icon, share images | drawn for this site with Source Serif 4 / Inter (OFL) | — |
| OPUS-MT en→bg model (Tiedemann & Thottingal), packaged by Argos Translate | draft Bulgarian translation (offline, at build time only) | CC BY 4.0 | yes: in the footer of every Bulgarian page, and in the README |
| Astro, Pagefind, yaml and other npm packages | building the site | MIT / ISC (permissive) | no |
| ts-fsrs 6.0.0 (open-spaced-repetition) | scheduling the daily review | MIT | no |
| GoatCounter (hosted, free plan) | visitor counts | service terms; script is EUPL-1.2 but only loaded, not modified or distributed | no |
| Wikidata coordinates and Bulgarian place names (`content-meta/knowledge/places.yaml`, `source: wikidata:Q…`) | map positions of places | CC0 (public domain) | no |
| Natural Earth 1:50m land, lakes and rivers (`public/atlas/geo.json`, built by `scripts/atlas-geo.mjs`) | Atlas base map | public domain | no (credited on the Atlas page anyway) |
| Atlas drawing, symbols and styles (`src/scripts/atlas.ts`, `src/styles/atlas.css`) | Atlas | drawn for this site | — |
| Chapter trailer player, film grain and ship (`src/trailer/player.ts`) | chapter trailers | made for this site; uses the Natural Earth base map above | — |

When a later phase adds data or libraries, add a row here in the same commit.
