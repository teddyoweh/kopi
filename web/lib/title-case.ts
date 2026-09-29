/**
 * About one GeBIZ title in five is written in capitals ("SUPPLY OF INSTRUCTORS FOR FOOTBALL CCA
 * IN 2027"). displayTitle sets those in title case, the way the rest are written, and leaves
 * everything else alone. Title case rather than sentence case, because a title is full of names
 * ("Valour Primary School", "Pasir Ris Park") that sentence case would lower.
 *
 * Only words written entirely in capitals change. Short ones that are not English words stay as
 * they are, since in a tender they are acronyms (CCA, HDB, M&E, IT); so do words with digits
 * (L9, MAS-REQ-2026-001426/AA).
 */

/** Joining words kept lower-case inside a title. */
const MINOR = new Set("a an the and or nor but for of in on at to by as with from into onto per via vs than".split(" "));

/** English words of three letters or fewer that a title might use; any other short word is an acronym. */
const SHORT_WORDS = new Set(
  (
    "a an the and or nor but for of in on at to by as up via per vs " +
    "be is are was do go if no it's its our own new old big few low high hot dry wet raw red one two six ten " +
    "all any add age aid air arm art bag bar bay bed bin bit box bus buy can cap car cat cow cup cut day dog due ear eat end eye " +
    "fan far fee fit fix fly fog fun gas gel gym hat hub ice ink jam jet job key kid kit lab law lay leg let lid lit log lot man " +
    "map mat men mix mud net nut oak off oil out pad pan pay pen per pet pie pin pit pot pro pub put rack ran rat raw ray rig rod " +
    "row rug run saw sea set sit ski sky sum sun tab tag tap tax tea tie tin tip toe ton top tow toy try tub two use van vet war " +
    "way web wig win yes yet zoo re co non pre sub etc ad hoc " +
    // Abbreviations GeBIZ titles use, which read better capitalised than shouted.
    "sch schs pri sec blk blks bldg bldgs ave rd jln svcs pt proj dev yr yrs mth mths pte ltd bhd inc llp " +
    "jan feb mar apr may jun jul aug sep sept oct nov dec " +
    // Syllables of Singapore place and school names (Pasir Ris, Toa Payoh, Ang Mo Kio, Pei Chun).
    "ris toa ang mo kio yio chu pei gan eng ubi tan lim teo soo hua kim lam sin yew tee pek"
  ).split(" "),
);

/** Acronyms longer than three letters, and names with their own capitals. */
const NAMED: Record<string, string> = Object.fromEntries(
  (
    "SCDF IMDA CAAS SUSS CCTV HVAC ACMV ASEAN COVID RSAF IRAS MINDEF PSLE IPPT SMRT SBST ALPS NTUC CHIJ SCAR " +
    "GovTech ActiveSG NParks SportSG iPad iPhone eLearning"
  )
    .split(" ")
    .map((name) => [name.toUpperCase(), name]),
);

/** A letter on its own after these is a label ("Part A", "Phase B"), not the article. */
const LABELS = new Set("part pt phase block blk type annex schedule lot zone section tower level category item grade batch proj".split(" "));

const hasLower = /[a-z]/;
const LETTERS = /[A-Za-z]/g;

function isShouting(title: string): boolean {
  const letters = title.match(LETTERS) ?? [];
  const upper = letters.filter((c) => c >= "A" && c <= "Z").length;
  const loudWords = title.split(/\s+/).filter((w) => w.length >= 4 && /^[^a-z]*[A-Z]{4}[^a-z]*$/.test(w)).length;
  return letters.length > 0 && upper / letters.length >= 0.6 && loudWords >= 2;
}

function capitalise(part: string): string {
  const lower = part.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** One hyphen-free piece of a word, already known to be in capitals. */
function casePart(part: string, minorOk: boolean, previous: string): string {
  if (/^\d+(ST|ND|RD|TH)$/.test(part)) return part.toLowerCase();
  const letters = part.replace(/[^A-Za-z]/g, "");
  if (!letters || /\d/.test(part) || part.includes("&")) return part;
  const named = NAMED[letters];
  if (named) return part.replace(letters, named);
  const word = letters.toLowerCase();
  if (letters.length === 1) {
    if (word === "a" && minorOk && !LABELS.has(previous)) return part.toLowerCase();
    return part;
  }
  // "(SHM)", "(MSCP)": a short word alone in brackets is the acronym being defined.
  if (/^\([A-Z]{2,5}\)[.,;:]?$/.test(part)) return part;
  if (!SHORT_WORDS.has(word) && (letters.length <= 3 || (letters.length === 4 && !/[AEIOUY]/.test(letters)))) return part;
  if (minorOk && MINOR.has(word)) return part.toLowerCase();
  // Keep punctuation around the word ("(TOTAL:" → "(Total:"); an apostrophe's "S" stays with the word.
  return part.replace(/[A-Za-z][A-Za-z'’]*/, (w) => capitalise(w));
}

/** The title as it should read: unchanged unless GeBIZ wrote it in capitals. */
export function displayTitle(title: string): string {
  if (!isShouting(title)) return title;
  const words = title.split(/(\s+)/);
  let previous = "";
  let startOfPhrase = true;
  return words
    .map((word) => {
      if (/^\s+$/.test(word) || !word) return word;
      let out = word;
      if (!hasLower.test(word)) {
        const minorOk = !startOfPhrase && !/^[(\[]/.test(word);
        // Pieces joined by "-" or "/" are cased one by one; after a reference number, the title starts afresh.
        const pieces = word.split(/([-/])/);
        out = pieces
          .map((piece, i) => {
            if (i % 2 === 1) return piece;
            if (i === 0) return casePart(piece, minorOk && pieces.length === 1, previous);
            return casePart(piece, !pieces.slice(0, i).some((p) => /\d/.test(p)), "");
          })
          .join("");
      }
      previous = word.replace(/[^A-Za-z]/g, "").toLowerCase();
      startOfPhrase = /[:;(]$/.test(word);
      return out;
    })
    .join("");
}
