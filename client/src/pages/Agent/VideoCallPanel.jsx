import React from "react";
import { Box, Typography, Paper } from "@mui/material";
import MeetingPage from "../OpenTok/MeetingPage";

const VideoCallPanel = ({ activeCallId, sessionId, onCallEnd }) => {
  return (
    <Paper
      elevation={3}
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        overflow: "hidden",
        height: "100vh", // Fixed height to ensure full viewport
        bgcolor: "background.paper",
      }}
    >
      {/* Video container - will show black background from MeetingPage */}
      <Box
        sx={{
          flex: 1,
          position: "relative",
          backgroundColor: "black",
          overflow: "hidden", // Prevent overflow issues
        }}
      >
        <MeetingPage
          sessionId={sessionId}
          activeCallId={activeCallId}
          onCallEnd={onCallEnd}
        />
      </Box>
    </Paper>
  );
};

export default VideoCallPanel;
