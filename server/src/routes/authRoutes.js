import express from "express";
import { demoLogin, login, me, signup } from "../controllers/authController.js";
import { authRequired } from "../middleware/userAuth.js";

export const authRouter = express.Router();

authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/demo", demoLogin);
authRouter.get("/me", authRequired, me);
