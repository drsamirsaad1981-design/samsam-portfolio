# The welcome page's build tools

The public page (`welcome/index.html` Arabic, `welcome/en.html` English, `welcome/privacy*.html`) is generated; edit the
sources here, never the output.

- `src/Main.dc.html`, `src/English.dc.html`, `src/canvas.json` — the page's design sources (the same files as the design
  artifact). Images are referenced as `/_blob/<id>`; `assets.json` maps each id to an image name.
- `build_public.py` — builds `welcome/index.html` and `welcome/en.html` (images, meta tags, share images' tags).
- `build_privacy.py` — builds `welcome/privacy.html` and `welcome/privacy-en.html` (the text is inside the script).
- `og.py` — the share images (`welcome/img/og-*.png`); needs the Cairo font files.
- `demo/` — the scripts that took the screenshots from a demo portfolio (they need the test servers in `tests/`).

Run from anywhere: `python3 tools/welcome/build_public.py` and `python3 tools/welcome/build_privacy.py`.
Screenshots come from a fresh demo folder when there is one, otherwise from the images already in `welcome/img`.
