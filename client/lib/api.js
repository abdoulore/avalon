export function getApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== "undefined" && window.location.hostname) {
    return `http://${window.location.hostname}:4000/api`;
  }

  return "http://localhost:4000/api";
}

// Admin token for the gated endpoints (publish, on-chain deposit). Kept in
// sessionStorage only — never in code or the bundle; sent as x-admin-token.
const ADMIN_TOKEN_KEY = "avalon-admin-token";

export function getAdminToken() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

export function setAdminToken(value) {
  if (typeof window === "undefined") return;
  if (value) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, value);
  else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function api(path, options = {}) {
  const adminToken = getAdminToken();
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "x-admin-token": adminToken } : {}),
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

export const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
  }).format(Number(value || 0));
