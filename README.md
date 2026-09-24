# Pokédex

A searchable Pokédex built with vanilla JavaScript, HTML and CSS on top of the
[PokéAPI](https://pokeapi.co/docs/v2). No build step, no dependencies.

## Features

- Search by name or National Dex number (e.g. `char`, `25`, `#150`)
- Filter by type and by generation, combinable with search
- Cards with official artwork and type badges, loaded lazily as you scroll
- Detail view with description, height/weight, abilities, base stats and
  the evolution chain (click any stage to jump to it)
- Fight page: two random Pokémon battle it out with animated playback
- Story mode: a chapter-based RPG. Name yourself and your rival, pick a starter
  from Professor Oak, nickname it, answer characters through multiple-choice
  replies, and battle your rival turn by turn choosing your own moves.
  Chapter 2 is a delivery quest with wild and trainer battles; chapter 3 is
  about catching a new Pokémon and ends on a mystery.
- Save slots: progress saves automatically to a small JSON database
  (`data/saves.json`) through the included server. Load any slot, delete
  slots, or save a copy to try different choices. Without the server, slots
  are kept in the browser instead.
- Light and dark mode via `prefers-color-scheme`

## Run

The app uses `fetch`, so open it over HTTP rather than from `file://`.
A dependency-free Node server is included:

```bash
npm start            # or: node server.js [port]
```

Then open http://localhost:8080.

## Files

- `index.html` – page shell and controls
- `styles.css` – layout, cards, modal and type colours
- `app.js` – PokéAPI client, filtering, rendering and detail modal
- `story.html`, `story.js` – story mode page and engine
- `chapters.js` – story content (add new chapters here)
- `server.js` – zero-dependency static file server and save API (`npm start`)
- `data/saves.json` – story save slots (created on first save)
