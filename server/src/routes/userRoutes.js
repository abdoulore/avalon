import express from "express";
import {
  depositToGateway,
  getGatewayBalance,
  getMe,
  getUserDashboard,
  topUpMe,
} from "../controllers/userController.js";
import { adminRequired } from "../middleware/adminAuth.js";
import { authRequired } from "../middleware/userAuth.js";

export const userRouter = express.Router();

userRouter.get("/me", authRequired, getMe);
userRouter.post("/me/top-up", authRequired, topUpMe);
userRouter.get("/me/gateway-balance", authRequired, getGatewayBalance);
// Moves real funds from the project wallet into Gateway — admin only (the
// user token identifies the pool to credit; the admin token authorizes it).
userRouter.post("/me/gateway-deposit", authRequired, adminRequired, depositToGateway);
userRouter.get("/me/dashboard", authRequired, getUserDashboard);
