# Task Board

A simple dot-grid task board: create a board per product, drop **Notes** and **Wireframe steps**
onto a snapping grid, and connect them with elbow arrows. Everything is saved to your browser's
`localStorage` — no accounts, no backend.

Built from the `Task Board.dc.html` design file, using the Geist UI design tokens.

## Use

- **Add a board** — type a product name in the sidebar and press *Add*.
- **Add elements** — *Note* (heading + bullets) or *Wireframe step* (heading only).
- **Move** — drag a card; it snaps to the 24px dot grid.
- **Connect** — click the link icon on one card, then the link icon on another. Click the same
  card twice, or press <kbd>Esc</kbd>, to cancel. Linking two already-connected cards removes
  the connector.
- **Bullets** — <kbd>Enter</kbd> adds the next bullet, <kbd>Backspace</kbd> on an empty one
  removes it.

## Stack

Static HTML, CSS and vanilla JS. No build step, no dependencies.

```
index.html          markup shell
assets/styles.css   Geist tokens + component styles
assets/app.js       state, rendering, drag, connectors
```

## Run locally

```bash
python -m http.server 4173
```

Then open <http://localhost:4173>.

## Deploy

The site is served from the repository root by GitHub Pages (`main` branch). Any push to `main`
publishes the change.

## Configuration

The board options exposed as props in the design file are constants at the top of
[`assets/app.js`](assets/app.js):

| Option       | Default   | Meaning                              |
| ------------ | --------- | ------------------------------------ |
| `snap`       | `true`    | Snap card positions to the dot grid  |
| `gridSize`   | `24`      | Dot grid pitch, in px                |
| `connectors` | `'elbow'` | `'elbow'` or `'straight'` connectors |
