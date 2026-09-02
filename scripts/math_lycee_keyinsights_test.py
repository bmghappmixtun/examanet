#!/usr/bin/env python3
"""Test math lycée keyInsights generation for 3 sample files (1 série, 1 cours, 1 devoir).

Same approach as physique lycée:
- DEVOIR/EXERCISE: "Exercice N: [topic] - [summary 15-25 words]"
- COURSE: "Section N (Title): [concept summary]" - one per subtitle

For math, we use "Exercice" / "Exercice de cours" / "Partie" etc. as appropriate.
"""
import os
import json
import time
import requests
import tempfile
from pypdf import PdfReader
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv('/workspace/edutunisie/.env.local')

INTERNAL_TOKEN = os.environ.get("INTERNAL_BULK_TOKEN", "devmanet-bulk-2026")

# Test files: (numericId, type, expected_format)
TEST_FILES = [
    3818,  # EXERCISE: Série d'exercices Barycentre
    4077,  # COURSE: Pollution des océans
    93,    # DEVOIR: Dérivabilité et limites
]

client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])

def get_blob_text(file_url):
    """Download via Vercel Blob URL, extract text with PyPDF."""
    try:
        r = requests.get(file_url, timeout=30)
        if r.status_code != 200:
            return None, f'HTTP {r.status_code}'
        data = r.content
    except Exception as e:
        return None, f'download: {e}'
    
    if not data or len(data) < 100:
        return None, 'empty blob'
    
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    
    try:
        reader = PdfReader(tmp_path)
        text = '\n'.join(page.extract_text() or '' for page in reader.pages)
        os.unlink(tmp_path)
        if len(text) > 200:
            return text, 'pypdf'
        return None, 'too little text'
    except Exception as e:
        os.unlink(tmp_path)
        return None, f'pypdf: {e}'


def extract_exercises_math(num, title, text):
    """For DEVOIR or EXERCISE: extract each exercise as 'Exercice N: topic - summary'."""
    if not text or len(text) < 100:
        return None
    
    nonce = f'{num}-{time.time()}'
    system = f"""Tu es un expert en mathématiques du système éducatif tunisien (lycée 1ère à 4ème année).
Analyse ce document (titre: {title[:120]}) et extrais TOUS les exercices ou parties d'exercices.
Pour CHAQUE exercice/partie: "Exercice N: [sujet/thème court, 5-10 mots] - [résumé FR, 10-20 mots]"
Format strict: commence par "Exercice" puis numéro, puis ":", puis sujet après ":", puis " - " puis résumé.
Exemples valides:
  "Exercice 1: Étude d'une fonction logarithme - Domaine, dérivabilité, limites, tableau de variations."
  "Exercice 2: Géométrie dans l'espace - Calcul de volumes, aires, distances entre points."
  "Exercice 3: Probabilités conditionnelles - Arbre pondéré, événements indépendants, formule de Bayes."
Si le document ne contient pas d'exercices, retourne un JSON vide.
Retourne UNIQUEMENT JSON: {{"exercises": ["Exercice 1: ... - ...", ...]}}
Limite: 3-12 exercices max (les plus importants).
Nonce: {nonce}"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': f'---DOC---\n{text[:25000]}\n---END---'},
            ],
            response_format={'type': 'json_object'},
            temperature=0.1,
            max_tokens=3000,
        )
        parsed = json.loads(resp.choices[0].message.content)
        ex = parsed.get('exercises', [])
        valid = [e for e in ex if 'Exercice' in e and ':' in e and ' - ' in e and len(e) < 350]
        return valid if valid else None
    except Exception as e:
        return {'error': str(e)}


def extract_sections_course(num, title, text):
    """For COURSE: extract each section/subsection as 'Section N (Title): summary'."""
    if not text or len(text) < 100:
        return None
    
    nonce = f'{num}-{time.time()}'
    system = f"""Tu es un expert en mathématiques du système éducatif tunisien (lycée 1ère à 4ème année).
