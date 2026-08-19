# Task Board

A simple dot-grid task board: create a board per project, drop **nodes** onto a snapping grid,
and join them with elbow connectors. Light and dark themes. Everything is saved to your
browser's `localStorage` — no accounts, no backend.

Built from the `Task Board.dc.html` design file, using the Geist UI design tokens.

## Use

- **Add a board** — type a project name in the sidebar and press *Add*.
- **Delete a board** — the ⋮ button at the left of any sidebar row opens its menu. Boards with
  nodes ask for confirmation first.
- **Set a priority** — the same ⋮ menu marks a project **1** (high), **2** (medium) or **3** (low).
  New projects start at 2. The badge shows on the row; priority labels a project, it does not
  reorder the queue.
- **Reorder the queue** — drag a row by its grip handle. The row lifts and the rest part around it,
  same press-and-hold interaction as the Router Department Tracking job queue.
- **Add a node** — *Node* drops one on the grid. Each node has a heading and bullets; long text
  wraps onto the next line and the node grows to fit.
- **Move** — drag a node; it snaps to the 24px dot grid.
- **Link nodes** — press *Link nodes* to arm the tool, then either drag from one node to another,
  or click one node and then the next. Repeating an existing connection removes it.
  <kbd>Esc</kbd> leaves the tool.
- **Mark a node complete** — the circle at the top-left of a node. Completed nodes strike through
  their heading and dim; the sidebar count then reads *done/total*.
- **Bullets** — <kbd>Enter</kbd> adds the next bullet, <kbd>Shift</kbd>+<kbd>Enter</kbd> breaks a
  line inside one, <kbd>Backspace</kbd> on an empty one removes it.
- **Theme** — the toggle in the header switches light/dark and remembers your choice. Until you
  pick one, the board follows your system setting.

## Stack

Static HTML, CSS and vanilla JS. No build step, no dependencies.

```
index.html          markup shell
assets/styles.css   Geist tokens (light + dark) and component styles
assets/app.js       state, rendering, drag, linking, connectors
assets/DDT-*.svg    favicon (the header mark is inline SVG, themed by CSS)
```

## Run locally

```bash
python -m http.server 4173
```

Then open <http://localhost:4173>.

## Deploy

The site is served from the repository root by GitHub Pages (`main` branch). Any push to `main`
publishes the change.

Pages caches assets for ten minutes, so `index.html` loads `styles.css` and `app.js` with a `?v=`
query string. **Bump both when you change either file**, otherwise a returning visitor can get new
markup alongside a stale script.

## Configuration

The board options exposed as props in the design file are constants at the top of
[`assets/app.js`](assets/app.js):

| Option       | Default   | Meaning                              |
| ------------ | --------- | ------------------------------------ |
| `snap`       | `true`    | Snap node positions to the dot grid  |
| `gridSize`   | `24`      | Dot grid pitch, in px                |
| `connectors` | `'elbow'` | `'elbow'` or `'straight'` connectors |

Boards saved by earlier versions are migrated on load: the old *Note* and *Wireframe step*
elements both become nodes, and their connections are kept.
