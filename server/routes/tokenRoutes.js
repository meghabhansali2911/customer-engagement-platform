import express from "express";

const router = express.Router();

export default (opentok, apiKey) => {
  router.post("/token", (req, res) => {
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
      res
        .status(500)
        .json({
          success: false,
          message: "Failed to generate token",
          error: error.message,
        });
    }
  });

  return router;
};
