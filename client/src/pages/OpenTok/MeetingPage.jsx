import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import OT from "@opentok/client";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Modal,
  Button,
} from "@mui/material";
import {
  Videocam,
  VideocamOff,
  Mic,
  MicOff,
  UploadFile,
  ScreenShare,
  StopScreenShare,
  Description,
} from "@mui/icons-material";

const MeetingPage = ({ sessionId, activeCallId }) => {
  const [error, setError] = useState(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [localVideoOn, setLocalVideoOn] = useState(true);
  const [localAudioOn, setLocalAudioOn] = useState(true);
  const [remoteVideoOn, setRemoteVideoOn] = useState(true);
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [signingUrl, setSigningUrl] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [retryMedia, setRetryMedia] = useState(false); // New state for retry
  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);
  const screenPublisherRef = useRef(null);

  useEffect(() => {
    async function handlePermissions() {
      try {
        // Check current permission state if supported
        if (navigator.permissions) {
          const cameraPermission = await navigator.permissions.query({
            name: "camera",
          });
          const micPermission = await navigator.permissions.query({
            name: "microphone",
          });

          if (
            cameraPermission.state === "granted" &&
            micPermission.state === "granted"
          ) {
            console.log("Permissions already granted");
            return;
          }
        }

        // If permissions aren't granted, request them
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Media access granted");
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        console.error("Error:", error);
        setError("Could not access camera/microphone: " + error.message);
      }
    }

    // Call this from a button click handler instead of automatically
    handlePermissions();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing sessionId");
      return;
    }

    let isMounted = true;

    async function initSession() {
      try {
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

        const res = await axios.post(`${backendUrl}/api/token`, {
          sessionId,
          userType: "publisher",
          userData: { name: "Agent" },
        });

        const { apiKey, token } = res.data;
        if (!isMounted) return;

        const session = OT.initSession(apiKey, sessionId);
        sessionRef.current = session;

        session.on("streamCreated", (event) => {
          setHasRemoteStream(true);
          const subscriber = session.subscribe(
            event.stream,
            subscriberRef.current,
            { insertMode: "append", width: "100%", height: "100%" },
            (err) => {
              if (err) {
                console.error("Subscribe error:", err);
                setError("Failed to subscribe to stream");
              }
            }
          );
          setRemoteVideoOn(event.stream.hasVideo);
          subscriber.on("videoEnabled", () => setRemoteVideoOn(true));
          subscriber.on("videoDisabled", () => setRemoteVideoOn(false));
        });

        session.on("streamDestroyed", () => {
          setHasRemoteStream(false);
          setRemoteVideoOn(true);
        });

        session.on("signal:file-upload", (event) => {
          const { fileUrl } = JSON.parse(event.data);
          setUploadedFileUrl(fileUrl);
          setOpenModal(true);
        });

        session.on("signal:document-signing", (event) => {
          const { signingUrl } = JSON.parse(event.data);
          setSigningUrl(signingUrl);
          setOpenModal(true);
        });

        session.connect(token, async (err) => {
          if (err) {
            setError("Failed to connect to session");
            return;
          }

          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log("🚀 ~ session.connect ~ devices:", devices);
            const hasVideoInput = devices.some((d) => d.kind === "videoinput");
            console.log("🚀 ~ session.connect ~ hasVideoInput:", hasVideoInput);
            const hasAudioInput = devices.some((d) => d.kind === "audioinput");
            console.log("🚀 ~ session.connect ~ hasAudioInput:", hasAudioInput);

            setLocalVideoOn(hasVideoInput);
            setLocalAudioOn(hasAudioInput);

            // Skip getUserMedia if no devices are available
            if (!hasVideoInput && !hasAudioInput) {
              setError(
                "No camera or microphone detected. Continuing without media."
              );
            } else {
              console.log(
                `🚀 ~ session.connect ~ {
                video: hasVideoInput,
                audio: hasAudioInput,
              }:`,
                {
                  video: hasVideoInput,
                  audio: hasAudioInput,
                }
              );
              await navigator.mediaDevices.getUserMedia({
                video: hasVideoInput,
                audio: hasAudioInput,
              });
              console.log(
                "🚀 ~ session.connect ~ navigator.mediaDevices.getUserMedia:",
                navigator.mediaDevices.getUserMedia
              );
            }

            const publisherOptions = {
              insertMode: "append",
              width: "100%",
              height: "100%",
              name: "Agent",
              videoSource: hasVideoInput ? undefined : null,
              audioSource: hasAudioInput ? undefined : null,
            };
            console.log(
              "🚀 ~ session.connect ~ publisherOptions:",
              publisherOptions
            );

            const publisher = OT.initPublisher(
              publisherRef.current,
              publisherOptions,
              (pubErr) => {
                if (pubErr) {
                  console.error("Publisher init error:", pubErr);
                  setError("Failed to initialize publisher");
                } else {
                  publisherRef.current = publisher;
                  session.publish(publisher, (pubErr) => {
                    if (pubErr) {
                      console.error("Publish error:", pubErr);
                      setError("Failed to publish stream");
                    }
                  });
                }
              }
            );
          } catch (mediaErr) {
            console.error("Media error:", mediaErr);
            if (mediaErr.name === "NotReadableError") {
              setError(
                "Camera or microphone is in use by another application. Please close other apps or tabs and try again."
              );
              setRetryMedia(true); // Enable retry option
            } else {
              setError(
                `Could not access camera or microphone: ${mediaErr.message}`
              );
            }
          }
        });
      } catch (err) {
        console.error(err);
        if (isMounted) setError("Failed to initialize session");
      }
    }

    initSession();

    return () => {
      isMounted = false;
      if (sessionRef.current) {
        if (screenPublisherRef.current) {
          sessionRef.current.unpublish(screenPublisherRef.current);
          screenPublisherRef.current.destroy();
        }
        if (publisherRef.current) {
          sessionRef.current.unpublish(publisherRef.current);
          publisherRef.current.destroy();
        }
        sessionRef.current.disconnect();
      }
    };
  }, [sessionId, retryMedia]); // Add retryMedia to dependencies

  const toggleVideo = () => {
    if (publisherRef.current) {
      publisherRef.current.publishVideo(!localVideoOn);
      setLocalVideoOn(!localVideoOn);
    }
  };

  const toggleAudio = () => {
    if (publisherRef.current) {
      publisherRef.current.publishAudio(!localAudioOn);
      setLocalAudioOn(!localAudioOn);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
      const res = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const fileUrl = res.data.url;
      setUploadedFileUrl(fileUrl);

      sessionRef.current.signal(
        {
          type: "file-upload",
          data: JSON.stringify({ fileUrl }),
        },
        (err) => {
          if (err) console.error("Signal error:", err);
        }
      );

      setOpenModal(true);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload file");
    }
  };

  const sendDocumentForSigning = async () => {
    try {
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
      const res = await axios.post(`${backendUrl}/api/signing`, {
        sessionId,
        document: "sample.pdf",
      });
      const { signingUrl } = res.data;

      sessionRef.current.signal(
        {
          type: "document-signing",
          data: JSON.stringify({ signingUrl }),
        },
        (err) => {
          if (err) console.error("Signal error:", err);
        }
      );

      setSigningUrl(signingUrl);
      setOpenModal(true);
    } catch (err) {
      console.error("Signing error:", err);
      setError("Failed to initiate document signing");
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenPublisherRef.current) {
        sessionRef.current.unpublish(screenPublisherRef.current);
        screenPublisherRef.current.destroy();
        screenPublisherRef.current = null;
      }
      setIsScreenSharing(false);
      if (publisherRef.current) {
        sessionRef.current.publish(publisherRef.current);
      }
    } else {
      try {
        if (publisherRef.current) {
          sessionRef.current.unpublish(publisherRef.current);
        }

        const screenPublisher = OT.initPublisher(
          publisherRef.current,
          {
            insertMode: "append",
            width: "100%",
            height: "100%",
            videoSource: "screen",
            audioSource: null,
          },
          (err) => {
            if (err) {
              console.error("Screen publisher init error:", err);
              setError("Failed to initialize screen sharing");
              if (publisherRef.current) {
                sessionRef.current.publish(publisherRef.current);
              }
            } else {
              screenPublisherRef.current = screenPublisher;
              sessionRef.current.publish(screenPublisher, (pubErr) => {
                if (pubErr) {
                  console.error("Screen publish error:", pubErr);
                  setError("Failed to publish screen stream");
                } else {
                  setIsScreenSharing(true);
                }
              });
            }
          }
        );
      } catch (err) {
        console.error("Screen sharing error:", err);
        setError("Could not start screen sharing");
        if (publisherRef.current) {
          sessionRef.current.publish(publisherRef.current);
        }
      }
    }
  };

  const retryMediaAccess = async () => {
    setError(null);
    setRetryMedia(!retryMedia); // Trigger useEffect to retry
  };

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

  if (error) {
    return (
      <Paper sx={{ p: 2, bgcolor: "error.main", color: "white" }}>
        <Typography variant="h6">Error: {error}</Typography>
        <Typography variant="body2">
          {error.includes("NotReadableError")
            ? "Please close any applications or browser tabs using your camera or microphone, then try again."
            : "Please ensure your camera and microphone are connected and accessible in your browser settings."}
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
      </Paper>
    );
  }

  return (
    <Paper
      elevation={3}
      sx={{
        height: "100vh",
        bgcolor: "grey.900",
        display: "flex",
        flexDirection: "column",
        p: 2,
      }}
    >
      <Typography variant="h6" color="white" gutterBottom>
        Active Call: {activeCallId || "None"}
      </Typography>

      <Box sx={{ flex: 1, display: "flex", gap: 2 }}>
        <Box
          sx={{
            flex: hasRemoteStream ? 1 : 1,
            position: "relative",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "black",
          }}
        >
          <Box
            ref={publisherRef}
            sx={{
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 0,
            }}
          />
          {!localVideoOn && !isScreenSharing && renderFallbackAvatar("You")}
          <Typography
            sx={{
              position: "absolute",
              bottom: 8,
              left: 8,
              bgcolor: "black",
              color: "white",
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: 12,
              zIndex: 2,
            }}
          >
            You
          </Typography>
          <Box
            sx={{
              position: "absolute",
              bottom: 8,
              right: 8,
              display: "flex",
              gap: 1,
              zIndex: 2,
            }}
          >
            <Tooltip title={localVideoOn ? "Turn off video" : "Turn on video"}>
              <IconButton
                onClick={toggleVideo}
                sx={{ bgcolor: "black", color: "white" }}
                disabled={isScreenSharing}
              >
                {localVideoOn ? <Videocam /> : <VideocamOff />}
              </IconButton>
            </Tooltip>
            <Tooltip title={localAudioOn ? "Turn off audio" : "Turn on audio"}>
              <IconButton
                onClick={toggleAudio}
                sx={{ bgcolor: "black", color: "white" }}
              >
                {localAudioOn ? <Mic /> : <MicOff />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Upload File">
              <IconButton
                component="label"
                sx={{ bgcolor: "black", color: "white" }}
              >
                <UploadFile />
                <input
                  type="file"
                  hidden
                  onChange={handleFileUpload}
                  accept="image/*,.pdf"
                />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
            >
              <IconButton
                onClick={toggleScreenShare}
                sx={{ bgcolor: "black", color: "white" }}
              >
                {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Send Document">
              <IconButton
                onClick={sendDocumentForSigning}
                sx={{ bgcolor: "black", color: "white" }}
              >
                <Description />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {hasRemoteStream && (
          <Box
            sx={{
              flex: 1,
              position: "relative",
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "black",
            }}
          >
            <Box
              ref={subscriberRef}
              sx={{
                width: "100%",
                height: "100%",
                position: "absolute",
                top: 0,
                left: 0,
                zIndex: 0,
              }}
            />
            {!remoteVideoOn && renderFallbackAvatar("Remote")}
            <Typography
              sx={{
                position: "absolute",
                bottom: 8,
                left: 8,
                bgcolor: "black",
                color: "white",
                px: 1,
                py: 0.5,
                borderRadius: 1,
                fontSize: 12,
                zIndex: 2,
              }}
            >
              Remote
            </Typography>
          </Box>
        )}
      </Box>

      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: "white",
            p: 4,
            borderRadius: 2,
            maxWidth: "80%",
            maxHeight: "80%",
            overflow: "auto",
          }}
        >
          {signingUrl ? (
            <>
              <iframe src={signingUrl} width="100%" height="500px" />
              <Button onClick={() => setOpenModal(false)} sx={{ mt: 2 }}>
                Close
              </Button>
            </>
          ) : (
            uploadedFileUrl && (
              <>
                {uploadedFileUrl.endsWith(".pdf") ? (
                  <iframe src={uploadedFileUrl} width="100%" height="500px" />
                ) : (
                  <img
                    src={uploadedFileUrl}
                    alt="Uploaded"
                    style={{ maxWidth: "100%" }}
                  />
                )}
                <Button onClick={() => setOpenModal(false)} sx={{ mt: 2 }}>
                  Close
                </Button>
              </>
            )
          )}
        </Box>
      </Modal>
    </Paper>
  );
};

export default MeetingPage;
