const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function readDetail(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return typeof data?.detail === "string" ? data.detail : fallback;
  } catch {
    return fallback;
  }
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: OrderFile[];
}

export type ProjectPath = "design" | "direct" | "source";

export interface Proposal {
  /** Set when the chat ran through a freelancer's bot, so the order is credited to them. */
  bot_token?: string;
  project_path?: ProjectPath;
  source_url?: string;
  source_type?: "github" | "zip";
  source_file?: OrderFile;
  type: "proposal";
  projectName: string;
  summary: string;
  features: string[];
  tech: string;
  days: number;
  price: number;
  priceLabel: string;
  mode?: ChatMode;
}

export interface LeadAnalysis {
  project_type: string;
  project_goal: string;
  budget_level: string;
  budget_fit: "low" | "fit" | "high";
  recommended_solution: string;
  recommended_stack: string;
  estimated_price_range: string;
  estimated_timeline: string;
  client_risk_level: string;
  lead_score: number;
  client_message: string;
  admin_summary: string;
  missing_questions: string[];
}

export interface AISettingsResponse {
  settings: Record<string, unknown>;
}

export interface Order {
  id: string;
  customer_id: string | null;
  project_name: string;
  summary: string;
  chat_history: Message[];
  features: string[];
  tech_stack: string;
  delivery_days: number;
  price_estimate: number;
  price_label: string;
  order_files: OrderFile[];
  mode?: ChatMode;
  final_price: number | null;
  payment_percentage: number | null;
  payment_amount: number | null;
  proposal_file: string | null;
  admin_note: string | null;
  ai_summary: string | null;
  milestones: { id: string; title: string; amount: number; status: "pending" | "paid" }[];
  status: "pending_review" | "approved" | "awaiting_payment" | "paid" | "cancelled";
  paid_at: string | null;
  created_at: string;
}

export interface OrderFile {
  id: string;
  name: string;
  url: string;
  size: number;
  content_type: string | null;
  uploaded_by: "admin" | "customer" | string;
  uploaded_at: string;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  business_type: string | null;
}

export interface FreelancerSession {
  access_token: string;
  freelancer_id: string;
  name: string | null;
  onboarding_completed: boolean;
  bot_token: string;
}

// ── Unified session ─────────────────────────────────────────────────────────
// One sign-in returns a token for every panel the person may open.

export type Role = "customer" | "freelancer" | "admin";

export interface Session {
  roles: Role[];
  customer?: { access_token: string; customer_id: string; first_name: string | null } | null;
  freelancer?: FreelancerSession | null;
  admin_token?: string | null;
  needs_phone?: boolean;
}

export const PANELS: Record<Role, { label: string; href: string; tokenKey: string }> = {
  customer: { label: "پنل مشتری", href: "/account", tokenKey: "customer_token" },
  freelancer: { label: "پنل فریلنسر", href: "/freelancer/dashboard", tokenKey: "freelancer_token" },
  admin: { label: "پنل ادمین", href: "/admin/dashboard", tokenKey: "admin_token" },
};

const SESSION_KEYS = [
  "customer_token", "customer_id", "customer_first_name",
  "freelancer_token", "freelancer_id", "freelancer_bot_token", "freelancer_name",
  "admin_token",
];

