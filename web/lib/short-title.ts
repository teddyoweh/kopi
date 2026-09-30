import { displayTitle } from "./title-case";

/** A reference code in front of the title: "IOCT14/26 – …", "C26a-00697_AE2 - …", "SPO-REQ-2026-005662-SS-The …". */
const REFERENCE = [/^\S*\d\S*\s+[-–:]\s+/, /^\S*\d\S*?-(?=The\s)/];

/** How GeBIZ titles open, which says nothing in a sidebar or a palette row. */
const LEAD_IN = [
  /^(an?\s+)?invitation\s+to\s+(quote|tender)\s+(for|on)\s+(the\s+)?/i,
  /^request\s+for\s+(quotation|proposal|information)\s+(for|on)\s+(the\s+)?/i,
  /^(tender|quotation)\s+for\s+(the\s+)?/i,
  /^(the\s+)?provision\s+of\s+(the\s+)?/i,
];

/**
 * A tender's title cut to what it is about, for places with one line to spare: "Invitation to
 * Tender for Legal Services to Majlis Ugama Islam Singapura" reads "Legal Services to Majlis
 * Ugama Islam Singapura". The full title stays everywhere there is room for it.
 */
export function shortTitle(title: string): string {
  const full = displayTitle(title).trim();
  let short = full;
  for (const pattern of REFERENCE) short = short.replace(pattern, "");
  for (const pattern of LEAD_IN) short = short.replace(pattern, "");
  short = short.trim();
  if (short.length < 8) return full;
  return short.charAt(0).toUpperCase() + short.slice(1);
}
