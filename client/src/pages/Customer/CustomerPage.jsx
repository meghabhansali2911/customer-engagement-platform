import React, { useState, useRef, useEffect } from "react";
import OT from "@opentok/client";
import axios from "axios";
import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const CustomerPage = () => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [checkingDevices, setCheckingDevices] = useState(false);
  const [joined, setJoined] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [session, setSession] = useState(null);

  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);

  const handleJoin = async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setCheckingDevices(true);
    setError("");

    try {
      // Ask for camera/mic permissions
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      mediaStream.getTracks().forEach((t) => t.stop());

      setJoined(true); // show the video screen
    } catch (err) {
      console.error("Permission denied or device unavailable:", err);
      setError("Camera/Microphone access denied or unavailable.");
    } finally {
      setCheckingDevices(false);
    }
  };

  useEffect(() => {
    const startSession = async () => {
      if (!joined) return;

      try {
        const response = await axios.post(`${backendUrl}/api/call-request`, {
          name,
        });

        const { apiKey, sessionId, token } = response.data;

        const session = OT.initSession(apiKey, sessionId);
        setSession(session);

        const publisher = OT.initPublisher(
          publisherRef.current,
          {
            insertMode: "append",
            width: "100%",
            height: "100%",
          },
          (err) => {
            if (err) {
              console.error("Publisher init error:", err);
              setError("Could not access camera/mic.");
            }
          }
        );

        session.connect(token, (err) => {
          if (err) {
            console.error("Session connect error:", err);
            setError("Could not connect to session.");
            return;
          }
          session.publish(publisher);
        });

        session.on("streamCreated", (event) => {
          session.subscribe(
            event.stream,
            subscriberRef.current,
            {
              insertMode: "append",
              width: "100%",
              height: "100%",
            },
            (err) => {
              if (err) console.error("Subscribe error:", err);
            }
          );
        });

        session.on("exception", (event) => {
          console.error("OpenTok exception:", event);
        });

        // Listen for agent ending call signal
        session.on("signal:endCall", (event) => {
          console.log("Received endCall signal:", event.data);
          session.disconnect();
          setCallEnded(true);
        });
      } catch (err) {
        console.error("Token fetch or session error:", err);
        setError("Failed to join video call.");
      }
    };

    startSession();

    return () => {
      if (session) {
        session.disconnect();
      }
    };
  }, [joined, session, name]);

  if (callEnded) {
    return (
      <Box
        sx={{
          height: "100vh",
          backgroundColor: "#000",
          color: "#fff",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          px: 2,
          textAlign: "center",
        }}
      >
        <Typography variant="h4" gutterBottom>
          Call Ended
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          The agent has ended the call.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Request New Call
        </Button>
      </Box>
    );
  }

  if (!joined) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#000",
          overflow: "hidden",
        }}
      >
        <Paper
          elevation={4}
          sx={{
            width: "100%",
            maxWidth: 400,
            height: "100%",
            borderRadius: 2,
            backgroundColor: "#fff",
            color: "#000",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            px: 2,
            py: 2,
            textAlign: "center",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <Typography variant="h5" gutterBottom>
            Welcome!
          </Typography>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Enter your name to join the video call
          </Typography>

          <TextField
            fullWidth
            label="Your Name"
            variant="outlined"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(error)}
          />

          {error && (
            <Typography color="error" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}

          <Button
            variant="contained"
            color="primary"
            sx={{ mt: 3 }}
            fullWidth
            onClick={handleJoin}
            disabled={checkingDevices}
          >
            {checkingDevices ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Join Call"
            )}
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#000",
        color: "#fff",
      }}
    >
      <Typography variant="h6" textAlign="center" p={2}>
        Connected as {name}
      </Typography>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          gap: 2,
          p: 2,
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        <Box
          ref={publisherRef}
          sx={{ flex: 1, backgroundColor: "#222", borderRadius: 2 }}
        />
        <Box
          ref={subscriberRef}
          sx={{ flex: 1, backgroundColor: "#333", borderRadius: 2 }}
        />
      </Box>
    </Box>
  );
};

export default CustomerPage;
