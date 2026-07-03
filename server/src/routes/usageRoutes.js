import express from "express";
import { completeUsageSession } from "../controllers/usageController.js";
import { authRequired } from "../middleware/userAuth.js";

export const usageRouter = express.Router();

// Sessions start and bill over the socket (session:start / usage:heartbeat /
// usage:page). The ONE REST endpoint is completion: final flush + release.
usageRouter.post("/sessions/:id/complete", authRequired, completeUsageSession);
