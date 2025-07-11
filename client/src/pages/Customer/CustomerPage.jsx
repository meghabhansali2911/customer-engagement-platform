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
  const [token, setToken] = useState(null);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const [publisherHasVideo, setPublisherHasVideo] = useState(true);
  const [subscriberHasVideo, setSubscriberHasVideo] = useState(false);

  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);
  const publisher = useRef(null);

  const renderFallbackAvatar = (label = "You") => (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "grey.800",
        zIndex: 1,
        borderRadius: 2,
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          bgcolor: "grey.700",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="h6" color="white">
          {label[0]?.toUpperCase()}
        </Typography>
      </Box>
    </Box>
  );

  const handleJoin = async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setCheckingDevices(true);
    setError("");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      mediaStream.getTracks().forEach((t) => t.stop());

      const res = await axios.post(`${backendUrl}/api/call-request`, { name });
      const { apiKey, sessionId, token } = res.data;

      const session = OT.initSession(apiKey, sessionId);
      sessionRef.current = session;
      setToken(token);
      setJoined(true);
      setWaitingForAgent(true);

      // ✅ Connect only to listen for signals
      session.connect(token, (err) => {
        if (err) {
          console.error("Session connect error (signal phase):", err);
          setError("Could not connect to session.");
          return;
        }
        console.log("Customer connected. Waiting for callAccepted signal...");
      });
    } catch (err) {
      console.error("Permission/API error:", err);
      setError("Camera/Mic access denied or API error.");
    } finally {
      setCheckingDevices(false);
    }
  };

  const handleCallAccepted = async () => {
    console.log("✅ Agent accepted call, initializing publisher...");
    setWaitingForAgent(false);

    const session = sessionRef.current;
    if (!session) return;

    try {
      // Request camera and mic permissions explicitly before publishing
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      // Stop tracks immediately, we just want permissions here
      stream.getTracks().forEach((track) => track.stop());

      publisher.current = OT.initPublisher(
        publisherRef.current,
        {
          insertMode: "append",
          width: "100%",
          height: "100%",
          publishAudio: true,
          publishVideo: true,
        },
        (err) => {
          if (err) {
            console.error("Publisher init error:", err);
            setError("Could not access camera/mic.");
          }
        }
      );

      session.publish(publisher.current);

      publisher.current.on("videoEnabled", () => setPublisherHasVideo(true));
      publisher.current.on("videoDisabled", () => setPublisherHasVideo(false));
    } catch (err) {
      console.error("Failed to get user media before publishing:", err);
      setError("Camera/Mic permissions denied or unavailable.");
    }
  };

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    const handleStreamCreated = (event) => {
      const subscriber = session.subscribe(
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

      subscriber.on("videoEnabled", () => setSubscriberHasVideo(true));
      subscriber.on("videoDisabled", () => setSubscriberHasVideo(false));
      setSubscriberHasVideo(true);
    };

    const handleEndCall = () => {
      console.log("📴 End call signal received");
      session.disconnect();
      setCallEnded(true);
    };

    const signalHandler = (event) => {
      console.log("📡 Received signal:", event.type, event.data);
    };

    session.on("signal", signalHandler);
    session.on("signal:callAccepted", handleCallAccepted);
    session.on("streamCreated", handleStreamCreated);
    session.on("signal:endCall", handleEndCall);
    session.on("exception", (e) => console.error("OpenTok exception:", e));

    return () => {
      session.off("signal", signalHandler);
      session.off("streamCreated", handleStreamCreated);
      session.off("signal:endCall", handleEndCall);
      session.off("signal:callAccepted", handleCallAccepted);
      if (publisher.current) {
        publisher.current.destroy();
      }
    };
  }, [token]);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
      if (publisher.current) {
        publisher.current.destroy();
      }
    };
  }, []);

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
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#000",
        }}
      >
        <Paper
          elevation={4}
          sx={{
            width: "100%",
            maxWidth: 400,
            borderRadius: 2,
            backgroundColor: "#fff",
            color: "#000",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            px: 2,
            py: 4,
            textAlign: "center",
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

  if (joined && waitingForAgent) {
    return (
      <Box
        sx={{
          height: "100vh",
          bgcolor: "#000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        <CircularProgress sx={{ color: "#fff", mb: 2 }} />
        <Typography variant="h6">Waiting for agent to join...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        backgroundColor: "#000",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        px: 2,
      }}
    >
      <Paper
        elevation={4}
        sx={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 2,
          bgcolor: "#111",
          color: "#fff",
          p: 2,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography variant="h6" textAlign="center" mb={2}>
          Connected as {name}
        </Typography>

        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Publisher */}
          <Box
            sx={{
              flex: 1,
              position: "relative",
              borderRadius: 2,
              bgcolor: "#222",
              overflow: "hidden",
            }}
          >
            {!publisherHasVideo && renderFallbackAvatar(name || "You")}
            <Box
              ref={publisherRef}
              sx={{
                width: "100%",
                height: "100%",
                "& video, & div": {
                  width: "100% !important",
                  height: "100% !important",
                  objectFit: "cover",
                  borderRadius: 2,
                },
              }}
            />
          </Box>

          {/* Subscriber */}
          <Box
            sx={{
              flex: 1,
              position: "relative",
              borderRadius: 2,
              bgcolor: "#333",
              overflow: "hidden",
            }}
          >
            {!subscriberHasVideo && renderFallbackAvatar("Agent")}
            <Box
              ref={subscriberRef}
              sx={{
                width: "100%",
                height: "100%",
                "& video, & div": {
                  width: "100% !important",
                  height: "100% !important",
                  objectFit: "cover",
                  borderRadius: 2,
                },
              }}
            />
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default CustomerPage;
