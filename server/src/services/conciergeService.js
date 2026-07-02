import { Content } from "../models/Content.js";
import { env } from "../config/env.js";

/**
 * "Ask Ember" budget concierge. Given a free-text wish plus an optional budget and
 * time, it recommends titles that fit and explains the cost/time math. Ember owns
 * the RANKING + reasons (via DeepSeek); the affordability math is deterministic
 * here so the numbers are exact, not model-guessed. If the model is unavailable or
 * errors, it falls back to a deterministic keyword + fit ranking (never hard-fails).
 */
const DEEPSEEK_MODEL = "deepseek-chat";
const TIMEOUT_MS = Number(process.env.CONCIERGE_TIMEOUT_MS || 6000);
const round = (n) => Math.round(Number(n || 0) * 1e4) / 1e4;

// Infer whether the user wants to WATCH (video) or READ (book). A movie request
// must never return books, even if books are cheaper and "fit" the budget better.
export function inferType(query) {
  const q = String(query || "").toLowerCase();
  const wantsVideo = /\b(movie|movies|film|films|watch|watching|video|videos|cinema|documentar\w*|flick|show|shows|series|clip)\b/.test(q);
  const wantsBook = /\b(book|books|read|reading|novel|novels|story|stories|author|chapter|poem|poetry|essay|essays|nonfiction)\b/.test(q);
  if (wantsVideo && !wantsBook) return "video";
  if (wantsBook && !wantsVideo) return "book";
  return null; // ambiguous or unspecified -> consider both
}

// durationLabel is "MM:SS" or "H:MM:SS" (e.g. "92:14"). Returns seconds.
export function parseDurationSeconds(label) {
  if (!label || typeof label !== "string") return 0;
  const parts = label.trim().split(":").map((p) => Number(p));
  if (parts.length && parts.every((n) => Number.isFinite(n))) {
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
  }
  // Fallback: "1h 36m 20s" style.
  let s = 0;
  const h = label.match(/(\d+)\s*h/i);
  const m = label.match(/(\d+)\s*m/i);
  const sec = label.match(/(\d+)\s*s/i);
  if (h) s += Number(h[1]) * 3600;
  if (m) s += Number(m[1]) * 60;
  if (sec) s += Number(sec[1]);
  return s;
}

// Exact cost/time economics for one item under the given budget + time window.
function economicsFor(item, { budgetUsd, minutes }) {
  const hasBudget = Number(budgetUsd) > 0;
  const hasTime = Number(minutes) > 0;
  if (item.type === "video") {
    const rate = Number(item.pricePerSecondUsd || 0);
    const durationSeconds = parseDurationSeconds(item.durationLabel);
    // Unknown runtime (no/unparseable durationLabel): the full cost is UNKNOWN,
    // not $0, and "fits fully" can never be claimed — otherwise such a title
    // ranks first as the cheapest fitting pick with a visibly wrong reason.
    const known = durationSeconds > 0;
    const fullCostUsd = known ? round(durationSeconds * rate) : null;
    // How many minutes the budget buys (capped at the runtime), and the time cap.
    const budgetSeconds = hasBudget && rate > 0 ? budgetUsd / rate : Infinity;
    const timeSeconds = hasTime ? minutes * 60 : Infinity;
    const watchableSeconds = Math.min(known ? durationSeconds : Infinity, budgetSeconds, timeSeconds);
    const fitsFully =
      known && (!hasBudget || fullCostUsd <= budgetUsd + 1e-9) && (!hasTime || durationSeconds <= minutes * 60);
    return {
      rateUsd: rate,
      rateUnit: "sec",
      durationLabel: item.durationLabel || "",
      durationSeconds,
      fullCostUsd,
      fitsFully,
      watchableMinutes: Number.isFinite(watchableSeconds) ? round(watchableSeconds / 60) : null,
    };
  }
  const rate = Number(item.pricePerPageUsd || 0);
  const pages = Number(item.pages || 0);
  const fullCostUsd = round(pages * rate);
  const affordablePages = hasBudget && rate > 0 ? Math.min(pages, Math.floor(budgetUsd / rate)) : pages;
  const fitsFully = !hasBudget || fullCostUsd <= budgetUsd + 1e-9;
  return { rateUsd: rate, rateUnit: "page", pages, fullCostUsd, fitsFully, affordablePages };
}

function toPick(item, econ, reason) {
  return {
    contentId: String(item._id),
    title: item.title,
    type: item.type,
    creatorName: item.creatorName || "",
    coverUrl: item.coverUrl || "",
    description: item.description || "",
    reason: reason || "",
    link: `/app?play=${item._id}`,
    ...econ,
  };
}

