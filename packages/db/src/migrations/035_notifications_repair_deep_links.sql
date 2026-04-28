-- 035_notifications_repair_deep_links.sql
-- Existing UI-feed rows were written with deep links that pointed at routes
-- that don't exist on the web app, causing 404s when users clicked them.
-- See PR #169 for the registry fix that prevents new bad rows.
-- This migration repairs the rows already in the table. Idempotent.

-- task.created / task.updated: /workspace/projects/{p}/tasks/{t}
--                              -> /workspace/projects/{p}?tab=tasks&task={t}
UPDATE notifications
SET deep_link = REGEXP_REPLACE(
  deep_link,
  '^/workspace/projects/([^/?#]+)/tasks/([^/?#]+)$',
  '/workspace/projects/\1?tab=tasks&task=\2'
)
WHERE channel = 'ui'
  AND deep_link ~ '^/workspace/projects/[^/?#]+/tasks/[^/?#]+$';

-- email.drafted / email.failed: /workspace/mail/drafts/{d}
--                               -> /workspace/email-drafts?draft={d}
UPDATE notifications
SET deep_link = REGEXP_REPLACE(
  deep_link,
  '^/workspace/mail/drafts/([^/?#]+)$',
  '/workspace/email-drafts?draft=\1'
)
WHERE channel = 'ui'
  AND deep_link ~ '^/workspace/mail/drafts/[^/?#]+$';

-- email.sent: /workspace/mail/sent/{m}
--             -> /workspace/email-drafts?message={m}
UPDATE notifications
SET deep_link = REGEXP_REPLACE(
  deep_link,
  '^/workspace/mail/sent/([^/?#]+)$',
  '/workspace/email-drafts?message=\1'
)
WHERE channel = 'ui'
  AND deep_link ~ '^/workspace/mail/sent/[^/?#]+$';

-- invite.sent / invite.accepted: /workspace/members
--                                -> /workspace/settings/members
UPDATE notifications
SET deep_link = '/workspace/settings/members'
WHERE channel = 'ui'
  AND deep_link = '/workspace/members';
