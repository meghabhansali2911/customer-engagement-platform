import React, { useState, useRef, useEffect, useCallback } from "react";
import OT from "@opentok/client";
import SignatureCanvas from "react-signature-canvas";
import axios from "axios";
import { PDFDocument } from "pdf-lib";
import CobrowseIO from "cobrowse-sdk-js";

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

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const cobrowseLicenseKey = import.meta.env.VITE_COBROWSE_LICENSE_KEY;

const CustomerPage = () => {
  // State Declarations
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
  const [filePreviewName, setFilePreviewName] = useState(null);
  const [signatureDocUrl, setSignatureDocUrl] = useState(null);
  const [signatureDocName, setSignatureDocName] = useState(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [agentLeft, setAgentLeft] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const subscriberRef = useRef(null);
  const publisher = useRef(null);
  const sigPadRef = useRef(null);

  const renderFallbackAvatar = (label = "You") => {
    return (
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "grey.800",
          zIndex: 9999,
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

  useEffect(() => {
    const initPublisher = async () => {
      const session = sessionRef.current;
      if (!session || !publisherRef.current || publisher.current) {
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
          name: name,
        },
        (err) => {
          if (err) {
            console.error("❌ Publisher init error:", err);
            setError("Could not access camera/mic.");
            return;
          }
        }
      );

      session.publish(publisher.current, (err) => {
        if (err) {
          console.error("❌ Publishing failed:", err);
          setError("Publishing to session failed.");
        }
      });

      publisher.current.on("videoEnabled", () => setPublisherHasVideo(true));
      publisher.current.on("videoDisabled", () => setPublisherHasVideo(false));
    };

    if (joined && !waitingForAgent && publisherRef.current) {
      initPublisher();
    }
  }, [joined, waitingForAgent, publisherRef, name]);

  const handleJoin = async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setCheckingDevices(true);
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((track) => track.stop());

      const res = await axios.post(`${backendUrl}/api/call-request`, { name });
      const { apiKey, sessionId, token } = res.data;

      const session = OT.initSession(apiKey, sessionId);
      sessionRef.current = session;
      setToken(token);
      setJoined(true);
      setWaitingForAgent(true);

      session.connect(token, (err) => {
        if (err) {
          console.error("❌ Session connect error (signal phase):", err);
          setError("Could not connect to session.");
          return;
        }
      });
    } catch (err) {
      console.error("❌ handleJoin error:", err);
      setError("Camera/Mic access denied or API error.");
    } finally {
      setCheckingDevices(false);
    }
  };

  const handleCallAccepted = useCallback(async () => {
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
        name: name,
      },
      (err) => {
        if (err) {
          console.error("❌ Publisher init error:", err);
          setError("Could not access camera/mic.");
          return;
        }
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
      }
    });

    publisher.current.on("videoEnabled", () => {
      setPublisherHasVideo(true);
    });

    publisher.current.on("videoDisabled", () => {
      setPublisherHasVideo(false);
    });
  }, [name, setError, setWaitingForAgent, setPublisherHasVideo]);

  const handleSendSignedDocument = async (signatureDataUrl) => {
    if (!sessionRef.current || !signatureDocUrl || !signatureDocName) {
      setError("Session or file not available for signing.");
      return;
    }

    const fileType = getFileType(signatureDocUrl, signatureDocName);
    let finalBlob;

    try {
      if (fileType === "pdf") {
        const pdfBytes = await fetch(signatureDocUrl).then((res) =>
          res.arrayBuffer()
        );
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const sigImageBytes = await fetch(signatureDataUrl).then((res) =>
          res.arrayBuffer()
        );
        const pngImage = await pdfDoc.embedPng(sigImageBytes);
        const pngDims = pngImage.scale(0.5);

        const lastPage = pdfDoc.getPages().at(-1);
        const { width } = lastPage.getSize();

        lastPage.drawImage(pngImage, {
          x: width - pngDims.width - 40,
          y: 40,
          width: pngDims.width,
          height: pngDims.height,
        });

        const modifiedPdfBytes = await pdfDoc.save();
        finalBlob = new Blob([modifiedPdfBytes], { type: "application/pdf" });
      } else if (fileType === "image") {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = signatureDocUrl;

        await new Promise((res) => (image.onload = res));

        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");

        ctx.drawImage(image, 0, 0);

        const sigImg = new Image();
        sigImg.src = signatureDataUrl;

        await new Promise((res) => (sigImg.onload = res));

        const scale = 0.3;
        const sigWidth = sigImg.width * scale;
        const sigHeight = sigImg.height * scale;

        ctx.drawImage(
          sigImg,
          canvas.width - sigWidth - 20,
          canvas.height - sigHeight - 20,
          sigWidth,
          sigHeight
        );

        const mergedDataUrl = canvas.toDataURL("image/png");
        finalBlob = await (await fetch(mergedDataUrl)).blob();
      } else {
        alert(
          "This file type can't be signed directly. Please upload a PDF or image."
        );
        return;
      }

      const formData = new FormData();
      const nameBase = signatureDocName.split(".")[0];
      const extension = fileType === "pdf" ? "pdf" : "png";
      const finalFileName = `${nameBase}-signed.${extension}`;

      formData.append("file", finalBlob, finalFileName);

      const res = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const signalData = {
        name: finalFileName,
        url: res.data.url,
      };

      sessionRef.current.signal(
        {
          type: "signed-document",
          data: JSON.stringify(signalData),
        },
        (err) => {
          if (err) {
            console.error("Signal error:", err);
            setError("Failed to send signed document.");
          } else {
            setSignatureModalOpen(false);
            setSignatureDocUrl(null);
            setSignatureDocName(null);
          }
        }
      );
    } catch (err) {
      console.error("❌ Error signing document:", err);
      setError("Failed to sign document.");
    }
  };

  const handleCloseFilePreviewDialog = () => {
    setShowUploadedDialog(false);
    setFilePreviewUrl(null);
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
          if (err) console.error("❌ Subscribe error:", err);
        }
      );

      subscriber.on("videoEnabled", () => {
        setSubscriberHasVideo(true);
      });
      subscriber.on("videoDisabled", () => {
        setSubscriberHasVideo(false);
      });

      setSubscriberHasVideo(true);
    };

    const handleEndCall = () => {
      session.disconnect();
      setCallEnded(true);
    };

    const handleFileUpload = (event) => {
      if (
        event.type === "signal:file-share" ||
        event.type === "signal:file-preview"
      ) {
        try {
          const parsed = JSON.parse(event.data);
          setFilePreviewUrl(parsed.url);
          setFilePreviewName(parsed.name);
          setShowUploadedDialog(true);
        } catch (err) {
          console.error("Failed to parse file signal:", err);
        }
      }

      if (event.type === "signal:file-request") {
        setFileUploadRequested(true);
      }
    };

    const handleVideoAssist = (event) => {
      const data = event.data;
      if (data === "enable-video") {
        setSubscriberHasVideo(false);
        setActiveFeature("Video Assist");
      } else {
        setActiveFeature("");
        setSubscriberHasVideo(true);
      }
    };

    const handleSignaturePreview = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setSignatureDocUrl(parsed.url);
        setSignatureDocName(parsed.name);
        setSignatureModalOpen(true);
      } catch (err) {
        console.error("Failed to parse file-for-signing signal data:", err);
      }
    };

    const handleAgentStreamDestroyed = () => {
      setAgentLeft(true);
    };

    const handleAgentConnectionDestroyed = () => {
      setAgentLeft(true);
    };

    const handleCobrowsingSignal = async () => {
      try {
        const res = await axios.post(`${backendUrl}/api/cobrowse-token`);
        const token = res.data?.token;

        CobrowseIO.license = cobrowseLicenseKey;
        CobrowseIO.debug = true;
        await CobrowseIO.client();

        CobrowseIO.start({ allowIFrameStart: true });

        const session = await CobrowseIO.createSession();
        const sessionId = session.id();
        const sessionUrl = `https://cobrowse.io/session/${sessionId}/?token=${token}&end_action=none&navigation=none&messages=none`;

        if (sessionUrl) {
          sessionRef.current?.signal(
            {
              type: "cobrowsing-url",
              data: JSON.stringify({ action: "start", sessionUrl }),
            },
            (err) => {
              if (err) {
                console.error("❌ Signal error:", err);
              }
            }
          );
        }
      } catch (error) {
        console.error("❌ Failed to parse cobrowsing signal:", error);
      }
    };

    session.on("signal:callAccepted", () => setWaitingForAgent(false));
    session.on("streamCreated", handleStreamCreated);
    session.on("signal:endCall", handleEndCall);
    session.on("signal:video-assist", handleVideoAssist);
    session.on("signal:file-request", handleFileUpload);
    session.on("signal:file-share", handleFileUpload);
    session.on("signal:file-preview", handleFileUpload);
    session.on("signal:file-preview-closed", handleCloseFilePreviewDialog);
    session.on("signal:file-for-signing", handleSignaturePreview);
    session.on("streamDestroyed", handleAgentStreamDestroyed);
    session.on("connectionDestroyed", handleAgentConnectionDestroyed);
    session.on("signal:request-cobrowsing-url", handleCobrowsingSignal);
    session.on("exception", (e) => console.error("⚠️ OpenTok exception:", e));

    return () => {
      session.off("signal:callAccepted", handleCallAccepted);
      session.off("signal:video-assist", handleVideoAssist);
      session.off("signal:file-request", handleFileUpload);
      session.off("signal:file-share", handleFileUpload);
      session.off("signal:file-preview", handleFileUpload);
      session.off("signal:file-preview-closed", handleCloseFilePreviewDialog);
      session.off("signal:file-for-signing", handleSignaturePreview);

      if (publisher.current) {
        publisher.current.destroy();
        CobrowseIO.stop();
      }
    };
  }, [token, handleCallAccepted, name]);

  const uploadAndShareFile = async ({
    file,
    session,
    setShowUploadedDialog,
    setError,
    backendUrl,
    setFilePreviewUrl,
    setIsUploading,
  }) => {
    if (!file) {
      setError("No file selected.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true); // Show loader

    try {
      const res = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const fileData = {
        name: res.data.name,
        url: res.data.url,
        type: file.type,
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
            setFilePreviewUrl(res.data.url);
            setShowUploadedDialog(true);
          }
        }
      );
    } catch (err) {
      console.error("❌ File upload failed:", err);
      setError("File upload failed. Please try again.");
    } finally {
      // ⏳ Add artificial delay so loader is visible for 2 seconds
      setIsUploading(false); // Hide loader
    }
  };

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
        {activeFeature && (
          <Typography variant="h6" textAlign="center" mb={2}>
            {activeFeature}
          </Typography>
        )}

        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <Box
            sx={{
              flex: 1,
              position: "relative",
              borderRadius: 2,
              bgcolor: "#222",
              overflow: "hidden",
              height: subscriberHasVideo ? "50%" : "100%",
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
          {/* Agent Video */}
          <Box
            sx={{
              flex: 1,
              position: "relative",
              borderRadius: 2,
              bgcolor: "#333",
              overflow: "hidden",
              display: subscriberHasVideo ? "block" : "none", // This properly hides the container
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

          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
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
                setIsUploading,
              });
            }}
          />

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
                (() => {
                  const fileType = getFileType(filePreviewUrl, filePreviewName);

                  switch (fileType) {
                    case "image":
                      return (
                        <img
                          src={filePreviewUrl}
                          alt={filePreviewName}
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
                          src={filePreviewUrl}
                          controls
                          style={{ width: "100%", maxHeight: 600 }}
                        />
                      );
                    case "audio":
                      return (
                        <audio
                          src={filePreviewUrl}
                          controls
                          style={{ width: "100%" }}
                        />
                      );
                    case "pdf":
                      return (
                        <iframe
                          src={filePreviewUrl}
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
                            href={filePreviewUrl}
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
          </Dialog>

          <Dialog
            open={signatureModalOpen}
            onClose={() => setSignatureModalOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Sign Document: {signatureDocName}</DialogTitle>
            <DialogContent
              dividers
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              {signatureDocUrl && (
                <iframe
                  src={signatureDocUrl}
                  title="Document to Sign"
                  width="100%"
                  height="400px"
                  style={{ border: "none" }}
                />
              )}

              <Box
                sx={{
                  border: "1px solid #ccc",
                  borderRadius: 1,
                  height: 200,
                }}
              >
                <SignatureCanvas
                  penColor="black"
                  ref={sigPadRef}
                  canvasProps={{
                    width: 600,
                    height: 200,
                    className: "sigCanvas",
                    style: {
                      width: "100%",
                      height: "200px",
                      borderRadius: 8,
                    },
                  }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  if (sigPadRef.current) sigPadRef.current.clear();
                }}
              >
                Clear
              </Button>
              <Button
                onClick={() => {
                  if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
                    alert("Please provide your signature.");
                    return;
                  }
                  const dataUrl = sigPadRef.current
                    .getCanvas()
                    .toDataURL("image/png");

                  handleSendSignedDocument(dataUrl);
                }}
                variant="contained"
                color="primary"
              >
                Send Signed Document
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={isUploading} onClose={() => {}} disableEscapeKeyDown>
            <DialogTitle>Uploading File...</DialogTitle>
            <DialogContent
              sx={{ display: "flex", alignItems: "center", gap: 2 }}
            >
              <CircularProgress />
              <Typography>
                Please wait while the file is being uploaded.
              </Typography>
            </DialogContent>
          </Dialog>

          <Dialog
            open={agentLeft}
            onClose={() => setAgentLeft(false)}
            aria-labelledby="agent-left-dialog-title"
            aria-describedby="agent-left-dialog-description"
          >
            <DialogTitle id="agent-left-dialog-title">Agent Left</DialogTitle>
            <DialogContent>
              <DialogContentText id="agent-left-dialog-description">
                The agent has left the call.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setAgentLeft(false);
                  window.location.reload(); // or navigate to home page, etc
                }}
                variant="contained"
                color="primary"
                autoFocus
              >
                Request New Call
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Paper>
    </Box>
  );
};

export default CustomerPage;
