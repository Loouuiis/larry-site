import { runIntelligence, generateBootstrapFromTranscript } from "@larry/ai";
import {
  getProjectSnapshot,
  insertProjectMemoryEntry,
  listLarryEventIdsBySource,
  runAutoActions,
  storeSuggestions,
} from "@larry/db";
import type {
  CanonicalEventCreatedPayload,
  CanonicalEvent,
  TranscriptCanonicalPayload,
  LarryAction,
} from "@larry/shared";
import { db } from "./context.js";
import { buildWorkerIntelligenceConfig } from "./intelligence-config.js";

interface CanonicalEventRow {
  id: string;
  source: CanonicalEvent["source"];
  payload: Record<string, unknown>;
}

interface MeetingNoteRow {
  id: string;
  project_id: string | null;
  title: string | null;
  summary: string | null;
}

type ProjectRuntimeStatus = "active" | "archived";

interface EmailCanonicalPayload extends Record<string, unknown> {
  projectId?: string;
  from?: string;
  subject?: string;
  bodyText?: string;
  threadId?: string;
}

interface CalendarCanonicalPayload extends Record<string, unknown> {
  projectId?: string;
  project_id?: string;
  channelId?: string;
  resourceState?: string;
  resourceId?: string;
  messageNumber?: string;
  body?: Record<string, unknown>;
}

interface SlackCanonicalPayload extends Record<string, unknown> {
  team_id?: string;
  projectId?: string;
  project_id?: string;
  event?: Record<string, unknown>;
}

