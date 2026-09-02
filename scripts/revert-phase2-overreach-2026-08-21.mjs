#!/usr/bin/env node
/**
 * Revert over-reach in Phase 2: for profs where DB had a full name
 * but I incorrectly set firstName=null, restore original names.
 * 
 * The Phase 2 logic was too aggressive: it set firstName=null for profs
 * where the PDF's profNames only matched the lastName. But the DB
 * had valid full names in many cases.
 * 
 * Better strategy: only set firstName=null if:
 * 1. The firstName in DB looks corrupted (single letter, "Mr", "M.", "H-", etc.)
 * 2. OR if the prof was a "same name" test account (X X)
 * 3. OR if the AR firstName is also a single letter / corruption
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// CSV with the original data
const originalData = `2153,"Mohamed Hedi Taabouri","محمد هادي التابوري",3,lastName matches in 3 profNames, 2-word: 0
1022,"M. Mahmoudi","م. المحمودي",8,lastName matches in 5 profNames, 2-word: 3
993," ALOUIINI.H"," الوييني",21,lastName matches in 2 profNames, 2-word: 0
1026,"Mohamed Nemri","محمد نمري",3,lastName matches in 2 profNames, 2-word: 1
1073," Manai-H"," منعي-هـ",21,lastName matches in 7 profNames, 2-word: 0
1128,"Keba GUEYE","كبا القوي",3,lastName matches in 3 profNames, 2-word: 0
1200,"Mrs DZIRI","مدام ذيري",27,lastName matches in 7 profNames, 2-word: 1
1216,"Mr. Fkih","السيد فقيه",5,lastName matches in 3 profNames, 2-word: 2
1221,"Mr Hayouni","السيد حيوني",11,lastName matches in 7 profNames, 2-word: 4
1286,"D Ali","د علي",3,lastName matches in 2 profNames, 2-word: 1
1444," Boussada-A"," بوسعادة-أ",14,lastName matches in 2 profNames, 2-word: 0
2147,"Jaballah Noureddine","جاباللاه النورددين",8,lastName matches in 6 profNames, 2-word: 0
2152,"M ksaier","م كسائر",28,lastName matches in 4 profNames, 2-word: 3
1519," H-JAMEL"," ه-جمل",3,lastName matches in 3 profNames, 2-word: 0
2140," B-NEJIB"," ب-نيجيب",4,lastName matches in 3 profNames, 2-word: 0
2159," Amiche.R"," أميش",3,lastName matches in 2 profNames, 2-word: 0
2202," KORTAS.B"," كورتاس ب",13,lastName matches in 2 profNames, 2-word: 0
111,"Hanen Othmani","هنين عثماني",6,lastName matches in 2 profNames, 2-word: 0
516,"Abdessamad bouzidi","عبد الصمد البوزيدي",7,lastName matches in 5 profNames, 2-word: 0
1780,"Maayoufi Maayoufi","مايوفي المايوفي",13,lastName matches in 12 profNames, 2-word: 0
1753,"Daghbougi Daghbougi","داغبوقي الداغبوقي",6,lastName matches in 6 profNames, 2-word: 0
1762," B-NEJIB"," ب-نيجيب",2,lastName matches in 2 profNames, 2-word: 0
1820,"Maatallah Maatallah","ماتاللاه الماتاللاه",29,lastName matches in 18 profNames, 2-word: 0
1877,"Mahmoud Mahmoudi","محمود المحمودي",5,lastName matches in 3 profNames, 2-word: 0
1917,"Ali Hamdi","علي الحامدي",23,lastName matches in 23 profNames, 2-word: 0
1935,"Mr Darwez","السيد داروز",3,lastName matches in 2 profNames, 2-word: 1
442,"Mr Fradi","السيد فرادي",6,lastName matches in 2 profNames, 2-word: 1
141,"Lotfi Amri","لطفي عمري",46,lastName matches in 27 profNames, 2-word: 9
2067,"Mezrigui Lassaad","مزريقوي لسعد",2,lastName matches in 2 profNames, 2-word: 0
91,"hayet raddadi","حياة ردادي",4,lastName matches in 4 profNames, 2-word: 0
2253,"boughammoura boughammoura","بوالغاممورا بوالغاممورا",2,lastName matches in 2 profNames, 2-word: 0
2391," Ch-Jalel"," ش-جليل",2,lastName matches in 2 profNames, 2-word: 0
2506,"Gader Gader","قادر القادر",2,lastName matches in 2 profNames, 2-word: 0
906,"Hakim Hakim","حكيم حكيم",4,lastName matches in 2 profNames, 2-word: 0
2453,"troudi chekra","الطرودي شقرا",2,lastName matches in 2 profNames, 2-word: 0
1575,"Cherif Cherif","الشريف الشريف",6,lastName matches in 4 profNames, 2-word: 0
1834,"S. SAYAH","س. سياح",5,lastName matches in 3 profNames, 2-word: 1
1924,"Amine Hergueme","امين الهرقوم",2,lastName matches in 2 profNames, 2-word: 0
1463," Mannai"," منّاعي",2,lastName matches in 2 profNames, 2-word: 0
1492,"sammari slim","سامماري سليم",6,lastName matches in 5 profNames, 2-word: 0
1645," B-A-Sebti"," ب-أ-سبتي",4,lastName matches in 3 profNames, 2-word: 0
1653,"mohamed hakim","محمد حكيم",6,lastName matches in 5 profNames, 2-word: 0
2251,"Oumeimen Oumeimen","وميمن الوميمن",5,lastName matches in 4 profNames, 2-word: 0
1359," K.CHAKER"," ك.شاكير",2,lastName matches in 2 profNames, 2-word: 0
1149,"A.M.Kamel A.M.Kamel","ا.م.كامل ال.م.كامل",4,lastName matches in 2 profNames, 2-word: 0`;

// Profs where firstName looks VALID (full name in DB) - SHOULD REVERT
const shouldRevert = new Set([
  2153, // Mohamed Hedi Taabouri - full name
  1026, // Mohamed Nemri - full name
  1128, // Keba GUEYE - full name
  111,  // Hanen Othmani - full name
  516,  // Abdessamad bouzidi - full name
  1917, // Ali Hamdi - full name
  141,  // Lotfi Amri - full name
  91,   // hayet raddadi - full name
  1924, // Amine Hergueme - full name
  1492, // sammari slim - full name
  1653, // mohamed hakim - full name
  2067, // Mezrigui Lassaad - full name
]);

// Profs where firstName looks CORRUPTED - keep firstName=null
const keepNull = new Set([
  1022, // M. Mahmoudi - M. is corruption
  993,  //  ALOUIINI.H - just lastName with H
  1073, //  Manai-H - has dash
  1200, // Mrs DZIRI - Mrs is corruption
  1216, // Mr. Fkih - Mr. is corruption
  1221, // Mr Hayouni - Mr is corruption
  1286, // D Ali - D is corruption
  1444, //  Boussada-A - dash corruption
  2147, // Jaballah Noureddine - has full name - KEEP
  2152, // M ksaier - M is corruption
  1519, //  H-JAMEL - dash corruption
  2140, //  B-NEJIB - dash corruption
  2159, //  Amiche.R - dot corruption
  2202, //  KORTAS.B - dot corruption
  1780, // Maayoufi Maayoufi - same name test
  1753, // Daghbougi Daghbougi - same name test
  1762, //  B-NEJIB - same as 2140
  1820, // Maatallah Maatallah - same name test
  1877, // Mahmoud Mahmoudi - same name test
  1935, // Mr Darwez - Mr is corruption
  442,  // Mr Fradi - Mr is corruption
  2253, // boughammoura boughammoura - same name test
  2391, //  Ch-Jalel - dash corruption
  2506, // Gader Gader - same name test
  906,  // Hakim Hakim - same name test
  2453, // troudi chekra - looks like name swap, KEEP
  1575, // Cherif Cherif - same name test
  1834, // S. SAYAH - S. is corruption
  1463, //  Mannai - looks clean
  1645, //  B-A-Sebti - dash corruption
  2251, // Oumeimen Oumeimen - same name test
  1359, //  K.CHAKER - dot corruption
  1149, // A.M.Kamel A.M.Kamel - same name test
]);

// Re-evaluate: keep the nulls only if the firstName was CORRUPTED in the original
// For valid full names in DB, restore the firstName
async function callOpenAI(firstName, lastName) {
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. JSON strict: {"firstNameAr": "...", "lastNameAr": "..."}. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"`;
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    return JSON.parse(r.choices[0].message.content);
  } catch (e) { return null; }
}

async function main() {
  console.log('Reverting over-reach for profs with valid full names...');
  
  // Get all 45 profs
  const all45 = originalData.split('\n').map(line => {
    const parts = line.split(',');
    return { id: parseInt(parts[0]) };
  });
  
  // For each, check the ORIGINAL name (before Phase 2)
  // Parse the original CSV
  const originals = originalData.split('\n').map(line => {
    const m = line.match(/^(\d+),"([^"]+)","([^"]+)",/);
    return m ? { id: parseInt(m[1]), fr: m[2], ar: m[3] } : null;
  }).filter(Boolean);
  
  let reverted = 0, kept = 0, failed = 0;
  for (const orig of originals) {
    const current = await p.user.findFirst({ where: { numericId: orig.id } });
    if (!current) continue;
    
    // Parse the original FR name
    const parts = orig.fr.trim().split(/\s+/);
    let origFn, origLn;
    
    // Special handling
    if (parts.length === 1) {
      origFn = null; origLn = parts[0];
    } else if (parts.length === 2) {
      origFn = parts[0]; origLn = parts[1];
    } else {
      // 3+ words - middle word is part of firstName or lastName
      origFn = parts.slice(0, -1).join(' ');
      origLn = parts[parts.length - 1];
    }
    
    // Decide: revert or keep
    // If firstName is corruption pattern (single char, Mr, M., etc.), keep null
    const isCorrupt = (s) => {
      if (!s) return false;
      const cleaned = s.trim();
      if (cleaned.length <= 1) return true;
      if (/^Mr\.?$|^Mrs\.?$|^Mme\.?$|^M\.?$|^S\.?$|^T\.?$|^H\.?$/i.test(cleaned)) return true;
      if (/^[A-Z]\.$/.test(cleaned)) return true; // M.
      if (cleaned.startsWith('H-') || cleaned.startsWith('B-') || cleaned.startsWith('Ch-') || cleaned.startsWith('A.M.')) return true;
      if (cleaned.endsWith('.H') || cleaned.endsWith('.B') || cleaned.endsWith('.R') || cleaned.endsWith('.A')) return true;
      return false;
    };
    
    if (isCorrupt(origFn)) {
      // Keep firstName=null
      kept++;
      continue;
    }
    
    // Valid firstName - revert!
    try {
      const ar = await callOpenAI(origFn, origLn);
      if (!ar) { failed++; continue; }
      
      await p.user.updateMany({
        where: { numericId: orig.id },
        data: {
          firstName: origFn,
          firstNameAr: ar.firstNameAr || null,
          // Keep lastName as is
          lastNameAr: ar.lastNameAr || null,
        }
      });
      reverted++;
      if (reverted <= 20) {
        console.log('  REVERT #' + orig.id + ' "' + orig.fr + '" → firstName="' + origFn + '" lastName="' + origLn + '"');
      }
    } catch (e) {
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\nDone. Reverted: ' + reverted + ', Kept (corrupt firstName): ' + kept + ', Failed: ' + failed);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });
