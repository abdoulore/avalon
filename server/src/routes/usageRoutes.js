import express from "express";
import { completeUsageSession, recordUsage, startUsageSession } from "../controllers/usageController.js";

export const usageRouter = express.Router();

usageRouter.post("/sessions", startUsageSession);
usageRouter.post("/sessions/:id/events", recordUsage);
usageRouter.post("/sessions/:id/complete", completeUsageSession);
