import { conciergeService } from "../services/conciergeService.js";

// "Ask Ember": one wish + optional budget/time -> ranked, budget-aware picks with
// exact cost/time math and a deep link to play each.
export async function recommend(req, res) {
  const { query, budgetUsd, minutes } = req.body || {};
  if (!String(query || "").trim() && !(Number(budgetUsd) > 0)) {
    return res.status(400).json({ error: "Tell Ember what you feel like, or set a budget." });
  }
  const result = await conciergeService.recommend({ query, budgetUsd, minutes });
  res.json(result);
}
