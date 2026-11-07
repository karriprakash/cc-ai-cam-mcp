import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpModule } from "../_shared/types.js";
import { callApi, fail, ok } from "../_shared/result.js";

// TrustAdda: honesty-based self-checkout for hanging sachet points, vending
// kiosks and kirana shops. Residents browse, pick, and pay the owner by UPI.
// Only the public resident API is used here; admin routes need a session.

const api = () => process.env.TRUSTADDA_API_URL || "https://trustadda.com";

interface Item { id: number; name: string; category: string; price: number; quantity: number; storeId?: string }
interface Store { id: string; name: string; type: string; location: string; upiId: string; isOpen: boolean; tagline?: string }

const cartLines = z.array(z.object({ itemId: z.number().int(), qty: z.number().int().min(1) })).min(1);

export function upiLink(upiId: string, payeeName: string, amount: number, note?: string): string {
  const p = new URLSearchParams({ pa: upiId, pn: payeeName, am: amount.toFixed(2), cu: "INR" });
  if (note) p.set("tn", note.slice(0, 50));
  return `upi://pay?${p.toString()}`;
}

async function buildCart(storeId: string, lines: Array<{ itemId: number; qty: number }>) {
  const [storesRes, itemsRes] = await Promise.all([
    callApi(api(), "/api/stores"),
    callApi(api(), `/api/items?storeId=${encodeURIComponent(storeId)}`),
  ]);
  if (!storesRes.ok) return { error: storesRes.error };
  if (!itemsRes.ok) return { error: itemsRes.error };
  const store = (storesRes.data as Store[]).find((s) => s.id === storeId);
  if (!store) return { error: `No store with id "${storeId}". Call list_stores first.` };
  const items = itemsRes.data as Item[];
  const problems: string[] = [];
  const orderItems = [];
  for (const line of lines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) { problems.push(`Item ${line.itemId} is not sold at ${store.name}.`); continue; }
    if (item.quantity < line.qty) problems.push(`Only ${item.quantity} × ${item.name} left (asked for ${line.qty}).`);
    orderItems.push({ itemId: item.id, name: item.name, price: item.price, quantity: line.qty });
  }
  // Prices come from the server, never from the caller.
  const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  return { store, orderItems, total, problems };
}

