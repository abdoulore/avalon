import express from "express";
import {
  getCreatorTransactions,
  getOnchainTransactions,
  getPlatformRevenue,
  getUserTransactions,
} from "../controllers/ledgerController.js";

export const ledgerRouter = express.Router();

ledgerRouter.get("/user", getUserTransactions);
ledgerRouter.get("/transactions", getOnchainTransactions);
ledgerRouter.get("/creator", getCreatorTransactions);
ledgerRouter.get("/platform", getPlatformRevenue);
