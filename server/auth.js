import 'dotenv/config';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, logAudit } from './db.js';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;

// Fail startup safely in production if JWT_SECRET is missing (Requirement D.1)
if (!JWT_SECRET) {
  if (isProduction) {
    console.error('[SECURITY ERROR] FATAL: JWT_SECRET environment variable is missing in production.');
    process.exit(1);
  } else {
    throw new Error('JWT_SECRET environment variable is required. Please set JWT_SECRET in your .env or environment configuration.');
  }
}

const TOKEN_EXPIRY = '7d';

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      organization: user.organization,
      verification_status: user.verification_status || 'VERIFIED',
      department: user.department || null,
      authorized_tenders_scope: user.authorized_tenders_scope || 'ALL'
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function authenticateToken(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.query && req.query.token) {
    // For protected file downloads initiated via browser window/tab
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or token invalid. Please log in again.' });
    }

    // Verify user still exists in database and fetch full verified status
    const user = db.prepare(`
      SELECT id, email, full_name, role, organization, phone,
             verification_status, department, official_designation, government_id_ref,
             authorized_tenders_scope, entity_type, cin_llpin, gstin, pan,
             business_address, rep_name, rep_designation, rep_phone, rep_email,
             email_verified_at, verified_by, verified_at, verification_notes, created_at
      FROM users WHERE id = ?
    `).get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }

    if (user.verification_status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Account suspended: Access has been suspended by administration.' });
    }

    req.user = user;
    next();
  });
}

// Basic role checks
export function requireOfficer(req, res, next) {
  if (!req.user || req.user.role !== 'officer') {
    return res.status(403).json({ error: 'Access denied: Procurement Officer credentials required.' });
  }
  next();
}

export function requireBidder(req, res, next) {
  if (!req.user || req.user.role !== 'bidder') {
    return res.status(403).json({ error: 'Access denied: Bidder authorization required.' });
  }
  next();
}

// Stricter verification & approval guards (Requirements 2, 3, 4)
export function requireApprovedOfficer(req, res, next) {
  if (!req.user || req.user.role !== 'officer') {
    return res.status(403).json({ error: 'Access denied: Procurement Officer credentials required.' });
  }
  if (req.user.verification_status !== 'APPROVED') {
    return res.status(403).json({
      error: `Access denied: Officer account status is "${req.user.verification_status || 'PENDING_VERIFICATION'}". Only approved procurement officers can publish tenders or record official decisions.`
    });
  }
  next();
}

export function requireVerifiedBidder(req, res, next) {
  if (!req.user || req.user.role !== 'bidder') {
    return res.status(403).json({ error: 'Access denied: Bidder authorization required.' });
  }
  if (req.user.verification_status !== 'VERIFIED') {
    return res.status(403).json({
      error: `Access denied: Vendor account status is "${req.user.verification_status || 'UNVERIFIED'}". Only verified and approved vendors may submit proposals. Please complete business verification.`
    });
  }
  next();
}

/**
 * Public self-registration (Requirements 1, 2, C):
 * NEVER trusts the role parameter from frontend or request payload.
 * Public registration is strictly restricted to creating 'bidder' accounts.
 * Collects entity type, CIN/LLPIN, GSTIN, PAN, and representative details.
 * Starts in 'EMAIL_PENDING' state until verified.
 */
export function registerUser({
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
  ipAddress
}) {
  if (!email || !password || !full_name) {
    throw new Error('Corporate email, password, and authorized representative name are required.');
  }

  // Force role to 'bidder' regardless of any client-supplied value
  const role = 'bidder';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    throw new Error('A user with this email address already exists.');
  }

  const id = 'usr_' + crypto.randomUUID().slice(0, 12);
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const now = new Date().toISOString();
  const emailToken = crypto.randomUUID();

  // Status transitions: EMAIL_PENDING -> VERIFICATION_PENDING -> VERIFIED / REJECTED / SUSPENDED
  const initialStatus = 'EMAIL_PENDING';

  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, role, organization, phone, created_at,
      verification_status, email_verification_token, entity_type,
      cin_llpin, gstin, pan, business_address, rep_name, rep_designation, rep_phone, rep_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    email.toLowerCase().trim(),
    passwordHash,
    full_name.trim(),
    role,
    organization ? organization.trim() : 'Registered Enterprise',
    phone || null,
    now,
    initialStatus,
    emailToken,
    entity_type || 'PRIVATE_LIMITED',
    cin_llpin ? cin_llpin.trim().toUpperCase() : null,
    gstin ? gstin.trim().toUpperCase() : null,
    pan ? pan.trim().toUpperCase() : null,
    business_address ? business_address.trim() : null,
    full_name.trim(),
    rep_designation ? rep_designation.trim() : 'Authorized Representative',
    rep_phone || phone || null,
    email.toLowerCase().trim()
  );

  logAudit(id, 'VENDOR_REGISTERED', 'users', id, {
    email,
    role,
    full_name,
    organization,
    entity_type: entity_type || 'PRIVATE_LIMITED',
    cin_llpin,
    gstin,
    pan,
    status: initialStatus
  }, ipAddress);

  const newUser = {
    id,
    email: email.toLowerCase().trim(),
    full_name: full_name.trim(),
    role,
    organization: organization || 'Registered Enterprise',
    phone: phone || null,
    verification_status: initialStatus,
    entity_type: entity_type || 'PRIVATE_LIMITED',
    cin_llpin,
    gstin,
    pan,
    business_address,
    rep_name: full_name.trim(),
    rep_designation: rep_designation || 'Authorized Representative'
  };

  const token = generateToken(newUser);
  return { user: newUser, token, verification_status: initialStatus };
}

