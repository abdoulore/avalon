import express from "express";
import {
  getCreatorTransactions,
  getOnchainTransactions,
  getPlatformRevenue,
  getUserTransactions,
} from "../controllers/ledgerController.js";
import { adminRequired } from "../middleware/adminAuth.js";
import { authRequired } from "../middleware/userAuth.js";

export const ledgerRouter = express.Router();

ledgerRouter.get("/user", authRequired, getUserTransactions);
ledgerRouter.get("/transactions", authRequired, getOnchainTransactions);
ledgerRouter.get("/creator", authRequired, getCreatorTransactions);
ledgerRouter.get("/platform", adminRequired, getPlatformRevenue);
