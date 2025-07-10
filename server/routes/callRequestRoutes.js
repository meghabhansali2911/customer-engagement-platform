import express from "express";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

const callRequests = [];

export default (opentok, apiKey) => {
  router.post("/call-request", async (req, res) => {
    const { name } = req.body;

    try {
      const session = await new Promise((resolve, reject) => {
        opentok.createSession({ mediaMode: "routed" }, (err, session) => {
          if (err) reject(err);
          else resolve(session);
        });
      });

      const token = opentok.generateToken(session.sessionId);
      const callRequest = {
        id: uuidv4(),
        name,
        sessionId: session.sessionId,
        token,
        timestamp: Date.now(),
      };
      callRequests.push(callRequest);

      res.json({ apiKey, sessionId: session.sessionId, token });
    } catch (err) {
      console.error("Error creating call request:", err);
      res.status(500).json({
        success: false,
        message: "Error creating session",
        error: err.message,
      });
    }
  });

  router.get("/call-requests", (req, res) => {
    res.json(callRequests);
  });

  router.post("/call-request/:id/decline", (req, res) => {
    const { id } = req.params;
    const index = callRequests.findIndex((call) => call.id === id);

    if (index === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Call request not found" });
    }

    callRequests.splice(index, 1); // Remove the declined call
    res.json({ success: true, message: "Call request declined" });
  });

  router.post("/call-request/:id/joined", (req, res) => {
    const { id } = req.params;
    const index = callRequests.findIndex((call) => call.id === id);

    if (index === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Call request not found" });
    }

    callRequests.splice(index, 1); // Remove after successful join
    res.json({ success: true, message: "Call joined and removed" });
  });

  router.post("/call-request/:id/error", (req, res) => {
    const { id } = req.params;
    const index = callRequests.findIndex((call) => call.id === id);

    if (index === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Call request not found" });
    }

    callRequests.splice(index, 1); // Remove if failed to connect
    res.json({ success: true, message: "Call request removed due to error" });
  });

  return router;
};
