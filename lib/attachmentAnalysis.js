/**
 * Attachment Risk Analysis (feeds the Trust Score Engine's "attachments" category)
 *
 * Runs entirely against the filenames the content script can already see in
 * the Gmail/Outlook DOM (attachment chips) — no download, no file content is
 * ever read. Two tiers:
 *
 * 1. HIGH-RISK extensions — executable or script types that can run code the
 *    moment they're opened (.exe, .scr, .js, .vbs, .bat, .cmd, .msi, .jar,
 *    .ps1, .lnk, .hta, .wsf, .com, .cpl, .apk).
 * 2. MEDIUM-RISK extensions — archive/container and macro-capable document
 *    types frequently used to smuggle the above past mail filters (.zip,
 *    .rar, .7z, .iso, .img, .docm, .xlsm, .pptm, .html, .htm — an HTML
 *    attachment is a classic credential-harvesting-page delivery vector).
 *
 * A double extension (invoice.pdf.exe) is also flagged directly — it's one
 * of the oldest and still most effective social-engineering tricks, and a
 * pattern match on the filename catches it regardless of the "real" (last)
 * extension already being on the high-risk list.
 */

const HIGH_RISK_EXTENSIONS = new Set([
  "exe", "scr", "js", "vbs", "vbe", "bat", "cmd", "msi", "jar",
  "ps1", "ps2", "lnk", "hta", "wsf", "wsh", "com", "cpl", "apk",
  "pif", "gadget", "msc", "reg", "vb", "jse"
]);

const MEDIUM_RISK_EXTENSIONS = new Set([
  "zip", "rar", "7z", "iso", "img", "docm", "xlsm", "pptm",
  "html", "htm", "dll", "sys", "dmg"
]);

// BUG FIX (round-7): the old regex (/\.[a-z0-9]{2,5}\.[a-z0-9]{2,5}$/i) just
// checked for "any two dot-separated segments at the end", so it flagged
// every versioned or dated filename as a disguised-double-extension attack
// — tested against 5 filenames, it hit invoice.pdf.exe (correct) AND
// Q3.report.final.pdf, photo.2024.jpg, resume_v2.final.docx, archive.tar.gz
// (all false positives). The actual attack pattern this check exists to
// catch is specifically "a normal-looking document extension immediately
// followed by an executable/script extension" (invoice.pdf.exe,
// resume.docx.scr) — so now it only flags when the middle segment is a
// common document/media extension AND the final segment is itself already
// on the high-risk list, and it explicitly excludes known-benign compound
// extensions like .tar.gz/.tar.bz2/.tar.xz.
const BENIGN_DOUBLE_EXTENSION_SUFFIXES = ["tar.gz", "tar.bz2", "tar.xz"];
const COMMON_DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf",
  "jpg", "jpeg", "png", "gif", "bmp", "zip"
]);

function getExtension(filename) {
  const match = /\.([a-z0-9]{1,6})$/i.exec((filename || "").trim());
  return match ? match[1].toLowerCase() : "";
}

function hasDisguisedDoubleExtension(filename) {
  const lower = (filename || "").toLowerCase();
  if (BENIGN_DOUBLE_EXTENSION_SUFFIXES.some(suf => lower.endsWith("." + suf))) return false;

  const match = /\.([a-z0-9]{2,5})\.([a-z0-9]{2,6})$/i.exec(filename || "");
  if (!match) return false;
  const middleExt = match[1].toLowerCase();
  const finalExt = match[2].toLowerCase();
  return COMMON_DOCUMENT_EXTENSIONS.has(middleExt) && HIGH_RISK_EXTENSIONS.has(finalExt);
}

/**
 * attachments = [{ name: "invoice.pdf" }, ...] — plain filenames scraped
 * from attachment chips in the open message. No file content, ever.
 */
function analyzeAttachments(attachments) {
  const result = {
    attachmentsScanned: attachments ? attachments.length : 0,
    highRisk: [],
    mediumRisk: [],
    doubleExtension: []
  };
  if (!attachments || attachments.length === 0) return result;

  for (const att of attachments) {
    const name = (att.name || "").trim();
    if (!name) continue;
    const ext = getExtension(name);

    if (hasDisguisedDoubleExtension(name)) {
      result.doubleExtension.push(name);
    }
    if (HIGH_RISK_EXTENSIONS.has(ext)) {
      result.highRisk.push(name);
    } else if (MEDIUM_RISK_EXTENSIONS.has(ext)) {
      result.mediumRisk.push(name);
    }
  }

  return result;
}

if (typeof module !== "undefined") {
  module.exports = {
    analyzeAttachments, getExtension, hasDisguisedDoubleExtension,
    HIGH_RISK_EXTENSIONS, MEDIUM_RISK_EXTENSIONS
  };
}
