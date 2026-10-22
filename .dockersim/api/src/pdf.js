// ponytail: minimal single-page PDF writer (Helvetica text only) — no PDF dependency
export function pdfBytes(title, lines) {
  const esc = (s) => String(s).replace(/[()\\]/g, "");
  const txt = [`BT /F1 16 Tf 50 750 Td (${esc(title)}) Tj ET`,
    ...lines.slice(0, 20).map((l, i) => `BT /F1 10 Tf 50 ${720 - i * 18} Td (${esc(String(l).slice(0, 90))}) Tj ET`)].join("\n");
  const objs = [
    `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`,
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`,
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj`,
    `4 0 obj << /Length ${txt.length} >> stream\n${txt}\nendstream endobj`,
    `5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`,
  ];
  let out = "%PDF-1.4\n", off = [0], pos = out.length;
  for (const o of objs) { off.push(pos); out += o + "\n"; pos = out.length; }
  const xref = pos;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n `).join("\n") +
    `\ntrailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
