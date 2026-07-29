# Selection translate: infinite loader (no LLM request)

Quick reference for an intermittent bug: clicking the selection-translate icon shows a loading spinner forever, and the remote LLM server never receives a request.

Last investigated: 2026-07-28.

## Symptoms

- User selects text → floating icon appears → click icon.
- Popup switches to loading (`Loader`) and never leaves that state.
- LLM remote server shows **no request**.
- Happens **sometimes**, not always (often after idle / first use on a page).

## Call chain (icon → LLM)

```
Icon click
  → TextTranslatorPopup.doTranslate()          // set translating=true
  → mount TextTranslator
  → initTranslator()                           // getTranslatorFeatures + getConfig + …
  → set from/to/translatorFeatures
  → isInited = true
  → translateText()                            // only then
  → requests/backend/translate.ts
  → Background.getTranslateManager()
  → Scheduler.translate()
  → LLMTranslator.translate()                  // fetch(apiUrl)
```

Loader stays up until **either** a translated result **or** an error is set:

- File: `src/app/ContentScript/SelectTranslator/components/TextTranslatorPopup/TextTranslator/TextTranslator.tsx`
- LLM only runs after `isInited` (init completed successfully).

So: **if init never finishes, you get infinite loader + zero LLM traffic.**

## Root cause

### 1. Init path could fail silently (primary UX bug)

Init used to be:

```ts
getTranslatorFeatures().then(async (...) => { ... });
// no .catch()
```

Any rejection left:

- `from` / `to` / `translatorFeatures` unset
- `isInited === false`
- `translate()` never called
- UI stuck on `<Loader />`

Translate had `.catch` (error card). Init did not.

**Mitigation landed:** init is now `try/catch` in `initTranslator()`. Failures:

- set `error` and show the existing error card + Retry
- log `console.error('[SelectTranslator] init failed:', reason)`
- Retry re-runs init when init failed (not only translate)

There is **no toast library** in this project; the selection popup error body + page console are the surface.

### 2. Why it is intermittent: cold MV3 service worker

Background handlers register late:

```
App.main()
  → migrateAll()
  → setupOffscreenDocuments()
  → background.start()          // getTranslatorsClasses, TranslatorManager
  → setupRequestHandlers()      // onMessage listeners (translate, getConfig, …, ping last)
```

Entry: `src/background-script.ts` → `src/app/index.ts`.

Content-script → background uses `browser.runtime.sendMessage` (`src/requests/utils/index.ts` / `buildBackendRequest`).

On a **cold SW wake**, early messages can fail with e.g.:

- `Could not establish connection. Receiving end does not exist.`
- `The message port closed before a response was received.`

Content-script boot **does** wait with `ping` before first config load:

- `src/app/ContentScript/ClientConfig.ts` → `await ping({ delay: 100 })`

Popup also pings with timeout and shows an error:

- `src/pages/popup/popup.tsx`

Selection translate init **did not** re-ping after SW sleep. That is the intermittent race: warm SW works; cold SW can drop init messages → silent hang (before the catch fix) or visible init error (after the catch fix).

## Key files

| Area | Path |
| --- | --- |
| Icon / card shell | `src/app/ContentScript/SelectTranslator/components/TextTranslatorPopup/TextTranslatorPopup.tsx` |
| Loader / init / translate UI | `.../TextTranslator/TextTranslator.tsx` |
| Selection host | `src/app/ContentScript/SelectTranslator/SelectTranslator.tsx` |
| Translate RPC | `src/requests/backend/translate.ts` |
| Features RPC | `src/requests/backend/getTranslatorFeatures.ts` |
| Request plumbing | `src/requests/utils/requestBuilder/buildBackendRequest.ts` |
| SW bootstrap | `src/app/index.ts`, `src/app/Background/index.ts` |
| LLM fetch | `src/lib/translators/llm/LLMTranslator.ts` |
| Ping / readiness | `src/requests/backend/ping.ts`, `src/app/ContentScript/ClientConfig.ts` |

## How to diagnose

1. Load unpacked Chromium build: `build/chromium` (`make buildChromium`).
2. Reproduce stuck load on a normal page (not `chrome://`).
3. Open **page** DevTools → Console (content script logs here).
4. Look for:
   - `[SelectTranslator] init failed: …`
   - `[SelectTranslator] translate failed: …`
5. Or read the error text in the selection popup card (Retry button present).

If the message is a messaging / receiving-end error → SW readiness race.  
If it is API key / HTTP status / unsupported language → real translate path (request may still hit server).

## Related prior fixes (popup not request)

These address the popup being **closed** during first open / Loader mount, not the “no LLM request” hang:

- `suppressOutsidePointerClose` / closed-shadow outside-click handling in `SelectTranslator.tsx` + `TextTranslatorPopup.tsx`
- Soft `setOptions` in `SelectTranslatorManager` so config broadcasts do not remount the popup mid-load
- Commits such as `12f861b` (keep popup open on icon click) and related Loader/SW race comments in those files

## Remaining hardening (optional)

- Before selection init (and optionally translate), `ping` background with a short timeout/retry (same pattern as popup / `ClientConfig`).
- Surface a dedicated “background unavailable” message via `getMessage('common_bgUnavailable')` when ping fails.
- Consider registering critical `onMessage` handlers earlier in SW startup so cold wake is less fragile.

## Verification

- After rebuild + reload extension, forced init failure should show error card, not infinite spinner.
- Successful path still: init → translate → LLM request → result/error card.
- Console must show `[SelectTranslator]` prefix on failures.
