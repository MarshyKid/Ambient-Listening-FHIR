import type { IntakeSummary } from "../types";

export function sortIntakesNewestFirst(intakes: IntakeSummary[]): IntakeSummary[] {
  return [...intakes].sort((left, right) => authoredTimestamp(right) - authoredTimestamp(left));
}

export function authoredTimestamp(intake: IntakeSummary): number {
  if (!intake.authored) return 0;
  const timestamp = new Date(intake.authored).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function isToday(authored: string | null | undefined): boolean {
  if (!authored) return false;
  const date = new Date(authored);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function formatAuthoredDateTime(authored: string | null | undefined): string {
  if (!authored) return "Not recorded";
  const date = new Date(authored);
  if (Number.isNaN(date.getTime())) return authored;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatRelativeAuthored(authored: string | null | undefined): string {
  if (!authored) return "Not recorded";
  const date = new Date(authored);
  if (Number.isNaN(date.getTime())) return authored;

  const elapsedMs = Date.now() - date.getTime();
  if (elapsedMs < 0) return formatAuthoredDateTime(authored);

  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;
  if (isToday(authored)) return "Today";

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays} days ago`;

  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

export function normalizedStatus(status: string | null | undefined): string {
  return String(status || "unknown").trim().toLowerCase().replace(/\s+/g, "-");
}

export function statusClass(status: string | null | undefined): string {
  const normalized = normalizedStatus(status);
  if (normalized === "completed") return "done";
  if (normalized === "in-progress") return "progress";
  return "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  const normalized = normalizedStatus(status);
  if (normalized === "completed") return "Completed";
  if (normalized === "in-progress") return "In progress";
  if (normalized === "unknown") return "Unknown";
  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
