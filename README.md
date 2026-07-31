Linguist is a browser extension for private, on-device selection and text translation under your control.

This repository is a [fork](https://github.com/nichbar/linguist) of [translate-tools/linguist](https://github.com/translate-tools/linguist). Selection and text translation are the core workflow. The only built-in translator is an LLM backend you configure; other providers load as custom modules.

# Why Linguist?

Linguist is a standalone translation system — not a thin wrapper around a commercial widget. Configure an OpenAI-compatible LLM endpoint, or plug in any other backend with [custom translators](./docs/CustomTranslator.md). Community module examples live in [translate-tools/linguist-translators](https://github.com/translate-tools/linguist-translators) (self-hosted / offline services included).

Linguist is free, open-source, and collects no personal data.

# Features

- **LLM translator** (default, OpenAI-compatible chat completions)
  - Configurable API key, URL, model, and system prompt (`{from}` / `{to}`)
- **Custom translators and TTS** via JS modules (DeepL, LibreTranslate, Google, etc.)
- **Selection and text translation**
  - Floating button + compact selection popup
  - Optional quick translate / context-menu modes
  - Popup placement above/below the selection
  - Configurable popup opacity
  - Optional fixed source language (skip detection)
  - Optional hide popup when selected text is already in **Your language**
  - Translate free-form text from the extension popup
- **Dictionary** for saved translations
- **History** of recent translations
- **Text-to-speech (TTS)**

# Not in this fork

These upstream capabilities were removed and are not supported here:

- Full-page translation (engine, popup tab, auto-translate site/lang prefs, page-translate context menu)
- Built-in commercial / offline stacks: Google, Microsoft/Bing, Yandex, Bergamot  
  (use custom modules if you need those providers)
- Firefox XPI / Chrome CRX packaging in the release path (Chromium zip is the default artifact)

# Changes in this fork

Compared to upstream [translate-tools/linguist](https://github.com/translate-tools/linguist):

### Added
- Built-in LLM translator with OpenAI-compatible endpoint (`apiKey`, `apiUrl`, `model`)
- Configurable LLM system prompt (`{from}` / `{to}` placeholders)
- Fixed source language option in settings
- Selection popup opacity setting (default `0.95`)
- Option to hide the selection popup when text matches **Your language**
- Redesigned compact selection TextTranslator card
- Selection popup placement relative to the selected text (prefer top/bottom)

### Removed / simplified
- Full-page translation and related settings / menus
- Built-in Google, Microsoft/Bing, Yandex, and Bergamot translators
- Release artifacts beyond Chromium zip (no CRX / Firefox XPI packaging in CI)

### Fixes
- Keep the selection translate popup open when clicking the floating icon
- Apply opacity to the loading popup state
- Avoid duplicate translate requests on selection-popup init
- More reliable selection-popup init/error handling with retry

Version line: upstream is at `7.0.5`; this fork is at `7.0.10`.

# Installation

Use a package from the [GitHub Releases page](https://github.com/nichbar/linguist/releases) or a local build, then load it unpacked:

1. Build or download the Chromium package
2. Open `chrome://extensions` (or Chromium equivalent)
3. Enable **Developer mode**
4. **Load unpacked** → select `build/chromium` (or extract a release zip)

# Development

See [development docs](./docs/dev/Development.md) for build, debug, tests, and migrations.

This fork’s default load-unpacked target is Chromium:

```bash
npm install
# watch / dev
npm run build:dev
# or: make devChromium

# production Chromium (reload from build/chromium)
make buildChromium
```

Other useful commands:

```bash
npm test
npm run lint
make buildChrome   # Chrome store target, if needed
```
