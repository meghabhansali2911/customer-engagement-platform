import express from "express";
import jwt from "jsonwebtoken";
import fs from "fs";
const router = express.Router();
const privateKey = fs.readFileSync("./cred/private-key.pem", "utf8");

export default (opentok, apiKey) => {
  router.post("/opentok-token", (req, res) => {
    try {
      const { sessionId, userType = "publisher", userData = {} } = req.body;

      if (!sessionId) {
        return res
          .status(400)
          .json({ success: false, message: "Session ID is required" });
      }

      const token = opentok.generateToken(sessionId, {
        role: userType,
        expireTime: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        data: JSON.stringify(userData),
      });

      res.status(200).json({ success: true, apiKey, sessionId, token });
    } catch (error) {
      console.error("Error generating token:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate token",
        error: error.message,
      });
    }
  });

  router.post("/cobrowse-token", (req, res) => {
    const now = new Date();
    const expires = new Date(now.getTime() + 2 * 60 * 1000); // +2 minutes

    const payload = {
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expires.getTime() / 1000),
      aud: "https://cobrowse.io",
      iss: process.env.COBROWSE_LICENSE_KEY,
      sub: "agent@gmail.com",
      displayName: "Agent",
    };

    try {
      const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
      return res.json({ token });
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Failed to sign JWT", details: err.message });
    }
  });
  return router;
};
