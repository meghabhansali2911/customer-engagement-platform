import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenTok from "opentok";

import createTokenRoutes from "./routes/tokenRoutes.js";
import createCallRequestRoutes from "./routes/callRequestRoutes.js";
import callbackRoutes from "./routes/callbackRoutes.js";

dotenv.config();

const app = express();
const apiKey = process.env.OPENTOK_API_KEY;
const apiSecret = process.env.OPENTOK_API_SECRET;
const opentok = new OpenTok(apiKey, apiSecret);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", createTokenRoutes(opentok, apiKey));
app.use("/api", createCallRequestRoutes(opentok, apiKey));
app.use("/api", callbackRoutes);

export default app;
