'use strict';

// Parses Textract LINE blocks from a business-card scan into structured contact
// fields. Business cards have no fixed layout, so name/company/title are inferred
// heuristically (font-size-as-proxy via bounding-box height, keyword matching)
// rather than read from fixed positions — hence the per-field confidence levels
// the caller uses to flag likely-wrong fields for review instead of trusting them.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+?\d[\d\s\-().]{7,}\d)/;
const PHONE_KEYWORDS = /\b(tel|mobile|ph|phone|cell|m|t)[.:\s]/i;
const COMPANY_SUFFIX_RE = /\b(inc|ltd|llc|llp|pvt|corp|corporation|company|co|technologies|technology|tech|solutions|solution|group|systems|enterprises|industries|associates)\b\.?/i;
const TITLE_KEYWORDS_RE = /\b(manager|director|ceo|cto|cfo|coo|founder|co-founder|engineer|president|vice president|vp|head|officer|executive|lead|consultant|architect|analyst|specialist|owner|partner)\b/i;
const URL_RE = /(https?:\/\/|www\.)\S+/i;

function isPlausibleName(text) {
  if (URL_RE.test(text) || EMAIL_RE.test(text) || PHONE_RE.test(text)) return false;
  const words = text.trim().split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  // Reject lines that are mostly digits (addresses, zip codes, phone fragments)
  const digitCount = (text.match(/\d/g) || []).length;
  if (digitCount > text.length * 0.3) return false;
  return true;
}

/**
 * @param {Array<{ text: string, confidence: number, top: number, height: number }>} lines
 * @returns {{ fields: object, confidence: object }}
 */
function parseBusinessCard(lines) {
  const fields = { name: '', email: '', phone: '', company: '', jobTitle: '' };
  const confidence = { name: null, email: null, phone: null, company: null, jobTitle: null };

  const remaining = [...lines];

  // Email — deterministic regex match
  const emailLine = remaining.find((l) => EMAIL_RE.test(l.text));
  if (emailLine) {
    fields.email = emailLine.text.match(EMAIL_RE)[0];
    confidence.email = 'high';
  }

  // Phone — prefer a line with an explicit phone-ish keyword, else first plausible match
  const phoneCandidates = remaining.filter((l) => PHONE_RE.test(l.text) && !EMAIL_RE.test(l.text));
  const keywordPhone = phoneCandidates.find((l) => PHONE_KEYWORDS.test(l.text));
  const phoneLine = keywordPhone || phoneCandidates[0];
  if (phoneLine) {
    fields.phone = phoneLine.text.match(PHONE_RE)[0].trim();
    confidence.phone = 'high';
  }

  // Remove lines already claimed by email/phone/URL from the name/company/title pool
  const pool = remaining.filter(
    (l) => l !== emailLine && l !== phoneLine && !URL_RE.test(l.text),
  );

  // Job title — only set on an explicit keyword match, never guessed
  const titleLine = pool.find((l) => TITLE_KEYWORDS_RE.test(l.text));
  if (titleLine) {
    fields.jobTitle = titleLine.text.trim();
    confidence.jobTitle = 'high';
  }

  const namePool = pool.filter((l) => l !== titleLine);

  // Company — prefer a line with a recognizable business suffix
  const companyBySuffix = namePool.find((l) => COMPANY_SUFFIX_RE.test(l.text));
  let companyLine = companyBySuffix;

  // Name — largest text block (font-size proxy) among plausible name-shaped lines
  const nameCandidates = namePool
    .filter((l) => l !== companyLine && isPlausibleName(l.text))
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  const nameLine = nameCandidates[0];
  if (nameLine) {
    fields.name = nameLine.text.trim();
    confidence.name = 'medium';
  }

  // If no suffix-matched company was found, fall back to the next-largest
  // remaining line that isn't the name/title.
  if (!companyLine) {
    const companyCandidates = namePool
      .filter((l) => l !== nameLine)
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    companyLine = companyCandidates[0];
    if (companyLine) confidence.company = 'low';
  } else {
    confidence.company = 'medium';
  }
  if (companyLine) fields.company = companyLine.text.trim();

  return { fields, confidence };
}

module.exports = { parseBusinessCard };