export function clearSession() {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

/** Replaces whatever account was signed in with this session's panels. */
export function saveSession(session: Session) {
  clearSession();
  if (session.customer) {
    localStorage.setItem("customer_token", session.customer.access_token);
    localStorage.setItem("customer_id", session.customer.customer_id);
    if (session.customer.first_name) localStorage.setItem("customer_first_name", session.customer.first_name);
  }
  if (session.freelancer) {
    localStorage.setItem("freelancer_token", session.freelancer.access_token);
    localStorage.setItem("freelancer_id", session.freelancer.freelancer_id);
    localStorage.setItem("freelancer_bot_token", session.freelancer.bot_token);
    if (session.freelancer.name) localStorage.setItem("freelancer_name", session.freelancer.name);
  }
  if (session.admin_token) localStorage.setItem("admin_token", session.admin_token);
}

export function signedInRoles(): Role[] {
  return (Object.keys(PANELS) as Role[]).filter((role) => localStorage.getItem(PANELS[role].tokenKey));
}

/** Where a role lands after sign-in; a freelancer who has not finished setup goes to onboarding. */
export function panelHref(role: Role, session?: Session) {
  if (role === "freelancer" && session?.freelancer && !session.freelancer.onboarding_completed) return "/freelancer/onboarding";
  return PANELS[role].href;
}

export async function passwordLogin(identifier: string, password: string): Promise<Session> {
  const res = await fetch(`${API_URL}/api/auth/password-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(await readDetail(res, "ایمیل یا رمز عبور اشتباه است"));
  return res.json();
}

export async function linkFreelancerPhone(freelancerToken: string, phone: string, code: string): Promise<Session> {
  const res = await fetch(`${API_URL}/api/freelancer/link-phone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${freelancerToken}` },
    body: JSON.stringify({ phone, code }),
  });
  if (!res.ok) throw new Error(await readDetail(res, "اتصال شماره انجام نشد"));
  return res.json();
}

// ── GitHub ──────────────────────────────────────────────────────────────────

export interface GithubStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
}

export interface GithubRepo {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  default_branch: string | null;
  updated_at: string | null;
}

async function githubRequest<T>(token: string, path: string, init: RequestInit = {}, fallback = "ارتباط با GitHub ناموفق بود"): Promise<T> {
  const res = await fetch(`${API_URL}/api/github${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(await readDetail(res, fallback));
  return res.json();
}

export const fetchGithubStatus = (token: string) => githubRequest<GithubStatus>(token, "/status");
export const fetchGithubRepos = (token: string) => githubRequest<GithubRepo[]>(token, "/repos", {}, "دریافت مخزن‌ها ناموفق بود");
export const disconnectGithub = (token: string) => githubRequest<{ connected: false }>(token, "", { method: "DELETE" });
export const startGithubConnect = (token: string, returnTo: string) =>
  githubRequest<{ url: string }>(token, "/connect", { method: "POST", body: JSON.stringify({ return_to: returnTo }) });

// ── Chat ─────────────────────────────────────────────────────────────────────
export async function createChatSession(botToken?: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/chat/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_token: botToken || null }),
  });
  if (!res.ok) throw new Error("خطا در ساخت session");
  const data = await res.json();
  return data.id;
}

export async function updateChatSession(
  sessionId: string,
  messages: Message[],
  opts: { phone?: string; converted?: boolean; orderId?: string } = {}
): Promise<void> {
  await fetch(`${API_URL}/api/chat/session/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
      phone: opts.phone,
      converted: opts.converted,
      order_id: opts.orderId,
    }),
  });
}

export async function freelancerRegister(customerToken: string, inviteCode: string, name?: string): Promise<Session> {
  const res = await fetch(`${API_URL}/api/freelancer/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ name, invite_code: inviteCode }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(await readDetail(res, "خطا در ثبت‌نام"));
  return res.json();
}

export interface InviteCode {
  code: string;
  note: string | null;
  max_uses: number;
  used_count: number;
  revoked: boolean;
  expires_at: string | null;
  created_at: string;
  active: boolean;
}

export interface AdminFreelancer {
  id: string;
  email: string;
  name: string | null;
  position: string | null;
  invite_code: string | null;
  onboarding_completed: boolean;
  created_at: string;
  order_count: number;
}

async function adminRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/admin/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(await readDetail(res, "درخواست ناموفق بود"));
  return res.json();
}

export const fetchInvites = (token: string) => adminRequest<InviteCode[]>(token, "invites");
export const createInvite = (token: string, body: { note: string; max_uses: number; expires_days: number | null }) =>
  adminRequest<InviteCode>(token, "invites", { method: "POST", body: JSON.stringify(body) });
