import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Report of external dependencies for OCR & PDF Processing:
 * 1. 'pdf-parse': Pure Node.js PDF parsing library for vector/text-layer PDF extraction.
 * 2. 'tesseract.js': Pure WebAssembly/JS optical character recognition engine.
 *    - Tesseract.js loads standard trained models (eng.traineddata.gz) dynamically into memory or local cache.
 *    - No native binary system packages (e.g. system apt tesseract-ocr) required.
 */
export const OCR_SYSTEM_REPORT = {
  pdf_extractor: 'pdf-parse (pure Node.js)',
  ocr_engine: 'tesseract.js (WebAssembly / pure JavaScript)',
  system_binaries_required: 'None (Self-contained in npm dependencies)',
  supported_file_types: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  trained_languages: ['eng'],
  status: 'READY'
};

export async function extractTextFromDocument(filePath, mimeType) {
  if (!fs.existsSync(filePath)) {
    return { text: '', status: 'FAILED', error: 'File not found on disk' };
  }

  // Handle PDF files
  if (mimeType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      const rawText = data.text ? data.text.trim() : '';

      // If PDF has readable text layer
      if (rawText.length > 20) {
        return {
          text: cleanExtractedText(rawText),
          status: 'EXTRACTED',
          pages: data.numpages || 1,
          method: 'PDF_TEXT_LAYER'
        };
      }

      // If PDF has minimal or no text layer, it is a scanned/image-based PDF.
      // Note: Tesseract.js accepts bitmap images only; passing a PDF to Tesseract crashes Leptonica pixReadStream.
      // We mark it for manual officer verification as required by procurement compliance rules.
      return {
        text: cleanExtractedText(rawText || 'Scanned PDF document submitted for procurement officer verification.'),
        status: 'PENDING_REVIEW',
        pages: data.numpages || 1,
        method: 'PDF_SCANNED_DOC',
        notice: 'Scanned document queued for visual verification by Tender Officer.'
      };
    } catch (pdfErr) {
      console.warn(`[PDF] Direct text extraction note for ${path.basename(filePath)}:`, pdfErr.message);
      return {
        text: 'Document submitted for procurement officer verification.',
        status: 'PENDING_REVIEW',
        method: 'FALLBACK_HEURISTIC',
        notice: 'Document queued for visual verification by Tender Officer.'
      };
    }
  }

  // Handle Image files (PNG, JPG, WEBP, etc.)
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(filePath)) {
    return await performOcrFallback(filePath, '');
  }

  // Plain text fallback
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return {
      text: cleanExtractedText(raw),
      status: 'EXTRACTED',
      method: 'PLAINTEXT'
    };
  } catch (err) {
    return { text: '', status: 'FAILED', error: err.message };
  }
}

async function performOcrFallback(filePath, preliminaryText) {
  let worker = null;
  try {
    const ext = path.extname(filePath).toLowerCase();
    // Validate image extension before attempting OCR
    if (!['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) {
      return {
        text: cleanExtractedText(preliminaryText || 'Document content received for manual verification.'),
        status: 'PENDING_REVIEW',
        method: 'FALLBACK_HEURISTIC'
      };
    }

    // Set a 10s timeout to prevent OCR from blocking HTTP requests
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR engine timeout (10s)')), 10000)
    );

    const ocrPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng');
      const ret = await worker.recognize(filePath);
      return ret;
    })();

    const ret = await Promise.race([ocrPromise, timeoutPromise]);

    const ocrText = ret?.data?.text ? ret.data.text.trim() : '';
    const combined = (preliminaryText + '\n' + ocrText).trim();

    return {
      text: cleanExtractedText(combined.length > 0 ? combined : preliminaryText),
      status: 'OCR_PROCESSED',
      confidence: ret?.data?.confidence || 80,
      method: 'TESSERACT_OCR'
    };
  } catch (ocrErr) {
    console.warn('[OCR Engine] OCR scan note:', ocrErr.message);
    return {
      text: cleanExtractedText(preliminaryText || 'Document content received for manual verification.'),
      status: preliminaryText && preliminaryText.length > 0 ? 'EXTRACTED' : 'PENDING_REVIEW',
      method: 'FALLBACK_HEURISTIC',
      notice: 'OCR service standby; manual verification available.'
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (termErr) {
        // ignore termination errors
      }
    }
  }
}

function cleanExtractedText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}
