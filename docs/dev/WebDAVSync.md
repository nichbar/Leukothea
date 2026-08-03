# WebDAV config sync

Design note for multi-device `AppConfig` sync over WebDAV.

Status: v1.1 runtime + conditional writes + secrets opt-in (syncSecrets default off). UX polish remains a follow-up.

## What it is

Bidirectional **whole-blob** sync of `AppConfig` to a fixed WebDAV object:

`{baseUrl}/linguist/linguist-config.json`

- Dictionary / history stay local.
- Transport: GET / PUT / MKCOL + Basic auth (`WebDAVClient`).
- Decision: last-write-wins on `updatedAt` + extension-version gate (`configEnvelope`).
- Orchestration: background `WebDAVSyncManager` (startup / alarm / local write / manual).

## Layers

| Layer | Role |
| --- | --- |
| `src/lib/webdav/WebDAVClient.ts` | Minimal WebDAV IO |
| `src/lib/webdav/configEnvelope.ts` | Envelope serialize/parse + `decideSyncAction` |
| `src/app/Background/WebDAVSyncManager/` | Watch config, alarms, reconcile |
| `src/requests/backend/sync/*` | Status / sync now / test connection |
| Options + `sync.webdav.*` | Enable + credentials UI |

Local meta (not in envelope) lives in `storage.local` under `configSyncMeta`:

- `lastLocalWriteAt`, `lastRemoteUpdatedAt`, `lastSyncAt`
- `lastError`, `lastDirection`
- `lastRemoteEtag` (conditional writes)

## Envelope (v1)

```json
{
  "version": 1,
  "updatedAt": 1730000000000,
  "extensionVersion": "7.0.x",
  "config": { "...AppConfig..." }
}
```

Rules (`decideSyncAction`):

1. Remote missing (404) → push (create).
2. `localExt < remoteExt` → never push; may pull if remote newer and valid.
3. Invalid remote config → never push over it (`skipIncompatibleRemote`).
4. Else LWW on `updatedAt`.

## Known gaps (review summary)

| Sev | Issue | v1.1 stance |
| --- | --- | --- |
| High | Concurrent reconcile dropped mid-flight work | **Fixed**: dirty flag + re-run |
| High | `setTimeout` push debounce dies with MV3 SW | **Fixed**: immediate reconcile while awake + one-shot alarm backstop |
| High | Unconditional PUT (lost update A/B) | **Fixed**: ETag `If-Match` / create `If-None-Match: *`; 412 → re-reconcile |
| High | Full config includes secrets | **Fixed (PR C)**: WebDAV url/username/password always local-only; `syncSecrets` (default off) only gates LLM API key |
| Med | Remote apply skips migrations | Keep decode-only; upgrade extension to recover |
| Med | Soft system config writes bump LWW clock | Follow-up (`set` source tag) |
| Med | Thin client (timeouts, test=GET only) | Timeouts added; **Test stays GET-only** (MKCOL probe falsely failed on existing folders) |
| Med | Manager untested | **Fixed**: manager unit tests with mock client |
| Low | i18n / status UX / fixed path+interval | Follow-up |

## v1.1 runtime contract

### Single-flight + dirty

- At most one `runReconcile` in flight.
- If another trigger arrives while busy → set `dirtyWhileReconciling` and **re-run after finish**.
- Push always re-reads latest config + `lastLocalWriteAt` (no stale snapshot).

### Local write path

1. Always bump `lastLocalWriteAt` (even if sync disabled — preserves LWW once enabled).
2. If configured:
   - Schedule one-shot push alarm (`webdav-config-push`, ~1 min) as **MV3 reliability backstop**.
   - Best-effort `reconcile('localWrite')` immediately while the SW is awake.
3. Clear push alarm after a successful reconcile cycle.

### Periodic pull

- Alarm `webdav-config-sync`, fixed `1440` minutes (unchanged).

### Conditional write

- GET stores `ETag` in meta (`lastRemoteEtag`).
- Create (404 path): `PUT` with `If-None-Match: *`.
- Update: `PUT` with `If-Match: <etag>` when etag known; if server never gave an etag, unconditional PUT (degraded).
- HTTP 412 → treat as dirty remote, re-GET and re-decide (no blind overwrite).
- After pull/push success, refresh `lastRemoteEtag` from response when present.

### Conflict UX (minimal)

- 412 loops that still cannot decide cleanly surface `lastError` (user can Sync now / pull).
- No vector clocks / device ids in v1.1.

## Follow-up roadmap

### PR C — Secrets (done)

- `sync.webdav.syncSecrets: boolean` default `false` (migration v20) — **LLM API key only**.
- WebDAV **url + username + password are always local-only** (never uploaded / never adopted from remote), even when syncSecrets is on.
- `prepareConfigForPush` / `mergeRemoteConfig` in `src/lib/webdav/syncSecrets.ts`.
- Push without syncSecrets: empty API key on create; keep existing remote API key on update; always clear WebDAV connection fields (url/username/password).
- Pull: always keep local WebDAV connection; keep local API key when syncSecrets is off.
- `syncSecrets` itself is a **per-device policy** — never adopted from remote on pull.
- Options checkbox + EN copy; threat model blurb in group description.

### PR D — UX / client polish

- Timeouts already preferred on fetch; map 401 vs 403.
- Test connection should prove write ACL (not GET-only).
- Richer status: last remote vs local times, conflict CTA.
- Complete locales + `packages/locales/sample.json`.
- Optional: configurable relative path; faster pull interval.

### Deferred

- Per-field CRDT, dictionary/history sync, OAuth WebDAV, encrypted blob, remote migration pipeline, multi-profile paths.

## Testing

- Pure: `configEnvelope` decision + parse (existing).
- Client: URL join, auth header, conditional header plumbing.
- Manager (mock client + real `ObservableAsyncStorage` / `storage.local` meta):
  - dirty re-run after concurrent local write
  - `applyingRemote` does not echo push
  - 404 create with `If-None-Match: *`
  - local newer → conditional push
  - remote newer → pull
  - 412 → second GET + re-decide
  - older extension never pushes
  - push alarm scheduled on local write
  - WebDAV connection always stripped on push / retained on pull; LLM key gated by syncSecrets

## Threat model (short)

- Remote file is **plaintext JSON** on user-controlled WebDAV (same class as `storage.local` plaintext).
- Anyone with WebDAV read can see synced settings; with write can plant config.
- Default installs do **not** upload the LLM API key. WebDAV url/username/password never leave the device. With `syncSecrets` on, treat WebDAV ACL as the boundary for the LLM API key.
- Prefer app passwords; do not sync to shared/public collections.

## Success criteria (v1.1)

1. Rapid local edits during an in-flight sync → final remote matches final local.
2. SW sleep after a settings write → push still lands via alarm backstop.
3. Two devices push without etag match → 412 path re-GETs; no silent clobber when etags work.
4. Manager tests cover single-flight, create, 412, and no pull→push loop.
5. Push never includes WebDAV url/username/password; default `syncSecrets: false` → empty LLM API key on create; pull keeps local WebDAV connection + local API key.

