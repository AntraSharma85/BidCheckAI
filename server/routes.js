import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db, logAudit, recordStatusChange, createNotification } from './db.js';
import {
  authenticateToken,
  requireOfficer,
  requireBidder,
  requireApprovedOfficer,
  requireVerifiedBidder,
  loginUser,
  registerUser,
  verifyVendorEmail,
  createOfficerByAdmin
} from './auth.js';
import { extractTextFromDocument, OCR_SYSTEM_REPORT } from './ocr-pdf.js';
import { evaluateApplicationAI, analyzeTenderCollusion } from './ai-engine.js';
import { detectDocumentMismatch } from './mismatch-detector.js';

const router = express.Router();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed MIME types and extensions for file uploads (Requirement D.4)
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp'
]);

// Multer storage with UUID filenames to prevent file overwrite and path traversal
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = crypto.randomUUID() + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Invalid file type (${ext || 'unknown'}). Only verified PDF documents and scan images (.pdf, .png, .jpg) are permitted.`));
    }
    cb(null, true);
  }
});

// Helper for client IP
const getClientIp = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
};

// Rate Limiter Implementation (Requirement D.3)
const rateLimitStore = new Map();

export function createRateLimiter({ windowMs, maxRequests, message }) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      const retrySecs = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        error: message || `Too many requests. Please wait ${retrySecs} seconds before trying again.`
      });
    }

    next();
  };
}

const isDev = process.env.NODE_ENV !== 'production';

const loginLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: isDev ? 100 : 15,
  message: 'Too many login attempts from this network. Please wait 1 minute before trying again.'
});

const registerLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: isDev ? 100 : 10,
  message: 'Registration rate limit reached. Please wait 5 minutes before submitting another registration.'
});

/* =========================================================================
   1. AUTHENTICATION & IDENTITY VERIFICATION ENDPOINTS
   ========================================================================= */

// Public Registration: STRICTLY creates bidder accounts only (Requirements 1, 2, C)
// Supports optional registration documents upload (PDF, PNG, JPG)
router.post('/auth/register', registerLimiter, upload.any(), async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      organization,
      phone,
      entity_type,
      cin_llpin,
      gstin,
      pan,
      business_address,
      rep_designation,
      rep_phone
    } = req.body;

    // Note: 'role' is intentionally ignored. Only 'bidder' accounts can be registered publicly.
    const result = registerUser({
      email,
      password,
      full_name,
      organization,
      phone,
      entity_type,
      cin_llpin,
      gstin,
      pan,
      business_address,
      rep_designation,
      rep_phone,
      ipAddress: getClientIp(req)
    });

    // Process any registration documents uploaded
    const files = req.files || [];
    if (files.length > 0) {
      const now = new Date().toISOString();
      const insertDocStmt = db.prepare(`
        INSERT INTO vendor_documents (
          id, user_id, doc_type, original_filename, stored_filename, file_path,
          file_size, mime_type, verification_status, extracted_text, ocr_status, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, ?)
      `);

      for (const file of files) {
        let docType = 'OTHER';
        const fld = (file.fieldname || '').toUpperCase();
        const orig = (file.originalname || '').toUpperCase();
        if (fld.includes('INCORP') || fld.includes('REG') || orig.includes('INCORP') || orig.includes('REG')) {
          docType = 'BUSINESS_REGISTRATION';
        } else if (fld.includes('GST') || fld.includes('TAX') || orig.includes('GST') || orig.includes('TAX')) {
          docType = 'TAX_REGISTRATION';
        } else if (fld.includes('PAN') || orig.includes('PAN')) {
          docType = 'PAN_CARD';
        }

        let extractedText = '';
        let ocrStatus = 'NOT_NEEDED';
        try {
          const ocrResult = await extractTextFromDocument(file.path, file.mimetype);
          extractedText = ocrResult.text || '';
          ocrStatus = ocrResult.status || 'EXTRACTED';
        } catch (e) {
          ocrStatus = 'FAILED';
        }

        const docId = 'vdoc_' + crypto.randomUUID().slice(0, 10);
        insertDocStmt.run(
          docId,
          result.user.id,
          docType,
          file.originalname,
          file.filename,
          file.path,
          file.size,
          file.mimetype,
          extractedText,
          ocrStatus,
          now
        );
      }
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// User Login with distinct portal verification and rate limiting (Requirement 1)
router.post('/auth/login', loginLimiter, (req, res) => {
  try {
    const { email, password, portalRole } = req.body;
    const result = loginUser({
      email,
      password,
      portalRole,
      ipAddress: getClientIp(req)
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Vendor email verification (Requirement 2)
router.post('/auth/verify-email', authenticateToken, requireBidder, (req, res) => {
  try {
    const result = verifyVendorEmail({
      userId: req.user.id,
      ipAddress: getClientIp(req)
    });

    createNotification(
      req.user.id,
      'Email Verified',
      'Your corporate email has been verified. Your business registration details (CIN/GSTIN/PAN) are now queued for Administrative Verification.',
      '/my-bids'
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Immutable security attributes protection (Requirement 4)
// Prevents users from modifying their own role or verification status
router.patch('/auth/profile', authenticateToken, (req, res) => {
  try {
    const { role, verification_status, verified_by, verified_at, authorized_tenders_scope } = req.body;

    // Strict rejection of tampering attempts
    if (role !== undefined && role !== req.user.role) {
      logAudit(req.user.id, 'SECURITY_TAMPERING_ATTEMPT', 'users', req.user.id, { attempted_role: role }, getClientIp(req));
      return res.status(403).json({ error: 'Security violation: Users are strictly prohibited from changing their own system role.' });
    }

    if (verification_status !== undefined && verification_status !== req.user.verification_status) {
      logAudit(req.user.id, 'SECURITY_TAMPERING_ATTEMPT', 'users', req.user.id, { attempted_status: verification_status }, getClientIp(req));
      return res.status(403).json({ error: 'Security violation: Users are strictly prohibited from altering their own account verification status.' });
    }

    const { phone, business_address, rep_designation, rep_phone } = req.body;
    db.prepare(`
      UPDATE users
      SET phone = COALESCE(?, phone),
          business_address = COALESCE(?, business_address),
          rep_designation = COALESCE(?, rep_designation),
          rep_phone = COALESCE(?, rep_phone)
      WHERE id = ?
    `).run(phone || null, business_address || null, rep_designation || null, rep_phone || null, req.user.id);

    logAudit(req.user.id, 'PROFILE_UPDATED', 'users', req.user.id, {}, getClientIp(req));
    res.json({ success: true, message: 'Profile updated.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/auth/me', authenticateToken, (req, res) => {
  try {
    const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).count;
    res.json({
      user: req.user,
      unread_notifications: unreadCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/logout', authenticateToken, (req, res) => {
  logAudit(req.user.id, 'USER_LOGOUT', 'users', req.user.id, {}, getClientIp(req));
  res.json({ success: true, message: 'Logged out successfully.' });
});

/* =========================================================================
   2. ADMINISTRATIVE OFFICER ONBOARDING & VERIFICATION (Requirements 3, 5, C.4)
   ========================================================================= */

router.post('/admin/officers', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      organization,
      phone,
      department,
      official_designation,
      government_id_ref,
      authorized_tenders_scope,
      initial_status
    } = req.body;

    const result = createOfficerByAdmin({
      adminUser: req.user,
      email,
      password,
      full_name,
      organization,
      phone,
      department,
      official_designation,
      government_id_ref,
      authorized_tenders_scope,
      initial_status: initial_status || 'APPROVED',
      ipAddress: getClientIp(req)
    });

    res.status(201).json({ success: true, officer: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin list users for account verification review (Requirement 5)
router.get('/admin/users', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { role, status } = req.query;
    let query = `
      SELECT id, email, full_name, role, organization, phone, verification_status,
             entity_type, cin_llpin, gstin, pan, business_address, rep_name, rep_designation, rep_phone,
             department, official_designation, government_id_ref, authorized_tenders_scope,
             email_verified_at, verified_by, verified_at, verification_notes, created_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      query += ' AND verification_status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    const users = db.prepare(query).all(...params);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin retrieves vendor documents with compliance checklist (Requirement 1, 2, 3)
