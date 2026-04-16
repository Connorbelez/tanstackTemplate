# Admin origination — visual mockups

This folder contains **static HTML/CSS** mockups that mirror the screens described in the parallel phase specs. Open `index.html` in a browser (local `file://` is fine).

## Paper MCP (optional)

To drive the same layouts in [Paper](https://paper.design) instead of HTML, install **Paper Desktop**, open a document, then connect Cursor via `/add-plugin paper-desktop` or the HTTP endpoint described in [Paper MCP docs](https://paper.design/docs/mcp). When the `paper` MCP is available, you can ask an agent to recreate these screens on the canvas using the phase spec text and the ASCII diagrams as source of truth.

This repository’s CI/agents do not assume Paper is installed.

## Files

- `styles.css` — shared tokens and layout primitives (`dash`, `card`, `case-layout`, etc.).
- `phase-01.html` … `phase-09.html` — one file per phase spec; each file may include multiple screens as labeled sections.
