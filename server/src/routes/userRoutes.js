import express from "express";
import {
  depositToGateway,
  getGatewayBalance,
  getMe,
  getUserDashboard,
  topUpMe,
} from "../controllers/userController.js";
import { authRequired } from "../middleware/userAuth.js";

export const userRouter = express.Router();

userRouter.get("/me", authRequired, getMe);
userRouter.post("/me/top-up", authRequired, topUpMe);
userRouter.get("/me/gateway-balance", authRequired, getGatewayBalance);
// Self-serve: moves the signed-in user's OWN USDC from their wallet into
// Gateway (testnet; the $50 cap in the controller is the sanity limit).
userRouter.post("/me/gateway-deposit", authRequired, depositToGateway);
userRouter.get("/me/dashboard", authRequired, getUserDashboard);
