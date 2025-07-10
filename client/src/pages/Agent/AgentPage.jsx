// AgentPage.jsx
import React, { useState } from "react";
import axios from "axios";
import { Box, Divider, Paper, Typography } from "@mui/material";
import AgentHeader from "./AgentHeader";
import CallRequestList from "./CallRequestList";
import VideoCallPanel from "./VideoCallPanel";

const AgentPage = () => {
  const [activeCallId, setActiveCallId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sessionId, setSessionId] = useState(null);

  const handleAcceptCall = (data) => {
    setActiveCallId(data.id);
    setSessionId(data.sessionId);
    setShowSidebar(false);
  };

  const handleDeclineCall = async (callData) => {
    try {
      await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/call-request/${
          callData.id
        }/decline`
      );
      console.log(`Call ${callData.id} declined`);
    } catch (err) {
      console.error("Failed to decline call:", err);
    }
  };

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <AgentHeader />
      <Divider />

      <Box sx={{ display: "flex", flex: 1, overflow: "hidden", p: 2, gap: 2 }}>
        {showSidebar && (
          <Paper
            elevation={3}
            sx={{ width: 300, borderRadius: 2, overflowY: "auto", p: 2 }}
          >
            <CallRequestList
              onAccept={handleAcceptCall}
              onDecline={handleDeclineCall}
            />
          </Paper>
        )}

        <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {sessionId ? (
            <VideoCallPanel activeCallId={activeCallId} sessionId={sessionId} />
          ) : (
            <Paper
              elevation={2}
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography variant="h6" color="text.secondary">
                Select a call to start video
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default AgentPage;
