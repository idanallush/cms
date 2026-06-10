import { Router } from 'express';
import multer from 'multer';
import { requireSiteAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed'));
    }
  },
});

const router = Router();

router.post('/:siteId/upload', requireSiteAccess, upload.single('image'), asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: { message: 'No image file provided' } });
  }

  // Use Vercel Blob if available, otherwise return error
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return res.status(503).json({ error: { message: 'Image storage not configured. Set BLOB_READ_WRITE_TOKEN env var.' } });
  }

  try {
    const { put } = await import('@vercel/blob');
    const filename = `${siteId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const blob = await put(filename, file.buffer, {
      access: 'public',
      token: blobToken,
      contentType: file.mimetype,
    });

    res.json({
      success: true,
      url: blob.url,
      filename: file.originalname,
      size: file.size,
    });
  } catch (err) {
    console.error('Blob upload error:', err);
    res.status(500).json({ error: { message: 'Failed to upload image: ' + err.message } });
  }
}));

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { message: 'File too large. Maximum size is 4MB.' } });
    }
    return res.status(400).json({ error: { message: err.message } });
  }
  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ error: { message: err.message } });
  }
  next(err);
});

export default router;