interface SlackEventPayload extends Record<string, unknown> {
  team?: string;
  channel?: string;
  user?: string;
  text?: string;
  subtype?: string;
  projectId?: string;
  project_id?: string;
  metadata?: Record<string, unknown>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

async function loadCanonicalEvent(
  tenantId: string,
  canonicalEventId: string
): Promise<CanonicalEventRow | null> {
  const rows = await db.queryTenant<CanonicalEventRow>(
    tenantId,
    `SELECT id, source, payload
     FROM canonical_events
     WHERE tenant_id = $1
       AND id = $2
     LIMIT 1`,
    [tenantId, canonicalEventId]
  );

  return rows[0] ?? null;
}

async function loadMeetingNote(
  tenantId: string,
  meetingNoteId: string
): Promise<MeetingNoteRow | null> {
  const rows = await db.queryTenant<MeetingNoteRow>(
    tenantId,
    `SELECT id, project_id, title
            , summary
     FROM meeting_notes
     WHERE tenant_id = $1
       AND id = $2
     LIMIT 1`,
    [tenantId, meetingNoteId]
  );

  return rows[0] ?? null;
}

async function loadMeetingAnalysisFolderId(
  tenantId: string,
  projectId: string | null
): Promise<string | null> {
  if (projectId) {
    const projectFolderRows = await db.queryTenant<{ id: string }>(
      tenantId,
      `SELECT id
         FROM folders
        WHERE tenant_id = $1
          AND project_id = $2
          AND parent_id IS NULL
        LIMIT 1`,
      [tenantId, projectId]
    );
    if (projectFolderRows[0]?.id) {
      return projectFolderRows[0].id;
    }
  }

  const generalFolderRows = await db.queryTenant<{ id: string }>(
    tenantId,
    `SELECT id
       FROM folders
      WHERE tenant_id = $1
        AND folder_type = 'general'
      ORDER BY created_at ASC
      LIMIT 1`,
    [tenantId]
  );
  return generalFolderRows[0]?.id ?? null;
}

async function upsertMeetingAnalysisDocument(input: {
  tenantId: string;
  meetingNoteId: string;
  projectId: string | null;
  title: string | null;
  summary: string;
  canonicalEventId: string;
  createdByUserId: string | null;
}): Promise<void> {
  const folderId = await loadMeetingAnalysisFolderId(input.tenantId, input.projectId);
  const documentTitleBase = readOptionalString(input.title) ?? "Meeting transcript";
  const documentTitle = `${documentTitleBase} analysis`;
  const metadata = JSON.stringify({
    canonicalEventId: input.canonicalEventId,
    generatedFrom: "meeting_transcript",
    meetingNoteId: input.meetingNoteId,
  });

  const existingRows = await db.queryTenant<{ id: string }>(
    input.tenantId,
    `SELECT id
       FROM documents
      WHERE tenant_id = $1
        AND source_kind = 'meeting'
        AND source_record_id = $2
      ORDER BY updated_at DESC
      LIMIT 1`,
    [input.tenantId, input.meetingNoteId]
  );

  if (existingRows[0]?.id) {
    await db.queryTenant(
      input.tenantId,
      `UPDATE documents
          SET project_id = $3,
              folder_id = $4,
              title = $5,
              content = $6,
              doc_type = 'transcript',
              metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
              updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2`,
      [
        input.tenantId,
        existingRows[0].id,
        input.projectId,
        folderId,
        documentTitle,
        input.summary,
        metadata,
      ]
    );
    return;
  }

  await db.queryTenant(
    input.tenantId,
    `INSERT INTO documents
      (
        tenant_id,
        project_id,
        folder_id,
        title,
        content,
        doc_type,
        source_kind,
        source_record_id,
        version,
        metadata,
        created_by_user_id
      )
     VALUES
      ($1, $2, $3, $4, $5, 'transcript', 'meeting', $6, 1, $7::jsonb, $8)`,
    [
      input.tenantId,
      input.projectId,
      folderId,
      documentTitle,
      input.summary,
      input.meetingNoteId,
      metadata,
      input.createdByUserId,
    ]
  );
}

async function loadProjectRuntimeStatus(
  tenantId: string,
  projectId: string
): Promise<ProjectRuntimeStatus | null> {
  const rows = await db.queryTenant<{ status: ProjectRuntimeStatus }>(
    tenantId,
    `SELECT CASE
              WHEN status = 'archived' THEN 'archived'
              ELSE 'active'
            END AS status
       FROM projects
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1`,
    [tenantId, projectId]
  );
  return rows[0]?.status ?? null;
}

async function shouldSkipArchivedProjectWrites(input: {
  tenantId: string;
  canonicalEvent: CanonicalEventRow;
  projectId: string;
}): Promise<boolean> {
  const projectStatus = await loadProjectRuntimeStatus(input.tenantId, input.projectId);
  if (projectStatus !== "archived") {
    return false;
  }

  console.warn("[canonical-event] archived project write skipped", {
    tenantId: input.tenantId,
    canonicalEventId: input.canonicalEvent.id,
    source: input.canonicalEvent.source,
    projectId: input.projectId,
  });
  return true;
}

async function reconcileMeetingNote(
  tenantId: string,
  meetingNoteId: string,
  actionCount: number,
  options: { projectId?: string | null; summary?: string | null } = {}
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `UPDATE meeting_notes
     SET project_id = COALESCE(project_id, $3),
         summary = COALESCE($4, summary),
         action_count = $5
     WHERE tenant_id = $1
       AND id = $2`,
    [tenantId, meetingNoteId, options.projectId ?? null, options.summary ?? null, actionCount]
  );
}

function buildTranscriptPrompt(transcript: string): string {
  const truncated = transcript.slice(0, 6_000);
  const truncationNote = transcript.length > 6_000 ? "\n[transcript truncated]" : "";
  return [
    "A meeting transcript was uploaded. Extract committed action items, assign owners where mentioned, infer deadlines, and flag risks.",
    "Create task_create actions for each action item. Update existing task statuses if the transcript mentions progress.",
    "",
    "TRANSCRIPT:",
    truncated,
    truncationNote,
  ].filter(Boolean).join("\n");
}

function buildEmailPrompt(payload: EmailCanonicalPayload): string {
  const from = readOptionalString(payload.from) ?? "unknown sender";
  const subject = readOptionalString(payload.subject) ?? "(no subject)";
  const threadId = readOptionalString(payload.threadId) ?? "none";
  const bodyText = readOptionalString(payload.bodyText) ?? "";
  return [
    `email signal from "${from}"`,
    `subject: "${subject}"`,
    `threadId: "${threadId}"`,
    `body: "${bodyText.slice(0, 500)}"`,
  ].join("\n");
}

