// ⬇ Import statements remain unchanged
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";

// ⬇ Backend URL
const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const CustomerPage = () => {
  console.log("🔵 CustomerPage component initialized");

  // ⬇ State Declarations
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [checkingDevices, setCheckingDevices] = useState(false);
  const [joined, setJoined] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [token, setToken] = useState(null);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const [publisherHasVideo, setPublisherHasVideo] = useState(true);
  const [subscriberHasVideo, setSubscriberHasVideo] = useState(false);
  const [fileUploadRequested, setFileUploadRequested] = useState(false);
  const [showUploadedDialog, setShowUploadedDialog] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);

  // ⬇ Refs
  const fileInputRef = useRef(null);
  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);
  const publisher = useRef(null);

  // ⬇ Render fallback avatar box
  const renderFallbackAvatar = (label = "You") => {
    console.log("🔹 renderFallbackAvatar called with label:", label);
    return (
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
  };

  const handleJoin = async () => {
    console.log("🔹 handleJoin started");

    if (!name.trim()) {
      setError("Please enter your name.");
      console.log("⚠️ handleJoin aborted: name is empty");
      return;
    }

    setCheckingDevices(true);
    setError("");

    try {
      console.log("🎤 Checking mic access...");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      mediaStream.getTracks().forEach((t) => t.stop());
      console.log("🎤 Mic access granted.");

      const res = await axios.post(`${backendUrl}/api/call-request`, { name });
      const { apiKey, sessionId, token } = res.data;
      console.log("📡 Call request successful:", res.data);

      const session = OT.initSession(apiKey, sessionId);
      sessionRef.current = session;
      setToken(token);
      setJoined(true);
      setWaitingForAgent(true);

      console.log("🔌 Connecting to session to wait for signals...");
      session.connect(token, (err) => {
        if (err) {
          console.error("❌ Session connect error (signal phase):", err);
          setError("Could not connect to session.");
          return;
        }
        console.log(
          "✅ Customer connected. Waiting for callAccepted signal..."
        );
      });
    } catch (err) {
      console.error("❌ handleJoin error:", err);
      setError("Camera/Mic access denied or API error.");
    } finally {
      setCheckingDevices(false);
      console.log("🔹 handleJoin ended");
    }
  };

  const handleCallAccepted = async () => {
    console.log("🔹 handleCallAccepted started");

    if (publisher.current) {
      console.warn("⚠️ Publisher already initialized. Skipping.");
      return;
    }

    setWaitingForAgent(false);
    const session = sessionRef.current;

    if (!session) {
      console.error("❌ handleCallAccepted: Session not found.");
      return;
    }

    try {
      console.log("🎥 Requesting media permissions...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((track) => track.stop());
      console.log("🎥 Media permissions granted.");

      if (!publisherRef.current) {
        console.error("❌ Publisher container ref is null.");
        setError("Unable to initialize publisher view.");
        return;
      }

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
            console.error("❌ Publisher init error:", err);
            setError("Could not access camera/mic.");
            return;
          }
          console.log("✅ Publisher initialized.");
        }
      );

      if (!publisher.current) {
        console.error("❌ OT.initPublisher returned null.");
        setError("Failed to initialize publisher.");
        return;
      }

      session.publish(publisher.current, (err) => {
        if (err) {
          console.error("❌ Publishing failed:", err);
          setError("Publishing to session failed.");
        } else {
          console.log("✅ Published to session.");
        }
      });

      publisher.current.on("videoEnabled", () => {
        console.log("🎥 Publisher video enabled");
        setPublisherHasVideo(true);
      });
      publisher.current.on("videoDisabled", () => {
        console.log("📵 Publisher video disabled");
        setPublisherHasVideo(false);
      });
    } catch (err) {
      console.error("❌ handleCallAccepted error:", err);
      setError("Camera/Mic permissions denied or unavailable.");
    }

    console.log("🔹 handleCallAccepted ended");
  };

  const handleCloseFilePreviewDialog = () => {
    console.log("🔐 File dialog closed");
    setShowUploadedDialog(false);
    setFilePreviewUrl(null);
  };

  useEffect(() => {
    console.log("🟢 useEffect (token) started");
    const session = sessionRef.current;
    if (!session) return;

    const handleStreamCreated = (event) => {
      console.log("✅ Stream created:", event.stream);
      const subscriber = session.subscribe(
        event.stream,
        subscriberRef.current,
        {
          insertMode: "append",
          width: "100%",
          height: "100%",
        },
        (err) => {
          if (err) console.error("❌ Subscribe error:", err);
        }
      );

      subscriber.on("videoEnabled", () => {
        console.log("🎥 Subscriber video enabled");
        setSubscriberHasVideo(true);
      });
      subscriber.on("videoDisabled", () => {
        console.log("📵 Subscriber video disabled");
        setSubscriberHasVideo(false);
      });

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

    const handleFileUpload = (event) => {
      console.log("📡 Received signal:", event.type, event.data);

      if (event.type === "signal:file-share") {
        try {
          const parsed = JSON.parse(event.data);
          console.log("📎 Received file from agent:", parsed.name);
          setFilePreviewUrl(parsed.url);
          setShowUploadedDialog(true);
        } catch (err) {
          console.error("❌ Failed to parse file signal:", err);
        }
      }

      if (event.type === "signal:file-request") {
        console.log("📥 Agent requested file upload");
        setFileUploadRequested(true);
      }
    };

    const handleVideoAssist = (event) => {
      console.log("📡 Received video assist signal:", event.data);

      const data = event.data;
      if (data === "enable-video") {
        console.log("📡 Received video assist signal enabled");
        setSubscriberHasVideo(false);
      } else {
        console.log("📡 Received video assist signal disabled");
        setSubscriberHasVideo(true);
      }
    };

    session.on("signal", signalHandler);
    session.on("signal:callAccepted", handleCallAccepted);
    session.on("streamCreated", handleStreamCreated);
    session.on("signal:endCall", handleEndCall);
    session.on("signal:video-assist", handleVideoAssist);
    session.on("signal:file-request", handleFileUpload);
    session.on("signal:file-share", handleFileUpload);
    session.on("signal:file-preview-closed", handleCloseFilePreviewDialog);
    session.on("exception", (e) => console.error("⚠️ OpenTok exception:", e));

    return () => {
      console.log("🧹 Cleanup for useEffect (token)");
      session.off("signal", signalHandler);
      session.off("streamCreated", handleStreamCreated);
      session.off("signal:endCall", handleEndCall);
      session.off("signal:callAccepted", handleCallAccepted);
      if (publisher.current) {
        publisher.current.destroy();
        console.log("🗑️ Destroyed publisher");
      }
    };
  }, [token]);

  const uploadAndShareFile = async ({
    file,
    session,
    setShowUploadedDialog,
    setError,
    backendUrl,
    setFilePreviewUrl, // add this prop in your call
  }) => {
    if (!file || file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      console.log("📤 Uploading file to backend...");
      const res = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const fileData = {
        name: res.data.name,
        url: res.data.url,
      };

      session.signal(
        {
          type: "file-share",
          data: JSON.stringify(fileData),
        },
        (err) => {
          if (err) {
            console.error("❌ File signal send error:", err);
            setError("Failed to share file.");
          } else {
            console.log("📡 File shared via signal:", fileData);
            setFilePreviewUrl(res.data.url); // <<<< SET THIS
            setShowUploadedDialog(true);
          }
        }
      );
    } catch (err) {
      console.error("❌ File upload failed:", err);
      setError("File upload failed. Please try again.");
    }
  };

  useEffect(() => {
    console.log("🟡 useEffect (componentWillUnmount) started");
    return () => {
      console.log("🧹 useEffect (componentWillUnmount) cleanup running...");
      if (sessionRef.current) {
        sessionRef.current.disconnect();
        console.log("🔌 Session disconnected");
      }
      if (publisher.current) {
        publisher.current.destroy();
        console.log("🗑️ Publisher destroyed");
      }
    };
  }, []);

  if (callEnded) {
    console.log("📴 Rendering call ended screen");
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
    console.log("👋 Rendering join screen");
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
    console.log("⏳ Rendering waiting for agent screen");

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
          {/* Always show Publisher */}
          <Box
            sx={{
              flex: 1,
              position: "relative",
              borderRadius: 2,
              bgcolor: "#222",
              overflow: "hidden",
              height: subscriberHasVideo ? "50%" : "100%", // dynamic height
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

          {/* Only show Subscriber if video exists */}
          {subscriberHasVideo && (
            <Box
              sx={{
                flex: 1,
                position: "relative",
                borderRadius: 2,
                bgcolor: "#333",
                overflow: "hidden",
                height: "50%", // shared height
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
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files[0];
              const session = sessionRef.current;

              if (!file || !session) return;

              await uploadAndShareFile({
                file,
                session,
                setShowUploadedDialog,
                setError,
                backendUrl,
                setFilePreviewUrl,
              });
            }}
          />

          {/* Dialog for file upload request */}
          <Dialog
            open={fileUploadRequested}
            onClose={() => setFileUploadRequested(false)}
            aria-labelledby="file-upload-dialog-title"
            aria-describedby="file-upload-dialog-description"
          >
            <DialogTitle id="file-upload-dialog-title">
              File Upload Requested
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="file-upload-dialog-description">
                The agent has requested you to upload a PDF file. Please select
                a file to share.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setFileUploadRequested(false)}
                color="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  fileInputRef.current?.click();
                  setFileUploadRequested(false);
                }}
                variant="contained"
                color="primary"
                autoFocus
              >
                Upload File
              </Button>
            </DialogActions>
          </Dialog>

          {/* Dialog for showing uploaded file */}
          <Dialog
            open={showUploadedDialog}
            onClose={handleCloseFilePreviewDialog}
            aria-labelledby="uploaded-file-dialog-title"
            maxWidth="md"
            fullWidth
          >
            <DialogTitle id="uploaded-file-dialog-title">
              File Preview
            </DialogTitle>
            <DialogContent dividers>
              {filePreviewUrl ? (
                <iframe
                  src={filePreviewUrl}
                  title="Uploaded PDF Preview"
                  width="100%"
                  height="600px"
                  style={{ border: "none" }}
                />
              ) : (
                <Typography color="error">Preview not available.</Typography>
              )}
            </DialogContent>
          </Dialog>
        </Box>
      </Paper>
    </Box>
  );
};

export default CustomerPage;