router.get('/admin/vendors/:id/documents', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const vendor = db.prepare('SELECT id, email, full_name, organization, verification_status, entity_type, cin_llpin, gstin, pan FROM users WHERE id = ?').get(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor account not found.' });
    }

    const docs = db.prepare(`
      SELECT vd.*, u.full_name as verified_by_name, u.role as verified_by_role
      FROM vendor_documents vd
      LEFT JOIN users u ON vd.verified_by = u.id
      WHERE vd.user_id = ?
      ORDER BY vd.uploaded_at DESC
    `).all(vendor.id);

    const mandatoryTypes = [
      { type: 'BUSINESS_REGISTRATION', label: 'Certificate of Incorporation / Registration', required: true },
      { type: 'TAX_REGISTRATION', label: 'GSTIN / Tax Clearance Certificate', required: true },
      { type: 'PAN_CARD', label: 'Corporate PAN Card', required: true }
    ];

    const checklist = mandatoryTypes.map(m => {
      const doc = docs.find(d => d.doc_type === m.type);
      return {
        type: m.type,
        label: m.label,
        required: true,
        is_uploaded: !!doc,
        verification_status: doc ? doc.verification_status : 'MISSING',
        document: doc || null
      };
    });

    const totalMandatory = mandatoryTypes.length;
    const verifiedMandatory = checklist.filter(c => c.verification_status === 'VERIFIED').length;
    const allMandatoryVerified = verifiedMandatory === totalMandatory;

    res.json({
      vendor,
      documents: docs,
      checklist,
      summary: {
        total_mandatory: totalMandatory,
        verified_mandatory: verifiedMandatory,
        all_mandatory_verified: allMandatoryVerified,
        missing_count: checklist.filter(c => !c.is_uploaded).length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Officer manually reviews individual vendor document (Requirement 2)
router.post('/admin/vendor-documents/:id/verify', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['PENDING_REVIEW', 'VERIFIED', 'NEEDS_CLARIFICATION', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid document status. Must be one of: ${validStatuses.join(', ')}` });
    }

    if ((status === 'REJECTED' || status === 'NEEDS_CLARIFICATION') && (!notes || notes.trim().length < 5)) {
      return res.status(400).json({ error: `A specific reason (minimum 5 characters) is required when marking a document as ${status.replace(/_/g, ' ')}.` });
    }

    const doc = db.prepare('SELECT * FROM vendor_documents WHERE id = ?').get(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Vendor document not found.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE vendor_documents
      SET verification_status = ?,
          verification_notes = ?,
          verified_by = ?,
          verified_at = ?
      WHERE id = ?
    `).run(status, notes ? notes.trim() : null, req.user.id, now, doc.id);

    const updatedDoc = db.prepare(`
      SELECT vd.*, u.full_name as verified_by_name
      FROM vendor_documents vd
      LEFT JOIN users u ON vd.verified_by = u.id
      WHERE vd.id = ?
    `).get(doc.id);

    logAudit(req.user.id, 'VENDOR_DOCUMENT_REVIEWED', 'vendor_documents', doc.id, {
      vendor_id: doc.user_id,
      doc_type: doc.doc_type,
      filename: doc.original_filename,
      previous_status: doc.verification_status,
      new_status: status,
      notes: notes || null
    }, getClientIp(req));

    createNotification(
      doc.user_id,
      `Document Review: ${doc.doc_type.replace(/_/g, ' ')}`,
      `Your document "${doc.original_filename}" has been marked "${status.replace(/_/g, ' ')}" by the Tender Officer.${notes ? ' Note: ' + notes : ''}`,
      '/my-bids'
    );

    res.json({
      success: true,
      document: updatedDoc
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin reviews and verifies / approves / suspends vendor account (Requirement 2, 3, 5)
// Strictly enforces mandatory document verification before final approval
router.post('/admin/vendors/:id/verify', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { action, notes } = req.body; // 'APPROVE', 'REJECT', 'SUSPEND'
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ error: 'Vendor account not found.' });
    }
    if (targetUser.role !== 'bidder') {
      return res.status(400).json({ error: 'Target user is not a vendor enterprise.' });
    }

    let newStatus = targetUser.verification_status;
    let actionLabel = '';

    if (action === 'APPROVE') {
      // Enforce mandatory document verification requirements (Requirement 3)
      const docs = db.prepare('SELECT * FROM vendor_documents WHERE user_id = ?').all(targetUser.id);
      const mandatoryRequirements = [
        { type: 'BUSINESS_REGISTRATION', label: 'Certificate of Incorporation / Registration' },
        { type: 'TAX_REGISTRATION', label: 'GSTIN / Tax Clearance Certificate' },
        { type: 'PAN_CARD', label: 'Corporate PAN Card' }
      ];

      const missing = [];
      const unverified = [];

      for (const reqItem of mandatoryRequirements) {
        const found = docs.find(d => d.doc_type === reqItem.type);
        if (!found) {
          missing.push(reqItem.label);
        } else if (found.verification_status !== 'VERIFIED') {
          unverified.push(`${reqItem.label} (Current status: ${found.verification_status.replace(/_/g, ' ')})`);
        }
      }

      if (missing.length > 0 || unverified.length > 0) {
        const issues = [];
        if (missing.length > 0) issues.push(`Missing mandatory document(s): ${missing.join(', ')}`);
        if (unverified.length > 0) issues.push(`Unverified document(s): ${unverified.join(', ')}`);

        return res.status(400).json({
          error: `Cannot approve vendor enterprise: Mandatory verification requirements are not fulfilled. ${issues.join('. ')}. All mandatory documents must be uploaded and individually verified by an authorized officer.`
        });
      }

      newStatus = 'VERIFIED';
      actionLabel = 'APPROVED';
    } else if (action === 'REJECT') {
      if (!notes || notes.trim().length < 5) {
        return res.status(400).json({ error: 'A specific administrative reason (at least 5 characters) is required when rejecting a vendor verification.' });
      }
      newStatus = 'REJECTED';
      actionLabel = 'REJECTED';
    } else if (action === 'SUSPEND') {
      if (!notes || notes.trim().length < 5) {
        return res.status(400).json({ error: 'A specific reason (at least 5 characters) is required when suspending a vendor verification.' });
      }
      newStatus = 'SUSPENDED';
      actionLabel = 'SUSPENDED';
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be APPROVE, REJECT, or SUSPEND.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET verification_status = ?,
          verified_by = ?,
          verified_at = ?,
          verification_notes = ?
      WHERE id = ?
    `).run(newStatus, req.user.id, now, notes ? notes.trim() : null, targetUser.id);

    logAudit(req.user.id, `VENDOR_ACCOUNT_${actionLabel}`, 'users', targetUser.id, {
      target_email: targetUser.email,
      company: targetUser.organization,
      previous_status: targetUser.verification_status,
      new_status: newStatus,
      notes: notes || null
    }, getClientIp(req));

    createNotification(
      targetUser.id,
      `Enterprise Verification: ${newStatus}`,
      `Your business account verification has been set to "${newStatus}" by Procurement Authority. ${notes ? 'Notes: ' + notes : ''}`,
      '/my-bids'
    );

    res.json({
      success: true,
      user_id: targetUser.id,
      verification_status: newStatus,
      verified_at: now
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secure Document Viewing Endpoint (Supports PDF and images inline) (Requirement 1 & 4)
router.get('/vendor-documents/:id/view', authenticateToken, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM vendor_documents WHERE id = ?').get(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Vendor document not found.' });
    }

    // Role check: officer OR document owner (Requirement 4)
    const isOwner = req.user.id === doc.user_id;
    const isOfficer = req.user.role === 'officer';
    if (!isOwner && !isOfficer) {
      logAudit(req.user.id, 'UNAUTHORIZED_VENDOR_DOC_ACCESS', 'vendor_documents', doc.id, {}, getClientIp(req));
      return res.status(403).json({ error: 'Unauthorized: You do not have permission to view this vendor document.' });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'Document file not found on server storage.' });
    }

    logAudit(req.user.id, 'VENDOR_DOC_VIEWED', 'vendor_documents', doc.id, {
      filename: doc.original_filename,
      mime_type: doc.mime_type
    }, getClientIp(req));

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_filename)}"`);
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secure Document Download Endpoint (Attachment) (Requirement 1 & 4)
router.get('/vendor-documents/:id/download', authenticateToken, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM vendor_documents WHERE id = ?').get(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Vendor document not found.' });
    }

    const isOwner = req.user.id === doc.user_id;
    const isOfficer = req.user.role === 'officer';
    if (!isOwner && !isOfficer) {
      logAudit(req.user.id, 'UNAUTHORIZED_VENDOR_DOC_ACCESS', 'vendor_documents', doc.id, {}, getClientIp(req));
      return res.status(403).json({ error: 'Unauthorized: You do not have permission to download this vendor document.' });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'Document file not found on server storage.' });
    }

    logAudit(req.user.id, 'VENDOR_DOC_DOWNLOADED', 'vendor_documents', doc.id, {
      filename: doc.original_filename
    }, getClientIp(req));

    res.download(doc.file_path, doc.original_filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vendor retrieves own verification documents and compliance checklist (Requirement 4)
router.get('/vendor/documents', authenticateToken, requireBidder, (req, res) => {
  try {
    const docs = db.prepare(`
      SELECT vd.*, u.full_name as verified_by_name
      FROM vendor_documents vd
      LEFT JOIN users u ON vd.verified_by = u.id
      WHERE vd.user_id = ?
      ORDER BY vd.uploaded_at DESC
    `).all(req.user.id);

    const mandatoryTypes = [
      { type: 'BUSINESS_REGISTRATION', label: 'Certificate of Incorporation / Registration', required: true },
      { type: 'TAX_REGISTRATION', label: 'GSTIN / Tax Certificate', required: true },
      { type: 'PAN_CARD', label: 'Corporate PAN Card', required: true }
    ];

    const checklist = mandatoryTypes.map(m => {
      const doc = docs.find(d => d.doc_type === m.type);
      return {
        type: m.type,
        label: m.label,
        required: true,
        is_uploaded: !!doc,
        verification_status: doc ? doc.verification_status : 'MISSING',
        document: doc || null
      };
    });

    res.json({
      documents: docs,
      checklist,
      verification_status: req.user.verification_status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vendor uploads/resubmits a verification document post-registration (Requirement 4)
router.post('/vendor/documents', authenticateToken, requireBidder, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document file provided for upload.' });
    }

    const { doc_type } = req.body;
    const validTypes = ['BUSINESS_REGISTRATION', 'TAX_REGISTRATION', 'PAN_CARD', 'POWER_OF_ATTORNEY', 'FINANCIAL_STATEMENT', 'OTHER'];
    const chosenType = validTypes.includes(doc_type) ? doc_type : 'OTHER';

    const now = new Date().toISOString();
    const docId = 'vdoc_' + crypto.randomUUID().slice(0, 10);

    let extractedText = '';
    let ocrStatus = 'NOT_NEEDED';
    try {
      const ocrResult = await extractTextFromDocument(req.file.path, req.file.mimetype);
      extractedText = ocrResult.text || '';
      ocrStatus = ocrResult.status || 'EXTRACTED';
    } catch (e) {
      ocrStatus = 'FAILED';
    }

    db.prepare(`
      INSERT INTO vendor_documents (
        id, user_id, doc_type, original_filename, stored_filename, file_path,
        file_size, mime_type, verification_status, extracted_text, ocr_status, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, ?)
    `).run(
      docId,
      req.user.id,
      chosenType,
      req.file.originalname,
      req.file.filename,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      extractedText,
      ocrStatus,
      now
    );

    // If vendor was in EMAIL_PENDING and has verified email, update to VERIFICATION_PENDING
    if (req.user.verification_status === 'EMAIL_PENDING' && req.user.email_verified_at) {
      db.prepare("UPDATE users SET verification_status = 'VERIFICATION_PENDING' WHERE id = ?").run(req.user.id);
    }

    logAudit(req.user.id, 'VENDOR_DOC_UPLOADED', 'vendor_documents', docId, {
      doc_type: chosenType,
      filename: req.file.originalname,
      file_size: req.file.size
    }, getClientIp(req));

    const officers = db.prepare("SELECT id FROM users WHERE role = 'officer'").all();
    officers.forEach(off => {
      createNotification(
        off.id,
        'Vendor Verification Document Uploaded',
        `${req.user.organization || req.user.full_name} uploaded ${chosenType.replace(/_/g, ' ')} for review.`,
        '/approvals'
      );
    });

    const newDoc = db.prepare('SELECT * FROM vendor_documents WHERE id = ?').get(docId);
    res.status(201).json({
      success: true,
      message: 'Document successfully uploaded and queued for review.',
      document: newDoc
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin reviews and approves / rejects officer account (Requirement 3 & 5)
router.post('/admin/officers/:id/approve', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { action, notes } = req.body; // 'APPROVE', 'REJECT', 'SUSPEND'
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ error: 'Officer account not found.' });
    }
    if (targetUser.role !== 'officer') {
      return res.status(400).json({ error: 'Target user is not an officer.' });
    }

    let newStatus = targetUser.verification_status;
    let actionLabel = '';

    if (action === 'APPROVE') {
      newStatus = 'APPROVED';
      actionLabel = 'APPROVED';
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      actionLabel = 'REJECTED';
    } else if (action === 'SUSPEND') {
      newStatus = 'SUSPENDED';
      actionLabel = 'SUSPENDED';
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be APPROVE, REJECT, or SUSPEND.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET verification_status = ?,
          verified_by = ?,
          verified_at = ?,
          verification_notes = ?
      WHERE id = ?
    `).run(newStatus, req.user.id, now, notes ? notes.trim() : null, targetUser.id);

    logAudit(req.user.id, `OFFICER_ACCOUNT_${actionLabel}`, 'users', targetUser.id, {
      target_email: targetUser.email,
      department: targetUser.department,
      previous_status: targetUser.verification_status,
      new_status: newStatus,
      notes
    }, getClientIp(req));

    createNotification(
      targetUser.id,
      `Officer Authority: ${newStatus}`,
      `Your procurement officer authority status has been updated to "${newStatus}".`,
      '/dashboard'
    );

    res.json({
      success: true,
      user_id: targetUser.id,
      verification_status: newStatus,
      verified_at: now
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   3. TENDERS ENDPOINTS
   ========================================================================= */

// List tenders
router.get('/tenders', (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT t.*, u.full_name as officer_name,
             (SELECT COUNT(*) FROM applications WHERE tender_id = t.id) as total_applications
      FROM tenders t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (t.title LIKE ? OR t.tender_ref LIKE ? OR t.category LIKE ? OR t.department LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY t.created_at DESC';
    const tenders = db.prepare(query).all(...params);
    res.json({ tenders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single tender details
router.get('/tenders/:id', (req, res) => {
  try {
    const tender = db.prepare(`
      SELECT t.*, u.full_name as officer_name, u.organization as officer_org
      FROM tenders t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    const apps = db.prepare(`
      SELECT id, company_name, bid_amount, currency, submission_date, status,
             ai_compliance_score, ai_risk_score, ai_risk_level, ai_recommendation, official_decision
      FROM applications
      WHERE tender_id = ?
      ORDER BY submission_date DESC
    `).all(req.params.id);

    res.json({ tender, applications: apps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Officer creates a new tender (Requirements 3, 4, 6)
router.post('/tenders', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { title, tender_ref, category, department, budget, currency, deadline, requirements } = req.body;

    if (!title || !tender_ref || !budget || !deadline) {
      return res.status(400).json({ error: 'Title, tender reference code, budget, and deadline are required.' });
    }

    // Scope check: Ensure officer is authorized for this category/department (Requirement 4)
    if (req.user.authorized_tenders_scope && req.user.authorized_tenders_scope !== 'ALL') {
      const allowedScopes = req.user.authorized_tenders_scope.split(',').map(s => s.trim().toUpperCase());
      const tenderCat = (category || 'General Procurement').toUpperCase();
      const tenderDept = (department || '').toUpperCase();
      const matches = allowedScopes.some(s => tenderCat.includes(s) || tenderDept.includes(s));
      if (!matches) {
        return res.status(403).json({
          error: `Scope authorization failed: Your procurement credentials only permit publishing tenders within [${req.user.authorized_tenders_scope}]. Cannot publish tender in category "${category}".`
        });
      }
    }

    const id = 'tnd_' + crypto.randomUUID().slice(0, 10);
    const now = new Date().toISOString();
    const reqJson = typeof requirements === 'string' ? requirements : JSON.stringify(requirements || {
      required_docs: ['TAX_CLEARANCE', 'FINANCIAL_AUDIT', 'COMPANY_REGISTRATION', 'TECHNICAL_PROPOSAL', 'BID_BOND']
    });

    db.prepare(`
      INSERT INTO tenders (
        id, tender_ref, title, category, department, budget, currency,
        deadline, status, requirements_json, created_by, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?)
    `).run(
      id,
      tender_ref.trim(),
      title.trim(),
      category || 'General Procurement',
      department || req.user.department || 'Public Procurement Board',
      parseFloat(budget),
      currency || 'USD',
      deadline,
      reqJson,
      req.user.id,
      now,
      now,
      now
    );

    logAudit(req.user.id, 'TENDER_PUBLISHED', 'tenders', id, { title, tender_ref, budget, department }, getClientIp(req));

    // Notify registered bidders of new published tender
    const bidders = db.prepare("SELECT id FROM users WHERE role = 'bidder'").all();
    bidders.forEach(b => {
      createNotification(b.id, 'New Tender Published', `Tender "${title}" has been published with budget $${parseFloat(budget).toLocaleString()}.`, `/tenders/${id}`);
    });

    const newTender = db.prepare('SELECT * FROM tenders WHERE id = ?').get(id);
    res.status(201).json({ success: true, tender: newTender });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Officer updates tender status
router.patch('/tenders/:id/status', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!['DRAFT', 'PUBLISHED', 'UNDER_EVALUATION', 'AWARDED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid tender status value.' });
    }

    const tender = db.prepare('SELECT * FROM tenders WHERE id = ?').get(req.params.id);
    if (!tender) return res.status(404).json({ error: 'Tender not found' });

    db.prepare('UPDATE tenders SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), req.params.id);

    logAudit(req.user.id, 'TENDER_STATUS_CHANGED', 'tenders', req.params.id, {
      from: tender.status,
      to: status,
      reason
    }, getClientIp(req));

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   4. APPLICATIONS / BIDS ENDPOINTS
   ========================================================================= */

// Bidder submits application with documents (Requirements 2, 4, 6)
// Strictly requires VERIFIED vendor account
router.post('/applications', authenticateToken, requireVerifiedBidder, upload.any(), async (req, res) => {
  try {
    const {
      tender_id,
      company_name,
      tax_id,
      registration_number,
      bid_amount,
      currency,
      contact_person,
      contact_email
    } = req.body;

    // Explicit verification check (Requirement 2 & 7)
    if (req.user.verification_status !== 'VERIFIED') {
      return res.status(403).json({
        error: `Vendor account is not verified. Current status: "${req.user.verification_status}". Only verified and approved vendor enterprises may submit bids.`
      });
    }

    if (!tender_id || !company_name || !tax_id || !bid_amount) {
      return res.status(400).json({ error: 'Tender ID, company name, tax ID, and bid amount are required.' });
    }

    const tender = db.prepare('SELECT * FROM tenders WHERE id = ?').get(tender_id);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    // Check if tender is open
    if (tender.status !== 'PUBLISHED' && tender.status !== 'UNDER_EVALUATION') {
      return res.status(400).json({ error: 'Tender is not currently accepting submissions.' });
    }

    // Check if bidder already applied
    const existing = db.prepare('SELECT id FROM applications WHERE tender_id = ? AND bidder_id = ?').get(tender_id, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted an application for this tender. Use document resubmission for updates.' });
    }

    const appId = 'app_' + crypto.randomUUID().slice(0, 10);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO applications (
        id, tender_id, bidder_id, company_name, tax_id, registration_number,
        bid_amount, currency, contact_person, contact_email, submission_date,
        status, ai_compliance_score, ai_risk_score, ai_risk_level, ai_recommendation,
        official_decision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', 0, 0, 'LOW', 'RECOMMEND_QUALIFY', 'PENDING', ?, ?)
    `).run(
      appId,
      tender_id,
      req.user.id,
      company_name.trim(),
      tax_id.trim(),
      registration_number ? registration_number.trim() : 'N/A',
      parseFloat(bid_amount),
      currency || 'USD',
      contact_person || req.user.full_name,
      contact_email || req.user.email,
      now,
      now,
      now
    );

    // Process uploaded documents
    const files = req.files || [];
    const insertDoc = db.prepare(`
      INSERT INTO documents (
        id, application_id, doc_type, original_filename, stored_filename,
        file_path, file_size, mime_type, extracted_text, ocr_status, is_resubmission, version, uploaded_at,
        review_status, mismatch_warning, automated_findings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, 'PENDING_REVIEW', ?, ?)
    `);

    for (const file of files) {
      // Determine doc_type from fieldname or filename
      let docType = 'TECHNICAL_PROPOSAL';
      const fName = file.fieldname.toUpperCase();
      if (fName.includes('TAX')) docType = 'TAX_CLEARANCE';
      else if (fName.includes('FINANCIAL') || fName.includes('AUDIT')) docType = 'FINANCIAL_AUDIT';
      else if (fName.includes('REG') || fName.includes('COMPANY')) docType = 'COMPANY_REGISTRATION';
      else if (fName.includes('BOND') || fName.includes('GUARANTEE')) docType = 'BID_BOND';
      else if (fName.includes('EXP') || fName.includes('CERT')) docType = 'EXPERIENCE_CERTIFICATE';

      // Run PDF text extraction / OCR
      let extractedText = '';
      let ocrStatus = 'NOT_NEEDED';
      try {
        const ocrResult = await extractTextFromDocument(file.path, file.mimetype);
        extractedText = ocrResult.text || '';
        ocrStatus = ocrResult.status || 'EXTRACTED';
      } catch (docErr) {
        console.warn('Doc extraction notice:', docErr.message);
        ocrStatus = 'FAILED';
      }

      // Check for content mismatch (Part 2 C)
      const mismatchCheck = detectDocumentMismatch(docType, extractedText, file.originalname);

      insertDoc.run(
        'doc_' + crypto.randomUUID().slice(0, 10),
        appId,
        docType,
        file.originalname,
        file.filename,
        file.path,
        file.size,
        file.mimetype,
        extractedText,
        ocrStatus,
        now,
        mismatchCheck.warning || null,
        JSON.stringify(mismatchCheck)
      );
    }

    // Run AI Evaluation
    const aiResult = evaluateApplicationAI(appId);

    // Record Status History & Audit Log
    recordStatusChange(appId, null, 'SUBMITTED', req.user.id, 'Bid submitted by applicant.');
    logAudit(req.user.id, 'BID_SUBMITTED', 'applications', appId, {
      company: company_name,
      amount: bid_amount,
      files_count: files.length
    }, getClientIp(req));

    // Notify procurement officers
    const officers = db.prepare("SELECT id FROM users WHERE role = 'officer'").all();
    officers.forEach(off => {
      createNotification(off.id, 'New Bid Submitted', `${company_name} submitted a bid for Tender ${tender.tender_ref}.`, `/tenders/${tender.id}`);
    });

    const fullApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
    res.status(201).json({
      success: true,
      application: fullApp,
      ai_evaluation: aiResult
    });
  } catch (err) {
    console.error('Submission error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List applications (Officer sees all, Bidder sees ONLY own)
router.get('/applications', authenticateToken, (req, res) => {
  try {
    const { tender_id, status } = req.query;
    let query = `
      SELECT a.*, t.title as tender_title, t.tender_ref, t.budget as tender_budget,
             u.email as bidder_email
      FROM applications a
      JOIN tenders t ON a.tender_id = t.id
      JOIN users u ON a.bidder_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // STRICT ROLE SEPARATION: Bidders can only query their own bids
    if (req.user.role === 'bidder') {
      query += ' AND a.bidder_id = ?';
      params.push(req.user.id);
    }

    if (tender_id) {
      query += ' AND a.tender_id = ?';
      params.push(tender_id);
    }

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    query += ' ORDER BY a.submission_date DESC';
    const applications = db.prepare(query).all(...params);
    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single application details: strictly authorized to owner or officer
router.get('/applications/:id', authenticateToken, (req, res) => {
  try {
    const app = db.prepare(`
      SELECT a.*, t.title as tender_title, t.tender_ref, t.budget as tender_budget,
             t.department, t.category, t.requirements_json, t.deadline as tender_deadline,
             u.full_name as bidder_name, u.email as bidder_email, u.organization as bidder_org, u.phone as bidder_phone,
             u.verification_status as vendor_verification_status, u.entity_type as vendor_entity_type,
             u.cin_llpin as vendor_cin_llpin, u.gstin as vendor_gstin, u.pan as vendor_pan,
             u.business_address as vendor_address, u.rep_name as vendor_rep_name,
             u.rep_designation as vendor_rep_designation, u.rep_phone as vendor_rep_phone,
             o.full_name as decided_by_name
      FROM applications a
      JOIN tenders t ON a.tender_id = t.id
      JOIN users u ON a.bidder_id = u.id
      LEFT JOIN users o ON a.decided_by = o.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Role check: Only bid owner or officer can view details (Requirement G)
    if (req.user.role === 'bidder' && app.bidder_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: You cannot access other bidders\' private applications.' });
    }

    const documents = db.prepare(`
      SELECT id, application_id, doc_type, original_filename, stored_filename, file_size, mime_type,
             ocr_status, is_resubmission, version, uploaded_at,
             review_status, review_notes, reviewed_by, reviewed_at,
             mismatch_warning, automated_findings, extracted_text
      FROM documents
      WHERE application_id = ?
      ORDER BY uploaded_at DESC
    `).all(req.params.id);

    const clarifications = db.prepare(`
      SELECT c.*, u.full_name as sender_name
      FROM clarifications c
      JOIN users u ON c.sender_id = u.id
      WHERE c.application_id = ?
      ORDER BY c.created_at ASC
    `).all(req.params.id);

    const history = db.prepare(`
      SELECT h.*, u.full_name as changed_by_name, u.role as changed_by_role
      FROM status_history h
      JOIN users u ON h.changed_by = u.id
      WHERE h.application_id = ?
      ORDER BY h.created_at ASC
    `).all(req.params.id);

    const auditLogs = db.prepare(`
      SELECT l.*, u.full_name as user_name, u.role as user_role
      FROM audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE (l.entity_type = 'applications' AND l.entity_id = ?)
         OR (l.entity_type = 'documents' AND l.entity_id IN (SELECT id FROM documents WHERE application_id = ?))
         OR (l.entity_type = 'clarifications' AND l.entity_id IN (SELECT id FROM clarifications WHERE application_id = ?))
      ORDER BY l.created_at DESC
      LIMIT 50
    `).all(req.params.id, req.params.id, req.params.id);

    res.json({
      application: app,
      documents,
      clarifications,
      history,
      audit_logs: auditLogs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bidder resubmits document
router.post('/applications/:id/resubmit-doc', authenticateToken, requireBidder, upload.single('document'), async (req, res) => {
  try {
    const { doc_type, notes } = req.body;
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);

    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (app.bidder_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: You are not the owner of this bid.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No document file uploaded.' });
    }

    const type = doc_type || 'TECHNICAL_PROPOSAL';

    const existingCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE application_id = ? AND doc_type = ?')
      .get(app.id, type).count;

    let extractedText = '';
    let ocrStatus = 'NOT_NEEDED';
    try {
      const ocrResult = await extractTextFromDocument(req.file.path, req.file.mimetype);
      extractedText = ocrResult.text || '';
      ocrStatus = ocrResult.status || 'EXTRACTED';
    } catch (e) {
      ocrStatus = 'FAILED';
    }

    const now = new Date().toISOString();
    const docId = 'doc_' + crypto.randomUUID().slice(0, 10);

    const mismatchCheck = detectDocumentMismatch(type, extractedText, req.file.originalname);

    db.prepare(`
      INSERT INTO documents (
        id, application_id, doc_type, original_filename, stored_filename,
        file_path, file_size, mime_type, extracted_text, ocr_status, is_resubmission, version, uploaded_at,
        review_status, mismatch_warning, automated_findings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'PENDING_REVIEW', ?, ?)
    `).run(
      docId,
      app.id,
      type,
      req.file.originalname,
      req.file.filename,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      extractedText,
      ocrStatus,
      existingCount + 1,
      now,
      mismatchCheck.warning || null,
      JSON.stringify(mismatchCheck)
    );

    const reEvaluation = evaluateApplicationAI(app.id);

    const prevStatus = app.status;
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
      .run('UNDER_REVIEW', now, app.id);

    recordStatusChange(app.id, prevStatus, 'UNDER_REVIEW', req.user.id, `Document ${type} resubmitted: ${req.file.originalname}. ${notes || ''}`);
    logAudit(req.user.id, 'DOCUMENT_RESUBMITTED', 'documents', docId, {
      application_id: app.id,
      doc_type: type,
      filename: req.file.originalname
    }, getClientIp(req));

    const officers = db.prepare("SELECT id FROM users WHERE role = 'officer'").all();
    officers.forEach(off => {
      createNotification(off.id, 'Document Resubmitted', `${app.company_name} resubmitted ${type} for their bid.`, `/applications/${app.id}`);
    });

    res.json({
      success: true,
      message: 'Document successfully resubmitted and re-evaluated.',
      reEvaluation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Officer issues Official Final Decision (Requirements 3, 4, 6)
router.post('/applications/:id/decision', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { official_decision, notes } = req.body;

    if (!['APPROVED', 'DISQUALIFIED', 'AWARDED', 'REJECTED', 'PENDING'].includes(official_decision)) {
      return res.status(400).json({ error: 'Invalid official decision status.' });
    }

    if (!notes || notes.trim().length < 5) {
      return res.status(400).json({ error: 'Officer decision rationale notes are required for administrative compliance.' });
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const prevStatus = app.status;
    let newAppStatus = app.status;

    if (official_decision === 'APPROVED') newAppStatus = 'QUALIFIED';
    else if (official_decision === 'DISQUALIFIED') newAppStatus = 'DISQUALIFIED';
    else if (official_decision === 'AWARDED') newAppStatus = 'AWARDED';
    else if (official_decision === 'REJECTED') newAppStatus = 'REJECTED';

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE applications
      SET official_decision = ?,
          official_decision_notes = ?,
          decided_by = ?,
          decided_at = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      official_decision,
      notes.trim(),
      req.user.id,
      now,
      newAppStatus,
      now,
      app.id
    );

    recordStatusChange(app.id, prevStatus, newAppStatus, req.user.id, `Official Decision: ${official_decision}. Rationale: ${notes}`);
    logAudit(req.user.id, 'OFFICIAL_DECISION_RECORDED', 'applications', app.id, {
      decision: official_decision,
      notes: notes,
      ai_recommendation: app.ai_recommendation
    }, getClientIp(req));

    createNotification(
      app.bidder_id,
      `Official Tender Decision: ${official_decision}`,
      `Your bid for Tender has been officially evaluated: ${official_decision}. Review notes in portal.`,
      `/my-bids`
    );

    res.json({
      success: true,
      official_decision,
      status: newAppStatus,
      notes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   5. CLARIFICATIONS & MESSAGING
   ========================================================================= */

// Officer issues clarification request (Requirements 3, 4, 6)
router.post('/applications/:id/clarifications', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { message, requested_doc_types } = req.body;
    if (!message || message.trim().length < 5) {
      return res.status(400).json({ error: 'Clarification message text is required.' });
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const clrId = 'clr_' + crypto.randomUUID().slice(0, 10);
    const now = new Date().toISOString();
    const docsJson = Array.isArray(requested_doc_types) ? JSON.stringify(requested_doc_types) : '[]';

    db.prepare(`
      INSERT INTO clarifications (
        id, application_id, sender_id, sender_role, message, requested_doc_types_json, created_at
      ) VALUES (?, ?, ?, 'officer', ?, ?, ?)
    `).run(clrId, app.id, req.user.id, message.trim(), docsJson, now);

    const prevStatus = app.status;
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
      .run('CLARIFICATION_REQUESTED', now, app.id);

    recordStatusChange(app.id, prevStatus, 'CLARIFICATION_REQUESTED', req.user.id, `Officer issued formal clarification request: ${message.slice(0, 100)}...`);
    logAudit(req.user.id, 'CLARIFICATION_REQUESTED', 'clarifications', clrId, {
      application_id: app.id,
      message,
      requested_doc_types
    }, getClientIp(req));

    createNotification(
      app.bidder_id,
      'Clarification Requested on Your Bid',
      `Procurement officer requested clarification: "${message.slice(0, 80)}..."`,
      `/my-bids`
    );

    res.status(201).json({ success: true, clarification_id: clrId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bidder responds to clarification request
router.post('/clarifications/:id/respond', authenticateToken, requireBidder, (req, res) => {
  try {
    const { response_text } = req.body;
    if (!response_text || response_text.trim().length < 5) {
      return res.status(400).json({ error: 'Response text is required.' });
    }

    const clr = db.prepare('SELECT * FROM clarifications WHERE id = ?').get(req.params.id);
    if (!clr) {
      return res.status(404).json({ error: 'Clarification thread not found' });
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(clr.application_id);
    if (!app || app.bidder_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to respond to this clarification.' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE clarifications SET response_text = ?, responded_at = ? WHERE id = ?')
      .run(response_text.trim(), now, clr.id);

    const prevStatus = app.status;
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?')
      .run('UNDER_REVIEW', now, app.id);

    recordStatusChange(app.id, prevStatus, 'UNDER_REVIEW', req.user.id, `Bidder submitted response to clarification request.`);
    logAudit(req.user.id, 'CLARIFICATION_RESPONDED', 'clarifications', clr.id, {
      application_id: app.id
    }, getClientIp(req));

    const officers = db.prepare("SELECT id FROM users WHERE role = 'officer'").all();
    officers.forEach(off => {
      createNotification(off.id, 'Clarification Response Received', `${app.company_name} responded to clarification request.`, `/applications/${app.id}`);
    });

    res.json({ success: true, message: 'Clarification response submitted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   6. BID RISK ANALYSIS & SIMILARITY EVALUATION (Approved Officer Only)
   ========================================================================= */

router.get('/tenders/:id/collusion-analysis', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const analysis = analyzeTenderCollusion(req.params.id);
    logAudit(req.user.id, 'COLLUSION_ANALYSIS_RUN', 'tenders', req.params.id, {
      proposals_analyzed: analysis.total_proposals || 0
    }, getClientIp(req));
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   7. SECURE DOCUMENT ACCESS / DOWNLOAD
   (Server-side Authorization Enforced - Requirement D.5)
   ========================================================================= */

router.get('/documents/:id/download', authenticateToken, (req, res) => {
  try {
    const doc = db.prepare(`
      SELECT d.*, a.bidder_id
      FROM documents d
      JOIN applications a ON d.application_id = a.id
      WHERE d.id = ?
    `).get(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Server-side authorization check: strictly bidder owner OR procurement officer
    const isOwner = req.user.id === doc.bidder_id;
    const isOfficer = req.user.role === 'officer';

    if (!isOwner && !isOfficer) {
      logAudit(req.user.id, 'UNAUTHORIZED_FILE_ACCESS_ATTEMPT', 'documents', doc.id, {}, getClientIp(req));
      return res.status(403).json({ error: 'Unauthorized: You do not have permission to access this procurement file.' });
    }

    if (!fs.existsSync(doc.file_path)) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename}.txt"`);
      return res.send(doc.extracted_text || 'Procurement document text contents.');
    }

    logAudit(req.user.id, 'FILE_DOWNLOADED', 'documents', doc.id, {
      original_filename: doc.original_filename
    }, getClientIp(req));

    res.download(doc.file_path, doc.original_filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secure Document View Endpoint (Stream inline for PDF/images) (Part 1 C)
router.get('/documents/:id/view', authenticateToken, (req, res) => {
  try {
    const doc = db.prepare(`
      SELECT d.*, a.bidder_id
      FROM documents d
      JOIN applications a ON d.application_id = a.id
      WHERE d.id = ?
    `).get(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const isOwner = req.user.id === doc.bidder_id;
    const isOfficer = req.user.role === 'officer';

    if (!isOwner && !isOfficer) {
      logAudit(req.user.id, 'UNAUTHORIZED_FILE_ACCESS_ATTEMPT', 'documents', doc.id, {}, getClientIp(req));
      return res.status(403).json({ error: 'Unauthorized: You do not have permission to view this procurement file.' });
    }

    if (!fs.existsSync(doc.file_path)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_filename)}.txt"`);
      return res.send(doc.extracted_text || 'Procurement document text contents.');
    }

    logAudit(req.user.id, 'DOCUMENT_VIEWED', 'documents', doc.id, {
      original_filename: doc.original_filename,
      mime_type: doc.mime_type
    }, getClientIp(req));

    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_filename)}"`);
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Officer Manual Review of Individual Bid Document (Part 1 D)
router.patch('/documents/:id/review', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { status, notes, override_finding } = req.body;
    if (!['PENDING_REVIEW', 'VERIFIED', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid review status. Must be PENDING_REVIEW, VERIFIED, NEEDS_CLARIFICATION, or REJECTED.' });
    }

    // Require reason when rejecting or overriding an automated finding (Part 1 D)
    if ((status === 'REJECTED' || override_finding) && (!notes || notes.trim().length < 5)) {
      return res.status(400).json({
        error: 'A specific explanation (minimum 5 characters) is required when rejecting a document or overriding an automated finding.'
      });
    }

    const doc = db.prepare(`
      SELECT d.*, a.bidder_id, a.tender_id
      FROM documents d
      JOIN applications a ON d.application_id = a.id
      WHERE d.id = ?
    `).get(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE documents
      SET review_status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(status, notes ? notes.trim() : null, req.user.id, now, doc.id);

    // Update overall application human review status
    const allDocs = db.prepare('SELECT review_status FROM documents WHERE application_id = ?').all(doc.application_id);
    const anyRejected = allDocs.some(d => d.review_status === 'REJECTED');
    const allVerified = allDocs.length > 0 && allDocs.every(d => d.review_status === 'VERIFIED');
    const anyClarify = allDocs.some(d => d.review_status === 'NEEDS_CLARIFICATION');

    let newHumanStatus = 'IN_REVIEW';
    if (anyRejected) newHumanStatus = 'REJECTED';
    else if (anyClarify) newHumanStatus = 'NEEDS_CLARIFICATION';
    else if (allVerified) newHumanStatus = 'REVIEWED';

    db.prepare('UPDATE applications SET human_review_status = ?, updated_at = ? WHERE id = ?')
      .run(newHumanStatus, now, doc.application_id);

    logAudit(req.user.id, 'DOCUMENT_REVIEW_UPDATED', 'documents', doc.id, {
      application_id: doc.application_id,
      doc_type: doc.doc_type,
      new_status: status,
      notes,
      override_finding: !!override_finding
    }, getClientIp(req));

    if (status === 'NEEDS_CLARIFICATION' || status === 'REJECTED') {
      createNotification(
        doc.bidder_id,
        `Document ${status === 'REJECTED' ? 'Rejected' : 'Needs Clarification'}: ${doc.doc_type}`,
        `Procurement officer reviewed your ${doc.doc_type} (${doc.original_filename}): ${notes || status}`,
        `/applications/${doc.application_id}`
      );
    }

    // Refresh application AI evaluation with updated document review state
    evaluateApplicationAI(doc.application_id);

    const updatedDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id);
    res.json({ success: true, document: updatedDoc, human_review_status: newHumanStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pre-submission document content validation & mismatch detection (Part 2 C)
router.post('/documents/pre-check', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document file uploaded for pre-check.' });
    }

    const { expected_doc_type } = req.body;
    let extractedText = '';
    let ocrStatus = 'NOT_NEEDED';

    try {
      const ocrResult = await extractTextFromDocument(req.file.path, req.file.mimetype);
      extractedText = ocrResult.text || '';
      ocrStatus = ocrResult.status || 'EXTRACTED';
    } catch (e) {
      ocrStatus = 'FAILED';
    }

    const check = detectDocumentMismatch(expected_doc_type || 'TECHNICAL_PROPOSAL', extractedText, req.file.originalname);

    res.json({
      success: true,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      ocr_status: ocrStatus,
      extracted_preview: extractedText ? extractedText.slice(0, 300) : '',
      mismatch: check.mismatch,
      warning: check.warning,
      detected_type: check.detectedType,
      detected_label: check.detectedLabel,
      unreadable: check.unreadable || false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tender Evaluation & Vendor Comparison Endpoint (Part 1 A & F)
router.get('/tenders/:id/comparison', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const tender = db.prepare('SELECT * FROM tenders WHERE id = ?').get(req.params.id);
    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    let reqObj = {};
    try {
      reqObj = JSON.parse(tender.requirements_json || '{}');
    } catch (e) {
      reqObj = {};
    }

    const requiredDocs = reqObj.required_docs || [];

    const apps = db.prepare(`
      SELECT a.*, u.email as bidder_email, u.full_name as rep_name, u.organization as vendor_org,
             u.verification_status as vendor_verification_status, u.phone as rep_phone,
             u.entity_type, u.cin_llpin, u.gstin, u.pan
      FROM applications a
      JOIN users u ON a.bidder_id = u.id
      WHERE a.tender_id = ?
      ORDER BY a.submission_date DESC
    `).all(tender.id);

    const comparativeApplications = apps.map(app => {
      const docs = db.prepare('SELECT * FROM documents WHERE application_id = ?').all(app.id);
      const clarifications = db.prepare('SELECT * FROM clarifications WHERE application_id = ?').all(app.id);

      const submittedTypes = new Set(docs.map(d => d.doc_type));
      const missingDocs = requiredDocs.filter(d => !submittedTypes.has(d));
      const verifiedDocsCount = docs.filter(d => d.review_status === 'VERIFIED').length;

      let clarificationStatus = 'NONE';
      if (clarifications.length > 0) {
        const lastClr = clarifications[clarifications.length - 1];
        clarificationStatus = lastClr.response_text ? 'RESPONDED' : 'CLARIFICATION_REQUESTED';
      }

      let requirementResults = [];
      try {
        requirementResults = app.requirement_results_json ? JSON.parse(app.requirement_results_json) : [];
      } catch (e) {
        requirementResults = [];
      }

      const priceRatio = tender.budget > 0 ? (app.bid_amount / tender.budget) : 1;

      return {
        id: app.id,
        company_name: app.company_name,
        vendor_verification_status: app.vendor_verification_status || 'VERIFIED',
        representative: {
          name: app.contact_person || app.rep_name,
          email: app.contact_email || app.bidder_email,
          phone: app.rep_phone
        },
        submission_date: app.submission_date,
        bid_amount: app.bid_amount,
        currency: app.currency,
        price_ratio_percent: parseFloat((priceRatio * 100).toFixed(1)),
        budget: tender.budget,
        documents_submitted_count: docs.length,
        required_documents_count: requiredDocs.length,
        documents_missing: missingDocs,
        document_verification_progress: `${verifiedDocsCount}/${docs.length} Verified`,
        compliance_score: app.compliance_score || app.ai_compliance_score || 0,
        compliance_status: app.compliance_status || (app.ai_compliance_score >= 85 ? 'COMPLIANT' : 'NEEDS_HUMAN_REVIEW'),
        technical_evaluation_status: app.technical_evaluation_status || 'QUALIFIED',
        human_review_status: app.human_review_status || 'PENDING_REVIEW',
        clarification_status: clarificationStatus,
        clarifications_count: clarifications.length,
        official_decision: app.official_decision || 'PENDING',
        status: app.status,
        documents: docs.map(d => ({
          id: d.id,
          doc_type: d.doc_type,
          original_filename: d.original_filename,
          review_status: d.review_status || 'PENDING_REVIEW',
          review_notes: d.review_notes,
          mismatch_warning: d.mismatch_warning,
          ocr_status: d.ocr_status,
          uploaded_at: d.uploaded_at
        })),
        requirement_results: requirementResults
      };
    });

    res.json({
      tender,
      required_docs: requiredDocs,
      total_applications: comparativeApplications.length,
      applications: comparativeApplications
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   8. AUDIT LOGS & STATUS HISTORY (Officer Only for Audit Logs)
   ========================================================================= */

router.get('/audit-logs', authenticateToken, requireApprovedOfficer, (req, res) => {
  try {
    const { action, entity_type, limit } = req.query;
    let query = `
      SELECT l.*, u.full_name as user_name, u.email as user_email, u.role as user_role
      FROM audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      query += ' AND l.action = ?';
      params.push(action);
    }
    if (entity_type) {
      query += ' AND l.entity_type = ?';
      params.push(entity_type);
    }

    const rowLimit = Math.min(parseInt(limit) || 100, 500);
    query += ` ORDER BY l.created_at DESC LIMIT ${rowLimit}`;

    const logs = db.prepare(query).all(...params);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/applications/:id/history', authenticateToken, (req, res) => {
  try {
    // Check application ownership or officer access
    const app = db.prepare('SELECT bidder_id FROM applications WHERE id = ?').get(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }
    if (req.user.role === 'bidder' && app.bidder_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to view this application history.' });
    }

    const history = db.prepare(`
      SELECT h.*, u.full_name as changed_by_name, u.role as changed_by_role
      FROM status_history h
      JOIN users u ON h.changed_by = u.id
      WHERE h.application_id = ?
      ORDER BY h.created_at ASC
    `).all(req.params.id);

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   9. NOTIFICATIONS
   ========================================================================= */

router.get('/notifications', authenticateToken, (req, res) => {
  try {
    const notifs = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    res.json({ notifications: notifs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/mark-all-read', authenticateToken, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
      .run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   10. DASHBOARD STATS
   ========================================================================= */

router.get('/dashboard/stats', authenticateToken, (req, res) => {
  try {
    if (req.user.role === 'officer') {
      const totalTenders = db.prepare('SELECT COUNT(*) as c FROM tenders').get().c;
      const activeTenders = db.prepare("SELECT COUNT(*) as c FROM tenders WHERE status = 'PUBLISHED'").get().c;
      const totalBids = db.prepare('SELECT COUNT(*) as c FROM applications').get().c;
      const highRiskBids = db.prepare("SELECT COUNT(*) as c FROM applications WHERE ai_risk_level = 'HIGH'").get().c;
      const uncertainBids = db.prepare("SELECT COUNT(*) as c FROM applications WHERE ai_risk_level = 'UNCERTAIN'").get().c;
      const pendingDecisions = db.prepare("SELECT COUNT(*) as c FROM applications WHERE official_decision = 'PENDING'").get().c;
      const clarificationsOpen = db.prepare("SELECT COUNT(*) as c FROM applications WHERE status = 'CLARIFICATION_REQUESTED'").get().c;

      res.json({
        total_tenders: totalTenders,
        active_tenders: activeTenders,
        total_bids: totalBids,
        high_risk_bids: highRiskBids,
        uncertain_bids: uncertainBids,
        pending_decisions: pendingDecisions,
        clarifications_open: clarificationsOpen
      });
    } else {
      const myBids = db.prepare('SELECT COUNT(*) as c FROM applications WHERE bidder_id = ?').get(req.user.id).c;
      const myClarifications = db.prepare("SELECT COUNT(*) as c FROM applications WHERE bidder_id = ? AND status = 'CLARIFICATION_REQUESTED'").get(req.user.id).c;
      const myQualified = db.prepare("SELECT COUNT(*) as c FROM applications WHERE bidder_id = ? AND status IN ('QUALIFIED', 'AWARDED')").get(req.user.id).c;

      res.json({
        my_bids: myBids,
        clarifications_pending: myClarifications,
        qualified_bids: myQualified
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   11. INTERNAL DIAGNOSTICS (Kept for internal monitoring only)
   ========================================================================= */

router.get('/system/diagnostics', (req, res) => {
  const dbPath = path.resolve(process.cwd(), 'data/bidcheck.db');
  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  res.json({
    app: 'BidCheck AI',
    version: '2.0.0',
    status: 'OPERATIONAL',
    database: {
      engine: 'SQLite3 (better-sqlite3 with WAL mode)',
      status: 'CONNECTED',
      size_bytes: dbSize
    },
    ocr_and_pdf: OCR_SYSTEM_REPORT,
    timestamp: new Date().toISOString()
  });
});

export default router;
