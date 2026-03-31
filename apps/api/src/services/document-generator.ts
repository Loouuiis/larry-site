import { Buffer } from "node:buffer";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  riskLevel: string;
}

interface ProjectTaskRow {
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  dueDate: string | null;
  progressPercent: number;
  riskLevel: string;
}

interface ProjectMeetingRow {
  title: string | null;
  summary: string | null;
  createdAt: string;
}

interface ProjectKpis {
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
  inProgressTasks: number;
}

function asDate(raw: string | null): string {
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export async function generateProjectStatusDocx(input: {
  project: ProjectSummary;
  tasks: ProjectTaskRow[];
  meetings: ProjectMeetingRow[];
}): Promise<Buffer> {
  const header = new Paragraph({
    children: [new TextRun({ text: `Project Status - ${input.project.name}`, bold: true, size: 30 })],
  });

  const overview = new Paragraph({
    children: [
      new TextRun({ text: `Status: ${input.project.status}` }),
      new TextRun({ text: ` | Risk: ${input.project.riskLevel}`, break: 1 }),
      new TextRun({ text: input.project.description?.trim() || "No description provided.", break: 1 }),
    ],
  });

  const taskTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ["Task", "Status", "Priority", "Assignee", "Due", "Progress", "Risk"].map(
          (label) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
            })
        ),
      }),
      ...input.tasks.slice(0, 25).map(
        (task) =>
          new TableRow({
            children: [
              task.title,
              task.status,
              task.priority,
              task.assignee ?? "-",
              asDate(task.dueDate),
              percent(task.progressPercent),
              task.riskLevel,
            ].map((value) =>
              new TableCell({ children: [new Paragraph(String(value))] })
            ),
          })
      ),
    ],
  });

  const meetingParagraphs =
    input.meetings.length > 0
      ? input.meetings.slice(0, 8).flatMap((meeting) => [
          new Paragraph({
            children: [new TextRun({ text: `${meeting.title ?? "Meeting"} (${asDate(meeting.createdAt)})`, bold: true })],
          }),
          new Paragraph(meeting.summary?.trim() || "No summary available."),
        ])
      : [new Paragraph("No recent meeting notes found.")];

  const document = new Document({
    sections: [
      {
        children: [
          header,
          new Paragraph(""),
          overview,
          new Paragraph(""),
          new Paragraph({ children: [new TextRun({ text: "Task Snapshot", bold: true, size: 24 })] }),
          taskTable,
          new Paragraph(""),
          new Paragraph({ children: [new TextRun({ text: "Recent Meetings", bold: true, size: 24 })] }),
          ...meetingParagraphs,
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

export async function generateTaskExportXlsx(input: { tasks: ProjectTaskRow[] }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tasks");

  sheet.columns = [
    { header: "Title", key: "title", width: 36 },
    { header: "Status", key: "status", width: 16 },
    { header: "Priority", key: "priority", width: 14 },
    { header: "Assignee", key: "assignee", width: 20 },
    { header: "Due Date", key: "dueDate", width: 14 },
    { header: "Progress", key: "progress", width: 12 },
    { header: "Risk Level", key: "riskLevel", width: 14 },
  ];

  for (const task of input.tasks) {
    sheet.addRow({
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee ?? "-",
      dueDate: asDate(task.dueDate),
      progress: percent(task.progressPercent),
      riskLevel: task.riskLevel,
    });
  }

  sheet.getRow(1).font = { bold: true };
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

export async function generateProjectBriefPptx(input: {
  project: ProjectSummary;
  tasks: ProjectTaskRow[];
  kpis: ProjectKpis;
}): Promise<Buffer> {
  const pptxModule = await import("pptxgenjs");
  const PptxConstructor = (pptxModule.default ?? pptxModule) as unknown as new () => {
    layout: string;
    addSlide: () => {
      addText: (text: string, options: Record<string, unknown>) => void;
    };
    write: (options: { outputType: "arraybuffer" }) => Promise<ArrayBuffer>;
  };
  const pptx = new PptxConstructor();
  pptx.layout = "LAYOUT_WIDE";

  const titleSlide = pptx.addSlide();
  titleSlide.addText(input.project.name, { x: 0.6, y: 1.2, w: 12.0, h: 0.8, fontSize: 32, bold: true });
  titleSlide.addText("Project Brief", { x: 0.6, y: 2.2, w: 8.0, h: 0.5, fontSize: 18, color: "4B5563" });

  const overviewSlide = pptx.addSlide();
  overviewSlide.addText("Project Overview", { x: 0.5, y: 0.4, w: 12.2, h: 0.5, fontSize: 24, bold: true });
  overviewSlide.addText(
    `Status: ${input.project.status}\nRisk: ${input.project.riskLevel}\n\n${input.project.description ?? "No description provided."}`,
    { x: 0.7, y: 1.1, w: 11.8, h: 3.8, fontSize: 16, valign: "top" }
  );

  const statusSlide = pptx.addSlide();
  statusSlide.addText("Task Status Summary", { x: 0.5, y: 0.4, w: 12.2, h: 0.5, fontSize: 24, bold: true });
  const topTasks = input.tasks.slice(0, 8).map((task) => `${task.title} - ${task.status} (${percent(task.progressPercent)})`);
  statusSlide.addText(topTasks.length > 0 ? topTasks.join("\n") : "No tasks available.", {
    x: 0.7,
    y: 1.1,
    w: 11.8,
    h: 4.6,
    fontSize: 14,
    valign: "top",
  });

  const kpiSlide = pptx.addSlide();
  kpiSlide.addText("Key Metrics", { x: 0.5, y: 0.4, w: 12.2, h: 0.5, fontSize: 24, bold: true });
  const lines = [
    `Total tasks: ${input.kpis.totalTasks}`,
    `Completed: ${input.kpis.completedTasks}`,
    `In progress: ${input.kpis.inProgressTasks}`,
    `Blocked: ${input.kpis.blockedTasks}`,
  ];
  kpiSlide.addText(lines.join("\n"), { x: 0.7, y: 1.3, w: 8.0, h: 3.0, fontSize: 20, bold: true });

  const data = await pptx.write({ outputType: "arraybuffer" });
  return Buffer.from(data as ArrayBuffer);
}
