import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'bidcheck.db');
export const db = new Database(DB_PATH);

// Enable WAL for concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('officer', 'bidder')),
      organization TEXT,
      phone TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenders (
      id TEXT PRIMARY KEY,
      tender_ref TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      department TEXT NOT NULL,
      budget REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK(status IN ('DRAFT', 'PUBLISHED', 'UNDER_EVALUATION', 'AWARDED', 'CANCELLED')),
      requirements_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      published_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      tender_id TEXT NOT NULL,
      bidder_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      registration_number TEXT NOT NULL,
      bid_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      contact_person TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      submission_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'UNDER_REVIEW', 'CLARIFICATION_REQUESTED', 'QUALIFIED', 'DISQUALIFIED', 'AWARDED', 'REJECTED')),
      ai_compliance_score REAL DEFAULT 0,
      ai_risk_score REAL DEFAULT 0,
      ai_risk_level TEXT DEFAULT 'LOW' CHECK(ai_risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'UNCERTAIN')),
      ai_recommendation TEXT DEFAULT 'RECOMMEND_QUALIFY' CHECK(ai_recommendation IN ('RECOMMEND_QUALIFY', 'REQUEST_CLARIFICATION', 'FLAG_FOR_AUDIT', 'RECOMMEND_DISQUALIFY')),
      ai_findings_json TEXT,
      official_decision TEXT DEFAULT 'PENDING' CHECK(official_decision IN ('PENDING', 'APPROVED', 'DISQUALIFIED', 'AWARDED', 'REJECTED')),
      official_decision_notes TEXT,
      decided_by TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tender_id) REFERENCES tenders(id),
      FOREIGN KEY (bidder_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      doc_type TEXT NOT NULL CHECK(doc_type IN ('TAX_CLEARANCE', 'FINANCIAL_AUDIT', 'COMPANY_REGISTRATION', 'TECHNICAL_PROPOSAL', 'BID_BOND', 'EXPERIENCE_CERTIFICATE')),
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      extracted_text TEXT,
      ocr_status TEXT DEFAULT 'NOT_NEEDED' CHECK(ocr_status IN ('NOT_NEEDED', 'EXTRACTED', 'OCR_PROCESSED', 'FAILED')),
      is_resubmission INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    );

    CREATE TABLE IF NOT EXISTS clarifications (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      requested_doc_types_json TEXT,
      response_text TEXT,
      responded_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendor_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      doc_type TEXT NOT NULL CHECK(doc_type IN ('BUSINESS_REGISTRATION', 'TAX_REGISTRATION', 'PAN_CARD', 'POWER_OF_ATTORNEY', 'FINANCIAL_STATEMENT', 'OTHER')),
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(verification_status IN ('PENDING_REVIEW', 'VERIFIED', 'NEEDS_CLARIFICATION', 'REJECTED')),
      verification_notes TEXT,
      verified_by TEXT,
      verified_at TEXT,
      extracted_text TEXT,
      ocr_status TEXT DEFAULT 'NOT_NEEDED',
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (verified_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status);
    CREATE INDEX IF NOT EXISTS idx_apps_tender ON applications(tender_id);
    CREATE INDEX IF NOT EXISTS idx_apps_bidder ON applications(bidder_id);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_vdocs_user ON vendor_documents(user_id);
  `);

  // Run dynamic schema migrations for identity verification and account approval
  migrateUserSchema();
  migrateDocumentSchema();
  migrateApplicationSchema();
  migrateClarificationsSchema();

  seedInitialData();
  seedVendorDocuments();
}

function migrateDocumentSchema() {
  const columns = db.prepare('PRAGMA table_info(documents)').all().map(c => c.name);
  const newCols = [
    { name: 'review_status', def: "TEXT DEFAULT 'PENDING_REVIEW'" },
    { name: 'review_notes', def: 'TEXT' },
    { name: 'reviewed_by', def: 'TEXT' },
    { name: 'reviewed_at', def: 'TEXT' },
    { name: 'mismatch_warning', def: 'TEXT' },
    { name: 'automated_findings', def: 'TEXT' }
  ];
  for (const col of newCols) {
    if (!columns.includes(col.name)) {
      db.exec(`ALTER TABLE documents ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

function migrateApplicationSchema() {
  const columns = db.prepare('PRAGMA table_info(applications)').all().map(c => c.name);
  const newCols = [
    { name: 'technical_evaluation_status', def: "TEXT DEFAULT 'PENDING'" },
    { name: 'human_review_status', def: "TEXT DEFAULT 'PENDING_REVIEW'" },
    { name: 'compliance_status', def: "TEXT DEFAULT 'NEEDS_HUMAN_REVIEW'" },
    { name: 'compliance_score', def: 'REAL DEFAULT 0' },
    { name: 'requirement_results_json', def: 'TEXT' }
  ];
  for (const col of newCols) {
    if (!columns.includes(col.name)) {
      db.exec(`ALTER TABLE applications ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

function migrateClarificationsSchema() {
  const columns = db.prepare('PRAGMA table_info(clarifications)').all().map(c => c.name);
  const newCols = [
    { name: 'resubmitted_doc_id', def: 'TEXT' }
  ];
  for (const col of newCols) {
    if (!columns.includes(col.name)) {
      db.exec(`ALTER TABLE clarifications ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

function migrateUserSchema() {
  const columns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);

  const newColumns = [
    { name: 'verification_status', def: "TEXT DEFAULT 'VERIFIED'" },
    { name: 'email_verified_at', def: 'TEXT' },
    { name: 'email_verification_token', def: 'TEXT' },
    { name: 'entity_type', def: "TEXT DEFAULT 'PRIVATE_LIMITED'" },
    { name: 'cin_llpin', def: 'TEXT' },
    { name: 'gstin', def: 'TEXT' },
    { name: 'pan', def: 'TEXT' },
    { name: 'business_address', def: 'TEXT' },
    { name: 'rep_name', def: 'TEXT' },
    { name: 'rep_designation', def: 'TEXT' },
    { name: 'rep_phone', def: 'TEXT' },
    { name: 'rep_email', def: 'TEXT' },
    { name: 'department', def: 'TEXT' },
    { name: 'official_designation', def: 'TEXT' },
    { name: 'government_id_ref', def: 'TEXT' },
    { name: 'authorized_tenders_scope', def: "TEXT DEFAULT 'ALL'" },
    { name: 'verified_by', def: 'TEXT' },
    { name: 'verified_at', def: 'TEXT' },
    { name: 'verification_notes', def: 'TEXT' }
  ];

  for (const col of newColumns) {
    if (!columns.includes(col.name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.def}`);
    }
  }

  // Update seeded officer with approved authority status
  db.prepare(`
    UPDATE users
    SET verification_status = 'APPROVED',
        department = COALESCE(department, 'National Public Procurement Authority'),
        official_designation = COALESCE(official_designation, 'Senior Procurement Director'),
        government_id_ref = COALESCE(government_id_ref, 'GOV-NPPA-2026-001'),
        authorized_tenders_scope = COALESCE(authorized_tenders_scope, 'ALL')
    WHERE id = 'usr_officer_001'
  `).run();

  // Update seeded bidders with verified business status and valid registration numbers
  db.prepare(`
    UPDATE users
    SET verification_status = 'VERIFIED',
        entity_type = COALESCE(entity_type, 'PRIVATE_LIMITED'),
        cin_llpin = COALESCE(cin_llpin, 'U45200MH2018PTC309182'),
        gstin = COALESCE(gstin, '27AABCU9603R1ZM'),
        pan = COALESCE(pan, 'AABCU9603R'),
        rep_name = COALESCE(rep_name, full_name),
        rep_designation = COALESCE(rep_designation, 'Managing Director'),
        business_address = COALESCE(business_address, '104 Industrial Sector 9, Mumbai, MH')
    WHERE id = 'usr_bidder_001'
  `).run();

  db.prepare(`
    UPDATE users
    SET verification_status = 'VERIFIED',
        entity_type = COALESCE(entity_type, 'PUBLIC_LIMITED'),
        cin_llpin = COALESCE(cin_llpin, 'L72200KA2015PLC081294'),
        gstin = COALESCE(gstin, '29AABCV4910N1ZG'),
        pan = COALESCE(pan, 'AABCV4910N'),
        rep_name = COALESCE(rep_name, full_name),
        rep_designation = COALESCE(rep_designation, 'Chief Executive Officer'),
        business_address = COALESCE(business_address, '502 Tech Boulevard, Electronic City, Bangalore, KA')
    WHERE id = 'usr_bidder_002'
  `).run();
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    return; // Already seeded
  }

  const salt = bcrypt.genSaltSync(10);
  const officerHash = bcrypt.hashSync('Officer@123', salt);
  const bidder1Hash = bcrypt.hashSync('Bidder@123', salt);
  const bidder2Hash = bcrypt.hashSync('Bidder@123', salt);
  const now = new Date().toISOString();

  const officerId = 'usr_officer_001';
  const bidder1Id = 'usr_bidder_001';
  const bidder2Id = 'usr_bidder_002';

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, role, organization, phone, created_at,
      verification_status, department, official_designation, government_id_ref, authorized_tenders_scope,
      entity_type, cin_llpin, gstin, pan, rep_name, rep_designation, business_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    officerId,
    'officer@procure.gov',
    officerHash,
    'Director Sarah Jenkins',
    'officer',
    'National Public Procurement Authority',
    '+1-555-0199',
    now,
    'APPROVED',
    'National Public Procurement Authority',
    'Senior Procurement Director',
    'GOV-NPPA-2026-001',
    'ALL',
    null, null, null, null, null, null, null
  );

  insertUser.run(
    bidder1Id,
    'bidder1@acmebuild.com',
    bidder1Hash,
    'Marcus Vance',
    'bidder',
    'Acme Infrastructure & Tech Ltd',
    '+1-555-0211',
    now,
    'VERIFIED',
    null, null, null, null,
    'PRIVATE_LIMITED',
    'U45200MH2018PTC309182',
    '27AABCU9603R1ZM',
    'AABCU9603R',
    'Marcus Vance',
    'Managing Director',
    '104 Industrial Sector 9, Mumbai, MH'
  );

  insertUser.run(
    bidder2Id,
    'bidder2@vortexcorp.com',
    bidder2Hash,
    'Elena Rostova',
    'bidder',
    'Vortex Systems Engineering Inc',
    '+1-555-0244',
    now,
    'VERIFIED',
    null, null, null, null,
    'PUBLIC_LIMITED',
    'L72200KA2015PLC081294',
    '29AABCV4910N1ZG',
    'AABCV4910N',
    'Elena Rostova',
    'Chief Executive Officer',
    '502 Tech Boulevard, Electronic City, Bangalore, KA'
  );

  // Seed sample published tenders
  const tender1Id = 'tnd_2026_solar_01';
  const tender2Id = 'tnd_2026_cloud_02';

  const insertTender = db.prepare(`
    INSERT INTO tenders (id, tender_ref, title, category, department, budget, currency, deadline, status, requirements_json, created_by, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const req1 = JSON.stringify({
    required_docs: ['TAX_CLEARANCE', 'FINANCIAL_AUDIT', 'COMPANY_REGISTRATION', 'TECHNICAL_PROPOSAL', 'BID_BOND'],
    min_turnover: 2000000,
    min_experience_years: 5,
    summary: 'Turnkey engineering, supply, and commissioning of a 15MW solar microgrid with battery storage systems.'
  });

  const req2 = JSON.stringify({
    required_docs: ['TAX_CLEARANCE', 'FINANCIAL_AUDIT', 'COMPANY_REGISTRATION', 'TECHNICAL_PROPOSAL'],
    min_turnover: 1000000,
    min_experience_years: 3,
    summary: 'Cloud migration, electronic health records modernization, and cybersecurity hardening for municipal hospitals.'
  });

  insertTender.run(
    tender1Id,
    'PRC-2026-SOLAR-091',
    'National Solar Microgrid & Energy Storage Project',
    'Renewable Energy',
    'Ministry of Infrastructure & Energy',
    5500000,
    'USD',
    '2026-12-15T18:00:00.000Z',
    'PUBLISHED',
    req1,
    officerId,
    now,
    now,
    now
  );

  insertTender.run(
    tender2Id,
    'PRC-2026-MED-044',
    'Metropolitan Civic Hospital Cloud ERP & Telehealth',
    'Information Technology',
    'Department of Public Health',
    2400000,
    'USD',
    '2026-11-30T17:00:00.000Z',
    'PUBLISHED',
    req2,
    officerId,
    now,
    now,
    now
  );

  // Seed two sample bids on tender 1 to demonstrate AI analysis, TF-IDF collusion check, and clarification flow
  const app1Id = 'app_acme_solar_001';
  const app2Id = 'app_vortex_solar_002';

  const insertApp = db.prepare(`
    INSERT INTO applications (
      id, tender_id, bidder_id, company_name, tax_id, registration_number,
      bid_amount, currency, contact_person, contact_email, submission_date,
      status, ai_compliance_score, ai_risk_score, ai_risk_level, ai_recommendation,
      ai_findings_json, official_decision, official_decision_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const findings1 = JSON.stringify({
    rule_checks: [
      { rule: 'TAX_ID_VALIDITY', passed: true, score: 100, details: 'Tax ID US-94-3829104 format is valid and verified against registry.' },
      { rule: 'REGISTRATION_CHECK', passed: true, score: 100, details: 'Incorporation number REG-77391-B in active standing.' },
      { rule: 'DOCUMENT_COMPLETENESS', passed: true, score: 100, details: 'All 5 mandatory documents provided.' },
      { rule: 'PRICE_ANOMALY', passed: true, score: 95, details: 'Bid amount $5,120,000 is 93.1% of allocated budget (reasonable market pricing).' },
      { rule: 'FINANCIAL_CAPACITY', passed: true, score: 90, details: 'Annual turnover meets threshold.' }
    ],
    uncertainties: [],
    red_flags: [],
    explanation: 'Application satisfies all statutory and tender compliance requirements with authentic technical documentation.'
  });

  const findings2 = JSON.stringify({
    rule_checks: [
      { rule: 'TAX_ID_VALIDITY', passed: true, score: 100, details: 'Tax ID US-12-8849201 format is valid.' },
      { rule: 'REGISTRATION_CHECK', passed: true, score: 100, details: 'Incorporation number REG-88204-V in active standing.' },
      { rule: 'DOCUMENT_COMPLETENESS', passed: false, score: 70, details: 'Bid Bond certificate is pending updated bank endorsement.' },
      { rule: 'PRICE_ANOMALY', passed: true, score: 92, details: 'Bid amount $5,190,000 is 94.4% of allocated budget.' }
    ],
    uncertainties: [
      {
        field: 'BID_BOND',
        nature: 'INFORMATION_GAP',
        explanation: 'Bank guarantee letter submitted has non-standard digital signature format. In accordance with procurement fairness standards, this uncertainty is categorized as an informational deficiency requiring clarification rather than evidence of fraud.'
      }
    ],
    red_flags: [],
    explanation: 'Proposal technically strong, but bank guarantee endorsement format requires formal clarification from the applicant.'
  });

  insertApp.run(
    app1Id,
    tender1Id,
    bidder1Id,
    'Acme Infrastructure & Tech Ltd',
    'US-94-3829104',
    'REG-77391-B',
    5120000,
    'USD',
    'Marcus Vance',
    'bidder1@acmebuild.com',
    now,
    'UNDER_REVIEW',
    96,
    8,
    'LOW',
    'RECOMMEND_QUALIFY',
    findings1,
    'PENDING',
    null,
    now,
    now
  );

  insertApp.run(
    app2Id,
    tender1Id,
    bidder2Id,
    'Vortex Systems Engineering Inc',
    'US-12-8849201',
    'REG-88204-V',
    5190000,
    'USD',
    'Elena Rostova',
    'bidder2@vortexcorp.com',
    now,
    'CLARIFICATION_REQUESTED',
    82,
    28,
    'UNCERTAIN',
    'REQUEST_CLARIFICATION',
    findings2,
    'PENDING',
    null,
    now,
    now
  );

  // Seed sample documents with text for TF-IDF similarity testing
  const insertDoc = db.prepare(`
    INSERT INTO documents (
      id, application_id, doc_type, original_filename, stored_filename,
      file_path, file_size, mime_type, extracted_text, ocr_status, is_resubmission, version, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const acmeProposalText = `
TECHNICAL PROPOSAL: 15MW SOLAR PHOTOVOLTAIC MICROGRID & BESS DEPLOYMENT
1. Executive Summary
Acme Infrastructure & Tech Ltd presents an end-to-end EPC execution roadmap for the National Solar Microgrid installation.
2. Technical Architecture & Inverters
We propose tier-1 bifacial monocrystalline silicon solar modules with 22.8% module efficiency, combined with utility-scale central inverters and liquid-cooled lithium-iron-phosphate (LFP) battery storage racks.
3. Supervisory Control and Data Acquisition (SCADA)
Real-time microgrid power dispatch controller with sub-second frequency regulation, autonomous islanding capability, and IEEE 1547-2018 compliance.
4. Civil & Geotechnical Works
Ramming depth analysis, galvanized steel tracker mounting systems with dual-axis automated astronomical tracking.
5. Quality Assurance & Commissioning Milestones
Commissioning protocol aligns with IEC 62446-1 quality verification procedures and environmental containment standards.
  `;

  const vortexProposalText = `
TECHNICAL PROPOSAL: NATIONAL SOLAR MICROGRID POWER INFRASTRUCTURE
1. Executive Summary
Vortex Systems Engineering Inc submits this comprehensive engineering proposal for the 15MW solar microgrid facility with energy storage.
2. Solar Array & Photovoltaic Specs
High-density bifacial N-type TOPCon solar modules connected via string inverters to modular 20-foot energy storage enclosures with liquid thermal management.
3. SCADA and Islanding Operations
Integrated microgrid energy management system with cloud telemetry, predictive peak shaving algorithms, and automated black-start capability.
4. Environmental Compliance and Ground Engineering
Pile-driven fixed tilt mounting structures tested for 140 km/h wind loads with zinc-aluminum-magnesium anti-corrosion coating.
5. Testing and Handover Framework
Execution in compliance with grid-interconnection standards, ISO 9001 certified engineering workflows, and warranty backing for 25 years.
  `;

  insertDoc.run(
    'doc_acme_tech_01',
    app1Id,
    'TECHNICAL_PROPOSAL',
    'Acme_Solar_Technical_Proposal_RevA.pdf',
    'acme_proposal_sample.pdf',
    path.join(DATA_DIR, 'acme_proposal_sample.pdf'),
    184200,
    'application/pdf',
    acmeProposalText,
    'EXTRACTED',
    0,
    1,
    now
  );

  insertDoc.run(
    'doc_vortex_tech_02',
    app2Id,
    'TECHNICAL_PROPOSAL',
    'Vortex_Solar_Proposal_Technical.pdf',
    'vortex_proposal_sample.pdf',
    path.join(DATA_DIR, 'vortex_proposal_sample.pdf'),
    192500,
    'application/pdf',
    vortexProposalText,
    'EXTRACTED',
    0,
    1,
    now
  );

  // Seed sample clarification thread
  const insertClarification = db.prepare(`
    INSERT INTO clarifications (
      id, application_id, sender_id, sender_role, message, requested_doc_types_json, response_text, responded_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertClarification.run(
    'clr_001',
    app2Id,
    officerId,
    'officer',
    'Please provide the direct bank verification letter for your submitted bid bond guarantee to confirm validity with First Commercial Guarantee Bank.',
    JSON.stringify(['BID_BOND']),
    'We have requested the formal verification letter directly from First Commercial Guarantee Bank and will upload the attested digital copy shortly.',
    now,
    now
  );

  // Seed status history
  const insertHistory = db.prepare(`
    INSERT INTO status_history (id, application_id, previous_status, new_status, changed_by, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertHistory.run(crypto.randomUUID(), app1Id, null, 'SUBMITTED', bidder1Id, 'Initial bid submission received via secure portal.', now);
  insertHistory.run(crypto.randomUUID(), app1Id, 'SUBMITTED', 'UNDER_REVIEW', officerId, 'Procurement officer initiated evaluation and compliance check.', now);

  insertHistory.run(crypto.randomUUID(), app2Id, null, 'SUBMITTED', bidder2Id, 'Initial bid submission received via secure portal.', now);
  insertHistory.run(crypto.randomUUID(), app2Id, 'SUBMITTED', 'CLARIFICATION_REQUESTED', officerId, 'Official clarification requested regarding Bid Bond bank guarantee endorsement.', now);

  // Seed audit logs
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run(crypto.randomUUID(), officerId, 'TENDER_PUBLISHED', 'tenders', tender1Id, JSON.stringify({ title: 'National Solar Microgrid & Energy Storage Project', budget: 5500000 }), '127.0.0.1', now);
  insertAudit.run(crypto.randomUUID(), officerId, 'TENDER_PUBLISHED', 'tenders', tender2Id, JSON.stringify({ title: 'Metropolitan Civic Hospital Cloud ERP & Telehealth', budget: 2400000 }), '127.0.0.1', now);
  insertAudit.run(crypto.randomUUID(), bidder1Id, 'BID_SUBMITTED', 'applications', app1Id, JSON.stringify({ company: 'Acme Infrastructure & Tech Ltd', amount: 5120000 }), '127.0.0.1', now);
  insertAudit.run(crypto.randomUUID(), bidder2Id, 'BID_SUBMITTED', 'applications', app2Id, JSON.stringify({ company: 'Vortex Systems Engineering Inc', amount: 5190000 }), '127.0.0.1', now);
  insertAudit.run(crypto.randomUUID(), officerId, 'CLARIFICATION_ISSUED', 'clarifications', 'clr_001', JSON.stringify({ recipient: 'Vortex Systems Engineering Inc', topic: 'BID_BOND' }), '127.0.0.1', now);

  // Seed notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, link, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertNotif.run(crypto.randomUUID(), officerId, 'New Bid Submitted', 'Acme Infrastructure & Tech Ltd submitted a bid for Tender PRC-2026-SOLAR-091.', '/tenders/' + tender1Id, 0, now);
  insertNotif.run(crypto.randomUUID(), bidder2Id, 'Clarification Requested', 'The procurement evaluation committee requested clarification regarding your bid bond.', '/my-bids', 0, now);
}

export function logAudit(userId, action, entityType, entityId, details, ipAddress = '127.0.0.1') {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, action, entityType, entityId, detailsStr, ipAddress, now);
    return id;
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export function recordStatusChange(applicationId, prevStatus, newStatus, changedBy, reason) {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO status_history (id, application_id, previous_status, new_status, changed_by, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, applicationId, prevStatus, newStatus, changedBy, reason || 'Status transitioned by authorized party.', now);
    return id;
  } catch (err) {
    console.error('Failed to record status change:', err);
  }
}

export function createNotification(userId, title, message, link = '') {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(id, userId, title, message, link, now);
    return id;
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export function seedVendorDocuments() {
  try {
    const UPLOADS_DIR = path.resolve(process.cwd(), 'data/uploads');
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const existingCount = db.prepare('SELECT COUNT(*) as count FROM vendor_documents').get().count;
    if (existingCount > 0) return;

    const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAACACAYAAAC1GS0QAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA0SURBVHhe7cExAQAAAMKg9U9tCj+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeDMyPAAB0r4B/AAAAABJRU5ErkJggg==';
    const pngBuffer = Buffer.from(validPngBase64, 'base64');

    function makeSamplePdf(title, text) {
      const streamContent = `BT /F1 14 Tf 50 720 Td (${title}) Tj ET\nBT /F1 10 Tf 50 690 Td (${text}) Tj ET`;
      return `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n4 0 obj << /Length ${streamContent.length} >> stream\n${streamContent}\nendstream endobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000350 00000 n \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n423\n%%EOF`;
    }

    const docsToSeed = [
      {
        id: 'vdoc_acme_incorp',
        userId: 'usr_bidder_001',
        docType: 'BUSINESS_REGISTRATION',
        originalName: 'Acme_Certificate_of_Incorporation.pdf',
        storedName: 'sample_acme_incorp.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from(makeSamplePdf('GOVERNMENT REGISTRAR OF COMPANIES - CERTIFICATE OF INCORPORATION', 'This certifies that Acme Infrastructure & Tech Ltd (CIN: U45200MH2018PTC309182) is duly incorporated.')),
        status: 'VERIFIED',
        notes: 'MCA record confirmed. Authorized capital and incorporation credentials verified against national registry.',
        verifiedBy: 'usr_officer_001'
      },
      {
        id: 'vdoc_acme_gst',
        userId: 'usr_bidder_001',
        docType: 'TAX_REGISTRATION',
        originalName: 'Acme_GST_Registration_Certificate.pdf',
        storedName: 'sample_acme_gst.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from(makeSamplePdf('GOODS AND SERVICES TAX REGISTRATION CERTIFICATE', 'Legal Name: Acme Infrastructure & Tech Ltd. GSTIN: 27AABCU9603R1ZM. Status: Active and compliant.')),
        status: 'VERIFIED',
        notes: 'Active taxpayer in jurisdiction Maharashtra. Monthly returns filing verified.',
        verifiedBy: 'usr_officer_001'
      },
      {
        id: 'vdoc_acme_pan',
        userId: 'usr_bidder_001',
        docType: 'PAN_CARD',
        originalName: 'Acme_Corporate_PAN_Card.png',
        storedName: 'sample_acme_pan.png',
        mimeType: 'image/png',
        content: pngBuffer,
        status: 'VERIFIED',
        notes: 'PAN card scan legible. Tax ID AABCU9603R matches incorporation details.',
        verifiedBy: 'usr_officer_001'
      },
      {
        id: 'vdoc_vortex_incorp',
        userId: 'usr_bidder_002',
        docType: 'BUSINESS_REGISTRATION',
        originalName: 'Vortex_Incorporation_Certificate.pdf',
        storedName: 'sample_vortex_incorp.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from(makeSamplePdf('MINISTRY OF CORPORATE AFFAIRS - CERTIFICATE OF INCORPORATION', 'Vortex Systems Engineering Inc (CIN: L72200KA2015PLC081294). Registered office in Electronic City, Bangalore.')),
        status: 'PENDING_REVIEW',
        notes: null,
        verifiedBy: null
      },
      {
        id: 'vdoc_vortex_gst',
        userId: 'usr_bidder_002',
        docType: 'TAX_REGISTRATION',
        originalName: 'Vortex_GSTIN_Tax_Clearance.pdf',
        storedName: 'sample_vortex_gst.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from(makeSamplePdf('TAX CLEARANCE AND REGISTRATION REPORT', 'GSTIN: 29AABCV4910N1ZG. Vendor tax standing certificate.')),
        status: 'PENDING_REVIEW',
        notes: null,
        verifiedBy: null
      }
    ];

    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO vendor_documents (
        id, user_id, doc_type, original_filename, stored_filename, file_path,
        file_size, mime_type, verification_status, verification_notes, verified_by,
        verified_at, extracted_text, ocr_status, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXTRACTED', ?)
    `);

    for (const doc of docsToSeed) {
      const filePath = path.join(UPLOADS_DIR, doc.storedName);
      fs.writeFileSync(filePath, doc.content);
      const size = fs.statSync(filePath).size;
      insertStmt.run(
        doc.id,
        doc.userId,
        doc.docType,
        doc.originalName,
        doc.storedName,
        filePath,
        size,
        doc.mimeType,
        doc.status,
        doc.notes,
        doc.verifiedBy,
        doc.verifiedBy ? now : null,
        doc.originalName.replace(/\.pdf|\.png/, '').replace(/_/g, ' '),
        now
      );
    }
  } catch (seedErr) {
    console.error('Error seeding vendor documents:', seedErr);
  }
}

export function getVendorDocumentsForUser(userId) {
  return db.prepare(`
    SELECT vd.*, u.full_name as verified_by_name, u.role as verified_by_role
    FROM vendor_documents vd
    LEFT JOIN users u ON vd.verified_by = u.id
    WHERE vd.user_id = ?
    ORDER BY vd.uploaded_at DESC
  `).all(userId);
}

export function getVendorDocumentById(docId) {
  return db.prepare(`
    SELECT vd.*, u.full_name as verified_by_name, u.role as verified_by_role,
           v.email as vendor_email, v.organization as vendor_org
    FROM vendor_documents vd
    JOIN users v ON vd.user_id = v.id
    LEFT JOIN users u ON vd.verified_by = u.id
    WHERE vd.id = ?
  `).get(docId);
}

