import express from "express";
import { createContent, getContent, getCreatorDashboard, getCreatorEarnings, listContent, updateContent } from "../controllers/contentController.js";
import { adminRequired } from "../middleware/adminAuth.js";

export const contentRouter = express.Router();

contentRouter.get("/", listContent);
contentRouter.get("/creator/dashboard", getCreatorDashboard);
contentRouter.get("/creator/earnings", getCreatorEarnings);
// Mutations gate on the admin token: the catalog is shared state on a public URL.
contentRouter.post("/", adminRequired, createContent);
contentRouter.put("/:id", adminRequired, updateContent);
// Keep the param route LAST so it doesn't shadow /creator/* above.
contentRouter.get("/:id", getContent);
