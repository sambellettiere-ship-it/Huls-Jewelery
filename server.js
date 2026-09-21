'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { nanoid } = require('nanoid');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const FORMSPREE_FORM_ID = process.env.FORMSPREE_FORM_ID || '';

// --- Fail fast on misconfiguration --------------------------------------

if (!ADMIN_PASSWORD) {
  console.error(
    'FATAL: ADMIN_PASSWORD is not set. The admin panel cannot be secured.\n' +
      'Set ADMIN_PASSWORD in your environment (see .env.example) and restart.'
  );
  process.exit(1);
}
if (!SESSION_SECRET && IS_PROD) {
  console.error('FATAL: SESSION_SECRET must be set in production.');
  process.exit(1);
}

// --- Core middleware -----------------------------------------------------

// Railway terminates TLS at a proxy; trust it so secure cookies work.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Google Fonts stylesheet + inline styles used by the pages.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        // Allow the contact form to POST to Formspree.
        connectSrc: ["'self'", 'https://formspree.io'],
        formAction: ["'self'", 'https://formspree.io'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: 'jwap.sid',
    secret: SESSION_SECRET || 'dev-insecure-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  })
);

// --- Static assets -------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));
// Uploaded images live on the data volume, served read-only.
app.use('/uploads', express.static(db.UPLOADS_DIR));

// Expose runtime config (Formspree ID) to the frontend without a build step.
app.get('/config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(
    `window.APP_CONFIG = ${JSON.stringify({
      formspreeFormId: FORMSPREE_FORM_ID
    })};`
  );
});

// --- File uploads (multer) ----------------------------------------------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, db.UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
    const safeExt = /^\.(jpe?g|png|gif|webp|avif)$/.test(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${nanoid(8)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed.'));
  }
});

// --- Auth ----------------------------------------------------------------

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison to keep timing roughly constant.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Not authenticated.' });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' }
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

app.post('/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (password && timingSafeEqual(password, ADMIN_PASSWORD)) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Incorrect password.' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('jwap.sid');
    res.json({ ok: true });
  });
});

// --- Public API ----------------------------------------------------------

function toPublic(piece) {
  return {
    id: piece.id,
    title: piece.title,
    description: piece.description,
    price: piece.price,
    status: piece.status,
    image: piece.image_filename ? `/uploads/${piece.image_filename}` : null
  };
}

app.get('/api/pieces', (_req, res) => {
  res.json(db.listAvailable().map(toPublic));
});

// --- Admin API (protected) ----------------------------------------------

app.get('/api/admin/pieces', requireAuth, (_req, res) => {
  res.json(db.listAll().map(toPublic));
});

app.post('/api/admin/pieces', requireAuth, upload.single('image'), (req, res) => {
  const { title, description, price, status } = req.body || {};
  if (!title || !title.trim()) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: 'Title is required.' });
  }
  const piece = db.createPiece({
    title: title.trim(),
    description: description || '',
    price: price || '',
    status,
    image_filename: req.file ? req.file.filename : null
  });
  res.status(201).json(toPublic(piece));
});

app.patch('/api/admin/pieces/:id', requireAuth, upload.single('image'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.getById(id);
  if (!existing) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(404).json({ error: 'Piece not found.' });
  }

  const fields = {};
  const { title, description, price, status, remove_image } = req.body || {};
  if (title !== undefined) fields.title = title.trim();
  if (description !== undefined) fields.description = description;
  if (price !== undefined) fields.price = price;
  if (status !== undefined) fields.status = status;

  let oldImageToRemove = null;
  if (req.file) {
    fields.image_filename = req.file.filename;
    oldImageToRemove = existing.image_filename;
  } else if (remove_image === 'true' || remove_image === '1') {
    fields.image_filename = null;
    oldImageToRemove = existing.image_filename;
  }

  const updated = db.updatePiece(id, fields);
  if (oldImageToRemove) removeUpload(oldImageToRemove);
  res.json(toPublic(updated));
});

app.delete('/api/admin/pieces/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const removed = db.deletePiece(id);
  if (!removed) return res.status(404).json({ error: 'Piece not found.' });
  if (removed.image_filename) removeUpload(removed.image_filename);
  res.json({ ok: true });
});

function removeUpload(filename) {
  if (!filename) return;
  const filePath = path.join(db.UPLOADS_DIR, filename);
  // Guard against path traversal — only delete inside the uploads dir.
  if (!filePath.startsWith(db.UPLOADS_DIR)) return;
  fs.unlink(filePath, () => {});
}

// --- Error handling ------------------------------------------------------

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || /image files/.test(err.message || '')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`Jewelry With A Past running on http://localhost:${PORT}`);
  console.log(`Data directory: ${db.DATA_DIR}`);
  if (!FORMSPREE_FORM_ID) {
    console.warn('Note: FORMSPREE_FORM_ID is not set — the contact form will be inactive.');
  }
});
