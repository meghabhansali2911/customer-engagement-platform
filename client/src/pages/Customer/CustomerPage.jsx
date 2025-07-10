import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import axios from "axios";
import OT from "@opentok/client";

const Customer = () => {
  const [name, setName] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);
  const [error, setError] = useState(null);
  const [localVideoOn, setLocalVideoOn] = useState(false);
  const [localAudioOn, setLocalAudioOn] = useState(false);
  const [callData, setCallData] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [retryMedia, setRetryMedia] = useState(false);
  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);
  const cachedStreamRef = useRef(null);

  const checkMediaPermissions = async () => {
    try {
      if (navigator.permissions) {
        const cameraPermission = await navigator.permissions.query({
          name: "camera",
        });
        const micPermission = await navigator.permissions.query({
          name: "microphone",
        });
        return {
          camera: cameraPermission.state,
          microphone: micPermission.state,
        };
      }
      return { camera: "prompt", microphone: "prompt" };
    } catch (err) {
      console.error("Permission query error:", err);
      return { camera: "prompt", microphone: "prompt" };
    }
  };

  const getMediaStream = async () => {
    try {
      if (cachedStreamRef.current) {
        cachedStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      cachedStreamRef.current = stream;
      return stream;
    } catch (error) {
      console.error("Error getting media stream:", error);
      throw error;
    }
  };

  const handleRequestCall = async () => {
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }

    try {
      setIsWaiting(true);
      setError(null);

      // First get media permissions and stream
      const permissions = await checkMediaPermissions();
      if (
        permissions.camera === "denied" ||
        permissions.microphone === "denied"
      ) {
        throw new Error("Camera/microphone permissions denied");
      }

      const stream = await getMediaStream();
      const videoEnabled = stream.getVideoTracks().length > 0;
      const audioEnabled = stream.getAudioTracks().length > 0;

      setLocalVideoOn(videoEnabled);
      setLocalAudioOn(audioEnabled);

      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/call-request`,
        { name }
      );

      const { apiKey, sessionId, token } = response.data;
      setCallData({ apiKey, sessionId, token });

      const callStarted = await initializeSession(
        apiKey,
        sessionId,
        token,
        videoEnabled,
        audioEnabled
      );

      if (!callStarted) {
        setIsWaiting(false);
        setIsDeclined(true);
      }
    } catch (err) {
      console.error("Call request failed", err);
      setIsWaiting(false);
      setIsDeclined(true);
      setError(
        err.message.includes("permissions denied")
          ? "Please allow camera and microphone access to continue."
          : "Failed to request call. Please try again."
      );
      setRetryMedia(true);
    }
  };

  const initializeSession = (apiKey, sessionId, token, hasVideo, hasAudio) => {
    return new Promise((resolve) => {
      const session = OT.initSession(apiKey, sessionId);
      sessionRef.current = session;

      session.on("streamCreated", (event) => {
        session.off("streamCreated");
        setIsWaiting(false);
        setIsCallActive(true);

        subscriberRef.current = session.subscribe(
          event.stream,
          "subscriber",
          {
            insertMode: "append",
            width: "100%",
            height: "100%",
            fitMode: "contain",
            style: { nameDisplayMode: "on" },
          },
          (error) => {
            if (error) {
              console.error("Subscriber error:", error);
              setError("Failed to subscribe to agent's stream.");
            }
          }
        );
        resolve(true);
      });

      session.connect(token, async (error) => {
        if (error) {
          console.error("Session connection error:", error);
          setIsWaiting(false);
          setError("Failed to connect to session.");
          resolve(false);
          return;
        }

        const publisherOptions = {
          insertMode: "append",
          width: "100%",
          height: "100%",
          fitMode: "contain",
          style: { nameDisplayMode: "on" },
          name: name,
          publishVideo: hasVideo && localVideoOn,
          publishAudio: hasAudio && localAudioOn,
          videoSource: hasVideo ? undefined : null,
          audioSource: hasAudio ? undefined : null,
        };

        publisherRef.current = OT.initPublisher(
          "publisher",
          publisherOptions,
          (err) => {
            if (err) {
              console.error("Publisher init error:", err);
              setError(`Failed to initialize video: ${err.message}`);
              resolve(false);
              return;
            }

            session.publish(publisherRef.current, (pubErr) => {
              if (pubErr) {
                console.error("Publisher publish error:", pubErr);
                setError("Failed to publish video stream.");
                resolve(false);
              } else {
                resolve(true);
              }
            });
          }
        );
      });

      setTimeout(() => {
        session.off("streamCreated");
        setIsWaiting(false);
        setIsDeclined(true);
        setError("No agent joined the call within the time limit.");
        resolve(false);
      }, 15000);
    });
  };

  const toggleLocalVideo = () => {
    if (publisherRef.current) {
      const newState = !localVideoOn;
      publisherRef.current.publishVideo(newState);
      setLocalVideoOn(newState);
    }
  };

  const toggleLocalAudio = () => {
    if (publisherRef.current) {
      const newState = !localAudioOn;
      publisherRef.current.publishAudio(newState);
      setLocalAudioOn(newState);
    }
  };

  const retryMediaAccess = () => {
    setError(null);
    setRetryMedia(false);
    handleRequestCall();
  };

  const cleanupMedia = () => {
    if (cachedStreamRef.current) {
      cachedStreamRef.current.getTracks().forEach((track) => track.stop());
      cachedStreamRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.disconnect();
    }
    if (publisherRef.current) {
      publisherRef.current.destroy();
    }
    if (subscriberRef.current) {
      subscriberRef.current.destroy();
    }
  };

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, []);

  const handleCloseDeclined = () => {
    setIsDeclined(false);
    setError(null);
    cleanupMedia();
  };

  const renderFallbackAvatar = (label = "You") => (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "rgba(0, 0, 0, 0.7)",
        zIndex: 2,
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
        {error ? (
          <Box
            sx={{ p: 2, bgcolor: "error.main", color: "white", width: "100%" }}
          >
            <Typography variant="h6">Error: {error}</Typography>
            <Typography variant="body2">
              {error.includes("permissions denied")
                ? "Please enable camera and microphone permissions in your browser settings."
                : "Please ensure your camera and microphone are connected and accessible."}
              <br />
              <a
                href="https://support.google.com/chrome/answer/2690860"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "white", textDecoration: "underline" }}
              >
                Learn how to manage permissions
              </a>
            </Typography>
            {retryMedia && (
              <Button
                onClick={retryMediaAccess}
                variant="contained"
                sx={{ mt: 2, bgcolor: "white", color: "error.main" }}
              >
                Retry Camera/Microphone
              </Button>
            )}
          </Box>
        ) : isCallActive ? (
          <>
            <Box
              id="publisher"
              sx={{
                width: "100%",
                height: "50%",
                overflow: "hidden",
                borderRadius: 1,
                backgroundColor: "black !important",
                position: "relative",
                "& video": {
                  objectFit: "contain",
                  width: "100%",
                  height: "100%",
                  display: "block",
                },
              }}
            >
              {!localVideoOn && renderFallbackAvatar(name || "You")}
            </Box>
            <Box
              id="subscriber"
              sx={{
                width: "100%",
                height: "50%",
                overflow: "hidden",
                borderRadius: 1,
                backgroundColor: "black !important",
                mt: 1,
                "& video": {
                  objectFit: "contain",
                  width: "100%",
                  height: "100%",
                  display: "block",
                },
              }}
            />
            <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                color="secondary"
                onClick={toggleLocalVideo}
              >
                {localVideoOn ? "Turn Off Video" : "Turn On Video"}
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={toggleLocalAudio}
              >
                {localAudioOn ? "Turn Off Audio" : "Turn On Audio"}
              </Button>
            </Box>
          </>
        ) : isDeclined ? (
          <Dialog open={isDeclined} onClose={handleCloseDeclined}>
            <DialogTitle>Call Request Declined</DialogTitle>
            <DialogContent>
              <Typography>
                Sorry, your call request was declined by the agent.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDeclined} color="primary">
                OK
              </Button>
            </DialogActions>
          </Dialog>
        ) : (
          <>
            <Typography variant="h4" component="h1" gutterBottom>
              Welcome Customer,
            </Typography>
            <Typography variant="body1" mb={3}>
              This is your mobile-friendly dashboard.
            </Typography>
            <TextField
              label="Enter your name"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleRequestCall}
              disabled={isWaiting}
              sx={{ mt: 4 }}
            >
              {isWaiting ? "Waiting for Agent..." : "Request a Call"}
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default Customer;
