import { readFile, writeFile, rename } from 'fs/promises';
import { join } from 'path';

const API_KEY = '7071847a-1197-4a5f-bc17-d7f5e9e7c37b';
const OUT_DIR = '/workspace/docs/api2pdf-test';
const ORIGINAL_DIR = join(OUT_DIR, 'originals');
const PDF_DIR = join(OUT_DIR, 'pdfs');

// Step 1: Build the 5 DOCX files (rebuild them - we have the source)
console.log('=== Step 1: Building 5 complex DOCX files ===\n');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageBreak, Header, Footer, PageNumber, LevelFormat, ShadingType } = await import('docx');

function buildDoc1() {
  return new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Mathématiques Terminale S — 2026', italics: true, size: 20 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Page ', size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 }), new TextRun({ text: ' sur ', size: 18 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Chapitre 7 : Intégrales et primitives', bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: 'Ce chapitre couvre les concepts fondamentaux du calcul intégral appliqués aux fonctions réelles d\'une variable réelle.' })] }),
        ...Array.from({ length: 30 }, (_, i) => new Paragraph({ children: [new TextRun({ text: `Exercice ${i+1}. Calculer l'intégrale : ` }), new TextRun({ text: `I${i+1} = ∫[0 à ${i+1}] x^${i+1} · e^(-x) dx`, font: 'Cambria Math', bold: true })] })),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Démonstrations' })] }),
        ...Array.from({ length: 10 }, (_, i) => new Paragraph({ children: [new TextRun({ text: `Théorème ${i+1}. `, bold: true }), new TextRun({ text: `Soit f une fonction continue sur [a, b]. Alors l'application F(x) = ∫[a à x] f(t) dt est dérivable et F'(x) = f(x). Démonstration : F'(x) = lim(h→0) [F(x+h) - F(x)] / h = lim(h→0) (1/h) ∫[x à x+h] f(t) dt...`, italics: true })] })),
      ],
    }],
    numbering: { config: [{ reference: 'math', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }] }] },
  });
}

