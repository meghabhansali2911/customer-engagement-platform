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
  Close as CloseIcon,
} from "@mui/icons-material";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const MeetingPage = ({ sessionId, activeCallId, onCallEnd }) => {
  const [error, setError] = useState(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [localVideoOn, setLocalVideoOn] = useState(true);
  const [localAudioOn, setLocalAudioOn] = useState(true);

  const [remoteVideoOn, setRemoteVideoOn] = useState(true);
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [signingUrl, setSigningUrl] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [retryMedia, setRetryMedia] = useState(false);
  const [hasVideoInput, setHasVideoInput] = useState(false);
  const [hasAudioInput, setHasAudioInput] = useState(false);

  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);
  const screenPublisherRef = useRef(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing sessionId");
      return;
    }

    let isMounted = true;

    async function initSession() {
      try {
        const res = await axios.post(`${backendUrl}/api/token`, {
          sessionId,
          userType: "publisher",
          userData: { name: "Agent" },
        });

        const { apiKey, token } = res.data;
        if (!isMounted) return;

        const session = OT.initSession(apiKey, sessionId);
        sessionRef.current = session;

        session.connect(token, async (err) => {
          if (err) {
            setError("Failed to connect to session");
            return;
          }

          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInput = devices.some((d) => d.kind === "videoinput");
            const audioInput = devices.some((d) => d.kind === "audioinput");

            setHasVideoInput(videoInput);
            setHasAudioInput(audioInput);
            setLocalVideoOn(videoInput);
            setLocalAudioOn(audioInput);

            if (videoInput || audioInput) {
              await navigator.mediaDevices.getUserMedia({
                video: videoInput,
                audio: audioInput,
              });
            }

            const publisherOptions = {
              insertMode: "append",
              width: "100%",
              height: "100%",
              name: "Agent",
              videoSource: videoInput ? undefined : null,
              audioSource: audioInput ? undefined : null,
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
                  console.log("Publisher initialized");
                  publisherRef.current = publisher;

                  session.publish(publisher, (pubErr) => {
                    if (pubErr) {
                      console.error("Publish error:", pubErr);
                      setError("Failed to publish stream");
                    } else {
                      console.log("✅ Agent stream started publishing.");
                    }
                  });

                  session.signal(
                    {
                      type: "callAccepted",
                      data: "Agent accepted the call",
                    },
                    (err) => {
                      if (err) console.error("Signal error:", err);
                    }
                  );
                }
              }
            );

            publisher.on("streamCreated", (e) => {
              console.log("📡 Publisher stream created:", e.stream);
              console.log("🎥 Stream has video:", e.stream.hasVideo);
            });
          } catch (mediaErr) {
            console.error("Media error:", mediaErr);
            if (mediaErr.name === "NotReadableError") {
              setError("Camera or microphone is in use by another app.");
              setRetryMedia(true);
            } else {
              setError(`Could not access media: ${mediaErr.message}`);
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
        sessionRef.current = null;
      }
    };
  }, [sessionId, retryMedia]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    function onStreamCreated(event) {
      console.log("📡 streamCreated:", event.stream);
      console.log("👀 subscriberRef.current:", subscriberRef.current);

      setHasRemoteStream(true);

      if (!subscriberRef.current) {
        console.warn("⚠️ subscriberRef not ready, delaying subscription...");
        const interval = setInterval(() => {
          if (subscriberRef.current) {
            clearInterval(interval);
            session.subscribe(
              event.stream,
              subscriberRef.current,
              { insertMode: "append", width: "100%", height: "100%" },
              (err) => {
                if (err) {
                  console.error("Subscribe error:", err);
                } else {
                  console.log("✅ Subscribed to delayed remote stream.");
                }
              }
            );
          }
        }, 100);
        return;
      }

      const subscriber = session.subscribe(
        event.stream,
        subscriberRef.current,
        { insertMode: "append", width: "100%", height: "100%" },
        (err) => {
          if (err) {
            console.error("Subscribe error:", err);
            setError("Failed to subscribe to stream");
          } else {
            console.log("✅ Subscribed to remote stream");
          }
        }
      );

      setRemoteVideoOn(event.stream.hasVideo);
      subscriber.on("videoEnabled", () => setRemoteVideoOn(true));
      subscriber.on("videoDisabled", () => setRemoteVideoOn(false));
    }

    function onStreamDestroyed() {
      setHasRemoteStream(false);
      setRemoteVideoOn(true);
    }

    session.on("streamCreated", onStreamCreated);
    session.on("streamDestroyed", onStreamDestroyed);

    return () => {
      session.off("streamCreated", onStreamCreated);
      session.off("streamDestroyed", onStreamDestroyed);
    };
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    function onStreamCreated(event) {
      console.log("🚀 ~ onStreamCreated ~ event:", event);
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
      console.log("🚀 ~ onStreamCreated ~ subscriber:", subscriber);
      setRemoteVideoOn(event.stream.hasVideo);
      subscriber.on("videoEnabled", () => setRemoteVideoOn(true));
      subscriber.on("videoDisabled", () => setRemoteVideoOn(false));
    }

    function onStreamDestroyed() {
      setHasRemoteStream(false);
      setRemoteVideoOn(true);
    }

    function onFileUploadSignal(event) {
      const { fileUrl } = JSON.parse(event.data);
      setUploadedFileUrl(fileUrl);
      setOpenModal(true);
    }

    function onDocumentSigningSignal(event) {
      const { signingUrl } = JSON.parse(event.data);
      setSigningUrl(signingUrl);
      setOpenModal(true);
    }

    function logParticipantCount() {
      const connections = session.connections || {};
      const count = Object.keys(connections).length;
      console.log("Current participant count:", count);
    }

    function onConnectionCreated() {
      logParticipantCount();
    }

    function onConnectionDestroyed() {
      logParticipantCount();
    }

    session.on("streamCreated", onStreamCreated);
    session.on("streamDestroyed", onStreamDestroyed);
    session.on("signal:file-upload", onFileUploadSignal);
    session.on("signal:document-signing", onDocumentSigningSignal);
    session.on("connectionCreated", onConnectionCreated);
    session.on("connectionDestroyed", onConnectionDestroyed);

    logParticipantCount();

    return () => {
      session.off("streamCreated", onStreamCreated);
      session.off("streamDestroyed", onStreamDestroyed);
      session.off("signal:file-upload", onFileUploadSignal);
      session.off("signal:document-signing", onDocumentSigningSignal);
      session.off("connectionCreated", onConnectionCreated);
      session.off("connectionDestroyed", onConnectionDestroyed);
    };
  }, []);

  const toggleVideo = () => {
    if (!publisherRef.current || !hasVideoInput) return;
    publisherRef.current.publishVideo(!localVideoOn);
    setLocalVideoOn(!localVideoOn);
  };

  const toggleAudio = () => {
    if (!publisherRef.current || !hasAudioInput) return;
    publisherRef.current.publishAudio(!localAudioOn);
    setLocalAudioOn(!localAudioOn);
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
          document.createElement("div"),
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

  const retryMediaAccess = () => {
    setError(null);
    setRetryMedia(!retryMedia);
  };

  const handleEndCall = async () => {
    console.log("Ending call...");
    if (sessionRef.current) {
      sessionRef.current.signal(
        { type: "endCall", data: "Agent ended the call" },
        (err) => {
          if (err) console.error("Signal send error:", err);
        }
      );
      sessionRef.current.disconnect();
    }
    onCallEnd();
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

  const ActivityToolbar = () => (
    <Box
      sx={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        bgcolor: "rgba(0,0,0,0.6)",
        borderRadius: 4,
        display: "flex",
        gap: 1,
        p: 1,
        zIndex: 9999,
        boxShadow: "0 0 10px rgba(0,0,0,0.7)",
      }}
    >
      <Tooltip title={localVideoOn ? "Turn off video" : "Turn on video"}>
        <span>
          <IconButton
            onClick={toggleVideo}
            sx={{ color: "white" }}
            disabled={isScreenSharing || !hasVideoInput}
          >
            {localVideoOn ? <Videocam /> : <VideocamOff />}
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={localAudioOn ? "Turn off audio" : "Turn on audio"}>
        <span>
          <IconButton
            onClick={toggleAudio}
            sx={{ color: "white" }}
            disabled={!hasAudioInput}
          >
            {localAudioOn ? <Mic /> : <MicOff />}
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}>
        <IconButton onClick={toggleScreenShare} sx={{ color: "white" }}>
          {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
        </IconButton>
      </Tooltip>

      <Tooltip title="Upload File">
        <IconButton component="label" sx={{ color: "white" }}>
          <UploadFile />
          <input
            type="file"
            hidden
            onChange={handleFileUpload}
            accept="image/*,.pdf"
          />
        </IconButton>
      </Tooltip>

      <Tooltip title="Send Document for Signing">
        <IconButton onClick={sendDocumentForSigning} sx={{ color: "white" }}>
          <Description />
        </IconButton>
      </Tooltip>

      <Tooltip title="End Call">
        <IconButton onClick={handleEndCall} sx={{ color: "red" }}>
          <CloseIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Paper
      elevation={3}
      sx={{
        height: "100vh",
        bgcolor: "grey.900",
        display: "flex",
        flexDirection: "column",
        p: 2,
        position: "relative",
      }}
    >
      <Typography variant="h6" color="white" gutterBottom>
        Active Call: {activeCallId || "None"}
      </Typography>

      <Box sx={{ flex: 1, display: "flex", gap: 2 }}>
        <Box
          sx={{
            flex: 1,
            position: "relative",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "black",
          }}
        >
          <div
            ref={publisherRef}
            style={{
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
          {!hasVideoInput && !isScreenSharing && (
            <Typography
              variant="body2"
              color="warning.main"
              sx={{ position: "absolute", bottom: 32, left: 8, zIndex: 2 }}
            >
              No local camera detected — listen-only mode
            </Typography>
          )}
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
            <div
              ref={subscriberRef}
              style={{
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

      <ActivityToolbar />

      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 4,
            borderRadius: 2,
            maxWidth: 600,
            width: "90%",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          {uploadedFileUrl && (
            <>
              <Typography variant="h6" gutterBottom>
                File Shared
              </Typography>
              <a href={uploadedFileUrl} target="_blank" rel="noreferrer">
                {uploadedFileUrl}
              </a>
            </>
          )}

          {signingUrl && (
            <>
              <Typography variant="h6" gutterBottom>
                Document for Signing
              </Typography>
              <a href={signingUrl} target="_blank" rel="noreferrer">
                {signingUrl}
              </a>
            </>
          )}

          <Box sx={{ mt: 2, textAlign: "right" }}>
            <Button onClick={() => setOpenModal(false)} variant="contained">
              Close
            </Button>
          </Box>
        </Box>
      </Modal>
    </Paper>
  );
};

export default MeetingPage;