/**
 * Verify Vendor Corporate Email
 */
export function verifyVendorEmail({ userId, ipAddress }) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('User not found.');
  }

  const now = new Date().toISOString();
  // Move from EMAIL_PENDING to VERIFICATION_PENDING (awaiting administrative business verification)
  const nextStatus = user.verification_status === 'EMAIL_PENDING' ? 'VERIFICATION_PENDING' : user.verification_status;

  db.prepare(`
    UPDATE users
    SET email_verified_at = ?,
        verification_status = ?
    WHERE id = ?
  `).run(now, nextStatus, userId);

  logAudit(userId, 'VENDOR_EMAIL_VERIFIED', 'users', userId, {
    previous_status: user.verification_status,
    new_status: nextStatus
  }, ipAddress);

  return {
    success: true,
    verification_status: nextStatus,
    email_verified_at: now
  };
}

/**
 * Authorized Administrative Officer Creation (Requirements 3, C.4):
 * Officer accounts can only be provisioned by an existing authenticated approved officer.
 */
export function createOfficerByAdmin({
  adminUser,
  email,
  password,
  full_name,
  organization,
  phone,
  department,
  official_designation,
  government_id_ref,
  authorized_tenders_scope,
  initial_status = 'APPROVED',
  ipAddress
}) {
  if (!adminUser || adminUser.role !== 'officer' || adminUser.verification_status !== 'APPROVED') {
    throw new Error('Unauthorized: Only an approved procurement officer can provision officer accounts.');
  }

  if (!email || !password || !full_name) {
    throw new Error('Email, password, and official full name are required.');
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    throw new Error('A user with this email address already exists.');
  }

  const id = 'usr_' + crypto.randomUUID().slice(0, 12);
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const now = new Date().toISOString();

  // Validate status
  const validStatuses = ['PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'SUSPENDED'];
  const status = validStatuses.includes(initial_status) ? initial_status : 'APPROVED';

  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, role, organization, phone, created_at,
      verification_status, department, official_designation, government_id_ref, authorized_tenders_scope,
      verified_by, verified_at
    )
    VALUES (?, ?, ?, ?, 'officer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    email.toLowerCase().trim(),
    passwordHash,
    full_name.trim(),
    organization || 'National Procurement Authority',
    phone || null,
    now,
    status,
    department || 'Department of Public Works',
    official_designation || 'Procurement Evaluation Officer',
    government_id_ref || `GOV-PO-${Math.floor(1000 + Math.random() * 9000)}`,
    authorized_tenders_scope || 'ALL',
    adminUser.id,
    now
  );

  logAudit(adminUser.id, 'OFFICER_ACCOUNT_PROVISIONED', 'users', id, {
    created_officer_email: email,
    full_name,
    department,
    official_designation,
    status
  }, ipAddress);

  return {
    id,
    email: email.toLowerCase().trim(),
    full_name: full_name.trim(),
    role: 'officer',
    organization: organization || 'National Procurement Authority',
    department: department || 'Department of Public Works',
    official_designation: official_designation || 'Procurement Evaluation Officer',
    verification_status: status
  };
}

/**
 * Two Distinct Login Options Authentication (Requirement 1):
 * Rejects cross-portal access attempts and enforces account active status.
 */
export function loginUser({ email, password, portalRole, ipAddress }) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    throw new Error('Invalid email or password.');
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password.');
  }

  // Account suspension check (Requirement 2 & 3)
  if (user.verification_status === 'SUSPENDED') {
    throw new Error('Account Suspended: This account has been suspended by the Procurement Authority. Access is revoked.');
  }

  // Strict role separation by login portal (Requirement 1)
  if (portalRole === 'officer' && user.role !== 'officer') {
    throw new Error('Access Denied: This portal is strictly for authorized Tender Officers and Government personnel. Vendors must sign in via the Vendor / Company Login portal.');
  }

  if (portalRole === 'bidder' && user.role !== 'bidder') {
    throw new Error('Government Officer account detected. Please sign in via the Tender Officer / Government Login portal.');
  }

  const sanitizedUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    organization: user.organization,
    phone: user.phone,
    verification_status: user.verification_status || 'VERIFIED',
    department: user.department || null,
    official_designation: user.official_designation || null,
    government_id_ref: user.government_id_ref || null,
    authorized_tenders_scope: user.authorized_tenders_scope || 'ALL',
    entity_type: user.entity_type || null,
    cin_llpin: user.cin_llpin || null,
    gstin: user.gstin || null,
    pan: user.pan || null,
    business_address: user.business_address || null,
    rep_name: user.rep_name || user.full_name,
    rep_designation: user.rep_designation || null,
    email_verified_at: user.email_verified_at || null,
    verification_notes: user.verification_notes || null
  };

  logAudit(user.id, 'USER_LOGIN', 'users', user.id, {
    email: user.email,
    role: user.role,
    portalRole: portalRole || 'general',
    verification_status: sanitizedUser.verification_status
  }, ipAddress);

  const token = generateToken(sanitizedUser);
  return { user: sanitizedUser, token };
}