function readCalendarProjectHint(payload: CalendarCanonicalPayload): string | null {
  const body = readOptionalRecord(payload.body);
  const bodyEvent = readOptionalRecord(body?.event);
  const bodyPayload = readOptionalRecord(body?.payload);

  const candidates = [
    readOptionalString(payload.projectId),
    readOptionalString(payload.project_id),
    readOptionalString(body?.projectId),
    readOptionalString(body?.project_id),
    readOptionalString(bodyEvent?.projectId),
    readOptionalString(bodyEvent?.project_id),
    readOptionalString(bodyPayload?.projectId),
    readOptionalString(bodyPayload?.project_id),
  ];

  for (const candidate of candidates) {
    if (candidate && isUuid(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildCalendarPrompt(payload: CalendarCanonicalPayload): string {
  const channelId = readOptionalString(payload.channelId) ?? "unknown-channel";
  const resourceState = readOptionalString(payload.resourceState) ?? "unknown-state";
  const resourceId = readOptionalString(payload.resourceId) ?? "unknown-resource";
  const messageNumber = readOptionalString(payload.messageNumber) ?? "none";
  const body = readOptionalRecord(payload.body);
  const bodyText = body ? JSON.stringify(body).slice(0, 500) : "";

  return [
    `calendar signal on channel "${channelId}"`,
    `resourceState: "${resourceState}"`,
    `resourceId: "${resourceId}"`,
    `messageNumber: "${messageNumber}"`,
    `body: "${bodyText}"`,
  ].join("\n");
}

function readSlackProjectHint(payload: SlackCanonicalPayload, event: SlackEventPayload | null): string | null {
  const eventMetadata = readOptionalRecord(event?.metadata);
  const eventMetadataPayload = readOptionalRecord(eventMetadata?.event_payload);

  const candidates = [
    readOptionalString(payload.projectId),
    readOptionalString(payload.project_id),
    readOptionalString(event?.projectId),
    readOptionalString(event?.project_id),
    readOptionalString(eventMetadataPayload?.projectId),
    readOptionalString(eventMetadataPayload?.project_id),
  ];

  for (const candidate of candidates) {
    if (candidate && isUuid(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildSlackPrompt(payload: SlackCanonicalPayload, event: SlackEventPayload | null): string {
  const teamId = readOptionalString(payload.team_id) ?? readOptionalString(event?.team) ?? "unknown-team";
  const channelId = readOptionalString(event?.channel) ?? "unknown-channel";
  const actor = readOptionalString(event?.user) ?? "unknown-user";
  const subtype = readOptionalString(event?.subtype) ?? "message";
  const text = readOptionalString(event?.text) ?? "";

  return [
    `slack signal in workspace "${teamId}" channel "${channelId}"`,
    `actor: "${actor}"`,
    `subtype: "${subtype}"`,
    `text: "${text.slice(0, 500)}"`,
  ].join("\n");
}

function buildMemorySummary(prefix: string, briefing: string): string {
  const cleanBriefing = briefing.replace(/\s+/g, " ").trim();
  const fallback = `${prefix}: Larry processed this source and generated project updates.`;
  if (!cleanBriefing) return fallback.slice(0, 4_000);
  return `${prefix}: ${cleanBriefing}`.slice(0, 4_000);
}

async function loadSlackMappedProjectId(
  tenantId: string,
  slackTeamId: string,
  slackChannelId: string
): Promise<string | null> {
  const rows = await db.queryTenant<{ project_id: string }>(
    tenantId,
    `SELECT project_id
     FROM slack_channel_project_mappings
     WHERE tenant_id = $1
       AND slack_team_id = $2
       AND slack_channel_id = $3
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId, slackTeamId, slackChannelId]
  );

  return rows[0]?.project_id ?? null;
}

async function loadCalendarMappedProjectId(
  tenantId: string,
  channelId: string
): Promise<string | null> {
  const rows = await db.queryTenant<{ project_id: string | null }>(
    tenantId,
    `SELECT project_id
     FROM google_calendar_installations
     WHERE tenant_id = $1
       AND webhook_channel_id = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId, channelId]
  );

  return readOptionalString(rows[0]?.project_id ?? null);
}

async function upsertSlackChannelProjectMapping(
  tenantId: string,
  input: { slackTeamId: string; slackChannelId: string; projectId: string }
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `INSERT INTO slack_channel_project_mappings
      (tenant_id, slack_team_id, slack_channel_id, project_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (tenant_id, slack_team_id, slack_channel_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       updated_at = NOW()`,
    [tenantId, input.slackTeamId, input.slackChannelId, input.projectId]
  );
}

async function handleTranscriptCanonicalEvent(
  tenantId: string,
  canonicalEvent: CanonicalEventRow
): Promise<void> {
  const transcriptPayload = canonicalEvent.payload as TranscriptCanonicalPayload;
  const meetingNoteId = readOptionalString(transcriptPayload.meetingNoteId);
  const transcript = readOptionalString(transcriptPayload.transcript);
  const submittedByUserId = readOptionalString(transcriptPayload.submittedByUserId);

  if (!meetingNoteId) {
    console.warn(`[canonical-event] transcript event ${canonicalEvent.id} missing meetingNoteId; skipping`);
    return;
  }
  if (!transcript) {
    console.warn(`[canonical-event] transcript event ${canonicalEvent.id} missing transcript text; skipping`);
    return;
  }

  const [meetingNote, existingEventIds] = await Promise.all([
    loadMeetingNote(tenantId, meetingNoteId),
    listLarryEventIdsBySource(db, tenantId, "meeting", meetingNoteId),
  ]);
  const resolvedProjectId =
    readOptionalString(transcriptPayload.projectId) ?? meetingNote?.project_id ?? null;

  if (existingEventIds.length > 0) {
    await reconcileMeetingNote(tenantId, meetingNoteId, existingEventIds.length, {
      projectId: resolvedProjectId,
    });
    if (meetingNote?.summary?.trim()) {
      await upsertMeetingAnalysisDocument({
        tenantId,
        meetingNoteId,
        projectId: resolvedProjectId,
        title: meetingNote?.title ?? null,
        summary: meetingNote.summary,
        canonicalEventId: canonicalEvent.id,
        createdByUserId: submittedByUserId,
      });
    }
    return;
  }

  if (!resolvedProjectId) {
    console.warn(
      `[canonical-event] transcript event ${canonicalEvent.id} has no resolvable project scope; skipping action generation`
    );
    return;
  }
  if (
    await shouldSkipArchivedProjectWrites({
      tenantId,
      canonicalEvent,
      projectId: resolvedProjectId,
    })
  ) {
    await reconcileMeetingNote(tenantId, meetingNoteId, 0, {
      projectId: resolvedProjectId,
    });
    return;
  }

  // Use the focused transcript extraction prompt (lightweight, fast) instead of
  // the full intelligence engine (massive prompt, slow, prone to timeout).
  const config = buildWorkerIntelligenceConfig();
  let extractedTasks: Array<{ title: string; description: string; priority: string; workstream: string | null; dueDate: string | null }> = [];
  let summary = "";

  // Fallback due dates when the model returns null (by priority)
  function inferDueDate(priority: string): string {
    const days = priority === "critical" ? 2 : priority === "high" ? 5 : priority === "medium" ? 10 : 21;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  try {
    const projectName = meetingNote?.title ?? "Project";
    const result = await generateBootstrapFromTranscript(config, {
      projectName,
      meetingTitle: meetingNote?.title ?? null,
      transcript,
    });
    extractedTasks = result.tasks.map((task) => ({
      ...task,
      dueDate: task.dueDate ?? inferDueDate(task.priority),
    }));
    summary = result.summary;
  } catch (aiError) {
    const reason = aiError instanceof Error ? aiError.message : String(aiError);
    console.error(
      `[canonical-event] transcript ${canonicalEvent.id} extraction failed (${reason}); saving meeting note without tasks`
    );
    await reconcileMeetingNote(tenantId, meetingNoteId, 0, {
      projectId: resolvedProjectId,
    });
    throw aiError instanceof Error
      ? aiError
      : new Error(`Transcript extraction failed: ${reason}`);
  }

  // Convert extracted tasks into suggested task_create actions
  const suggestedActions: LarryAction[] = extractedTasks.map((task) => ({
    type: "task_create" as const,
    displayText: `Create task: "${task.title}"`,
    reasoning: task.description,
    payload: {
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
    },
  }));

  await reconcileMeetingNote(tenantId, meetingNoteId, suggestedActions.length, {
    projectId: resolvedProjectId,
    summary,
  });

  await upsertMeetingAnalysisDocument({
    tenantId,
    meetingNoteId,
    projectId: resolvedProjectId,
    title: meetingNote?.title ?? null,
    summary,
    canonicalEventId: canonicalEvent.id,
    createdByUserId: submittedByUserId,
  });

  const ledgerContext = {
    requesterUserId: submittedByUserId,
    sourceKind: "meeting",
    sourceRecordId: meetingNoteId,
  } as const;

  await Promise.all([
    suggestedActions.length > 0
      ? storeSuggestions(
          db,
          tenantId,
          resolvedProjectId,
          "signal",
          suggestedActions,
          undefined,
          ledgerContext
        )
      : Promise.resolve(),
    Promise.resolve(
      insertProjectMemoryEntry(db, tenantId, resolvedProjectId, {
        source: "Meeting transcript",
        sourceKind: "meeting",
        sourceRecordId: meetingNoteId,
        content: buildMemorySummary("Meeting", summary),
      })
    ).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[canonical-event] transcript event ${canonicalEvent.id} failed to write project memory; continuing (${reason})`
      );
    }),
  ]);

  const finalEventIds = await listLarryEventIdsBySource(db, tenantId, "meeting", meetingNoteId);
  await reconcileMeetingNote(tenantId, meetingNoteId, finalEventIds.length, {
    projectId: resolvedProjectId,
    summary,
  });
}

async function handleEmailCanonicalEvent(
  tenantId: string,
  canonicalEvent: CanonicalEventRow
): Promise<void> {
  const emailPayload = canonicalEvent.payload as EmailCanonicalPayload;
  const projectId = readOptionalString(emailPayload.projectId);

  if (!projectId) {
    console.warn(
      `[canonical-event] email event ${canonicalEvent.id} missing projectId; skipping action generation`
    );
    return;
  }
  if (
    await shouldSkipArchivedProjectWrites({
      tenantId,
      canonicalEvent,
      projectId,
    })
  ) {
    return;
  }

  const existingEventIds = await listLarryEventIdsBySource(db, tenantId, "email", canonicalEvent.id);
  if (existingEventIds.length > 0) {
    return;
  }

  let snapshot;
  try {
    snapshot = await getProjectSnapshot(db, tenantId, projectId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[canonical-event] email event ${canonicalEvent.id} has invalid projectId ${projectId}; skipping (${reason})`
    );
    return;
  }

  const config = buildWorkerIntelligenceConfig();
  const intelligenceResult = await runIntelligence(config, snapshot, buildEmailPrompt(emailPayload));
  const ledgerContext = {
    sourceKind: "email",
    sourceRecordId: canonicalEvent.id,
  } as const;

  await Promise.all([
    runAutoActions(
      db,
      tenantId,
      projectId,
      "signal",
      intelligenceResult.autoActions,
      undefined,
      ledgerContext
    ),
    storeSuggestions(
      db,
      tenantId,
      projectId,
      "signal",
      intelligenceResult.suggestedActions,
      undefined,
      ledgerContext
    ),
    Promise.resolve(
      insertProjectMemoryEntry(db, tenantId, projectId, {
        source: "Email signal",
        sourceKind: "email",
        sourceRecordId: canonicalEvent.id,
        content: buildMemorySummary("Email", intelligenceResult.briefing),
      })
    ).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[canonical-event] email event ${canonicalEvent.id} failed to write project memory; continuing (${reason})`
      );
    }),
  ]);
}

async function handleCalendarCanonicalEvent(
  tenantId: string,
  canonicalEvent: CanonicalEventRow
): Promise<void> {
  const calendarPayload = canonicalEvent.payload as CalendarCanonicalPayload;
  const existingEventIds = await listLarryEventIdsBySource(db, tenantId, "calendar", canonicalEvent.id);
  if (existingEventIds.length > 0) {
    return;
  }

  const hintedProjectId = readCalendarProjectHint(calendarPayload);
  const calendarChannelId = readOptionalString(calendarPayload.channelId);
  let resolvedProjectId = hintedProjectId;
  if (!resolvedProjectId && calendarChannelId) {
    resolvedProjectId = await loadCalendarMappedProjectId(tenantId, calendarChannelId);
  }

  if (!resolvedProjectId) {
    console.warn(
      `[canonical-event] calendar event ${canonicalEvent.id} has no resolvable project scope; skipping action generation`
    );
    return;
  }
  if (
    await shouldSkipArchivedProjectWrites({
      tenantId,
      canonicalEvent,
      projectId: resolvedProjectId,
    })
  ) {
    return;
  }

  let snapshot;
  try {
    snapshot = await getProjectSnapshot(db, tenantId, resolvedProjectId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[canonical-event] calendar event ${canonicalEvent.id} has invalid project scope ${resolvedProjectId}; skipping (${reason})`
    );
    return;
  }

  const config = buildWorkerIntelligenceConfig();
  const intelligenceResult = await runIntelligence(config, snapshot, buildCalendarPrompt(calendarPayload));
  const ledgerContext = {
    sourceKind: "calendar",
    sourceRecordId: canonicalEvent.id,
  } as const;

  await Promise.all([
    runAutoActions(
      db,
      tenantId,
      resolvedProjectId,
      "signal",
      intelligenceResult.autoActions,
      undefined,
      ledgerContext
    ),
    storeSuggestions(
      db,
      tenantId,
      resolvedProjectId,
      "signal",
      intelligenceResult.suggestedActions,
      undefined,
      ledgerContext
    ),
    Promise.resolve(
      insertProjectMemoryEntry(db, tenantId, resolvedProjectId, {
        source: "Calendar signal",
        sourceKind: "calendar",
        sourceRecordId: canonicalEvent.id,
        content: buildMemorySummary("Calendar", intelligenceResult.briefing),
      })
    ).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[canonical-event] calendar event ${canonicalEvent.id} failed to write project memory; continuing (${reason})`
      );
    }),
  ]);
}

async function handleSlackCanonicalEvent(
  tenantId: string,
  canonicalEvent: CanonicalEventRow
): Promise<void> {
  const slackPayload = canonicalEvent.payload as SlackCanonicalPayload;
  const event = readOptionalRecord(slackPayload.event) as SlackEventPayload | null;
  const slackTeamId =
    readOptionalString(slackPayload.team_id) ?? readOptionalString(event?.team);
  const slackChannelId = readOptionalString(event?.channel);
  const hintedProjectId = readSlackProjectHint(slackPayload, event);

  const existingEventIds = await listLarryEventIdsBySource(db, tenantId, "slack", canonicalEvent.id);
  if (existingEventIds.length > 0) {
    return;
  }

  let resolvedProjectId: string | null = hintedProjectId;
  if (!resolvedProjectId && slackTeamId && slackChannelId) {
    resolvedProjectId = await loadSlackMappedProjectId(tenantId, slackTeamId, slackChannelId);
  }

  if (!resolvedProjectId) {
    console.warn(
      `[canonical-event] slack event ${canonicalEvent.id} has no resolvable project scope; skipping action generation`
    );
    return;
  }
  if (
    await shouldSkipArchivedProjectWrites({
      tenantId,
      canonicalEvent,
      projectId: resolvedProjectId,
    })
  ) {
    return;
  }

  let snapshot;
  try {
    snapshot = await getProjectSnapshot(db, tenantId, resolvedProjectId);
  } catch (error) {
    // A stale project hint should not block mapped channels from producing actions.
    if (hintedProjectId && slackTeamId && slackChannelId) {
      const mappedProjectId = await loadSlackMappedProjectId(tenantId, slackTeamId, slackChannelId);
      if (mappedProjectId && mappedProjectId !== resolvedProjectId) {
        try {
          snapshot = await getProjectSnapshot(db, tenantId, mappedProjectId);
          resolvedProjectId = mappedProjectId;
        } catch (fallbackError) {
          const fallbackReason =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          console.warn(
            `[canonical-event] slack event ${canonicalEvent.id} has invalid fallback project scope ${mappedProjectId}; skipping (${fallbackReason})`
          );
          return;
        }
      } else {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[canonical-event] slack event ${canonicalEvent.id} has invalid hinted project scope ${resolvedProjectId}; skipping (${reason})`
        );
        return;
      }
    } else {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[canonical-event] slack event ${canonicalEvent.id} has invalid project scope ${resolvedProjectId}; skipping (${reason})`
      );
      return;
    }
  }

  if (hintedProjectId && slackTeamId && slackChannelId && resolvedProjectId === hintedProjectId) {
    await upsertSlackChannelProjectMapping(tenantId, {
      slackTeamId,
      slackChannelId,
      projectId: hintedProjectId,
    }).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[canonical-event] slack event ${canonicalEvent.id} failed to upsert channel mapping; continuing (${reason})`
      );
    });
  }

  const config = buildWorkerIntelligenceConfig();
  const intelligenceResult = await runIntelligence(config, snapshot, buildSlackPrompt(slackPayload, event));
  const ledgerContext = {
    sourceKind: "slack",
    sourceRecordId: canonicalEvent.id,
  } as const;

  await Promise.all([
    runAutoActions(
      db,
      tenantId,
      resolvedProjectId,
      "signal",
      intelligenceResult.autoActions,
      undefined,
      ledgerContext
    ),
    storeSuggestions(
      db,
      tenantId,
      resolvedProjectId,
      "signal",
      intelligenceResult.suggestedActions,
      undefined,
      ledgerContext
    ),
    Promise.resolve(
      insertProjectMemoryEntry(db, tenantId, resolvedProjectId, {
        source: "Slack signal",
        sourceKind: "slack",
        sourceRecordId: canonicalEvent.id,
        content: buildMemorySummary("Slack", intelligenceResult.briefing),
      })
    ).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[canonical-event] slack event ${canonicalEvent.id} failed to write project memory; continuing (${reason})`
      );
    }),
  ]);
}

export async function handleCanonicalEventCreated(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const job = payload as Partial<CanonicalEventCreatedPayload>;
  if (!job.canonicalEventId || typeof job.canonicalEventId !== "string") {
    console.warn("[canonical-event] Missing canonicalEventId in queue payload");
    return;
  }

  const canonicalEvent = await loadCanonicalEvent(tenantId, job.canonicalEventId);
  if (!canonicalEvent) {
    console.warn(`[canonical-event] canonical event ${job.canonicalEventId} not found for tenant ${tenantId}`);
    return;
  }

  if (canonicalEvent.source === "transcript") {
    await handleTranscriptCanonicalEvent(tenantId, canonicalEvent);
    return;
  }

  if (canonicalEvent.source === "email") {
    await handleEmailCanonicalEvent(tenantId, canonicalEvent);
    return;
  }

  if (canonicalEvent.source === "calendar") {
    await handleCalendarCanonicalEvent(tenantId, canonicalEvent);
    return;
  }

  if (canonicalEvent.source === "slack") {
    await handleSlackCanonicalEvent(tenantId, canonicalEvent);
    return;
  }
}
