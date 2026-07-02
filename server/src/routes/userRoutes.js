import express from "express";
import {
  depositToGateway,
  getDemoUser,
  getGatewayBalance,
  getUserDashboard,
  topUpDemoUser,
} from "../controllers/userController.js";
import { adminRequired } from "../middleware/adminAuth.js";

export const userRouter = express.Router();

userRouter.get("/demo", getDemoUser);
userRouter.post("/demo/top-up", topUpDemoUser);
userRouter.get("/demo/gateway-balance", getGatewayBalance);
// Moves real funds from the project wallet into Gateway — admin only.
userRouter.post("/demo/gateway-deposit", adminRequired, depositToGateway);
userRouter.get("/demo/dashboard", getUserDashboard);
