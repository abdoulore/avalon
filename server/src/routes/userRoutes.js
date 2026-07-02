import express from "express";
import {
  depositToGateway,
  getDemoUser,
  getGatewayBalance,
  getUserDashboard,
  topUpDemoUser,
} from "../controllers/userController.js";

export const userRouter = express.Router();

userRouter.get("/demo", getDemoUser);
userRouter.post("/demo/top-up", topUpDemoUser);
userRouter.get("/demo/gateway-balance", getGatewayBalance);
userRouter.post("/demo/gateway-deposit", depositToGateway);
userRouter.get("/demo/dashboard", getUserDashboard);
