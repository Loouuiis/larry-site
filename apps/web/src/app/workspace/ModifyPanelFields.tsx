"use client";

// Per-action-type field renderers for the Modify panel.
// Spec: docs/superpowers/specs/2026-04-15-modify-action-design.md

import type { ReactElement } from "react";
import type { ModifySnapshot } from "@/hooks/useModifyPanel";

export interface FieldsProps {
  snapshot: ModifySnapshot;
  payload: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}

const INPUT_CLASS =
  "w-full rounded border border-neutral-300 px-2 py-1 text-sm focus:border-[#6c44f6] focus:outline-none focus:ring-1 focus:ring-[#6c44f6]";
const LABEL_CLASS = "flex flex-col gap-1 text-sm";
const SPAN_CLASS = "font-medium text-neutral-700";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function TeamSelect({
  value,
  onChange,
  members,
  placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  members: ModifySnapshot["teamMembers"];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLASS}
    >
      <option value="">{placeholder}</option>
      {members.map((m) => (
        <option key={m.userId} value={m.displayName}>
          {m.displayName}
        </option>
      ))}
    </select>
  );
}

function CreateTaskFields({ snapshot, payload, onPatch }: FieldsProps) {
  return (
    <div className="space-y-3">
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Title</span>
        <input
          type="text"
          value={str(payload.title)}
          onChange={(e) => onPatch({ title: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Description</span>
        <textarea
          value={str(payload.description)}
          onChange={(e) => onPatch({ description: e.target.value })}
          rows={3}
          className={INPUT_CLASS}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>Start date</span>
          <input
            type="date"
            value={str(payload.startDate)}
            onChange={(e) => onPatch({ startDate: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>Due date</span>
          <input
            type="date"
            value={str(payload.dueDate)}
            onChange={(e) => onPatch({ dueDate: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>Priority</span>
          <select
            value={str(payload.priority) || "medium"}
            onChange={(e) => onPatch({ priority: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>Assignee</span>
          <TeamSelect
            value={str(payload.assigneeName)}
            onChange={(name) => onPatch({ assigneeName: name })}
            members={snapshot.teamMembers}
            placeholder="(unassigned)"
          />
        </label>
      </div>
    </div>
  );
}

function ChangeDeadlineFields({ payload, onPatch }: FieldsProps) {
  return (
    <label className={LABEL_CLASS}>
      <span className={SPAN_CLASS}>New deadline</span>
      <input
        type="date"
        value={str(payload.newDeadline)}
        onChange={(e) => onPatch({ newDeadline: e.target.value })}
        className={INPUT_CLASS}
      />
    </label>
  );
}

function ChangeTaskOwnerFields({ snapshot, payload, onPatch }: FieldsProps) {
  return (
    <label className={LABEL_CLASS}>
      <span className={SPAN_CLASS}>New owner</span>
      <TeamSelect
        value={str(payload.newOwnerName)}
        onChange={(name) => onPatch({ newOwnerName: name })}
        members={snapshot.teamMembers}
        placeholder="(no owner)"
      />
    </label>
  );
}

function UpdateTaskStatusFields({ payload, onPatch }: FieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>New status</span>
        <select
          value={str(payload.newStatus) || "not_started"}
          onChange={(e) => onPatch({ newStatus: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="backlog">Backlog</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="waiting">Waiting</option>
          <option value="blocked">Blocked</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Risk level</span>
        <select
          value={str(payload.newRiskLevel) || "low"}
          onChange={(e) => onPatch({ newRiskLevel: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
    </div>
  );
}

function FlagTaskRiskFields({ payload, onPatch }: FieldsProps) {
  return (
    <label className={LABEL_CLASS}>
      <span className={SPAN_CLASS}>Risk level</span>
      <select
        value={str(payload.riskLevel) || "low"}
        onChange={(e) => onPatch({ riskLevel: e.target.value })}
        className={INPUT_CLASS}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}

function DraftEmailFields({ payload, onPatch }: FieldsProps) {
  return (
    <div className="space-y-3">
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>To</span>
        <input
          type="text"
          value={str(payload.to)}
          onChange={(e) => onPatch({ to: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Subject</span>
        <input
          type="text"
          value={str(payload.subject)}
          onChange={(e) => onPatch({ subject: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Body</span>
        <textarea
          value={str(payload.body)}
          onChange={(e) => onPatch({ body: e.target.value })}
          rows={6}
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}

function ChangeScopeFields({ payload, onPatch }: FieldsProps) {
  return (
    <label className={LABEL_CLASS}>
      <span className={SPAN_CLASS}>New description</span>
      <textarea
        value={str(payload.newDescription)}
        onChange={(e) => onPatch({ newDescription: e.target.value })}
        rows={4}
        className={INPUT_CLASS}
      />
    </label>
  );
}

function CreateProjectFields({ payload, onPatch }: FieldsProps) {
  const tasks = Array.isArray(payload.tasks) ? (payload.tasks as Array<Record<string, unknown>>) : [];
  return (
    <div className="space-y-3">
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Project name</span>
        <input
          type="text"
          value={str(payload.name)}
          onChange={(e) => onPatch({ name: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Description</span>
        <textarea
          value={str(payload.description)}
          onChange={(e) => onPatch({ description: e.target.value })}
          rows={4}
          className={INPUT_CLASS}
        />
      </label>
      {tasks.length > 0 && (
        <div className="space-y-1">
          <span className={SPAN_CLASS}>Seed tasks (read-only)</span>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-neutral-600">
            {tasks.map((t, i) => (
              <li key={i}>{str(t.title) || `Task ${i + 1}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <select
      value={value || "viewer"}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLASS}
    >
      <option value="owner">Admin</option>
      <option value="editor">PM</option>
      <option value="viewer">Member</option>
    </select>
  );
}

function AddCollaboratorFields({ payload, onPatch }: FieldsProps) {
  const displayName = str(payload.displayName) || str(payload.userId) || "(unknown)";
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className={SPAN_CLASS}>Collaborator</span>
        <p className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-700">
          {displayName}
        </p>
      </div>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Role</span>
        <RoleSelect value={str(payload.role)} onChange={(role) => onPatch({ role })} />
      </label>
    </div>
  );
}

function UpdateCollaboratorRoleFields({ payload, onPatch }: FieldsProps) {
  const userLabel = str(payload.displayName) || str(payload.userId) || "(unknown)";
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className={SPAN_CLASS}>User</span>
        <p className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-700">
          {userLabel}
        </p>
      </div>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>New role</span>
        <RoleSelect value={str(payload.role)} onChange={(role) => onPatch({ role })} />
      </label>
    </div>
  );
}

function RemoveCollaboratorNoopFields({ payload }: FieldsProps) {
  const userLabel = str(payload.displayName) || str(payload.userId) || "(unknown)";
  return (
    <div className="space-y-2 text-sm text-neutral-600">
      <p>
        Removing <span className="font-medium text-neutral-800">{userLabel}</span> from this
        project. There&apos;s nothing to edit on this action — use{" "}
        <span className="font-medium">Accept</span> to remove them, or{" "}
        <span className="font-medium">Dismiss</span> to discard the suggestion.
      </p>
    </div>
  );
}

function ProjectNoteFields({ payload, onPatch }: FieldsProps) {
  return (
    <div className="space-y-3">
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Visibility</span>
        <select
          value={str(payload.visibility) || "shared"}
          onChange={(e) => onPatch({ visibility: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="shared">Shared (whole project)</option>
          <option value="personal">Personal (single recipient)</option>
        </select>
      </label>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Content</span>
        <textarea
          value={str(payload.content)}
          onChange={(e) => onPatch({ content: e.target.value })}
          rows={5}
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}

// Convert an ISO datetime string (with or without TZ) to a value that
// <input type="datetime-local"> accepts: "YYYY-MM-DDTHH:mm" in local time.
function toDatetimeLocal(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// Convert a "YYYY-MM-DDTHH:mm" local string back to an ISO string with timezone
// offset, suitable for the calendar executor (Google/Outlook accept RFC3339).
function fromDatetimeLocal(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

function CreateCalendarEventFields({ payload, onPatch }: FieldsProps) {
  return (
    <div className="space-y-3">
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Summary</span>
        <input
          type="text"
          value={str(payload.summary)}
          onChange={(e) => onPatch({ summary: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>Start</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(payload.startDateTime)}
            onChange={(e) => onPatch({ startDateTime: fromDatetimeLocal(e.target.value) })}
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>End</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(payload.endDateTime)}
            onChange={(e) => onPatch({ endDateTime: fromDatetimeLocal(e.target.value) })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
    </div>
  );
}

function UpdateCalendarEventFields({ payload, onPatch }: FieldsProps) {
  const eventId = str(payload.eventId) || "(no eventId)";
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className={SPAN_CLASS}>Calendar event</span>
        <p className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs text-neutral-700">
          {eventId}
        </p>
      </div>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Summary</span>
        <input
          type="text"
          value={str(payload.summary)}
          onChange={(e) => onPatch({ summary: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>Start</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(payload.startDateTime)}
            onChange={(e) => onPatch({ startDateTime: fromDatetimeLocal(e.target.value) })}
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          <span className={SPAN_CLASS}>End</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(payload.endDateTime)}
            onChange={(e) => onPatch({ endDateTime: fromDatetimeLocal(e.target.value) })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
    </div>
  );
}

function DraftSlackMessageFields({ payload, onPatch }: FieldsProps) {
  return (
    <div className="space-y-3">
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Channel</span>
        <input
          type="text"
          value={str(payload.channelName)}
          onChange={(e) => onPatch({ channelName: e.target.value })}
          placeholder="#general"
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        <span className={SPAN_CLASS}>Message</span>
        <textarea
          value={str(payload.message)}
          onChange={(e) => onPatch({ message: e.target.value })}
          rows={5}
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}

// Keys are canonical DB action_type values (LarryActionType), not chat tool names.
const FIELDS_BY_TYPE: Record<string, (props: FieldsProps) => ReactElement> = {
  task_create: CreateTaskFields,
  deadline_change: ChangeDeadlineFields,
  owner_change: ChangeTaskOwnerFields,
  status_update: UpdateTaskStatusFields,
  risk_flag: FlagTaskRiskFields,
  email_draft: DraftEmailFields,
  scope_change: ChangeScopeFields,
  project_create: CreateProjectFields,
  collaborator_add: AddCollaboratorFields,
  collaborator_role_update: UpdateCollaboratorRoleFields,
  collaborator_remove: RemoveCollaboratorNoopFields,
  project_note_send: ProjectNoteFields,
  calendar_event_create: CreateCalendarEventFields,
  calendar_event_update: UpdateCalendarEventFields,
  slack_message_draft: DraftSlackMessageFields,
};

export function ModifyPanelFields(props: FieldsProps) {
  const Renderer = FIELDS_BY_TYPE[props.snapshot.actionType];
  if (!Renderer) {
    return (
      <p className="text-sm text-neutral-500">
        This action type doesn't have quick-edit fields. Tell Larry what to change using
        the chat below.
      </p>
    );
  }
  return <Renderer {...props} />;
}
