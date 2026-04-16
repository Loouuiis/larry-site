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
          <span className={SPAN_CLASS}>Due date</span>
          <input
            type="date"
            value={str(payload.dueDate)}
            onChange={(e) => onPatch({ dueDate: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
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
      </div>
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

// Keys are canonical DB action_type values (LarryActionType), not chat tool names.
const FIELDS_BY_TYPE: Record<string, (props: FieldsProps) => ReactElement> = {
  task_create: CreateTaskFields,
  deadline_change: ChangeDeadlineFields,
  owner_change: ChangeTaskOwnerFields,
  status_update: UpdateTaskStatusFields,
  risk_flag: FlagTaskRiskFields,
  email_draft: DraftEmailFields,
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
