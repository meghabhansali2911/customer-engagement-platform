import express from "express";

const router = express.Router();

router.post("/callback", (req, res) => {
  try {
    const eventData = req.body;
    console.log("Received callback event:", eventData);

    if (
      eventData.event === "session.created" ||
      eventData.event === "recording.started"
    ) {
      console.log(
        `Processed ${eventData.event} for session ${eventData.sessionId}`
      );
    }

    res.status(200).json({ success: true, message: "Callback received" });
  } catch (error) {
    console.error("Error processing callback:", error);
    res.status(500).json({
      success: false,
      message: "Error processing callback",
      error: error.message,
    });
  }
});

export default router;
