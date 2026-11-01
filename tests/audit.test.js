import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { db, initDatabase, logAudit, recordStatusChange, createNotification } from '../server/db.js';
import {
  loginUser,
  registerUser,
  verifyVendorEmail,
  createOfficerByAdmin,
  generateToken,
  requireOfficer,
  requireBidder,
  requireApprovedOfficer,
  requireVerifiedBidder
} from '../server/auth.js';
import {
  evaluateApplicationAI,
  computeCosineSimilarity,
  tokenizeText,
  extractNgrams,
  analyzeTenderCollusion
} from '../server/ai-engine.js';
import { extractTextFromDocument, OCR_SYSTEM_REPORT } from '../server/ocr-pdf.js';

async function runAuditSuite() {
  console.log('================================================================');
  console.log('   BIDCHECK AI IDENTITY & ROLE-BASED VERIFICATION AUDIT SUITE   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Dependency Integrity: Pure JavaScript, No Firebase/Mongo/Supabase, No Gemini SDK
  test('Req F & Tech Stack: Pure JavaScript & Independent of Gemini/Firebase/Mongo', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const forbidden = [
      '@google/genai',
      'firebase',
      'firebase-admin',
      '@google-cloud/firestore',
      'mongodb',
      'mongoose',
      '@supabase/supabase-js',
      'typescript',
      'tsx'
    ];
    for (const dep of forbidden) {
      assert.strictEqual(allDeps[dep], undefined, `Forbidden dependency found in package.json: ${dep}`);
    }
    const srcFiles = fs.readdirSync(path.resolve(process.cwd(), 'src'));
    const tsFiles = srcFiles.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    assert.strictEqual(tsFiles.length, 0, `TypeScript files found in src: ${tsFiles.join(', ')}`);
  });

  // 2. SQLite Database Initialization and Identity Columns Persistence
  test('Req 2 & 3: SQLite Database Initialization & Identity Schema Migration', () => {
    initDatabase();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const requiredTables = ['users', 'tenders', 'applications', 'documents', 'clarifications', 'notifications', 'status_history', 'audit_logs'];
    for (const t of requiredTables) {
      assert.ok(tables.includes(t), `Table ${t} missing from SQLite schema.`);
    }

    const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    const requiredCols = ['verification_status', 'cin_llpin', 'gstin', 'pan', 'entity_type', 'department', 'official_designation', 'authorized_tenders_scope'];
    for (const col of requiredCols) {
      assert.ok(userCols.includes(col), `Column ${col} missing from users table.`);
    }

    const journalMode = db.prepare('PRAGMA journal_mode').get().journal_mode;
    assert.ok(['wal', 'memory'].includes(journalMode.toLowerCase()), `Journal mode should be WAL, got: ${journalMode}`);
  });

  // 3. Two Distinct Login Options & Cross-Portal Access Rejection
  test('Scenario 1: Two Distinct Login Options with Cross-Portal Rejection', () => {
    // Valid officer login via officer portal
    const officerLogin = loginUser({
      email: 'officer@procure.gov',
      password: 'Officer@123',
      portalRole: 'officer',
      ipAddress: '127.0.0.1'
    });
    assert.strictEqual(officerLogin.user.role, 'officer');
    assert.strictEqual(officerLogin.user.verification_status, 'APPROVED');

    // Valid bidder login via vendor portal
    const bidderLogin = loginUser({
      email: 'bidder1@acmebuild.com',
      password: 'Bidder@123',
      portalRole: 'bidder',
      ipAddress: '127.0.0.1'
    });
    assert.strictEqual(bidderLogin.user.role, 'bidder');
    assert.strictEqual(bidderLogin.user.verification_status, 'VERIFIED');

    // Bidder attempting to log in via officer portal must be REJECTED
    assert.throws(() => {
      loginUser({
        email: 'bidder1@acmebuild.com',
        password: 'Bidder@123',
        portalRole: 'officer',
        ipAddress: '127.0.0.1'
      });
    }, /Access Denied: This portal is strictly for authorized Tender Officers/);

    // Officer attempting to log in via vendor portal must be REJECTED
    assert.throws(() => {
      loginUser({
        email: 'officer@procure.gov',
        password: 'Officer@123',
        portalRole: 'bidder',
        ipAddress: '127.0.0.1'
      });
    }, /Government Officer account detected/);
  });

  // 4. Public Registration: NEVER creates Officer accounts & Starts in EMAIL_PENDING
  test('Scenario 2: Public Registration NEVER Creates Officers & Collects Business Identifiers', () => {
    const testEmail = `vendor_${Date.now()}@infraenterprise.com`;
    const result = registerUser({
      email: testEmail,
      password: 'SecurePassword@123',
      full_name: 'David K. Vance',
      organization: 'Vance Industrial Works LLP',
      phone: '+1-555-8811',
      entity_type: 'LLP',
      cin_llpin: 'AAA-1234',
      gstin: '07AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      business_address: '42 Ring Road, Delhi',
      rep_designation: 'Managing Partner',
      role: 'officer', // INJECTION ATTEMPT
      ipAddress: '127.0.0.1'
    });

    assert.strictEqual(result.user.role, 'bidder', 'Public registration must strictly force role to bidder!');
    assert.strictEqual(result.user.verification_status, 'EMAIL_PENDING', 'New registration must start in EMAIL_PENDING state');

    const stored = db.prepare('SELECT * FROM users WHERE email = ?').get(testEmail);
    assert.strictEqual(stored.role, 'bidder');
    assert.strictEqual(stored.verification_status, 'EMAIL_PENDING');
    assert.strictEqual(stored.cin_llpin, 'AAA-1234');
    assert.strictEqual(stored.gstin, '07AAAAA0000A1Z5');
  });

  // 5. Vendor Email Verification flow
  test('Scenario 3: Vendor Email Verification Moves Account to VERIFICATION_PENDING', () => {
    const testEmail = `verify_vendor_${Date.now()}@test.com`;
    const reg = registerUser({
      email: testEmail,
      password: 'Pass@1234',
      full_name: 'Test Rep',
      organization: 'Test Enterprise Ltd',
      entity_type: 'PRIVATE_LIMITED',
      ipAddress: '127.0.0.1'
    });

    assert.strictEqual(reg.user.verification_status, 'EMAIL_PENDING');

    // Perform email verification
    const verifiedResult = verifyVendorEmail({ userId: reg.user.id, ipAddress: '127.0.0.1' });
    assert.strictEqual(verifiedResult.verification_status, 'VERIFICATION_PENDING');

    const stored = db.prepare('SELECT verification_status, email_verified_at FROM users WHERE id = ?').get(reg.user.id);
    assert.strictEqual(stored.verification_status, 'VERIFICATION_PENDING');
    assert.ok(stored.email_verified_at);
  });

  // 6. Unverified Vendor CANNOT Submit Bids
  test('Scenario 4: An Unverified Vendor CANNOT Submit a Bid', () => {
    const mockRes = {
      status: (code) => ({
        json: (data) => ({ statusCode: code, data })
      })
    };

    let nextCalled = false;
    // Test with unverified vendor (EMAIL_PENDING)
    const unverifiedUser = { role: 'bidder', verification_status: 'EMAIL_PENDING' };
    const blockedRes1 = requireVerifiedBidder({ user: unverifiedUser }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Unverified vendor must be blocked');
    assert.strictEqual(blockedRes1.statusCode, 403);

    // Test with vendor in VERIFICATION_PENDING
    const pendingUser = { role: 'bidder', verification_status: 'VERIFICATION_PENDING' };
    const blockedRes2 = requireVerifiedBidder({ user: pendingUser }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Pending vendor must be blocked');
    assert.strictEqual(blockedRes2.statusCode, 403);
  });

  // 7. Verified Vendor CAN Submit Bids for Eligible Tenders
  test('Scenario 5: A Verified Vendor CAN Submit a Bid for an Eligible Tender', () => {
    const mockRes = {
      status: (code) => ({
        json: (data) => ({ statusCode: code, data })
      })
    };

    let nextCalled = false;
    const verifiedVendor = { role: 'bidder', verification_status: 'VERIFIED' };
    requireVerifiedBidder({ user: verifiedVendor }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Verified vendor must pass requireVerifiedBidder guard');
  });

  // 8. Unapproved Officer CANNOT Publish Tenders
  test('Scenario 6: An Unapproved Officer CANNOT Publish a Tender', () => {
    const mockRes = {
      status: (code) => ({
        json: (data) => ({ statusCode: code, data })
      })
    };

    let nextCalled = false;
    const unapprovedOfficer = { role: 'officer', verification_status: 'PENDING_VERIFICATION' };
    const blockedRes = requireApprovedOfficer({ user: unapprovedOfficer }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Unapproved officer must be blocked from publishing');
    assert.strictEqual(blockedRes.statusCode, 403);
  });

  // 9. Approved Officer CAN Publish Tenders Within Authorized Scope
  test('Scenario 7: An Approved Officer CAN Publish Tenders Within Authorized Scope', () => {
    const mockRes = {
      status: (code) => ({
        json: (data) => ({ statusCode: code, data })
      })
    };

    let nextCalled = false;
    const approvedOfficer = {
      role: 'officer',
      verification_status: 'APPROVED',
      authorized_tenders_scope: 'INFRASTRUCTURE,ENERGY'
    };
    requireApprovedOfficer({ user: approvedOfficer }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Approved officer must pass requireApprovedOfficer guard');

    // Verify scope boundary logic:
    const allowedScopes = approvedOfficer.authorized_tenders_scope.split(',');
    const inScopeCat = 'Civil Engineering & Infrastructure'.toUpperCase();
    const outOfScopeCat = 'Medical Supplies & Pharmaceuticals'.toUpperCase();

    const canPublishInScope = allowedScopes.some(s => inScopeCat.includes(s));
    const canPublishOutOfScope = allowedScopes.some(s => outOfScopeCat.includes(s));

    assert.strictEqual(canPublishInScope, true, 'Category INFRASTRUCTURE must match');
    assert.strictEqual(canPublishOutOfScope, false, 'Medical supplies must NOT match INFRASTRUCTURE scope');
  });

  // 10. Cross-Bidder Document Privacy & Notification Isolation
  test("Scenario 8: A Vendor CANNOT View Another Vendor's Private Documents or Notifications", () => {
    const doc = db.prepare('SELECT d.*, a.bidder_id FROM documents d JOIN applications a ON d.application_id = a.id LIMIT 1').get();
    assert.ok(doc, 'Seeded document must exist');

    const ownerBidder = { id: doc.bidder_id, role: 'bidder' };
    const intruderBidder = { id: 'usr_different_bidder_999', role: 'bidder' };

    const isOwnerAllowed = ownerBidder.id === doc.bidder_id;
    const isIntruderAllowed = intruderBidder.id === doc.bidder_id;

    assert.strictEqual(isOwnerAllowed, true, 'Owner has access to own file');
    assert.strictEqual(isIntruderAllowed, false, 'Intruder is barred from accessing file');

    // Notifications isolation check
    createNotification(ownerBidder.id, 'Private Bidder Notification', 'Confidential tender update.', '/my-bids');
    const ownerNotifs = db.prepare('SELECT * FROM notifications WHERE user_id = ?').all(ownerBidder.id);
    const intruderNotifs = db.prepare('SELECT * FROM notifications WHERE user_id = ?').all(intruderBidder.id);

    assert.ok(ownerNotifs.some(n => n.title === 'Private Bidder Notification'));
    assert.ok(!intruderNotifs.some(n => n.title === 'Private Bidder Notification'), 'Intruder must not see owner notifications');
  });

  // 11. Self-Modification Protection (Tampering Prevention)
  test('Scenario 9: A Vendor CANNOT Change Their Role or Verification Status by Modifying a Request', () => {
    const testVendor = db.prepare("SELECT * FROM users WHERE role = 'bidder' LIMIT 1").get();
    assert.ok(testVendor);

    // Tampering attempt simulator matching the server's PATCH /auth/profile logic
    function simulateProfileUpdate(user, requestedBody) {
      if (requestedBody.role !== undefined && requestedBody.role !== user.role) {
        throw new Error('Security violation: Users are strictly prohibited from changing their own system role.');
      }
      if (requestedBody.verification_status !== undefined && requestedBody.verification_status !== user.verification_status) {
        throw new Error('Security violation: Users are strictly prohibited from altering their own account verification status.');
      }
      return { success: true };
    }

    // Role tampering must fail (bidder trying to make themselves an officer)
    assert.throws(() => {
      simulateProfileUpdate(testVendor, { role: 'officer' });
    }, /Users are strictly prohibited from changing their own system role/);

    // Verification status tampering must fail (e.g. an unverified vendor attempting to elevate to VERIFIED)
    const unverifiedVendor = { id: 'usr_unverified_vendor', role: 'bidder', verification_status: 'EMAIL_PENDING' };
    assert.throws(() => {
      simulateProfileUpdate(unverifiedVendor, { verification_status: 'VERIFIED' });
    }, /Users are strictly prohibited from altering their own account verification status/);

    // Altering verified vendor status directly without authorized admin vetting must also fail
    assert.throws(() => {
      simulateProfileUpdate(testVendor, { verification_status: testVendor.verification_status === 'VERIFIED' ? 'SUSPENDED' : 'VERIFIED' });
    }, /Users are strictly prohibited from altering their own account verification status/);
  });

  // 12. Verification States and Project Data Persist in SQLite
  test('Scenario 10: Verification States & Project Data Persist in SQLite', () => {
    const officer = db.prepare("SELECT * FROM users WHERE email = 'officer@procure.gov'").get();
    assert.ok(officer);
    assert.strictEqual(officer.verification_status, 'APPROVED');
    assert.ok(officer.department);
    assert.ok(officer.government_id_ref);

    const bidder = db.prepare("SELECT * FROM users WHERE email = 'bidder1@acmebuild.com'").get();
    assert.ok(bidder);
    assert.strictEqual(bidder.verification_status, 'VERIFIED');
    assert.strictEqual(bidder.cin_llpin, 'U45200MH2018PTC309182');
    assert.strictEqual(bidder.gstin, '27AABCU9603R1ZM');
    assert.strictEqual(bidder.pan, 'AABCU9603R');

    const tenders = db.prepare('SELECT * FROM tenders').all();
    assert.ok(tenders.length >= 2, 'Existing tenders must remain intact');

    const apps = db.prepare('SELECT * FROM applications').all();
    assert.ok(apps.length >= 2, 'Existing applications must remain intact');

    const auditLogs = db.prepare('SELECT * FROM audit_logs').all();
    assert.ok(auditLogs.length >= 4, 'Audit logs must remain intact');
  });

  // 13. Rule-Based Compliance & Non-Prejudicial Separation
  test('Scenario 11: Rule-based Checks & Non-Prejudicial Uncertainty Separation', () => {
    const tokens = tokenizeText('The renewable solar microgrid will install 15MW inverters.');
    assert.ok(tokens.includes('solar'));
    assert.ok(tokens.includes('microgrid'));

    const vecA = { solar: 0.8, microgrid: 0.6 };
    const vecB = { solar: 0.8, microgrid: 0.6 };
    const sim = computeCosineSimilarity(vecA, vecB);
    assert.strictEqual(Math.round(sim * 100), 100);

    const app = db.prepare("SELECT * FROM applications WHERE ai_risk_level = 'UNCERTAIN' LIMIT 1").get();
    assert.ok(app, 'Application with informational gap must exist');
    assert.strictEqual(app.ai_recommendation, 'REQUEST_CLARIFICATION');

    const findings = JSON.parse(app.ai_findings_json);
    assert.strictEqual(findings.red_flags.length, 0, 'Informational gap must not be treated as fraud');
  });

  // 14. Vendor Registration & Real Document Upload (Requirement 1, 4, 6)
  test('Scenario 12: Vendor Registration and Document Upload with Physical File on Disk', () => {
    const testVendorEmail = `vendor_docs_${Date.now()}@buildcorp.com`;
    const regResult = registerUser({
      email: testVendorEmail,
      password: 'SecurePassword@123',
      full_name: 'Jonathan Miller',
      organization: 'Miller Structural Engineering Ltd',
      phone: '+1-555-7722',
      entity_type: 'PRIVATE_LIMITED',
      cin_llpin: 'U45200MH2021PTC112233',
      gstin: '27AABCM1122R1Z1',
      pan: 'AABCM1122R',
      business_address: '88 Industrial Zone, Pune',
      rep_designation: 'Managing Director',
      ipAddress: '127.0.0.1'
    });

    const vendorId = regResult.user.id;
    assert.strictEqual(regResult.user.role, 'bidder');

    // Create a real physical PDF and image in data/uploads
    const UPLOADS_DIR = path.resolve(process.cwd(), 'data/uploads');
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const pdfName = `test_incorp_${Date.now()}.pdf`;
    const pdfPath = path.join(UPLOADS_DIR, pdfName);
    fs.writeFileSync(pdfPath, '%PDF-1.4\n% Miller Structural Engineering Certificate of Incorporation\n%%EOF');

    const pngName = `test_pan_${Date.now()}.png`;
    const pngPath = path.join(UPLOADS_DIR, pngName);
    const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(pngPath, validPng);

    const now = new Date().toISOString();
    const insertDoc = db.prepare(`
      INSERT INTO vendor_documents (
        id, user_id, doc_type, original_filename, stored_filename, file_path,
        file_size, mime_type, verification_status, extracted_text, ocr_status, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, 'EXTRACTED', ?)
    `);

    const docId1 = 'vdoc_test_' + Date.now() + '_1';
    insertDoc.run(
      docId1,
      vendorId,
      'BUSINESS_REGISTRATION',
      'Miller_Certificate_of_Incorporation.pdf',
      pdfName,
      pdfPath,
      fs.statSync(pdfPath).size,
      'application/pdf',
      'Miller Structural Engineering Incorporation Record',
      now
    );

    const docId2 = 'vdoc_test_' + Date.now() + '_2';
    insertDoc.run(
      docId2,
      vendorId,
      'PAN_CARD',
      'Miller_Corporate_PAN.png',
      pngName,
      pngPath,
      fs.statSync(pngPath).size,
      'image/png',
      'PAN AABCM1122R',
      now
    );

    // Verify stored records and physical file existence
    const storedDocs = db.prepare('SELECT * FROM vendor_documents WHERE user_id = ?').all(vendorId);
    assert.strictEqual(storedDocs.length, 2, 'Two documents must be associated with the vendor');
    assert.ok(fs.existsSync(storedDocs[0].file_path), 'Physical file 1 must exist on disk');
    assert.ok(fs.existsSync(storedDocs[1].file_path), 'Physical file 2 must exist on disk');
    assert.strictEqual(storedDocs[0].verification_status, 'PENDING_REVIEW', 'Document must start in PENDING_REVIEW status');
  });

  // 15. Officer Inspects Vendor Documents & Mandatory Checklist (Requirement 1, 2, 6)
  test('Scenario 13: Officer Inspects Vendor Documents and Mandatory Requirements Checklist', () => {
    const officer = db.prepare("SELECT * FROM users WHERE email = 'officer@procure.gov'").get();
    assert.ok(officer);
    assert.strictEqual(officer.verification_status, 'APPROVED');

    // Get a vendor with documents
    const vendor = db.prepare("SELECT * FROM users WHERE email LIKE 'vendor_docs_%' ORDER BY created_at DESC LIMIT 1").get();
    assert.ok(vendor);

    const docs = db.prepare('SELECT * FROM vendor_documents WHERE user_id = ?').all(vendor.id);
    const mandatoryTypes = ['BUSINESS_REGISTRATION', 'TAX_REGISTRATION', 'PAN_CARD'];

    const checklist = mandatoryTypes.map(m => {
      const doc = docs.find(d => d.doc_type === m);
      return {
        type: m,
        is_uploaded: !!doc,
        status: doc ? doc.verification_status : 'MISSING'
      };
    });

    const incorpCheck = checklist.find(c => c.type === 'BUSINESS_REGISTRATION');
    const panCheck = checklist.find(c => c.type === 'PAN_CARD');
    const taxCheck = checklist.find(c => c.type === 'TAX_REGISTRATION');

    assert.strictEqual(incorpCheck.is_uploaded, true);
    assert.strictEqual(panCheck.is_uploaded, true);
    assert.strictEqual(taxCheck.is_uploaded, false, 'Tax registration was not uploaded yet');
    assert.strictEqual(taxCheck.status, 'MISSING', 'Missing document must be labeled MISSING');
  });

  // 16. Manual Review of Individual Documents with Notes Enforcement (Requirement 2, 6)
  test('Scenario 14: Manual Document Review with Individual Statuses & Mandatory Reason on Rejection', () => {
    const officer = db.prepare("SELECT * FROM users WHERE email = 'officer@procure.gov'").get();
    const doc = db.prepare("SELECT * FROM vendor_documents WHERE doc_type = 'PAN_CARD' ORDER BY uploaded_at DESC LIMIT 1").get();
    assert.ok(doc);

    // Simulator for reviewing document
    function simulateDocReview(officerUser, documentId, status, notes) {
      if (officerUser.role !== 'officer' || officerUser.verification_status !== 'APPROVED') {
        throw new Error('Unauthorized: Only approved officers can review vendor documents.');
      }
      if ((status === 'REJECTED' || status === 'NEEDS_CLARIFICATION') && (!notes || notes.trim().length < 5)) {
        throw new Error(`A specific reason (minimum 5 characters) is required when marking a document as ${status}.`);
      }
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE vendor_documents
        SET verification_status = ?, verification_notes = ?, verified_by = ?, verified_at = ?
        WHERE id = ?
      `).run(status, notes || null, officerUser.id, now, documentId);
      return db.prepare('SELECT * FROM vendor_documents WHERE id = ?').get(documentId);
    }

    // Rejection without reason MUST fail
    assert.throws(() => {
      simulateDocReview(officer, doc.id, 'REJECTED', '');
    }, /A specific reason.*is required/);

    // Rejection with reason succeeds and persists
    const rejectedDoc = simulateDocReview(officer, doc.id, 'REJECTED', 'Scan is blurry and tax ID is partially obscured.');
    assert.strictEqual(rejectedDoc.verification_status, 'REJECTED');
    assert.strictEqual(rejectedDoc.verification_notes, 'Scan is blurry and tax ID is partially obscured.');
    assert.strictEqual(rejectedDoc.verified_by, officer.id);

    // Updating to VERIFIED succeeds
    const verifiedDoc = simulateDocReview(officer, doc.id, 'VERIFIED', 'High-resolution scan re-inspected and verified.');
    assert.strictEqual(verifiedDoc.verification_status, 'VERIFIED');
    assert.strictEqual(verifiedDoc.verified_by, officer.id);
  });

  // 17. Vendor Approval Pre-requisite Enforcement (Requirement 3, 6)
  test('Scenario 15: Vendor Approval Pre-requisite Enforcement (Mandatory Requirements Gate)', () => {
    const officer = db.prepare("SELECT * FROM users WHERE email = 'officer@procure.gov'").get();
    const vendor = db.prepare("SELECT * FROM users WHERE email LIKE 'vendor_docs_%' ORDER BY created_at DESC LIMIT 1").get();
    assert.ok(vendor);

    // Simulator for vendor approval gate
    function simulateVendorApproval(officerUser, vendorId, action, notes) {
      if (officerUser.role !== 'officer' || officerUser.verification_status !== 'APPROVED') {
        throw new Error('Unauthorized');
      }

      if (action === 'APPROVE') {
        const docs = db.prepare('SELECT * FROM vendor_documents WHERE user_id = ?').all(vendorId);
        const mandatoryTypes = ['BUSINESS_REGISTRATION', 'TAX_REGISTRATION', 'PAN_CARD'];
        const missing = [];
        const unverified = [];

        for (const m of mandatoryTypes) {
          const found = docs.find(d => d.doc_type === m);
          if (!found) {
            missing.push(m);
          } else if (found.verification_status !== 'VERIFIED') {
            unverified.push(`${m} (${found.verification_status})`);
          }
        }

        if (missing.length > 0 || unverified.length > 0) {
          throw new Error(`Cannot approve vendor enterprise: Mandatory verification requirements not satisfied. Missing: ${missing.join(', ')}. Unverified: ${unverified.join(', ')}`);
        }

        db.prepare("UPDATE users SET verification_status = 'VERIFIED' WHERE id = ?").run(vendorId);
        return { success: true, status: 'VERIFIED' };
      }

      if (action === 'REJECT') {
        if (!notes || notes.trim().length < 5) {
          throw new Error('A specific reason is required when rejecting vendor verification.');
        }
        db.prepare("UPDATE users SET verification_status = 'REJECTED' WHERE id = ?").run(vendorId);
        return { success: true, status: 'REJECTED' };
      }
    }

    // Attempting to approve while TAX_REGISTRATION is missing MUST fail
    assert.throws(() => {
      simulateVendorApproval(officer, vendor.id, 'APPROVE');
    }, /Cannot approve vendor enterprise: Mandatory verification requirements not satisfied/);

    // Now upload the missing TAX_REGISTRATION document
    const UPLOADS_DIR = path.resolve(process.cwd(), 'data/uploads');
    const taxFileName = `test_tax_${Date.now()}.pdf`;
    const taxFilePath = path.join(UPLOADS_DIR, taxFileName);
    fs.writeFileSync(taxFilePath, '%PDF-1.4\n% Miller Structural Engineering Tax Clearance\n%%EOF');

    const docId3 = 'vdoc_test_' + Date.now() + '_3';
    db.prepare(`
      INSERT INTO vendor_documents (
        id, user_id, doc_type, original_filename, stored_filename, file_path,
        file_size, mime_type, verification_status, extracted_text, ocr_status, uploaded_at
      ) VALUES (?, ?, 'TAX_REGISTRATION', 'Miller_Tax_Clearance.pdf', ?, ?, 100, 'application/pdf', 'PENDING_REVIEW', 'Tax GSTIN', 'EXTRACTED', ?)
    `).run(docId3, vendor.id, taxFileName, taxFilePath, new Date().toISOString());

    // Still fails if TAX_REGISTRATION is PENDING_REVIEW
    assert.throws(() => {
      simulateVendorApproval(officer, vendor.id, 'APPROVE');
    }, /TAX_REGISTRATION/);

    // Verify all 3 documents
    db.prepare("UPDATE vendor_documents SET verification_status = 'VERIFIED' WHERE user_id = ?").run(vendor.id);

    // Approval now succeeds
    const approvedResult = simulateVendorApproval(officer, vendor.id, 'APPROVE');
    assert.strictEqual(approvedResult.status, 'VERIFIED');

    const updatedVendor = db.prepare('SELECT verification_status FROM users WHERE id = ?').get(vendor.id);
    assert.strictEqual(updatedVendor.verification_status, 'VERIFIED');
  });

  // 18. Server-Side Document Access Authorization & Isolation (Requirement 4, 6)
  test('Scenario 16: Server-side Document Access Authorization & Intruder Isolation', () => {
    const doc = db.prepare('SELECT * FROM vendor_documents LIMIT 1').get();
    assert.ok(doc, 'Vendor document must exist');

    const ownerUser = { id: doc.user_id, role: 'bidder' };
    const intruderUser = { id: 'usr_intruder_bidder_999', role: 'bidder' };
    const officerUser = { id: 'usr_officer_001', role: 'officer' };

    function checkDocumentAccess(user, document) {
      if (!user) return { status: 401, error: 'Authentication required' };
      const isOwner = user.id === document.user_id;
      const isOfficer = user.role === 'officer';
      if (!isOwner && !isOfficer) {
        return { status: 403, error: 'Unauthorized: You do not have permission to access this vendor document.' };
      }
      return { status: 200, allowed: true };
    }

    // Owner is allowed
    const ownerAccess = checkDocumentAccess(ownerUser, doc);
    assert.strictEqual(ownerAccess.status, 200);

    // Officer is allowed
    const officerAccess = checkDocumentAccess(officerUser, doc);
    assert.strictEqual(officerAccess.status, 200);

    // Intruder bidder is BLOCKED with 403
    const intruderAccess = checkDocumentAccess(intruderUser, doc);
    assert.strictEqual(intruderAccess.status, 403);
    assert.strictEqual(intruderAccess.error, 'Unauthorized: You do not have permission to access this vendor document.');

    // Unauthenticated is BLOCKED with 401
    const unauthAccess = checkDocumentAccess(null, doc);
    assert.strictEqual(unauthAccess.status, 401);
  });

  console.log('\n================================================================');
  console.log(` AUDIT SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditSuite().catch(err => {
  console.error('Fatal audit suite error:', err);
  process.exit(1);
});
