# Compose send silent-fail UX (issue #84)

**Date:** 2026-04-18
**Sprint:** Launch 2026-04-19 (P0)

## Problem

`POST /v1/connectors/email/draft/send` swallows Gmail/Resend failures: on
error it logs a warning, stores the draft as `state: "sent"`, and returns
`200 { success: true }`. The user sees a green "Sent" badge but no email
ever leaves. First-week trust killer.

## Acceptance (from issue)

- Force Resend to 403 / 422 — UI shows a readable "send failed" message
  and the draft stays editable with a retry path.
- Gmail send failure behaves the same way.
- Draft row state stays `"draft"` (not `"sent"`) on failure so the user
  can retry.

## Design

### API change — `apps/api/src/routes/v1/connectors-email.ts`

1. Only attempt the send when `body.sendNow === true`. Track outcome in a
   local variable before touching the DB:
   ```ts
   type SendOutcome =
     | { ok: true; channel: "gmail" | "resend" }
     | { ok: false; code: string; message: string };
   ```
2. Gmail branch catches errors and maps them to
   `{ ok: false, code: "gmail_send_failed", message: err.message }`.
3. Resend branch captures HTTP status:
   - `403` → `{ code: "domain_not_verified", message: "Sender domain not verified with Resend." }`
   - `422` → same (Resend uses 422 for invalid from).
   - Any other non-2xx → `{ code: "resend_send_failed", message: "Resend rejected the send (status <n>)." }`.
   - Transport/throw → `{ code: "resend_send_failed", message: "Couldn't reach Resend." }`.
4. `sendNow=true` but no Resend key and no Gmail installation →
   `{ ok: false, code: "no_provider_configured", message: "No email provider is connected for this workspace." }`.
5. Finalise `draftState`:
   - `sendNow=false` → `"draft"`
   - `sendNow=true` + outcome.ok → `"sent"`
   - `sendNow=true` + !outcome.ok → `"draft"` (retryable)
6. INSERT rows with the final `draftState`. This avoids the current bug
   where rows are written as `"sent"` before the send completes.
7. Notification row (`INSERT INTO notifications`) only written on
   successful send.
8. Audit log action:
   - Success → `"connector.email.send"` (unchanged)
   - Failure → `"connector.email.send_failed"` with `{ errorCode }` in
     `details`.
9. Response:
   - Success → `200 { success: true, draftId, state: "sent" }`
     (unchanged shape).
   - Not sending (draft save) → `200 { success: true, draftId, state: "draft" }`
     (unchanged shape).
   - Send failure → `502 { success: false, draftId, state: "draft", error: <message>, errorCode: <code> }`.
     Using 502 because an upstream provider rejected the send.

### Frontend — `apps/web/src/app/workspace/email-drafts/EmailDraftsClient.tsx`

`ComposeModal.handleSend` and `DraftRow.handleSend` already read
`json.error` on `!res.ok` and render it inline. No structural change
needed; verify the message text renders and the Send button stays
enabled so retry is a single click.

### Proxy — `apps/web/src/app/api/workspace/email/drafts/send/route.ts`

`proxyApiRequest` already forwards `status` + `body` unchanged, so no
edit is required.

### Tests — `apps/api/tests/connectors-email-draft-send.test.ts`

Existing "logs a warning when Resend responds non-ok" test asserts the
OLD (broken) 200 behaviour. Rewrite it to:

- Assert `response.statusCode === 502`
- Assert response body contains `success: false`, `errorCode: "domain_not_verified"`, `state: "draft"`
- Assert DB insert was called with `state = 'draft'` (not `'sent'`)

Add a new test: Gmail-configured path, Gmail throws → response is 502
with `errorCode: "gmail_send_failed"` AND there is no Resend fallback
invocation (current behaviour falls back to Resend when Gmail throws,
which means Gmail failures are hidden behind Resend success; we want
explicit Gmail errors surfaced). **Decision:** keep the Gmail→Resend
fallback but only report Gmail's error if Resend is also unconfigured.
If Resend succeeds after Gmail fails, the send succeeded and we return
200. This matches current logic and is more useful.

So the test is: Gmail throws AND Resend is unconfigured → 502 with
`errorCode: "gmail_send_failed"`.

## Out of scope

- Refactoring `connectors-email.ts` to use `lib/email.ts` helpers
  (bug 1 from `larry-actions-bugs-2026-04-16.md`). Leave for
  post-launch.
- Retry button wording / Toast UX. The existing inline error message
  is enough for launch — users can click Send again.
- Draft-update endpoint for edited bodies. Current flow re-inserts a
  new draft per send attempt; that's acceptable for launch.
