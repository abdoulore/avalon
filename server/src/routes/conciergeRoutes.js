import express from "express";
import { recommend } from "../controllers/conciergeController.js";

export const conciergeRouter = express.Router();

conciergeRouter.post("/", recommend);
