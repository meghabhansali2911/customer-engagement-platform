import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

const BASE_URL = process.env.BASE_URL || "";

// POST /api/upload
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "No file uploaded or invalid file type" });
  }

  const fileUrl = BASE_URL
    ? `${BASE_URL}/uploads/${req.file.filename}`
    : `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

  res.json({ name: req.file.originalname, url: fileUrl });
});

export default router;