Analyse ce COURS (titre: {title[:120]}) et extrais les sous-titres / parties principales du cours.
Pour CHAQUE sous-titre ou partie identifiée dans le document: 
  "Section [N] (Titre du sous-titre): [concept mathématique clé, 10-20 mots]"
Format strict: commence par "Section" puis numéro, puis " (Titre)", puis ":", puis concept résumé.
Exemples valides:
  "Section 1 (Définition et notations): Introduction aux barycentres de 2 puis 3 points pondérés."
  "Section 2 (Propriétés des barycentres): Linéarité, associativité, cas particuliers du centre de gravité."
  "Section 3 (Applications géométriques): Construction du barycentre, alignement, coordonnées."
Si le document ne contient pas de sous-titres clairs, retourne un JSON vide.
Retourne UNIQUEMENT JSON: {{"sections": ["Section 1 (Titre): ...", ...]}}
Limite: 3-10 sections max (les plus importantes).
Nonce: {nonce}"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': f'---DOC---\n{text[:25000]}\n---END---'},
            ],
            response_format={'type': 'json_object'},
            temperature=0.1,
            max_tokens=3000,
        )
        parsed = json.loads(resp.choices[0].message.content)
        sec = parsed.get('sections', [])
        valid = [s for s in sec if 'Section' in s and ':' in s and len(s) < 350]
        return valid if valid else None
    except Exception as e:
        return {'error': str(e)}


def main():
    # Get test file details
    from prisma import Prisma
    p = Prisma()
    p.connect()
    
    files = []
    for numid in TEST_FILES:
        r = p.resource.find_first(
            where={'numericId': numid},
            include={'class': True, 'section': True}
        )
        if r:
            data = r.model_dump() if hasattr(r, 'model_dump') else dict(r)
            cls_obj = data.get('class')
            sec_obj = data.get('section')
            cls_name = cls_obj.get('nameFr') if cls_obj else None
            sec_name = sec_obj.get('nameFr') if sec_obj else None
            files.append({
                'id': r.id, 'numericId': r.numericId, 'title': r.title,
                'type': r.type, 'class': cls_name, 'section': sec_name,
                'fileUrl': r.fileUrl,
            })
    p.disconnect()
    
    results = []
    for f in files:
        print(f"\n{'='*70}")
        print(f"📄 #{f['numericId']} ({f['type']})")
        print(f"   {f['title']}")
        print(f"   {f['class']} / {f['section']}")
        print(f"{'='*70}")
        
        text, source = get_blob_text(f['fileUrl'])
        if not text:
            print(f"   ❌ Could not extract text: {source}")
            results.append({**f, 'error': source})
            continue
        
        print(f"   Text: {len(text)} chars (via {source})")
        
        # Choose extractor based on type
        if f['type'] == 'COURSE':
            insights = extract_sections_course(f['numericId'], f['title'], text)
        else:
            insights = extract_exercises_math(f['numericId'], f['title'], text)
        
        if not insights:
            print(f"   ⚠️ No insights returned")
            results.append({**f, 'keyInsights': [], 'text_len': len(text)})
            continue
        
        if isinstance(insights, dict) and 'error' in insights:
            print(f"   ❌ API error: {insights['error']}")
            results.append({**f, 'error': insights['error']})
            continue
        
        print(f"\n   📋 Generated {len(insights)} keyInsights:")
        for i, ki in enumerate(insights, 1):
            print(f"      {i}. {ki}")
        
        results.append({**f, 'keyInsights': insights, 'text_len': len(text), 'method': source})
        time.sleep(1)  # rate limit
    
    # Save results for user review
    with open('/tmp/math_lycee_test_results.json', 'w') as fp:
        json.dump(results, fp, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*70}")
    print(f"✅ Tests complete. Results saved to /tmp/math_lycee_test_results.json")
    print(f"   Files tested: {len(results)}")
    print(f"   Files with keyInsights: {sum(1 for r in results if r.get('keyInsights'))}")
    return results


if __name__ == '__main__':
    main()
