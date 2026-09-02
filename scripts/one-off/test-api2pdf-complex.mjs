/**
 * API2PDF Test Suite
 * Create 5 COMPLEX DOCX files and convert them via API2PDF
 * Each file exercises a different challenging feature:
 *   1. Math equations (LaTeX-style)
 *   2. Complex tables with merged cells
 *   3. Multi-section document with different orientations
 *   4. Heavy formatting (headers, footers, footnotes)
 *   5. Mixed content (images placeholders, lists, hyperlinks)
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageBreak, Header, Footer, PageNumber, LevelFormat, ShadingType } from 'docx';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const API_KEY = '7071847a-1197-4a5f-bc17-d7f5e9e7c37b';
const OUT_DIR = '/tmp/api2pdf-test';
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

// =====================================================================
// FILE 1: Heavy math content (formulas, equations, scientific notation)
// =====================================================================
function buildDoc1() {
  return new Document({
    creator: 'Test Suite',
    title: 'Mathématiques - Terminale',
    description: 'Heavy math content',
    styles: {
      default: {
        document: { run: { font: 'Cambria Math', size: 24 } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'math-exercises',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: 'Exercice %1.', alignment: AlignmentType.LEFT },
          ],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Mathématiques Terminale S — 2026', italics: true, size: 20 })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Page ', size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
              new TextRun({ text: ' sur ', size: 18 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
            ],
          })],
        }),
      },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Chapitre 7 : Intégrales et primitives', bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: 'Ce chapitre couvre les concepts fondamentaux du calcul intégral appliqués aux fonctions réelles d\'une variable réelle. Nous étudierons successivement les sommes de Riemann, le théorème fondamental de l\'analyse, et les techniques de calcul d\'intégrales par parties et par changement de variable.', })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        // 30 exercises
        ...Array.from({ length: 30 }, (_, i) => new Paragraph({
          numbering: { reference: 'math-exercises', level: 0 },
          children: [
            new TextRun({ text: `Calculer l'intégrale suivante en utilisant la technique la plus appropriée : ` }),
            new TextRun({ text: `I${i+1} = ∫[0 à ${i+1}] x^${i+1} · e^(-x) dx`, font: 'Cambria Math', bold: true }),
          ],
        })),
        // Page break
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Démonstrations' })] }),
        ...Array.from({ length: 10 }, (_, i) => new Paragraph({
          children: [
            new TextRun({ text: `Théorème ${i+1}. `, bold: true }),
            new TextRun({ text: 'Soit f une fonction continue sur un intervalle [a, b]. Alors l\'application F définie par F(x) = ∫[a à x] f(t) dt est dérivable sur [a, b] et pour tout x ∈ [a, b], F\'(x) = f(x). ' }),
            new TextRun({ text: `Démonstration : Par définition de la dérivée, F'(x) = lim(h→0) [F(x+h) - F(x)] / h = lim(h→0) (1/h) ∫[x à x+h] f(t) dt. Puisque f est continue en x, pour tout ε > 0, il existe δ > 0 tel que |t - x| < δ ⇒ |f(t) - f(x)| < ε. En encadrant l'intégrale, on obtient...`, italics: true }),
          ],
        })),
      ],
    }],
  });
}

// =====================================================================
// FILE 2: Complex tables with merged cells
// =====================================================================
function buildDoc2() {
  // Generate 5 large tables with merged cells
  const tables = Array.from({ length: 5 }, (_, tableIdx) => {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
      },
      rows: [
        // Header row with merged cell across all columns
        new TableRow({
          children: [new TableCell({
            columnSpan: 8,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: '1F4E79' },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `TABLEAU ${tableIdx + 1} : DONNÉES STATISTIQUES`, bold: true, color: 'FFFFFF', size: 28 })],
            })],
          })],
        }),
        // Sub-header
        new TableRow({
          children: ['Région', 'Q1', 'Q2', 'Q3', 'Q4', 'Total', 'Moy.', '%'].map((h, i) => new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D9E2F3' },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 20 })] })],
          })),
        }),
        // 30 data rows
        ...Array.from({ length: 30 }, (_, rowIdx) => {
          const region = ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabès', 'Gafsa', 'Kasserine'][rowIdx % 8];
          const q1 = Math.floor(Math.random() * 100);
          const q2 = Math.floor(Math.random() * 100);
          const q3 = Math.floor(Math.random() * 100);
          const q4 = Math.floor(Math.random() * 100);
          const total = q1 + q2 + q3 + q4;
          const moy = (total / 4).toFixed(1);
          const pct = (total / 4).toFixed(1) + '%';
          return new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: region, size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(q1), size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(q2), size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(q3), size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(q4), size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(total), bold: true, size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: moy, size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: pct, size: 18 })] })] }),
            ],
          });
        }),
        // Footer row with merged cells
        new TableRow({
          children: [new TableCell({
            columnSpan: 5,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFE699' },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAUX GÉNÉRAUX :', bold: true, size: 20 })] })],
          }), ...Array.from({ length: 3 }, (_, i) => new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFE699' },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${(Math.random() * 10000).toFixed(0)}`, bold: true, size: 20 })] })],
          }))],
        }),
      ],
    });
  });

  return new Document({
    sections: [{
      properties: { page: { size: { width: 16838, height: 11906 }, orientation: 'landscape' } },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Rapport Statistique Annuel', bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: 'Document contenant 5 tableaux complexes avec cellules fusionnées, en-têtes multi-niveaux et mise en forme conditionnelle.', italics: true })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...tables.flatMap((t, i) => [t, new Paragraph({ children: [new TextRun({ text: '' })] })]),
      ],
    }],
  });
}

// =====================================================================
// FILE 3: Multi-section with different page sizes/orientations
// =====================================================================
function buildDoc3() {
  // Section 1: A4 portrait with text
  const section1 = {
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    },
    children: [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Partie 1 : Théorie (A4 portrait)', bold: true })] }),
      ...Array.from({ length: 15 }, (_, i) => new Paragraph({
        children: [new TextRun({ text: `Paragraphe ${i+1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.` })],
      })),
    ],
  };

  // Section 2: A4 landscape with a large table
  const section2 = {
    properties: {
      page: { size: { width: 16838, height: 11906 }, orientation: 'landscape' },
    },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Partie 2 : Données tabulaires (A4 paysage)', bold: true })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: Array.from({ length: 40 }, (_, rowIdx) => new TableRow({
          children: Array.from({ length: 12 }, (_, colIdx) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `L${rowIdx+1}C${colIdx+1}`, size: 16 })] })],
          })),
        })),
      }),
    ],
  };

  // Section 3: Legal portrait with text and image placeholder
  const section3 = {
    properties: {
      page: { size: { width: 12240, height: 20160 }, margin: { top: 1800, right: 1800, bottom: 1800, left: 1800 } },
    },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Partie 3 : Format Légal', bold: true })] }),
      ...Array.from({ length: 20 }, (_, i) => new Paragraph({
        children: [new TextRun({ text: `Section légale paragraphe ${i+1} : Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.` })],
      })),
    ],
  };

  return new Document({
    sections: [section1, section2, section3],
  });
}

// =====================================================================
// FILE 4: Heavy formatting - lots of inline styles, colors, sizes
// =====================================================================
function buildDoc4() {
  const colors = ['FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', 'FF8800', '8800FF', '008888', '888800'];
  const sizes = [16, 20, 24, 28, 32, 36, 40, 48];
  const fonts = ['Calibri', 'Times New Roman', 'Arial', 'Cambria', 'Georgia', 'Verdana'];

  return new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 } } },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Test de formatage intensif', bold: true })] }),
        // 200 paragraphs with mixed formatting
        ...Array.from({ length: 200 }, (_, pIdx) => new Paragraph({
          alignment: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.JUSTIFIED][pIdx % 4],
          spacing: { before: pIdx % 2 === 0 ? 200 : 0, after: 100, line: 300 },
          children: Array.from({ length: 5 + (pIdx % 10) }, (_, rIdx) => {
            const r = Math.random();
            return new TextRun({
              text: `[P${pIdx+1}.${rIdx+1}] `,
              bold: r > 0.7,
              italics: r > 0.5 && r <= 0.7,
              underline: r > 0.3 && r <= 0.5 ? {} : undefined,
              color: colors[(pIdx + rIdx) % colors.length],
              size: sizes[(pIdx * 3 + rIdx) % sizes.length],
              font: fonts[(pIdx + rIdx) % fonts.length],
              highlight: r > 0.85 ? 'yellow' : undefined,
            });
          }),
        })),
        // Page break
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Section 2 : Listes imbriquées' })] }),
        // Multi-level nested list
        ...Array.from({ length: 5 }, (_, i) => new Paragraph({
          numbering: { reference: 'nested-list', level: 0 },
          children: [new TextRun({ text: `Niveau 1 item ${i+1}`, bold: true })],
        })),
      ],
    }],
  });
}

// =====================================================================
// FILE 5: Mixed content with footnotes, hyperlinks, etc.
// =====================================================================
function buildDoc5() {
  // Long document with mixed content
  const paragraphs = [];

  // Title
  paragraphs.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: 'Manuel complet de Physique-Chimie', bold: true })],
  }));

  // TOC
  paragraphs.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Table des matières' })],
  }));
  for (let i = 1; i <= 10; i++) {
    paragraphs.push(new Paragraph({
      tabStops: [{ type: 'right', position: 9000, leader: 'dot' }],
      children: [
        new TextRun({ text: `Chapitre ${i} : Titre du chapitre ${i}` }),
        new TextRun({ text: '\t' }),
        new TextRun({ text: `${i * 5 + 3}` }),
      ],
    }));
  }

  // 10 chapters, each with multiple subsections
  for (let chap = 1; chap <= 10; chap++) {
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `Chapitre ${chap} : Physique moderne`, bold: true })],
    }));

    // 5 subsections per chapter
    for (let sub = 1; sub <= 5; sub++) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `${chap}.${sub} Sous-section détaillée` })],
      }));

      // 4 paragraphs per subsection
      for (let p = 1; p <= 4; p++) {
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: `Dans cette section, nous abordons les concepts fondamentaux liés à ` }),
            new TextRun({ text: 'la mécanique quantique', bold: true }),
            new TextRun({ text: ` et ses applications pratiques. L'équation de Schrödinger H|ψ⟩ = E|ψ⟩ décrit l'évolution temporelle d'un système quantique. La constante de Planck réduite ℏ = h/2π ≈ 1.054 × 10⁻³⁴ J·s joue un rôle central.`, }),
            new TextRun({ text: ' Pour plus d\'informations, consultez ' }),
            new TextRun({ text: 'le site officiel', italics: true, color: '0000FF', underline: {} }),
            new TextRun({ text: ' ou reportez-vous aux références bibliographiques en fin d\'ouvrage.' }),
          ],
        }));
      }

      // Add a small table per subsection
      paragraphs.push(new Table({
        width: { size: 80, type: WidthType.PERCENTAGE },
        alignment: AlignmentType.CENTER,
        rows: [
          new TableRow({
            children: ['Constante', 'Symbole', 'Valeur', 'Unité'].map(h => new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: '4472C4' },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: 'FFFFFF' })] })],
            })),
          }),
          ...Array.from({ length: 5 }, (_, rIdx) => new TableRow({
            children: [
              ['Vitesse de la lumière', 'Constante de Planck', 'Charge élémentaire', 'Masse électron', 'Constante gravitationnelle'][rIdx],
              ['c', 'h', 'e', 'mₑ', 'G'][rIdx],
              ['299 792 458', '6.626 × 10⁻³⁴', '1.602 × 10⁻¹⁹', '9.109 × 10⁻³¹', '6.674 × 10⁻¹¹'][rIdx],
              ['m/s', 'J·s', 'C', 'kg', 'm³/kg·s²'][rIdx],
            ].map((c, cIdx) => new TableCell({
              children: [new Paragraph({ alignment: cIdx === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT, children: [new TextRun({ text: c })] })],
            })),
          })),
        ],
      }));
    }
  }

  return new Document({ sections: [{ children: paragraphs }] });
}

// =====================================================================
// Build all 5 docs
// =====================================================================
console.log('=== Building 5 complex DOCX files ===\n');
const docs = [
  { name: '1-math-heavy', builder: buildDoc1, size: 'target ~30 pages math' },
  { name: '2-tables-landscape', builder: buildDoc2, size: 'target 5 large tables' },
  { name: '3-multi-section', builder: buildDoc3, size: 'target 3 sections, 2 orientations' },
  { name: '4-heavy-formatting', builder: buildDoc4, size: 'target 200 styled paragraphs' },
  { name: '5-mixed-content', builder: buildDoc5, size: 'target 10 chapters, 5 sections each' },
];

const builtFiles = [];
for (const { name, builder, size } of docs) {
  const doc = builder();
  const buffer = await Packer.toBuffer(doc);
  const filepath = join(OUT_DIR, `${name}.docx`);
  await writeFile(filepath, buffer);
  builtFiles.push({ name, filepath, size, bufferBytes: buffer.length });
  console.log(`✓ ${name}.docx: ${(buffer.length / 1024).toFixed(1)} KB — ${size}`);
}

console.log(`\n=== Converting via API2PDF ===\n`);
const results = [];
for (const { name, filepath, bufferBytes } of builtFiles) {
  // Read file as base64 for inline upload (API2PDF accepts file URLs only,
  // so we need to base64 → data URL)
  // Actually, API2PDF v2 has a file= field with base64 — let me try that.
  // Per the docs: POST with multipart/form-data: file=@path, filename=
  // Or: JSON with url=
  // For local files, we need to first upload somewhere OR use the file= field
  // Actually, looking at the docs again, v2 has a "file" option that takes base64 or a multipart upload.

  // Let me try multipart first
  const fileBuffer = await import('fs/promises').then(fs => fs.readFile(filepath));
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${name}.docx`);

  const startTime = Date.now();
  const r = await fetch('https://v2.api2pdf.com/libreoffice/pdf', {
    method: 'POST',
    headers: { 'Authorization': API_KEY },
    body: formData,
  });
  const elapsed = Date.now() - startTime;
  const t = await r.text();

  let parsed = null;
  try { parsed = JSON.parse(t); } catch {}

  const result = {
    name,
    inputSizeKB: (bufferBytes / 1024).toFixed(1),
    status: r.status,
    elapsedMs: elapsed,
    response: parsed ? {
      success: parsed.Success,
      error: parsed.Error,
      mbOut: parsed.MbOut,
      cost: parsed.Cost,
      fileUrl: parsed.FileUrl,
    } : t.slice(0, 300),
  };
  results.push(result);
  console.log(`${result.name}: status=${result.status}, elapsed=${result.elapsedMs}ms, success=${result.response?.success}, fileUrl=${result.response?.fileUrl?.slice(0, 80) || 'n/a'}`);
  if (result.response?.error) console.log(`  ERROR: ${result.response.error}`);
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(results, null, 2));
