import express from "express";
import { createContent, getContent, getCreatorDashboard, getCreatorEarnings, listContent, updateContent } from "../controllers/contentController.js";

export const contentRouter = express.Router();

contentRouter.get("/", listContent);
contentRouter.get("/creator/dashboard", getCreatorDashboard);
contentRouter.get("/creator/earnings", getCreatorEarnings);
contentRouter.post("/", createContent);
contentRouter.put("/:id", updateContent);
// Keep the param route LAST so it doesn't shadow /creator/* above.
contentRouter.get("/:id", getContent);
