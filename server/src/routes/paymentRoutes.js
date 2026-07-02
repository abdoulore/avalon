import express from "express";
import { chargeHeartbeat, chargeRead, chargeWatch, unlockContent } from "../controllers/paymentController.js";

export const paymentRouter = express.Router();

paymentRouter.post("/watch/charge", chargeWatch);
paymentRouter.post("/read/charge", chargeRead);
paymentRouter.post("/content/unlock", unlockContent);
paymentRouter.post("/session/heartbeat", chargeHeartbeat);
