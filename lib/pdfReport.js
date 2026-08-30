/**
 * Dependency-free local PDF writer for A.E.G.I.S. forensic scan reports.
 * No message content or report data is uploaded to a server.
 */
function aegisPdfAscii(value) {
  return String(value == null ? "" : value).normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?");
}

function aegisPdfEscape(value) {
  return aegisPdfAscii(value).replace(/([\\()])/g, "\\$1");
}

function aegisWrapText(value, maxChars = 88) {
  const source = aegisPdfAscii(value).replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const lines = [];
  let line = "";
  for (const word of source.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) { line = candidate; continue; }
    if (line) lines.push(line);
    line = word;
    while (line.length > maxChars) {
      lines.push(line.slice(0, maxChars));
      line = line.slice(maxChars);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function aegisReportLines(report) {
  const lines = [];
  const add = (text, style = "body") => lines.push({ text: aegisPdfAscii(text), style });
  const section = title => { add("", "space"); add(title, "section"); };
  const field = (label, value) => {
    const text = `${label}: ${value == null || value === "" ? "Not available" : value}`;
    for (const wrapped of aegisWrapText(text)) add(wrapped);
  };

  add("A.E.G.I.S. PROTOTYPE FORENSIC SCAN REPORT", "title");
  add("Anti-Phishing Email Gateway & Intelligence System", "subtitle");
  field("Report ID", report.reportId);
  field("Generated", report.exportedAt);
  field("Extension version", report.version);
  section("ASSESSMENT");
  field("Trust score", `${report.score}/100`);
  field("Outcome", report.outcome);
  field("Verdict", report.verdict?.title || report.verdict?.message);
  field("Coverage", report.coverage?.mode || "unknown");
  field("Scan duration", report.scanDurationMs == null ? null : `${report.scanDurationMs} ms`);
  section("MESSAGE IDENTITY");
  field("Sender", report.sender);
  field("Display name", report.senderDisplayName);
  field("Visible Reply-To", report.visibleReplyTo);
  field("Subject", report.subject);
  section("AUTHENTICATION AND DOMAIN POSTURE");
  const stats = report.statistics || {};
  field("SPF DNS posture", stats.spfStatus);
  field("DKIM DNS posture", stats.dkimStatus);
  field("DMARC policy", stats.dmarcStatus);
  field("Provider SPF result", stats.messageSpfStatus);
  field("Provider DKIM result", stats.messageDkimStatus);
  field("Provider DMARC result", stats.messageDmarcStatus);
  field("Provider source", stats.messageAuthSource);
  field("Domain age", stats.domainAgeDays == null ? null : `${stats.domainAgeDays} days`);
  section("LOCAL AI LANGUAGE ANALYSIS");
  const ai = report.aiClassification || {};
  field("Model available", ai.available === true ? "Yes" : "No");
  field("Phishing-language probability", typeof ai.probabilityPercent === "number" ? `${ai.probabilityPercent}%` : null);
  field("Risk band", ai.band);
  field("Strongest phishing-language features", (ai.strongestPhishingTerms || []).slice(0, 5).map(item => item.term).join(", ") || null);
  add("The model is a local supporting linguistic signal, not proof of fraud or actor attribution. It cannot quarantine a message by itself.");
  section("RISK EVIDENCE");
  const deductions = Array.isArray(report.deductions) ? report.deductions : [];
  if (!deductions.length) add("No score deductions were applied.");
  for (const item of deductions) {
    for (const wrapped of aegisWrapText(`[${item.delta}] ${item.label}`)) add(wrapped, "bullet");
  }
  section("OBSERVED INDICATORS");
  field("Link hosts", (report.linkHosts || []).join(", ") || "None");
  field("Attachment filenames", (report.attachmentNames || []).join(", ") || "None");
  field("Links scanned", stats.linksScanned ?? 0);
  field("Risky links", stats.riskyLinks ?? stats.linksFlagged ?? 0);
  field("Attachments scanned", stats.attachmentsScanned ?? 0);
  field("Attachments flagged", stats.attachmentsFlagged ?? 0);
  section("SCOPE AND EVIDENTIARY NOTICE");
  for (const paragraph of [
    "This report was generated locally from the A.E.G.I.S. prototype scan result. It supports technical review and incident triage.",
    "It is not, by itself, a legal chain-of-custody record and does not identify a human threat actor. Missing evidence is not proof that an email is legitimate.",
    "DNS publication describes domain posture. Message-level SPF, DKIM and DMARC values appear only when the connected mail provider supplied them. This release does not independently repeat DKIM cryptographic verification.",
    "The report contains the visible subject, sender indicators, hostnames and attachment filenames selected for export. No raw email body, OAuth token or complete raw header is embedded."
  ]) {
    for (const wrapped of aegisWrapText(paragraph)) add(wrapped);
    add("", "space");
  }
  return lines;
}

function createAegisPdfBytes(report) {
  const TOP = 742, BOTTOM = 52, LEFT = 48;
  const lineHeight = style => ({ title: 20, subtitle: 15, section: 16, space: 6 }[style] || 12);
  const pages = [];
  let page = [], y = TOP;
  for (const line of aegisReportLines(report)) {
    const height = lineHeight(line.style);
    if (y - height < BOTTOM && page.length) { pages.push(page); page = []; y = TOP; }
    page.push({ ...line, y });
    y -= height;
  }
  if (page.length) pages.push(page);

  const objects = [];
  const addObject = value => { objects.push(value); return objects.length; };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  pages.forEach((lines, pageIndex) => {
    const commands = ["0.10 0.18 0.33 rg 0 754 612 38 re f", `BT /F2 8 Tf 1 1 1 rg 500 769 Td (Page ${pageIndex + 1} of ${pages.length}) Tj ET`];
    for (const line of lines) {
      if (line.style === "space" || !line.text) continue;
      const isBold = line.style === "title" || line.style === "section";
      const size = line.style === "title" ? 15 : line.style === "subtitle" ? 10 : line.style === "section" ? 11 : 9;
      const color = line.style === "section" ? "0.08 0.35 0.45" : "0.12 0.15 0.20";
      const x = line.style === "bullet" ? LEFT + 10 : LEFT;
      commands.push(`BT /${isBold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${line.y} Td (${aegisPdfEscape(line.text)}) Tj ET`);
    }
    commands.push(`0.45 0.49 0.56 rg BT /F1 7 Tf ${LEFT} 28 Td (Generated locally by A.E.G.I.S. - Prototype report - Verify evidence independently) Tj ET`);
    const stream = commands.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n%AEGIS\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

if (typeof module !== "undefined") module.exports = { aegisPdfAscii, aegisWrapText, aegisReportLines, createAegisPdfBytes };