export const revokeInvite = (token: string, code: string) =>
  adminRequest<InviteCode>(token, `invites/${encodeURIComponent(code)}`, { method: "DELETE" });
export const fetchAdminFreelancers = (token: string) => adminRequest<AdminFreelancer[]>(token, "freelancers");

export interface ChatHandoff {
  version: 1;
  proposal: Proposal;
  chatHistory: Message[];
  attachments: OrderFile[];
}

export type ChatMode = "designer" | "sales";

export async function sendChat(
  messages: Message[],
  attachments: OrderFile[] = [],
  mode: ChatMode = "designer",
  botToken?: string,
  finalize = false,
  projectPath?: ProjectPath,
  sourceUrl = "",
  sourceType?: "github" | "zip",
  sourceFile?: OrderFile,
  progressId?: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, attachments, mode, bot_token: botToken || null, finalize, project_path: projectPath || null, source_url: sourceUrl, source_type: sourceType || null, source_file: sourceFile || null, progress_id: progressId || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "خطا در ارتباط با سرور");
  }
  const data = await res.json();
  return data.content;
}

// ── Customer Auth ─────────────────────────────────────────────────────────────
export async function sendOtp(phone: string) {
  const res = await fetch(`${API_URL}/api/customer/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "خطا در ارسال کد");
  }
  return res.json();
}

export async function verifyOtp(phone: string, code: string): Promise<Session & { access_token: string; customer_id: string; first_name: string | null }> {
  const res = await fetch(`${API_URL}/api/customer/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "کد اشتباه است");
  }
  return res.json();
}

export async function fetchChatHandoff(handoffId: string): Promise<ChatHandoff> {
  const res = await fetch(`${API_URL}/api/customer/handoff/${encodeURIComponent(handoffId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "اطلاعات گفتگو منقضی شده است");
  }
  return res.json();
}

// ── Customer Orders ───────────────────────────────────────────────────────────
export async function fetchCustomerProfile(token: string): Promise<CustomerProfile> {
  const res = await fetch(`${API_URL}/api/customer/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت پروفایل");
  return res.json();
}

export async function updateCustomerProfile(
  token: string,
  profile: Pick<CustomerProfile, "first_name" | "last_name" | "business_type">
): Promise<CustomerProfile> {
  const res = await fetch(`${API_URL}/api/customer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در ذخیره پروفایل");
  return res.json();
}

export async function submitOrder(token: string, proposal: Proposal, chatHistory: Message[], orderFiles: OrderFile[] = [], sessionId?: string): Promise<Order> {
  const res = await fetch(`${API_URL}/api/customer/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      project_name: proposal.projectName,
      summary: proposal.summary,
      chat_history: chatHistory,
      features: proposal.features,
      tech_stack: proposal.tech,
      delivery_days: proposal.days,
      price_estimate: proposal.price,
      price_label: proposal.priceLabel,
      order_files: orderFiles,
      session_id: sessionId || null,
      bot_token: proposal.bot_token || null,
      mode: proposal.mode ?? "sales",
      project_path: proposal.project_path || null,
      source_url: proposal.source_url || "",
      source_type: proposal.source_type || null,
      source_file: proposal.source_file || null,
    }),
  });
  if (!res.ok) throw new Error("خطا در ثبت درخواست");
  return res.json();
}

export async function uploadChatFile(file: File): Promise<OrderFile> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/chat/files`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("خطا در آپلود فایل");
  return res.json();
}

export async function fetchMyOrders(token: string): Promise<Order[]> {
  const res = await fetch(`${API_URL}/api/customer/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت سفارشات");
  return res.json();
}