function createServer(): McpServer {
  const server = new McpServer({ name: "trustadda-mcp", version: "0.1.0" });

  server.registerTool("list_stores", {
    title: "List TrustAdda stores",
    description: "List store points (hanging sachet points, vending kiosks, kirana shops) with location, open status and UPI ID.",
    inputSchema: {},
  }, async () => {
    const r = await callApi(api(), "/api/stores");
    return r.ok ? ok(r.data) : fail(r.error);
  });

  server.registerTool("search_items", {
    title: "Search items",
    description: "Search the catalog. Prices are in rupees; quantity is live stock.",
    inputSchema: {
      search: z.string().optional().describe("Text to match in item names"),
      category: z.string().optional().describe("e.g. Laundry, Personal Care, Beverages, Snacks, Kirana, Medicine"),
      storeId: z.string().optional().describe("Limit to one store (id from list_stores)"),
    },
  }, async ({ search, category, storeId }) => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (category) q.set("category", category);
    if (storeId) q.set("storeId", storeId);
    const r = await callApi(api(), `/api/items?${q}`);
    if (!r.ok) return fail(r.error);
    const items = (r.data as Item[]).map(({ id, name, category, price, quantity, storeId }) => ({ id, name, category, price, inStock: quantity, storeId }));
    return ok(items);
  });

  server.registerTool("build_cart", {
    title: "Price a cart",
    description: "Price a cart using live server prices, check stock, and return the UPI payment link for the store owner. Does not place an order.",
    inputSchema: { storeId: z.string(), lines: cartLines },
  }, async ({ storeId, lines }) => {
    const c = await buildCart(storeId, lines);
    if ("error" in c) return fail(c.error as string);
    return ok({
      store: c.store.name, items: c.orderItems, totalRupees: c.total, problems: c.problems,
      payTo: c.store.upiId, upiLink: upiLink(c.store.upiId, c.store.name, c.total, "TrustAdda order"),
    });
  });

  server.registerTool("place_order", {
    title: "Place order",
    description: "Record a self-checkout order (decrements stock). Call build_cart first and only place the order after the customer confirms the total.",
    inputSchema: {
      storeId: z.string(),
      lines: cartLines,
      paymentMethod: z.enum(["UPI_QR", "TRUST_LATER"]).default("UPI_QR"),
      customerName: z.string().max(60).optional(),
    },
  }, async ({ storeId, lines, paymentMethod, customerName }) => {
    const c = await buildCart(storeId, lines);
    if ("error" in c) return fail(c.error as string);
    if (c.problems.length) return fail(`Not placed: ${c.problems.join(" ")}`);
    const r = await callApi(api(), "/api/orders", {
      method: "POST",
      body: { storeId, storeName: c.store.name, items: c.orderItems, totalAmount: c.total, paymentMethod, customerName },
    });
    if (!r.ok) return fail(r.error);
    return ok({ order: r.data, upiLink: upiLink(c.store.upiId, c.store.name, c.total, "TrustAdda order") });
  });

  server.registerTool("upi_payment_link", {
    title: "UPI payment link",
    description: "Build a standard upi://pay deep link (works with any UPI app or as a QR code).",
    inputSchema: {
      upiId: z.string().regex(/^[\w.\-]+@[\w.\-]+$/, "UPI IDs look like name@bank"),
      payeeName: z.string(),
      amount: z.number().positive(),
      note: z.string().optional(),
    },
  }, async ({ upiId, payeeName, amount, note }) => ok(upiLink(upiId, payeeName, amount, note)));

  server.registerTool("request_refill", {
    title: "Request refill",
    description: "Tell the store owner a point is running low.",
    inputSchema: { location: z.string().describe("Store point name or location") },
  }, async ({ location }) => {
    const r = await callApi(api(), "/api/refill", { method: "POST", body: { location } });
    return r.ok ? ok(r.data) : fail(r.error);
  });

  server.registerTool("send_feedback", {
    title: "Send feedback",
    description: "Send a suggestion, issue or idea to the TrustAdda team.",
    inputSchema: {
      message: z.string().min(1),
      category: z.enum(["suggestion", "issue", "idea"]).optional(),
      userName: z.string().optional(),
    },
  }, async (body) => {
    const r = await callApi(api(), "/api/feedback", { method: "POST", body });
    return r.ok ? ok(r.data) : fail(r.error);
  });

  server.registerTool("partner_inquiry", {
    title: "Partner inquiry",
    description: "Ask to set up a vending machine, sachet stand or digital kirana. The phone number is shared with the TrustAdda team only.",
    inputSchema: {
      name: z.string(), phone: z.string(), location: z.string(),
      setupType: z.enum(["vending_machine", "sachet_stand", "kirana_digital"]).default("vending_machine"),
      notes: z.string().optional(),
    },
  }, async (body) => {
    const r = await callApi(api(), "/api/machine-inquiries", { method: "POST", body });
    return r.ok ? ok(r.data) : fail(r.error);
  });

  return server;
}

const mod: McpModule = {
  slug: "trustadda",
  title: "TrustAdda",
  description: "Honesty self-checkout for sachet points, vending kiosks and kirana shops: browse, price a cart, pay by UPI, request refills.",
  env: { TRUSTADDA_API_URL: "TrustAdda server base URL (default https://trustadda.com)" },
  createServer,
  examples: [{ tool: "upi_payment_link", args: { upiId: "shop@ybl", payeeName: "Sri Sai Kirana", amount: 24, note: "2 sachets" } }],
};
export default mod;