export class ConciergeService {
  async recommend({ query, budgetUsd, minutes }) {
    const wish = String(query || "").trim();
    const budget = Number(budgetUsd) > 0 ? Number(budgetUsd) : null;
    const mins = Number(minutes) > 0 ? Number(minutes) : null;

    const items = await Content.find({ published: true }).lean();
    const enriched = items.map((item) => ({ item, econ: economicsFor(item, { budgetUsd: budget, minutes: mins }) }));

    // Respect an explicit "movie" / "to read" intent: rank only that type, so a
    // film request can't be answered with a cheaper book that merely fits.
    const desiredType = inferType(wish);
    let pool = desiredType ? enriched.filter((e) => e.item.type === desiredType) : enriched;
    if (!pool.length) pool = enriched;

    let picks = null;
    let source = "rules";
    if (env.deepseekApiKey) {
      try {
        const ids = await this._rankWithModel({ wish, budget, mins, enriched: pool, desiredType });
        if (ids?.length) {
          picks = ids
            .map(({ id, reason }) => {
              // Resolve against the type-filtered pool, not the full catalog — a
              // hallucinated cross-type id must not bypass the movie/book filter.
              const found = pool.find((e) => String(e.item._id) === String(id));
              return found ? toPick(found.item, found.econ, reason) : null;
            })
            .filter(Boolean)
            .slice(0, 3);
          if (picks.length) source = "ember";
        }
      } catch {
        picks = null; // fall through to rules
      }
    }

    if (!picks || !picks.length) {
      picks = this._rankByRules({ wish, enriched: pool, budget, mins });
      source = "rules";
    }

    return { ok: true, source, query: wish, budgetUsd: budget, minutes: mins, picks };
  }

  // Ember (model) ranks ids + writes the reasons; we keep the math.
  async _rankWithModel({ wish, budget, mins, enriched, desiredType }) {
    const catalog = enriched.map(({ item, econ }) => ({
      id: String(item._id),
      title: item.title,
      type: item.type,
      about: String(item.description || "").slice(0, 120),
      ...(item.type === "video"
        ? {
            runtime: econ.durationLabel || "unknown",
            fullCostUsd: econ.fullCostUsd ?? "unknown",
            fitsFully: econ.fitsFully,
            watchableMinutes: econ.watchableMinutes,
          }
        : { pages: econ.pages, fullCostUsd: econ.fullCostUsd, fitsFully: econ.fitsFully, affordablePages: econ.affordablePages }),
    }));

    const system =
      "You are Ember, Avalon's budget-aware viewing concierge. Recommend titles from the provided catalog that match " +
      "the user's interest AND fit their budget and time. Prefer titles they can enjoy FULLY (fitsFully:true); otherwise " +
      "say how much they can afford (watchableMinutes for video, affordablePages for books). Pick 1 to 3. Reasons must be " +
      "one short sentence, concrete about cost/time, no markdown. Reply with ONLY a json object.";
    const user =
      `User wish: ${wish || "(open to anything)"}\n` +
      `Looking for: ${desiredType || "either video or book"}\n` +
      `Budget: ${budget ? "$" + budget : "not set"} | Time: ${mins ? mins + " min" : "not set"}\n\n` +
      `Catalog (costs are exact USDC):\n${JSON.stringify(catalog)}\n\n` +
      `Return ONLY json of this shape:\n` +
      `{"picks":[{"id":"<catalog id>","reason":"<one short sentence>"}]}\n` +
      `Example: {"picks":[{"id":"abc","reason":"Sci-fi that fits your $1 - about 16 of its 60 minutes."}]}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.deepseekApiKey}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 400,
        }),
      });
      if (!res.ok) throw new Error(`deepseek http ${res.status}`);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);
      const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];
      return picks
        .filter((p) => p && p.id)
        .map((p) => ({ id: String(p.id), reason: String(p.reason || "").slice(0, 160) }));
    } finally {
      clearTimeout(timer);
    }
  }

  // Deterministic fallback: keyword overlap with title/description, then prefer
  // fits-fully and lower full cost. Always returns up to 3.
  _rankByRules({ wish, enriched, budget, mins }) {
    const terms = wish.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const scored = enriched.map(({ item, econ }) => {
      const hay = `${item.title} ${item.description || ""} ${item.type}`.toLowerCase();
      const relevance = terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
      return { item, econ, relevance };
    });
    scored.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      if (a.econ.fitsFully !== b.econ.fitsFully) return a.econ.fitsFully ? -1 : 1;
      // Unknown full cost (null) sorts LAST, never as "cheapest".
      return (a.econ.fullCostUsd ?? Infinity) - (b.econ.fullCostUsd ?? Infinity);
    });
    return scored.slice(0, 3).map(({ item, econ }) => toPick(item, econ, this._ruleReason(item, econ, { budget, mins })));
  }

  _ruleReason(item, econ, { budget }) {
    if (item.type === "video") {
      if (econ.fitsFully) return `Fits your plan - the full ${econ.durationLabel} runtime is about $${econ.fullCostUsd}.`;
      if (budget && econ.watchableMinutes != null && Number.isFinite(econ.watchableMinutes)) {
        return `About ${econ.watchableMinutes} min on your $${budget}, then extend to keep going.`;
      }
      if (econ.fullCostUsd == null) return `Runtime not listed - it bills $${econ.rateUsd}/sec only while you watch.`;
      return `Per-second title - full runtime is about $${econ.fullCostUsd}.`;
    }
    if (econ.fitsFully) return `Fits your plan - all ${econ.pages} pages for about $${econ.fullCostUsd}.`;
    if (budget) return `About ${econ.affordablePages} pages on your $${budget}.`;
    return `Per-page read - the full ${econ.pages} pages is about $${econ.fullCostUsd}.`;
  }
}

export const conciergeService = new ConciergeService();