export async function fetchMyOrder(token: string, id: string): Promise<Order> {
  const res = await fetch(`${API_URL}/api/customer/orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت سفارش");
  return res.json();
}

export async function fetchOrderBrief(token: string, id: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_URL}/api/customer/orders/${id}/brief`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
    if (!res.ok) throw new Error("خطا در ساخت کانفیگ پروژه");
    if (res.status !== 202) return res.json();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("ساخت کانفیگ بیشتر از حد معمول طول کشید؛ دوباره تلاش کنید");
}

// ── Payment ───────────────────────────────────────────────────────────────────
export async function requestPayment(token: string, orderId: string, callbackUrl: string) {
  const res = await fetch(`${API_URL}/api/payment/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_id: orderId, callback_url: callbackUrl }),
  });
  if (!res.ok) throw new Error("خطا در ایجاد درخواست پرداخت");
  return res.json();
}

export async function verifyPayment(authority: string, status: string) {
  const res = await fetch(`${API_URL}/api/payment/verify?Authority=${authority}&Status=${status}`);
  if (!res.ok) throw new Error("خطا در تایید پرداخت");
  return res.json();
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export async function fetchOrders(token: string): Promise<Order[]> {
  const res = await fetch(`${API_URL}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت سفارشات");
  return res.json();
}

/** Admins manage every order; a freelancer only the orders from their own chatbot. */
export type OrderScope = "admin" | "freelancer";
const ORDER_BASE: Record<OrderScope, string> = { admin: "/api/orders", freelancer: "/api/freelancer/orders" };

export async function fetchOrder(token: string, id: string, scope: OrderScope = "admin"): Promise<Order> {
  const res = await fetch(`${API_URL}${ORDER_BASE[scope]}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت سفارش");
  return res.json();
}

export async function fetchStats(token: string) {
  const res = await fetch(`${API_URL}/api/orders/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت آمار");
  return res.json();
}

export async function approveOrder(
  token: string,
  orderId: string,
  finalPrice: number,
  paymentPercentage: number,
  adminNote?: string,
  milestones: { title: string; amount: number }[] = [],
  scope: OrderScope = "admin"
) {
  const res = await fetch(`${API_URL}${ORDER_BASE[scope]}/${orderId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ final_price: finalPrice, payment_percentage: paymentPercentage, admin_note: adminNote, milestones }),
  });
  if (!res.ok) throw new Error(await readDetail(res, "خطا در تایید سفارش"));
  return res.json();
}

export interface FreelancerOnboardingData {
  name: string;
  position: string;
  services: string;
  price_range: string;
  timeline: string;
  note?: string;
}

export type WidgetColor = "violet" | "saffron" | "ink" | "emerald" | "ocean" | "rose" | "plum";
export type RobotShape = "circle" | "rectangle" | "square" | "hexagon";

export interface WidgetSettings {
  brand_name: string;
  greeting: string;
  accent: WidgetColor;
  robot_shape: RobotShape;
  robot_color: WidgetColor;
  voice: boolean;
  position: "bottom-left" | "bottom-right";
}

export const DEFAULT_WIDGET: WidgetSettings = {
  brand_name: "",
  greeting: "",
  accent: "violet",
  robot_shape: "circle",
  robot_color: "ink",
  voice: true,
  position: "bottom-left",
};

export interface BotProfile {
  name: string;
  position: string;
  widget: WidgetSettings;
}

export async function fetchBotProfile(botToken: string): Promise<BotProfile> {
  const res = await fetch(`${API_URL}/api/bot/${encodeURIComponent(botToken)}`);
  if (!res.ok) throw new Error("چت‌بات پیدا نشد");
  return res.json();
}

export async function updateWidgetSettings(token: string, widget: WidgetSettings): Promise<WidgetSettings> {
  const res = await fetch(`${API_URL}/api/freelancer/widget`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(widget),
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(await readDetail(res, "ذخیره تنظیمات ویجت ناموفق بود"));
  return res.json();
}

export async function fetchFreelancerOrders(token: string): Promise<Order[]> {
  const res = await fetch(`${API_URL}/api/freelancer/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت سفارشات");
  return res.json();
}

export type FreelancerField = "web" | "mobile" | "uiux" | "graphic" | "motion" | "content" | "marketing" | "seo" | "other" | "";

export interface FreelancerService {
  name: string;
  price_min: number | null;
  price_max: number | null;
  unit: "project" | "hour" | "month" | "item";
  days_min: number | null;
  days_max: number | null;
  description: string;
}

/** What a freelancer teaches their own chatbot; the bot quotes only these services and prices. */
export interface FreelancerKnowledge {
  field: FreelancerField;
  field_label: string;
  experience_years: number | null;
  bio: string;
  portfolio_url: string;
  services: FreelancerService[];
  process: string;
  intake_questions: string[];
  out_of_scope: string;
  payment_terms: string;
  faqs: { q: string; a: string }[];
  tone: "friendly" | "formal";
}

export const EMPTY_KNOWLEDGE: FreelancerKnowledge = {
  field: "",
  field_label: "",
  experience_years: null,
  bio: "",
  portfolio_url: "",
  services: [],
  process: "",
  intake_questions: [],
  out_of_scope: "",
  payment_terms: "",
  faqs: [],
  tone: "friendly",
};

export async function updateFreelancerKnowledge(token: string, knowledge: FreelancerKnowledge): Promise<FreelancerKnowledge> {
  const res = await fetch(`${API_URL}/api/freelancer/knowledge`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(knowledge),
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(await readDetail(res, "ذخیره آموزش دستیار ناموفق بود"));
  return res.json();
}

export async function fetchFreelancerSettings(token: string): Promise<FreelancerOnboardingData & { bot_token: string; widget: WidgetSettings; knowledge: FreelancerKnowledge }> {
  const res = await fetch(`${API_URL}/api/freelancer/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("خطا در دریافت اطلاعات");
  return res.json();
}

export async function freelancerOnboarding(token: string, data: FreelancerOnboardingData): Promise<FreelancerSession> {
  const res = await fetch(`${API_URL}/api/freelancer/onboarding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("خطا در ذخیره اطلاعات");
  return res.json();
}

export async function uploadProposal(token: string, orderId: string, file: File, scope: OrderScope = "admin") {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}${ORDER_BASE[scope]}/${orderId}/proposal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error("خطا در آپلود فایل");
  return res.json();
}

export async function summarizeOrder(token: string, orderId: string, scope: OrderScope = "admin"): Promise<Order> {
  const res = await fetch(`${API_URL}${ORDER_BASE[scope]}/${orderId}/summarize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در تولید خلاصه");
  return res.json();
}

export async function uploadAdminOrderFile(token: string, orderId: string, file: File, scope: OrderScope = "admin") {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}${ORDER_BASE[scope]}/${orderId}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error("خطا در آپلود فایل");
  return res.json();
}

export async function uploadCustomerOrderFile(token: string, orderId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/customer/orders/${orderId}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error("خطا در آپلود فایل");
  return res.json();
}

export async function fetchAISettings(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}/api/settings/ai`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت تنظیمات هوش مصنوعی");
  const data: AISettingsResponse = await res.json();
  return data.settings;
}

export async function updateAISettings(token: string, settings: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/api/settings/ai`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ settings }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در ذخیره تنظیمات هوش مصنوعی");
  return res.json();
}

// ── Admin: AI skills ──────────────────────────────────────────────────────────
export interface SkillCategory {
  key: string;
  label: string;
  hint: string;
  count: number;
  enabled_count: number;
}

export interface Skill {
  id: string;
  category: string;
  title: string;
  source_name: string | null;
  keywords: string[];
  enabled: boolean;
  builtin: boolean;
  chunk_count: number;
  embedded_count: number;
  size: number;
  preview: string;
  created_at: string;
}

async function skillsRequest<T>(token: string, path: string, init: RequestInit = {}, fallback = "خطا در ارتباط با سرور"): Promise<T> {
  const res = await fetch(`${API_URL}/api/skills${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(typeof data?.detail === "string" ? data.detail : fallback);
  }
  return res.json();
}

const jsonHeaders = { "Content-Type": "application/json" };

export const fetchSkillCategories = (token: string) => skillsRequest<SkillCategory[]>(token, "/categories");
export const fetchSkills = (token: string, category: string) =>
  skillsRequest<Skill[]>(token, `?category=${encodeURIComponent(category)}`);
export const fetchSkillContent = (token: string, id: string) =>
  skillsRequest<Skill & { content: string }>(token, `/${id}`);

export function uploadSkillFile(token: string, category: string, file: File, title: string, keywords: string) {
  const form = new FormData();
  form.append("category", category);
  form.append("file", file);
  form.append("title", title);
  form.append("keywords", keywords);
  return skillsRequest<Skill>(token, "/upload", { method: "POST", body: form }, "خطا در آپلود مهارت");
}

export const createSkill = (token: string, body: { category: string; title: string; content: string; keywords: string }) =>
  skillsRequest<Skill>(token, "", { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) }, "خطا در ذخیره مهارت");

export const updateSkill = (token: string, id: string, body: Partial<{ category: string; title: string; content: string; keywords: string; enabled: boolean }>) =>
  skillsRequest<Skill>(token, `/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) }, "خطا در ویرایش مهارت");

export const deleteSkill = (token: string, id: string) =>
  skillsRequest<{ ok: boolean }>(token, `/${id}`, { method: "DELETE" }, "خطا در حذف مهارت");

export const reindexSkills = (token: string) =>
  skillsRequest<{ ok: boolean }>(token, "/reindex/all", { method: "POST" }, "خطا در ایندکس مجدد");

export async function testImageGeneration(token: string, prompt: string): Promise<{ url: string; model: string }> {
  const res = await fetch(`${API_URL}/api/settings/ai/test-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(typeof data?.detail === "string" ? data.detail : "خطا در تولید تصویر");
  }
  return res.json();
}

export interface WorkspaceVersion {
  id: string;
  number: number;
  stage: "design" | "development";
  title: string;
  url: string;
  html: string;
  notes: string;
  created_at: string;
}
export interface WorkspaceComment {
  id: string;
  version_id: string;
  stage: string;
  page: string;
  selector: string;
  /** Short label of the pinned element (tag and text). */
  element?: string;
  /** Pin position on the preview, in percent. */
  x?: number | null;
  y?: number | null;
  text: string;
  status: "open" | "in_progress" | "review" | "approved";
  created_at: string;
}
export interface WorkspaceDeployment {
  id: string;
  state: string;
  url?: string;
  created_at: string;
  expires_at?: number;
}
export interface ProjectWorkspaceData {
  path: "design" | "direct" | "source" | null;
  source_url: string;
  source_type?: "github" | "zip";
  source_file?: OrderFile;
  versions: WorkspaceVersion[];
  comments: WorkspaceComment[];
  approvals: Partial<Record<"design" | "development", { version_id: string; approved_at: string }>>;
  activity: { id: string; text: string; actor: string; created_at: string }[];
  deployments: WorkspaceDeployment[];
  configuration?: Record<string, unknown> | null;
  has_credentials?: boolean;
}
export interface DeploymentStatus {
  state: string;
  url?: string;
  release_id?: string;
  platform?: string;
  expires_at?: number;
  fail_reason?: string;
  build_log_tail?: string[];
  build_errors?: string[];
  history: WorkspaceDeployment[];
}
export interface AdminCredentials { admin_url: string; username: string; password: string }

export async function workspaceRequest<T>(token: string, id: string, path = "", body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${API_URL}/api/customer/orders/${encodeURIComponent(id)}/workspace${path}`, {
    method: body === undefined ? "GET" : method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "درخواست انجام نشد؛ دوباره تلاش کنید");
  }
  return res.json();
}


export type ChatProgressStage = "thinking" | "searching" | "working" | "done" | "error";

export async function fetchChatProgress(id: string, signal: AbortSignal): Promise<ChatProgressStage | null> {
  const res = await fetch(`${API_URL}/api/chat/progress/${encodeURIComponent(id)}`, { cache: "no-store", signal });
  if (!res.ok) return null;
  const result = await res.json();
  return result.stage;
}

export interface AdminSite {
  slug: string;
  kind: "static" | "dynamic";
  url: string;
  app: string | null;
  order_id: string | null;
  platform: string;
  state: string;
  expires_at: number;
  has_database: boolean;
}

export async function manageAdminSites(token: string, kind?: string, slug?: string, hours?: number, remove = false) {
  const path = kind && slug ? `/${kind}/${slug}${remove ? "" : "/extend"}` : "";
  const response = await fetch(`${API_URL}/api/admin/sites${path}`, {
    method: remove ? "DELETE" : path ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(hours === undefined ? {} : { body: JSON.stringify({ hours }) }),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "عملیات سایت انجام نشد");
  return data;
}

export interface McpInfo {
  mcp_server_url: string;
  server_name: string;
}

export async function fetchMcpInfo(): Promise<McpInfo> {
  const res = await fetch(`${API_URL}/api/mcp/info`);
  if (!res.ok) throw new Error("دریافت آدرس سرور ناموفق بود");
  return res.json();
}

async function mcpRpc(url: string, id: number, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!res.ok) throw new Error(`سرور پاسخ ${res.status} داد`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "خطای سرور MCP");
  return data.result;
}

/** Runs the same handshake an AI client performs, to confirm the server URL works. */
export async function checkMcpServer(url: string): Promise<{ serverName: string; tools: string[] }> {
  const init = await mcpRpc(url, 1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "pixelgenius-panel", version: "1.0" },
  });
  const list = await mcpRpc(url, 2, "tools/list");
  return {
    serverName: init?.serverInfo?.name || "",
    tools: Array.isArray(list?.tools) ? list.tools.map((t: { name: string }) => t.name) : [],
  };
}

// ── Hosting (published sites and custom domains) ────────────────────────────

export interface HostedSite {
  order_id: string;
  project_name: string;
  url: string;
  /** Host a custom domain's CNAME record points to. */
  target: string;
  kind: "static" | "dynamic";
  expires_at: number;
  expired: boolean;
  has_database: boolean;
  state: string;
  can_renew_free: boolean;
  domains: { domain: string; verified: boolean }[];
}

export interface HostingOverview {
  billing_enabled: boolean;
  trial_days: number;
  /** A-record addresses for apex domains. */
  server_ips: string[];
  sites: HostedSite[];
}

async function hostingRequest<T>(token: string, path: string, init: RequestInit = {}, fallback = "درخواست انجام نشد"): Promise<T> {
  const res = await fetch(`${API_URL}/api/customer/sites${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(await readDetail(res, fallback));
  return res.json();
}

export const fetchHostedSites = (token: string) => hostingRequest<HostingOverview>(token, "", {}, "دریافت سایت‌ها ناموفق بود");
export const renewSite = (token: string, orderId: string) =>
  hostingRequest<{ expires_at: number }>(token, `/${orderId}/renew`, { method: "POST" }, "تمدید انجام نشد");
export const addSiteDomain = (token: string, orderId: string, domain: string) =>
  hostingRequest<{ domain: string; verified: boolean }>(token, `/${orderId}/domains`, { method: "POST", body: JSON.stringify({ domain }) }, "افزودن دامنه انجام نشد");
export const verifySiteDomain = (token: string, orderId: string, domain: string) =>
  hostingRequest<{ domain: string; verified: boolean; detail?: string }>(token, `/${orderId}/domains/${encodeURIComponent(domain)}/verify`, { method: "POST" }, "بررسی دامنه انجام نشد");
export const removeSiteDomain = (token: string, orderId: string, domain: string) =>
  hostingRequest<{ removed: string }>(token, `/${orderId}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" }, "حذف دامنه انجام نشد");
