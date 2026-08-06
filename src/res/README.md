Directory contains brand assets (extension logo / icons).

Source artwork: root `f.webp` (pixel ghost). Regenerated as:

- `logo-icon.svg` — square brand icon used in UI (popup header)
- `logo.svg` — same icon for page favicons / static copy
- `logo.png` / `logo-{16,32,48,128}.png` — nearest-neighbor PNG sizes for browser chrome
- `logo.webp` — copy of the source webp
- `translate-button.svg` — selection popup button: project icon cropped to content (no padding)

Webpack copies these into the build `static/` directory.
