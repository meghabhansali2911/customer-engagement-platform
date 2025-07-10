import React, { useState, useEffect } from "react";
import { Box, Typography, IconButton, Paper, Stack } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import axios from "axios";

const CallRequestList = ({ onAccept, onDecline }) => {
  const [calls, setCalls] = useState([]);

  const fetchCalls = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BACKEND_URL}/api/call-requests`
      );
      setCalls(response.data);
    } catch (err) {
      console.error("Failed to fetch call requests", err);
    }
  };

  useEffect(() => {
    fetchCalls();
    const interval = setInterval(fetchCalls, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDecline = async (callData) => {
    await onDecline(callData);
    fetchCalls();
  };

  return (
    <>
      <Typography variant="h6" fontWeight={600} mb={2}>
        Call Requests
      </Typography>

      <Stack spacing={2}>
        {calls.map((call) => (
          <Paper
            key={call.id}
            elevation={1}
            sx={{
              borderRadius: 2,
              px: 2,
              py: 1.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                backgroundColor: "#f8f9fa",
                boxShadow: 2,
              },
            }}
          >
            <Typography variant="subtitle1" fontWeight={500}>
              {call.name}
            </Typography>

            <Box display="flex" gap={1}>
              <IconButton
                color="success"
                size="small"
                onClick={() => onAccept(call)}
              >
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton
                color="error"
                size="small"
                onClick={() => handleDecline(call)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Paper>
        ))}
      </Stack>
    </>
  );
};

export default CallRequestList;