function buildDoc2() {
  const tables = Array.from({ length: 5 }, (_, tableIdx) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 8, color: '000000' }, bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' }, left: { style: BorderStyle.SINGLE, size: 8, color: '000000' }, right: { style: BorderStyle.SINGLE, size: 8, color: '000000' }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '888888' }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '888888' } },
    rows: [
      new TableRow({ children: [new TableCell({ columnSpan: 8, shading: { type: ShadingType.CLEAR, color: 'auto', fill: '1F4E79' }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `TABLEAU ${tableIdx + 1}`, bold: true, color: 'FFFFFF', size: 28 })] })] })] }),
      new TableRow({ children: ['Région', 'Q1', 'Q2', 'Q3', 'Q4', 'Total', 'Moy.', '%'].map((h) => new TableCell({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D9E2F3' }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 20 })] })] })) }),
      ...Array.from({ length: 30 }, (_, rowIdx) => {
        const region = ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabès', 'Gafsa', 'Kasserine'][rowIdx % 8];
        const vals = Array.from({ length: 4 }, () => Math.floor(Math.random() * 100));
        const total = vals.reduce((a, b) => a + b, 0);
        return new TableRow({ children: [region, ...vals, total, (total/4).toFixed(1), (total/4).toFixed(1)+'%'].map((c, i) => new TableCell({ children: [new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT, children: [new TextRun({ text: String(c), size: 18, bold: i === 5 })] })] })) });
      }),
    ],
  }));
  return new Document({ sections: [{ properties: { page: { size: { width: 16838, height: 11906 }, orientation: 'landscape' } }, children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Rapport Statistique Annuel', bold: true })] }), new Paragraph({ children: [new TextRun({ text: 'Document contenant 5 tableaux complexes avec cellules fusionnées.', italics: true })] }), ...tables.flatMap((t) => [t, new Paragraph({ children: [new TextRun({ text: '' })] })])] }] });
}

function buildDoc3() {
  return new Document({
    sections: [
      { properties: { page: { size: { width: 11906, height: 16838 } } }, children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Partie 1 : Théorie (A4 portrait)', bold: true })] }), ...Array.from({ length: 15 }, (_, i) => new Paragraph({ children: [new TextRun({ text: `Paragraphe ${i+1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.` })] }))] },
      { properties: { page: { size: { width: 16838, height: 11906 }, orientation: 'landscape' } }, children: [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Partie 2 : Données tabulaires (A4 paysage)', bold: true })] }), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: Array.from({ length: 40 }, (_, r) => new TableRow({ children: Array.from({ length: 12 }, (_, c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `L${r+1}C${c+1}`, size: 16 })] })] })) })) })] },
      { properties: { page: { size: { width: 12240, height: 20160 } } }, children: [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Partie 3 : Format Légal', bold: true })] }), ...Array.from({ length: 20 }, (_, i) => new Paragraph({ children: [new TextRun({ text: `Section légale paragraphe ${i+1} : Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.` })] }))] },
    ],
  });
}

function buildDoc4() {
  const colors = ['FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', 'FF8800'];
  const fonts = ['Calibri', 'Times New Roman', 'Arial', 'Cambria'];
  return new Document({ sections: [{ children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Test de formatage intensif', bold: true })] }), ...Array.from({ length: 200 }, (_, pIdx) => new Paragraph({ alignment: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.JUSTIFIED][pIdx % 4], children: Array.from({ length: 5 + (pIdx % 10) }, (_, rIdx) => { const r = Math.random(); return new TextRun({ text: `[P${pIdx+1}.${rIdx+1}] `, bold: r > 0.7, italics: r > 0.5 && r <= 0.7, color: colors[(pIdx + rIdx) % colors.length], size: [16, 20, 24, 28, 32, 36, 40, 48][(pIdx * 3 + rIdx) % 8], font: fonts[(pIdx + rIdx) % fonts.length] }); }) }))] }] });
}

function buildDoc5() {
  const paragraphs = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Manuel complet de Physique-Chimie', bold: true })] })];
  for (let chap = 1; chap <= 10; chap++) {
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `Chapitre ${chap} : Physique moderne`, bold: true })] }));
    for (let sub = 1; sub <= 5; sub++) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `${chap}.${sub} Sous-section détaillée` })] }));
      for (let p = 1; p <= 4; p++) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: `L'équation de Schrödinger H|ψ⟩ = E|ψ⟩ décrit l'évolution d'un système quantique. La constante ℏ = h/2π ≈ 1.054 × 10⁻³⁴ J·s joue un rôle central dans cette théorie fondamentale.` })] }));
      }
    }
  }
  return new Document({ sections: [{ children: paragraphs }] });
}

const builders = [['1-math-heavy', buildDoc1], ['2-tables-landscape', buildDoc2], ['3-multi-section', buildDoc3], ['4-heavy-formatting', buildDoc4], ['5-mixed-content', buildDoc5]];

const fileUrls = {};
for (const [name, builder] of builders) {
  const doc = builder();
  const buffer = await Packer.toBuffer(doc);
  const filepath = join(ORIGINAL_DIR, `${name}.docx`);
  await writeFile(filepath, buffer);
  console.log(`✓ ${name}.docx: ${(buffer.length / 1024).toFixed(1)} KB`);
}

// Step 2: Convert via API2PDF
console.log('\n=== Step 2: Converting via API2PDF ===\n');
const githubBase = 'https://raw.githubusercontent.com/bmghappmixtun/edutunisie/tests/api2pdf/tests/api2pdf';

for (const [name] of builders) {
  const url = `${githubBase}/${name}.docx`;
  const startTime = Date.now();
  const r = await fetch('https://v2.api2pdf.com/libreoffice/any-to-pdf', {
    method: 'POST',
    headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const elapsed = Date.now() - startTime;
  const t = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(t); } catch {}
  if (parsed?.Success && parsed?.FileUrl) {
    const pdfPath = join(PDF_DIR, `${name}.pdf`);
    const pdfRes = await fetch(parsed.FileUrl);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    await writeFile(pdfPath, pdfBuffer);
    console.log(`✓ ${name}.pdf: ${(pdfBuffer.length / 1024).toFixed(1)} KB, ${elapsed}ms, $${parsed.Cost.toFixed(6)}`);
  } else {
    console.log(`✗ ${name}: ${parsed?.Error?.slice(0, 100) || 'unknown'}`);
  }
}

console.log('\n=== Done ===');
