const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Message {
  role: "user" | "assistant";
  content: string;
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

export async function sendChat(messages: Message[]): Promise<string> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error("خطا در ارتباط با سرور");
  const data = await res.json();
  return data.content;
}

export async function requestPayment(proposal: Proposal, callbackUrl: string) {
  const res = await fetch(`${API_URL}/api/payment/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_name: proposal.projectName,
      summary: proposal.summary,
      features: proposal.features,
      tech_stack: proposal.tech,
      delivery_days: proposal.days,
      price: proposal.price,
      price_label: proposal.priceLabel,
      callback_url: callbackUrl,
    }),
  });
  if (!res.ok) throw new Error("خطا در ایجاد درخواست پرداخت");
  return res.json();
}

export async function verifyPayment(authority: string, status: string) {
  const res = await fetch(
    `${API_URL}/api/payment/verify?Authority=${authority}&Status=${status}`
  );
  if (!res.ok) throw new Error("خطا در تایید پرداخت");
  return res.json();
}

export async function adminLogin(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("نام کاربری یا رمز عبور اشتباه است");
  return res.json();
}

export async function fetchOrders(token: string) {
  const res = await fetch(`${API_URL}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("خطا در دریافت سفارشات");
  return res.json();
}

export async function fetchStats(token: string) {
  const res = await fetch(`${API_URL}/api/orders/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("خطا در دریافت آمار");
  return res.json();
}

export async function fetchOrder(token: string, id: string) {
  const res = await fetch(`${API_URL}/api/orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("خطا در دریافت سفارش");
  return res.json();
}
