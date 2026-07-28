Linguist is a powerful browser extension built to replace commercial translation services — private, fast, and under your control.

This repository is a [fork](https://github.com/nichbar/linguist) of [translate-tools/linguist](https://github.com/translate-tools/linguist). It keeps selection and text translation as the core workflow, and adds built-in LLM translation plus a redesigned selection popup.

Translate highlighted text, subtitles (including Netflix), and private messages; hear translations via TTS; and save entries to a personal dictionary. Supports 130 languages.

# Why Linguist?

Linguist is a standalone translation system — not a thin wrapper around a commercial widget. The first-party translator is an LLM backend you configure; plug in any other backend you choose with custom modules (see [Custom translators](https://linguister.io/docs/CustomTranslator)). See a [custom translators list](https://github.com/translate-tools/linguist-translators) for popular bindings, including self-hosted / offline services.

Linguist is free, open-source, and collects no personal data.

# Features

Most important features
- Modular translators system
	- Built-in **LLM translator** (OpenAI-compatible chat completions): API key, URL, model, and system prompt are configurable in settings (default)
	- [Custom translators](https://linguister.io/docs/CustomTranslator): load your own JS module (Google, DeepL, LibreTranslate, etc.)
	- Offline / self-hosted translation via custom modules (no built-in Bergamot stack)
- Selection and text translation
	- Compact redesigned selection popup (language, translation, provider/model)
	- Configurable popup opacity
	- Popup placement above/below the selected text
	- Optional fixed source language (skip detection)
	- Translate any text input from the popup
- Dictionary with saved translations
- Translations history, to remember recently translated words
- Text-to-speech (TTS)

# Changes in this fork

Compared to upstream [translate-tools/linguist](https://github.com/translate-tools/linguist) (`master`):

### Added
- Built-in LLM translator with OpenAI-compatible endpoint (`apiKey`, `apiUrl`, `model`)
- Configurable LLM system prompt (`{from}` / `{to}` placeholders)
- Fixed source language option in settings
- Selection popup opacity setting (default `0.95`)
- Redesigned compact selection TextTranslator card
- Selection popup placement relative to the selected text (prefer top/bottom)

### Removed / simplified
- Full-page translation engine, popup tab, auto-translate prefs, and page-translate context menu
- Built-in Google, Microsoft/Bing, Yandex, and Bergamot translators (LLM is the only first-party backend; custom modules remain)
- Release artifacts beyond Chromium zip (no CRX / Firefox XPI packaging in CI)

### Fixes
- Keep the selection translate popup open when clicking the floating icon
- Apply opacity to the loading popup state
- Avoid duplicate translate requests on selection-popup init

Version line: upstream is at `7.0.5`; this fork is at `7.0.10`.

# Installation

Official store listings still point at the upstream project:

[![](./assets/firefox.png)](https://addons.mozilla.org/addon/linguist-translator/) [![](./assets/chrome.png)](https://chrome.google.com/webstore/detail/gbefmodhlophhakmoecijeppjblibmie)

For this fork, download a package from the [GitHub Releases page](https://github.com/nichbar/linguist/releases) and install it manually in developer/load-unpacked mode.

## Android

<!-- Text partly copied from https://github.com/ajayyy/SponsorBlock/wiki/Android -->

This addon can be used on mobile browsers with [Firefox Nightly](https://play.google.com/store/apps/details?id=org.mozilla.fenix) (Recommended), or with any chromium browser that supports extensions.

To try the upstream add-on on Firefox, add it to a [custom add-on collection](https://www.ghacks.net/2020/10/01/you-can-now-install-any-add-on-in-firefox-nightly-for-android-but-it-is-complicated/) and use that collection to install the extension.

To try a Chromium build on mobile, download the extension zip/package and load it in a browser that supports extensions.

# Screenshots

See more info on https://linguister.io (upstream site; some screenshots still show full-page translation, which this fork no longer includes).

![](./packages/site/src/features/Landing/screenshots//text-translation.png)
![](./packages/site/src/features/Landing/screenshots//selected-text-translation.png)
![](./packages/site/src/features/Landing/screenshots//settings.png)

# Development

See [development docs](./docs/Development.md) to get info on how to build and debug.

This fork’s default dev target is Chromium:

```bash
npm install
npm run build:dev
```

Upstream contribution links still apply if you want to help the original project: file issues, suggest features, and submit pull requests. See the ["help wanted" label](https://github.com/translate-tools/linguist/labels/help%20wanted) for high-impact tasks.

# Donations

Upstream Linguist is free, open-source, and collects no user data. If you rely on it, consider supporting the original project.

How you can support upstream:
- Star the [upstream repository](https://github.com/translate-tools/linguist) to increase visibility and attract contributors
- File issues and suggest improvements: [new issue](https://github.com/translate-tools/linguist/issues/new)
- Help translate the UI (see the internationalization guide) and send a pull request
- Contribute artwork or UX design
- Reproduce and test unconfirmed bug reports: [recheck](https://github.com/translate-tools/linguist/labels/recheck)
- Fix bugs or implement features (TypeScript experience helpful)

Donate to vote with your money: prioritize fixes, commission features, or speed up important work. After donating, send transaction details and the issue/feature reference to [support@linguister.io](mailto:support@linguister.io) or add them in the issue comments. For significant donations, we will begin work on your request immediately.

- Monero (XMR): 861w7WuFGecR7SMpuf7GX9BBUgGJb1Xdx8z5pCpMrKY2ZeZAzS3mwZeQeJGV5RPpu35fr5dURSm587ewpHYGzNuGKGroQnD
- Bitcoin (BTC): bc1q2krassq0sa2aphkx37zn374lfjnthr5frm6s7y
- Ethereum (ETH), Tether USDT (ERC-20): 0x2463d84F46c131886CaE457412e8B6eaBc0b91a7
- Tron (TRC), Tether USDT (TRC-20): TQezzyzkfMCPJRdnYxNXrUfPj3s7kDeMBL

# Supporters

![](./assets/jb_beam.svg)
