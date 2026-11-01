# BidCheck AI — Procurement Fraud & Tender Compliance Portal

BidCheck AI is a procurement integrity intelligence and tender compliance platform. It provides automated statutory rule verification, cross-proposal document similarity evaluation (TF-IDF & cosine similarity), non-prejudicial evidentiary uncertainty handling, and an immutable audit trail for public procurement authorities and registered bidders.

---

## 1. Quick Start Guide

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation & Startup (Windows-friendly)

This project includes a project-level `.npmrc` setting `ignore-scripts=true` to work around a Windows installation failure where `better-sqlite3@13.0.3` attempts a `node-gyp` C++ build even when its bundled prebuilt binary is available. This skips dependency lifecycle scripts during installation; the project's explicit `npm run` commands still work. If a runtime module reports a missing binary, do not delete the database or change the SQLite file; use the troubleshooting notes below.

```powershell
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Run the automated audit verification test suite
npm test

# 3. Start the application server on Port 3000
npm run dev
```

If installation succeeds but SQLite cannot load, run `node -e "import('better-sqlite3').then(({default: Database}) => { const db = new Database(':memory:'); console.log(db.prepare('select sqlite_version() as version').get()); db.close(); }).catch(e => { console.error(e); process.exit(1); })"` to test the native module before launching the app.

Open your browser to:
```
http://localhost:3000
```

---

## 2. Test Accounts & Credentials

The application initializes with an embedded SQLite database (`./data/bidcheck.db`) pre-seeded with realistic tenders, proposals, and authorized accounts:

| Role | Name | Email Address | Password | Organization |
| :--- | :--- | :--- | :--- | :--- |
| **Procurement Officer** | Director Sarah Jenkins | `officer@procure.gov` | `Officer@123` | National Procurement Authority |
| **Registered Bidder 1** | Marcus Vance | `bidder1@acmebuild.com` | `Bidder@123` | Acme Infrastructure & Tech Ltd |
| **Registered Bidder 2** | Elena Rostova | `bidder2@vortexcorp.com` | `Bidder@123` | Vortex Systems Engineering Inc |

*Note: You can sign in using standard email and password or use the profile switcher in the top-right menu.*

---

## 3. Two-Device / Multi-Session Workflow

To demonstrate concurrent multi-user procurement workflows across separate browsers or devices:

### Step 1: Officer Session (Device / Window 1)
1. Sign in as `officer@procure.gov`.
2. Navigate to **Manage Tenders** and click **Publish New Tender**.
3. Fill in tender specifications (title, reference code, allocated budget, and deadline) and click **Publish Tender Notice**.
4. The tender immediately registers in the SQLite database and becomes visible across all sessions.

### Step 2: Bidder Session (Device / Window 2 or Incognito)
1. Sign in as `bidder1@acmebuild.com`.
2. Browse **Open Tenders** to view the newly published tender.
3. Click **Submit Application Proposal**.
4. Fill in legal entity details, statutory Tax ID, and proposal quote amount, and attach required documents (PDF or image scans). Click **Submit Sealed Bid**.

### Step 3: Real-Time Evaluation & Clarification (Device 1)
1. The officer dashboard immediately logs the new submission and increments alerts.
2. In **Submitted Bids**, click **Inspect Bid** to view automated compliance rule scores and evidentiary breakdown.
3. If an evidentiary gap exists (e.g. pending bank endorsement), issue a formal clarification request via the communications thread.

### Step 4: Bidder Resubmission (Device 2)
1. The bidder receives notification and navigates to **My Applications**.
2. Click **View Application & Respond** to submit an official explanation or upload a replacement certified document.
3. Resubmission triggers automatic re-evaluation and logs the new version in the status history.

### Step 5: Officer Final Determination (Device 1)
1. In **Bid Risk Analysis**, the officer can review cross-proposal similarity indices, shared registration checks, and price variances.
2. Under **Official Procurement Officer Final Determination**, select an official decision (`APPROVE & QUALIFY`, `AWARD TENDER CONTRACT`, or `DISQUALIFY`), enter mandatory administrative rationale notes, and submit.
3. The binding determination is archived in the **Audit Trail**.

---

## 4. Key Architectural & Compliance Safeguards

- **Pure JavaScript Implementation:** 100% ESM Node.js backend and React JSX frontend. Zero TypeScript, Firebase, MongoDB, or Supabase dependencies.
- **SQLite Concurrency & Persistence:** Database operates in WAL mode (`PRAGMA journal_mode = WAL`) stored at `./data/bidcheck.db`, guaranteeing data survival across server restarts.
- **Separation of Advisory AI and Human Authority:** The automated `ai_recommendation` provides advisory guidance, while the binding `official_decision` remains strictly controlled by authorized procurement officers.
- **Administrative Fairness Guarantee:** Missing documentation or unverified scans are categorized as `UNCERTAIN / INFORMATION_GAP` requiring clarification, never presumed as proof of fraud.
- **Protected File Access:** Uploaded documents are stored with UUID identifiers in `./uploads/` and served through `/api/documents/:id/download`, which enforces strict server-side ownership and officer authorization checks.
