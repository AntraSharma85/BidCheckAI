/**
 * Document Mismatch Detector
 * Rule-based heuristic classifier to identify potential upload discrepancies
 * Non-prejudicial: flags informational warnings without treating discrepancies as fraud.
 */

// Keyword profiles for document types
const PROFILES = {
  TAX_REGISTRATION: {
    label: 'GST / Tax Registration Document',
    strongKeywords: [
      'gstin', 'goods and services tax', 'form gst', 'taxpayer', 'tax invoice',
      'central board of indirect taxes', 'income tax department', 'permanent account number',
      'tax deduction', 'tax clearance certificate', 'state tax', 'revenue authority'
    ],
    negatives: ['technical proposal', 'methodology', 'bill of materials', 'scada', 'architecture diagram']
  },
  COMPANY_REGISTRATION: {
    label: 'Company Registration / Incorporation Certificate',
    strongKeywords: [
      'certificate of incorporation', 'registrar of companies', 'ministry of corporate affairs',
      'companies act', 'company limited by shares', 'corporate identity number',
      'cin:', 'llpin:', 'articles of association', 'memorandum of association'
    ],
    negatives: ['financial statement', 'balance sheet', 'auditor report', 'bank guarantee']
  },
  FINANCIAL_AUDIT: {
    label: 'Audited Financial Statements',
    strongKeywords: [
      'independent auditor', 'balance sheet', 'statement of profit and loss',
      'cash flows', 'chartered accountant', 'annual turnover', 'financial year',
      'net worth', 'current assets', 'current liabilities', 'notes to financial statements'
    ],
    negatives: ['goods and services tax', 'form gst', 'technical proposal']
  },
  TECHNICAL_PROPOSAL: {
    label: 'Technical Proposal & Engineering Plan',
    strongKeywords: [
      'technical proposal', 'executive summary', 'scope of work', 'technical architecture',
      'methodology', 'implementation roadmap', 'bill of materials', 'specifications',
      'commissioning', 'deliverables', 'milestone', 'system design', 'engineering plan'
    ],
    negatives: ['form gst reg', 'certificate of incorporation only', 'irrevocable bank guarantee']
  },
  BID_BOND: {
    label: 'Bid Security Bond / Bank Guarantee',
    strongKeywords: [
      'bank guarantee', 'bid bond', 'guarantor', 'beneficiary', 'earnest money deposit',
      'irrevocable guarantee', 'undertakes to pay', 'demand without caveat', 'bond validity'
    ],
    negatives: ['methodology', 'technical proposal', 'financial year balance sheet']
  },
  EXPERIENCE_CERTIFICATE: {
    label: 'Past Experience / Client Completion Certificate',
    strongKeywords: [
      'completion certificate', 'satisfactory performance', 'work order reference',
      'client testimonial', 'project value', 'successfully executed', 'certificate of completion'
    ],
    negatives: ['form gst reg', 'balance sheet']
  }
};

/**
 * Detect possible document mismatch between expected document requirement and actual file content.
 * 
 * @param {string} expectedType e.g. 'TECHNICAL_PROPOSAL', 'TAX_CLEARANCE', 'COMPANY_REGISTRATION'
 * @param {string} extractedText Extracted text content from PDF or OCR scan
 * @param {string} filename Original filename
 * @returns {object} { mismatch: boolean, warning: string|null, detectedType: string, confidence: number }
 */
export function detectDocumentMismatch(expectedType, extractedText = '', filename = '') {
  const normText = (extractedText || '').toLowerCase();
  const normName = (filename || '').toLowerCase();
  const combined = normText + ' ' + normName;

  // If text is unreadable or very short (< 30 characters), return unreadable notice without claiming mismatch
  if (normText.trim().length < 30) {
    return {
      mismatch: false,
      warning: 'Document text layer is minimal or scanned. File queued for visual verification by Tender Officer.',
      unreadable: true,
      detectedType: 'UNREADABLE_OR_SCANNED',
      confidence: 0
    };
  }

  // Calculate scores for each profile
  const scores = {};
  for (const [type, profile] of Object.entries(PROFILES)) {
    let matchCount = 0;
    for (const kw of profile.strongKeywords) {
      if (combined.includes(kw)) matchCount += 2;
    }
    for (const neg of profile.negatives) {
      if (combined.includes(neg)) matchCount -= 1;
    }
    scores[type] = Math.max(0, matchCount);
  }

  // Map expected document types to profile keys
  const expectedKeyMap = {
    'TAX_CLEARANCE': 'TAX_REGISTRATION',
    'TAX_REGISTRATION': 'TAX_REGISTRATION',
    'COMPANY_REGISTRATION': 'COMPANY_REGISTRATION',
    'FINANCIAL_AUDIT': 'FINANCIAL_AUDIT',
    'TECHNICAL_PROPOSAL': 'TECHNICAL_PROPOSAL',
    'BID_BOND': 'BID_BOND',
    'EXPERIENCE_CERTIFICATE': 'EXPERIENCE_CERTIFICATE'
  };

  const targetKey = expectedKeyMap[expectedType] || expectedType;
  const expectedProfile = PROFILES[targetKey];

  // Check which profile scored the highest
  let topType = targetKey;
  let topScore = scores[targetKey] || 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topType = type;
    }
  }

  // If expected type scored poorly (<= 2) and another profile scored significantly higher (>= 6)
  if (topType !== targetKey && topScore >= 6 && (scores[targetKey] || 0) <= 2) {
    const detectedLabel = PROFILES[topType]?.label || topType;
    const expectedLabel = expectedProfile?.label || expectedType;

    let warning = `Possible Document Mismatch: This file appears to contain ${detectedLabel} details, but a ${expectedLabel} is required. Please check your upload before submission.`;

    if (targetKey === 'TECHNICAL_PROPOSAL' && topType === 'TAX_REGISTRATION') {
      warning = 'Possible Document Mismatch: This file appears to contain GST / Tax registration information, but a Technical Proposal is required. Please check your upload.';
    } else if (targetKey === 'TECHNICAL_PROPOSAL' && topType === 'COMPANY_REGISTRATION') {
      warning = 'Possible Document Mismatch: This file appears to contain Company Incorporation proof, but a Technical Proposal is required. Please check your upload.';
    }

    return {
      mismatch: true,
      warning,
      detectedType: topType,
      detectedLabel,
      confidence: Math.min(90, topScore * 10)
    };
  }

  return {
    mismatch: false,
    warning: null,
    detectedType: targetKey,
    detectedLabel: expectedProfile?.label || targetKey,
    confidence: Math.min(100, Math.max(50, topScore * 15))
  };
}
