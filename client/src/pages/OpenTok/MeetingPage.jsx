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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
  CallEnd,
  Close as CloseIcon,
} from "@mui/icons-material";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const ENABLE_AGENT_VIDEO = import.meta.env.VITE_AGENT_ENABLE_VIDEO === "true";
const ENABLE_AGENT_AUDIO = import.meta.env.VITE_AGENT_ENABLE_AUDIO === "true";

const MeetingPage = ({ sessionId, activeCallId, onCallEnd }) => {
  const [error, setError] = useState(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [localVideoOn, setLocalVideoOn] = useState(ENABLE_AGENT_VIDEO);
  const [localAudioOn, setLocalAudioOn] = useState(ENABLE_AGENT_AUDIO);
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);
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

  const ensureMediaAccess = async () => {
    try {
      if (!ENABLE_AGENT_VIDEO && !ENABLE_AGENT_AUDIO) return true;
      await navigator.mediaDevices.getUserMedia({
        video: ENABLE_AGENT_VIDEO,
        audio: ENABLE_AGENT_AUDIO,
      });
      return true;
    } catch (err) {
      console.error("Media access error:", err);
      setError("Failed to access camera or mic. Please allow permissions.");
      return false;
    }
  };

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
            setLocalVideoOn(ENABLE_AGENT_VIDEO && videoInput);
            setLocalAudioOn(ENABLE_AGENT_AUDIO && audioInput);

            if (
              (ENABLE_AGENT_VIDEO && videoInput) ||
              (ENABLE_AGENT_AUDIO && audioInput)
            ) {
              await ensureMediaAccess();
            }

            const publisherOptions = {
              insertMode: "append",
              width: "100%",
              height: "100%",
              name: "Agent",
              videoSource: ENABLE_AGENT_VIDEO && videoInput ? undefined : null,
              audioSource: ENABLE_AGENT_AUDIO && audioInput ? undefined : null,
              video: ENABLE_AGENT_VIDEO && videoInput,
              audio: ENABLE_AGENT_AUDIO && audioInput,
            };

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
              console.log("Publisher stream created:", e.stream);
              setLocalVideoOn(e.stream.hasVideo);
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

        session.on("streamCreated", (event) => {
          console.log("New stream created:", event.stream);
          setHasRemoteStream(true);
          setRemoteVideoOn(event.stream.hasVideo);

          const subscriber = session.subscribe(
            event.stream,
            subscriberRef.current,
            {
              insertMode: "append",
              width: "100%",
              height: "100%",
            },
            (err) => {
              if (err) {
                console.error("Subscribe error:", err);
                setError("Failed to subscribe to customer stream");
              } else {
                console.log("Subscribed to customer stream successfully");
              }
            }
          );

          subscriber.on("videoEnabled", () => {
            console.log("Customer video enabled");
            setRemoteVideoOn(true);
          });

          subscriber.on("videoDisabled", () => {
            console.log("Customer video disabled");
            setRemoteVideoOn(false);
          });
        });

        session.on("streamDestroyed", (event) => {
          console.log("Stream destroyed:", event.stream.streamId);
          setHasRemoteStream(false);
          setRemoteVideoOn(false);
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

  const toggleVideo = async () => {
    if (!publisherRef.current || !hasVideoInput) return;

    if (!localVideoOn) {
      const granted = await ensureMediaAccess();
      if (!granted) return;
    }

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

  const handleCloseErrorDialog = () => {
    setError(null);
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
            disabled={isScreenSharing || !hasVideoInput || !ENABLE_AGENT_VIDEO}
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
            disabled={!hasAudioInput || !ENABLE_AGENT_AUDIO}
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
          <CallEnd />
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
        {/* Agent Video */}
        <Box
          sx={{
            flex: hasRemoteStream ? 1 : 1,
            width: hasRemoteStream ? "50%" : "100%",
            position: "relative",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "black",
            transition: "all 0.3s ease",
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
        </Box>

        {/* Customer Video */}
        <Box
          sx={{
            flex: hasRemoteStream ? 1 : 0,
            width: hasRemoteStream ? "50%" : "0%",
            position: "relative",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "black",
            visibility: hasRemoteStream ? "visible" : "hidden",
            transition: "all 0.3s ease",
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
          {!remoteVideoOn && renderFallbackAvatar("Customer")}
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
            Customer
          </Typography>
        </Box>
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

      <Dialog
        open={!!error}
        onClose={handleCloseErrorDialog}
        max
        ChatGPT
        said:Width="sm"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6" color="error">
            Error
          </Typography>
          <IconButton onClick={handleCloseErrorDialog} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        php-template Copy Edit
        <DialogContent dividers>
          <Typography>{error}</Typography>
          {error?.includes("NotReadableError") ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Please close any applications or browser tabs using your camera or
              microphone, then try again.
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Please ensure your camera and microphone are connected and
              accessible in your browser settings.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {retryMedia && (
            <Button
              onClick={retryMediaAccess}
              variant="outlined"
              color="primary"
            >
              Retry Camera/Mic
            </Button>
          )}
          <Button
            onClick={handleCloseErrorDialog}
            variant="contained"
            color="error"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default MeetingPage;
