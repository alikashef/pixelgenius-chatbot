const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: OrderFile[];
}

export interface Proposal {
  type: "proposal";
  projectName: string;
  summary: string;
  features: string[];
  tech: string;
  days: number;
  price: number;
  priceLabel: string;
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
}

// ── Chat ─────────────────────────────────────────────────────────────────────
export async function createChatSession(): Promise<string> {
  const res = await fetch(`${API_URL}/api/chat/session`, { method: "POST" });
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

export async function freelancerRegister(email: string, password: string, name?: string): Promise<FreelancerSession> {
  const res = await fetch(`${API_URL}/api/freelancer/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (res.status === 409) throw new Error("این ایمیل قبلاً ثبت شده");
  if (!res.ok) throw new Error("خطا در ثبت‌نام");
  return res.json();
}

export async function freelancerLogin(email: string, password: string): Promise<FreelancerSession> {
  const res = await fetch(`${API_URL}/api/freelancer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("ایمیل یا رمز اشتباه است");
  return res.json();
}

export async function sendChat(messages: Message[], attachments: OrderFile[] = []): Promise<string> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, attachments }),
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

export async function verifyOtp(phone: string, code: string) {
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

export async function submitOrder(token: string, proposal: Proposal, chatHistory: Message[], orderFiles: OrderFile[] = []): Promise<Order> {
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
export async function adminLogin(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("نام کاربری یا رمز عبور اشتباه است");
  return res.json();
}

export async function fetchOrders(token: string): Promise<Order[]> {
  const res = await fetch(`${API_URL}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت سفارشات");
  return res.json();
}

export async function fetchOrder(token: string, id: string): Promise<Order> {
  const res = await fetch(`${API_URL}/api/orders/${id}`, {
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
  adminNote?: string
) {
  const res = await fetch(`${API_URL}/api/orders/${orderId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ final_price: finalPrice, payment_percentage: paymentPercentage, admin_note: adminNote }),
  });
  if (!res.ok) throw new Error("خطا در تایید سفارش");
  return res.json();
}

export async function uploadProposal(token: string, orderId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/orders/${orderId}/proposal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error("خطا در آپلود فایل");
  return res.json();
}

export async function summarizeOrder(token: string, orderId: string): Promise<Order> {
  const res = await fetch(`${API_URL}/api/orders/${orderId}/summarize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در تولید خلاصه");
  return res.json();
}

export async function uploadAdminOrderFile(token: string, orderId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/orders/${orderId}/files`, {
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
