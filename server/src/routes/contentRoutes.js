import express from "express";
import { createContent, getContent, getCreatorDashboard, getCreatorEarnings, listContent, updateContent } from "../controllers/contentController.js";
import { authRequired } from "../middleware/userAuth.js";

export const contentRouter = express.Router();

contentRouter.get("/", listContent);
contentRouter.get("/creator/dashboard", authRequired, getCreatorDashboard);
contentRouter.get("/creator/earnings", authRequired, getCreatorEarnings);
// Publishing requires a signed-in user; the creator identity comes from the
// token (supersedes the old admin-token gate).
contentRouter.post("/", authRequired, createContent);
contentRouter.put("/:id", authRequired, updateContent);
// Keep the param route LAST so it doesn't shadow /creator/* above.
contentRouter.get("/:id", getContent);
