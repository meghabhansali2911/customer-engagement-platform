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
  CircularProgress,
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
  Cast,
} from "@mui/icons-material";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import { Document, Page, pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const ENABLE_AGENT_VIDEO = import.meta.env.VITE_AGENT_ENABLE_VIDEO === "true";
const ENABLE_AGENT_AUDIO = import.meta.env.VITE_AGENT_ENABLE_AUDIO === "true";

const MeetingPage = ({ sessionId, onCallEnd }) => {
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [localVideoOn, setLocalVideoOn] = useState(ENABLE_AGENT_VIDEO);
  const [localAudioOn, setLocalAudioOn] = useState(ENABLE_AGENT_AUDIO);
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [retryMedia, setRetryMedia] = useState(false);
  const [hasVideoInput, setHasVideoInput] = useState(false);
  const [hasAudioInput, setHasAudioInput] = useState(false);
  const [videoAssistActive, setVideoAssistActive] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [customerFileUrl, setCustomerFileUrl] = useState(null);
  const [customerFileDialogOpen, setCustomerFileDialogOpen] = useState(false);
  const [customerFileName, setCustomerFileName] = useState(null);
  const [waitingForSignedDoc, setWaitingForSignedDoc] = useState(false);
  const [signedDocUrl, setSignedDocUrl] = useState(null);
  const [signedDocName, setSignedDocName] = useState(null);
  const [signedDocDialogOpen, setSignedDocDialogOpen] = useState(false);
  const [isCobrowsing, setIsCobrowsing] = useState(false);

  const fileInputRef = useRef(null);
  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);
  const webcamPublisherRef = useRef(null);
  const screenPublisherRef = useRef(null);
  const publisherContainerRef = useRef(null);

  const ensureMediaAccess = async () => {
    if (!ENABLE_AGENT_VIDEO && !ENABLE_AGENT_AUDIO) return true;
    await navigator.mediaDevices.getUserMedia({
      video: ENABLE_AGENT_VIDEO,
      audio: ENABLE_AGENT_AUDIO,
    });
    return true;
  };

  useEffect(() => {
    if (!sessionId) {
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
            console.error("Session connect error:", err);
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

            const webcamPublisher = OT.initPublisher(
              publisherContainerRef.current,
              publisherOptions,
              (pubErr) => {
                if (pubErr) {
                  console.error("Publisher init error:", pubErr);
                  console.log("Failed to initialize publisher");
                } else {
                  webcamPublisherRef.current = webcamPublisher;
                  publisherRef.current = webcamPublisher;

                  session.publish(webcamPublisher, (pubErr2) => {
                    if (pubErr2) {
                      console.error("Publish error:", pubErr2);
                      console.log("Failed to publish stream");
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

            webcamPublisher.on("streamCreated", (e) => {
              console.log("Publisher stream created:", e.stream);
              setLocalVideoOn(e.stream.hasVideo);
            });
          } catch (mediaErr) {
            console.error("Media error:", mediaErr);
            if (mediaErr.name === "NotReadableError") {
              console.log("Camera or microphone is in use by another app.");
              setRetryMedia(true);
            } else {
              console.log(`Could not access media: ${mediaErr.message}`);
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
                console.log("Failed to subscribe to customer stream");
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

        session.on("signal", (event) => {
          console.log("📡 Received signal:", event.type, event.data);
        });

        session.on("signal:file-share", (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.url) {
              setCustomerFileUrl(data.url);
              setCustomerFileName(data.name || null);
              setCustomerFileDialogOpen(true);
            }
          } catch (err) {
            console.error("Failed to parse file-share signal data:", err);
          }
        });

        session.on("signal:signed-document", (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("Signed document received:", data);
            if (data.url) {
              setSignedDocUrl(data.url);
              setSignedDocName(data.name || "Signed Document");
              setSignedDocDialogOpen(true);
              setWaitingForSignedDoc(false);
            }
          } catch (err) {
            console.error("Failed to parse signed document signal:", err);
          }
        });

        session.on("signal:cobrowse-click", (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("🖱️ Received customer click:", data);
            // Optionally highlight or process the click (e.g., visually indicate on agent's screen)
          } catch (err) {
            console.error("❌ Failed to parse cobrowse-click signal:", err);
          }
        });
      } catch (err) {
        console.error(err);
        if (isMounted) console.log("Failed to initialize session");
      }
    }

    initSession();

    return () => {
      isMounted = false;
      if (sessionRef.current) {
        if (publisherRef.current) {
          sessionRef.current.unpublish(publisherRef.current);
          publisherRef.current.destroy();
        }
        sessionRef.current.disconnect();
        sessionRef.current = null;
      }
    };
  }, [sessionId, retryMedia]);

  // Start or stop co-browsing
  const toggleCobrowsing = async () => {
    alert("Co browser feature");
    setIsCobrowsing(true);
  };

  const toggleVideo = async () => {
    const pub = webcamPublisherRef.current;
    if (!pub || !hasVideoInput || isScreenSharing) return;

    if (!localVideoOn) {
      const granted = await ensureMediaAccess();
      if (!granted) return;
    }

    try {
      pub.publishVideo(!localVideoOn);
      setLocalVideoOn(!localVideoOn);
    } catch (err) {
      console.error("Video toggle failed:", err);
      console.log("Failed to toggle video");
    }
  };

  const toggleAudio = () => {
    const pub = webcamPublisherRef.current;
    if (!pub || !hasAudioInput || isScreenSharing) return;

    try {
      pub.publishAudio(!localAudioOn);
      setLocalAudioOn(!localAudioOn);
    } catch (err) {
      console.error("Audio toggle failed:", err);
      console.log("Failed to toggle audio");
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenPublisherRef.current && sessionRef.current) {
        sessionRef.current.unpublish(screenPublisherRef.current);
        screenPublisherRef.current.destroy();
        screenPublisherRef.current = null;
      }

      // Re-initialize webcam publisher after stopping screen sharing
      if (sessionRef.current && publisherContainerRef.current) {
        const publisherOptions = {
          insertMode: "append",
          width: "100%",
          height: "100%",
          name: "Agent",
          videoSource: ENABLE_AGENT_VIDEO && hasVideoInput ? undefined : null,
          audioSource: ENABLE_AGENT_AUDIO && hasAudioInput ? undefined : null,
          video: ENABLE_AGENT_VIDEO && hasVideoInput,
          audio: ENABLE_AGENT_AUDIO && hasAudioInput,
        };

        const newWebcamPublisher = OT.initPublisher(
          publisherContainerRef.current,
          publisherOptions,
          (err) => {
            if (err) {
              console.error("Re-init webcam publisher error:", err);
              return;
            }
            webcamPublisherRef.current = newWebcamPublisher;
            publisherRef.current = newWebcamPublisher;

            sessionRef.current.publish(newWebcamPublisher, (pubErr) => {
              if (pubErr) {
                console.error("Publish error after screen share stop:", pubErr);
              } else {
                setIsScreenSharing(false);
                setLocalVideoOn(true);
              }
            });
          }
        );
      }
    } else {
      // Start screen sharing
      if (!sessionRef.current) return;

      try {
        if (webcamPublisherRef.current) {
          sessionRef.current.unpublish(webcamPublisherRef.current);
          webcamPublisherRef.current.destroy();
          webcamPublisherRef.current = null;
        }

        const screenPublisher = OT.initPublisher(
          publisherContainerRef.current,
          {
            insertMode: "append",
            width: "100%",
            height: "100%",
            videoSource: "screen",
            audioSource: null,
            publishAudio: false,
          },
          (err) => {
            if (err) {
              console.error("Screen publisher init error:", err);
              if (webcamPublisherRef.current) {
                sessionRef.current.publish(webcamPublisherRef.current);
              }
              return;
            }
            screenPublisherRef.current = screenPublisher;
            sessionRef.current.publish(screenPublisher, (pubErr) => {
              if (pubErr) {
                console.error("Screen publish error:", pubErr);
                if (webcamPublisherRef.current) {
                  sessionRef.current.publish(webcamPublisherRef.current);
                }
              } else {
                setIsScreenSharing(true);
                setLocalVideoOn(false);
              }
            });
          }
        );
      } catch (err) {
        console.error("Screen sharing error:", err);
        if (webcamPublisherRef.current && sessionRef.current) {
          sessionRef.current.publish(webcamPublisherRef.current);
        }
      }
    }
  };

  const handleVideoAssist = () => {
    if (!sessionRef.current) return;

    const nextState = !videoAssistActive;
    sessionRef.current.signal(
      {
        type: "video-assist",
        data: nextState ? "enable-video" : "disable-video",
      },
      (err) => {
        if (err) {
          console.error("Signal error:", err);
          console.log("Failed to send video assist signal");
        } else {
          setVideoAssistActive(nextState);
          console.log(
            `📡 Sent 'video-assist' signal: ${nextState ? "enable" : "disable"}`
          );
        }
      }
    );
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

  const handleCloseFileDialog = () => {
    console.log("File dialog closed");

    sessionRef.current?.signal(
      {
        type: "file-preview-closed",
        data: "Agent closed the file preview",
      },
      (err) => {
        if (err) console.error("Signal send error:", err);
      }
    );

    setCustomerFileUrl(null);
    setCustomerFileDialogOpen(false);
  };

  const getFileType = (url, name) => {
    const extension = name?.split(".").pop().toLowerCase();

    if (!extension) return "unknown";

    if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(extension))
      return "image";

    if (["mp4", "webm", "ogg", "mov", "avi"].includes(extension))
      return "video";

    if (["mp3", "wav", "ogg", "m4a"].includes(extension)) return "audio";

    if (["pdf"].includes(extension)) return "pdf";

    return "unknown";
  };

  const handleDownloadAndSignal = async () => {
    if (!signedDocUrl) return;

    try {
      const response = await fetch(signedDocUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Network response was not ok");

      const blob = await response.blob();

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = signedDocName || "downloaded-file";
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.warn("Direct download failed, opening file in new tab:", error);
      window.open(signedDocUrl, "_blank", "noopener,noreferrer");
    }
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
        backdropFilter: "blur(10px)",
        backgroundColor: "rgba(216, 216, 216, 0.6)",
        borderRadius: 3,
        border: "1px solid rgba(255, 255, 255, 0.1)",
        display: "flex",
        gap: 1,
        p: 1,
        zIndex: 9999,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
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

      <Tooltip title="Enable Video Assist">
        <span>
          <IconButton
            onClick={handleVideoAssist}
            sx={{ color: videoAssistActive ? "lime" : "white" }}
          >
            <VideoFileIcon />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}>
        <IconButton onClick={toggleScreenShare} sx={{ color: "white" }}>
          {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
        </IconButton>
      </Tooltip>

      <Tooltip title={isCobrowsing ? "Stop Co-browsing" : "Start Co-browsing"}>
        <IconButton
          onClick={toggleCobrowsing}
          sx={{ color: isCobrowsing ? "lime" : "white" }}
        >
          <Cast />
        </IconButton>
      </Tooltip>

      <Tooltip title="Upload File">
        <IconButton component="label" sx={{ color: "white" }}>
          <UploadFile onClick={() => setUploadDialogOpen(true)} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Upload & Send Document for Signing">
        <IconButton
          onClick={() => {
            fileInputRef.current.dataset.intent = "sign";
            fileInputRef.current.click();
          }}
          sx={{ color: "white" }}
        >
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

  const uploadFileAndSignal = async (file, type = "preview") => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const uploadedFileUrl = res.data.url;
      const signalType = type === "sign" ? "file-for-signing" : "file-preview";

      sessionRef.current?.signal(
        {
          type: signalType,
          data: JSON.stringify({
            name: file.name,
            url: uploadedFileUrl,
          }),
        },
        (err) => {
          if (err) {
            console.error("Signal send error:", err);
          } else {
            if (type === "sign") {
              setWaitingForSignedDoc(true);
            } else {
              setCustomerFileUrl(uploadedFileUrl);
              setCustomerFileName(file.name);
              setCustomerFileDialogOpen(true);
            }
          }
        }
      );
    } catch (err) {
      console.error("File upload failed:", err);
    }
  };

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
      <Box sx={{ flex: 1, display: "flex", gap: 2 }}>
        {/* Agent Video */}
        <Box
          sx={{
            flex: videoAssistActive ? 0 : hasRemoteStream ? 1 : 1,
            width: videoAssistActive ? "0%" : hasRemoteStream ? "50%" : "100%",
            position: "relative",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "black",
            transition: "all 0.3s ease",
            visibility: videoAssistActive ? "hidden" : "visible",
          }}
        >
          <div
            ref={publisherContainerRef}
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
            flex: videoAssistActive ? 1 : hasRemoteStream ? 1 : 0,
            width: videoAssistActive ? "100%" : hasRemoteStream ? "50%" : "0%",
            position: "relative",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "black",
            visibility:
              hasRemoteStream || videoAssistActive ? "visible" : "hidden",
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

      <input
        type="file"
        accept="*/*"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files[0];
          const intent = e.target.dataset.intent || "preview";

          if (file) {
            await uploadFileAndSignal(
              file,
              intent === "sign" ? "sign" : "preview"
            );
          }

          e.target.value = "";
          delete e.target.dataset.intent;
        }}
      />

      <Dialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
      >
        <DialogTitle>Select Upload Type</DialogTitle>
        <DialogContent>
          <Button
            variant="contained"
            onClick={() => {
              setUploadDialogOpen(false);
              fileInputRef.current.click();
            }}
            sx={{ m: 1 }}
          >
            Agent Upload
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setUploadDialogOpen(false);
              sessionRef.current?.signal(
                {
                  type: "file-request",
                  data: "Please upload your file.",
                },
                (err) => {
                  if (err) console.error("Signal error:", err);
                }
              );
            }}
            sx={{ m: 1 }}
          >
            Request Customer Upload
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={customerFileDialogOpen}
        onClose={handleCloseFileDialog}
        aria-labelledby="uploaded-file-dialog-title"
        maxWidth="md"
        fullWidth
      >
        <DialogTitle id="uploaded-file-dialog-title">File Preview</DialogTitle>
        <DialogContent dividers>
          {customerFileUrl ? (
            (() => {
              const fileType = getFileType(customerFileUrl, customerFileName);

              switch (fileType) {
                case "image":
                  return (
                    <img
                      src={customerFileUrl}
                      alt={customerFileName}
                      style={{
                        width: "100%",
                        maxHeight: 600,
                        objectFit: "contain",
                      }}
                    />
                  );
                case "video":
                  return (
                    <video
                      src={customerFileUrl}
                      controls
                      style={{ width: "100%", maxHeight: 600 }}
                    />
                  );
                case "audio":
                  return (
                    <audio
                      src={customerFileUrl}
                      controls
                      style={{ width: "100%" }}
                    />
                  );
                case "pdf":
                  return (
                    <iframe
                      src={customerFileUrl}
                      title="Uploaded PDF Preview"
                      width="100%"
                      height="600px"
                      style={{ border: "none" }}
                    />
                  );
                default:
                  return (
                    <Typography>
                      Preview not available for this file type.{" "}
                      <a
                        href={customerFileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Click here to download.
                      </a>
                    </Typography>
                  );
              }
            })()
          ) : (
            <Typography color="error">Preview not available.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseFileDialog} color="primary" autoFocus>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={waitingForSignedDoc}
        onClose={() => {}}
        disableEscapeKeyDown
      >
        <DialogTitle>Waiting for Signed Document</DialogTitle>
        <DialogContent>
          <Typography>
            Document uploaded. Waiting for the customer to sign and send back...
          </Typography>
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              mt: 3,
            }}
          >
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={signedDocDialogOpen}
        onClose={() => setSignedDocDialogOpen(false)}
        maxWidth="md"
        fullWidth
        aria-labelledby="signed-doc-dialog-title"
      >
        <DialogTitle id="signed-doc-dialog-title">
          Signed Document Preview
        </DialogTitle>
        <DialogContent dividers>
          {signedDocUrl ? (
            (() => {
              const fileType = getFileType(signedDocUrl, signedDocName);
              console.log("🚀 ~ MeetingPage ~ fileType:", fileType);

              switch (fileType) {
                case "image":
                  return (
                    <img
                      src={signedDocUrl}
                      alt={signedDocName}
                      style={{
                        width: "100%",
                        maxHeight: 600,
                        objectFit: "contain",
                      }}
                    />
                  );
                case "video":
                  return (
                    <video
                      src={signedDocUrl}
                      controls
                      style={{ width: "100%", maxHeight: 600 }}
                    />
                  );
                case "audio":
                  return (
                    <audio
                      src={signedDocUrl}
                      controls
                      style={{ width: "100%" }}
                    />
                  );
                case "pdf":
                  return (
                    <iframe
                      src={signedDocUrl}
                      title="Uploaded PDF Preview"
                      width="100%"
                      height="600px"
                      style={{ border: "none" }}
                    />
                  );
                default:
                  return (
                    <Typography>
                      Preview not available for this file type.
                      <a href={signedDocUrl} target="_blank" rel="noreferrer">
                        Click here to download.
                      </a>
                    </Typography>
                  );
              }
            })()
          ) : (
            <Typography color="error">Preview not available.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          {signedDocUrl && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleDownloadAndSignal}
            >
              Download
            </Button>
          )}
          <Button onClick={() => setSignedDocDialogOpen(false)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default MeetingPage;
