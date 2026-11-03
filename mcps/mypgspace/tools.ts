import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpModule } from "../_shared/types.js";
import { callApi, fail, ok } from "../_shared/result.js";

// MyPGspace: PG & hostel management for owners and tenants. Pure tools encode
// the product rules (30-day notice, rent status, occupancy); API tools talk to
// the MyPGspace backend with the caller's JWT from the environment.

const api = () => process.env.MYPGSPACE_API_URL;
const token = () => process.env.MYPGSPACE_TOKEN;
const NOTICE_DAYS = 30;
const DUE_SOON_DAYS = 5;
const DAY = 86_400_000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => toDate(fmt(new Date()));

export function noticeCheck(vacatingDate: string, noticeDate?: string) {
  const notice = noticeDate ? toDate(noticeDate) : todayUtc();
  const earliest = new Date(notice.getTime() + NOTICE_DAYS * DAY);
  const vacate = toDate(vacatingDate);
  const valid = vacate.getTime() >= earliest.getTime();
  return {
    valid,
    noticeDate: fmt(notice),
    earliestVacatingDate: fmt(earliest),
    message: valid
      ? `OK: ${vacatingDate} is at least ${NOTICE_DAYS} days after the notice.`
      : `Too early: with notice on ${fmt(notice)} the earliest vacating date is ${fmt(earliest)}.`,
  };
}

export function rentStatus(dueDay: number, lastPaidMonth: string | undefined, today: Date) {
  const month = today.toISOString().slice(0, 7);
  if (lastPaidMonth && lastPaidMonth >= month) return { status: "Paid", month };
  const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dueDay));
  const days = Math.round((due.getTime() - today.getTime()) / DAY);
  if (days < 0) return { status: "Overdue", month, dueDate: fmt(due), daysLate: -days };
  if (days <= DUE_SOON_DAYS) return { status: "Due Soon", month, dueDate: fmt(due), daysLeft: days };
  return { status: "Upcoming", month, dueDate: fmt(due), daysLeft: days };
}

const roomSchema = z.object({
  roomNumber: z.string(),
  sharingType: z.number().int().min(1),
  rentPerBed: z.number().min(0),
  beds: z.array(z.object({ bedCode: z.string(), status: z.enum(["occupied", "vacant"]) })),
});

async function authed(path: string, method = "GET", body?: unknown) {
  if (!token()) return fail("MYPGSPACE_TOKEN is not set. Log in to MyPGspace and put the JWT in the env, not in the chat.");
  const r = await callApi(api(), path, { method, body, token: token() });
  return r.ok ? ok(r.data) : fail(r.error);
}

function createServer(): McpServer {
  const server = new McpServer({ name: "mypgspace-mcp", version: "0.1.0" });

  server.registerTool("notice_period_check", {
    title: "Notice period check",
    description: `Check a tenant's vacating date against the ${NOTICE_DAYS}-day notice rule and give the earliest allowed date.`,
    inputSchema: { vacatingDate: isoDate, noticeDate: isoDate.optional().describe("Defaults to today") },
  }, async ({ vacatingDate, noticeDate }) => ok(noticeCheck(vacatingDate, noticeDate)));

  server.registerTool("rent_status", {
    title: "Rent status",
    description: `Classify this month's rent as Paid, Due Soon (within ${DUE_SOON_DAYS} days), Overdue or Upcoming.`,
    inputSchema: {
      dueDay: z.number().int().min(1).max(28).describe("Day of month rent is due"),
      lastPaidMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Latest month paid, YYYY-MM"),
      today: isoDate.optional(),
    },
  }, async ({ dueDay, lastPaidMonth, today }) => ok(rentStatus(dueDay, lastPaidMonth, today ? toDate(today) : todayUtc())));

  server.registerTool("occupancy_summary", {
    title: "Occupancy summary",
    description: "Summarize beds by floor (first digit of the room number): occupied, vacant, and monthly rent lost to vacancies.",
    inputSchema: { rooms: z.array(roomSchema).min(1) },
  }, async ({ rooms }) => {
    const floors: Record<string, { occupied: number; vacant: number; vacantBeds: string[]; rentLost: number }> = {};
    for (const room of rooms) {
      const floor = room.roomNumber.match(/\d/)?.[0] ?? "?";
      const f = (floors[floor] ??= { occupied: 0, vacant: 0, vacantBeds: [], rentLost: 0 });
      for (const bed of room.beds) {
        if (bed.status === "occupied") f.occupied++;
        else { f.vacant++; f.vacantBeds.push(bed.bedCode); f.rentLost += room.rentPerBed; }
      }
    }
    const totals = Object.values(floors).reduce((t, f) => ({ occupied: t.occupied + f.occupied, vacant: t.vacant + f.vacant, rentLost: t.rentLost + f.rentLost }), { occupied: 0, vacant: 0, rentLost: 0 });
    const beds = totals.occupied + totals.vacant;
    return ok({ floors, totals: { ...totals, occupancyPct: beds ? Math.round((totals.occupied / beds) * 100) : 0 } });
  });

  server.registerTool("list_rooms", { title: "List rooms", description: "Rooms and bed status from MyPGspace.", inputSchema: {} },
    async () => authed("/api/rooms"));

  server.registerTool("list_tenants", { title: "List tenants", description: "Tenants from MyPGspace (owner token).", inputSchema: {} },
    async () => authed("/api/tenants"));

  server.registerTool("owner_stats", { title: "Owner dashboard stats", description: "Owner dashboard numbers (owner token).", inputSchema: {} },
    async () => authed("/api/stats/owner"));

  server.registerTool("list_complaints", { title: "List complaints", description: "All complaints for the property (owner token). Anonymous complaints come without the tenant's name or phone.", inputSchema: {} },
    async () => authed("/api/complaints"));

  server.registerTool("raise_complaint", {
    title: "Raise complaint",
    description: "Raise a complaint as the logged-in tenant. Set isAnonymous to hide the tenant's name and phone from the owner.",
    inputSchema: {
      category: z.string().describe("e.g. Plumbing, Electrical, Food, Cleaning, Wi-Fi, Safety"),
      description: z.string().min(5),
      isAnonymous: z.boolean().default(false),
    },
  }, async (body) => authed("/api/complaints", "POST", body));

  return server;
}

const mod: McpModule = {
  slug: "mypgspace",
  title: "MyPGspace",
  description: "PG & hostel management: notice-period and rent rules, occupancy by floor, rooms, tenants and anonymous complaints.",
  env: {
    MYPGSPACE_API_URL: "MyPGspace backend base URL, e.g. http://localhost:5000",
    MYPGSPACE_TOKEN: "JWT from POST /api/auth/login (owner or tenant)",
  },
  createServer,
  examples: [
    { tool: "notice_period_check", args: { noticeDate: "2026-11-01", vacatingDate: "2026-11-20" } },
    { tool: "rent_status", args: { dueDay: 5, lastPaidMonth: "2026-10", today: "2026-11-03" } },
    { tool: "occupancy_summary", args: { rooms: [
      { roomNumber: "101", sharingType: 2, rentPerBed: 6500, beds: [{ bedCode: "101A", status: "occupied" }, { bedCode: "101B", status: "vacant" }] },
      { roomNumber: "201", sharingType: 1, rentPerBed: 9000, beds: [{ bedCode: "201A", status: "occupied" }] },
    ] } },
  ],
};
export default mod;
