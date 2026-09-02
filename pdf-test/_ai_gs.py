import os, json, time, re
from openai import OpenAI

client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])

with open('/tmp/files_with_keys.json') as f:
    files = json.load(f)

print(f'Re-extracting specific generalSubject for {len(files)} files...', flush=True)

results = {}

def call_gpt_gs(text, subject_name, type_label, class_name, year):
    if not text or len(text.strip()) < 30:
        return None
    text_sample = text[:6000]  # Larger context for better detection
    
    type_fr = {'COURSE': 'Cours', 'DEVOIR': 'Devoir', 'EXERCISE': "Série d'exercices", 
               'EXAM': 'Examen', 'CORRECTION': 'Devoir corrigé', 'TP': 'TP', 
               'HOMEWORK': 'Devoir maison'}.get(type_label, type_label)
    
    prompt = f"""Tu es un expert en mathématiques/sciences tunisien. Analyse ce document: {type_fr} de {subject_name} pour {class_name} - {year}.

⚠️ RÈGLE ABSOLUE: Le "generalSubject" doit être le **sujet SPÉCIFIQUE** du document, pas un terme générique.

❌ INTERDITS (trop génériques):
- "Physique et Chimie", "Physique", "Chimie", "Mathématiques", "Sciences", "SVT"
- "Devoir de...", "Devoir de mathématiques", "Devoir de contrôle en..."
- "En physique", "En anglais", "En mathématiques"
- "Cours de...", "Algorithmique et programmation" (trop vague)
- "Mathématiques avancées", "Mathématiques pour le Bac"

✅ EXEMPLES BONS (3-6 mots spécifiques):
- Math: "Fonctions logarithme népérien", "Géométrie dans l'espace", "Probabilités conditionnelles", "Nombres complexes et géométrie", "Limites et continuité", "Étude de fonctions rationnelles"
- Physique: "Piles électrochimiques", "Acides carboxyliques et amides", "Mécanique newtonienne", "Réactions chimiques acide-base", "Spectre atomique", "Électrocinétique"
- SVT: "Régulation de la pression artérielle", "Immunité et vaccination", "Génétique des populations"
- Algo: "Structures conditionnelles (Si/Si...Sinon)", "Algorithmes de tri", "Fonctions et procédures", "Boucles Tant que"
- Anglais: "Compréhension écrite narrative", "Expression écrite argumentative"
- Étude de texte: "Analyse d'une maqama", "Commentaire littéraire"

JSON uniquement:
{{
  "generalSubject": "Sujet spécifique (3-6 mots, ex: 'Limites et continuité' ou 'Piles électrochimiques')",
  "summary": "Résumé 2-3 phrases en français (100-150 mots)",
  "keyPoints": ["point 1 spécifique", "point 2", "point 3", "point 4", "point 5"],
  "shortKeyPoints": ["point court 1", "point court 2"]
}}

Contenu OCR (texte complet):
{text_sample}"""
    
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {'role': 'system', 'content': 'Tu réponds TOUJOURS en français. JSON uniquement. Sois PRÉCIS sur le sujet.'},
                    {'role': 'user', 'content': prompt}
                ],
                max_tokens=1000,
                temperature=0.1,
            )
            content = resp.choices[0].message.content.strip()
            if content.startswith('```'):
                content = re.sub(r'^```[a-z]*\n?', '', content)
                content = re.sub(r'\n?```$', '', content)
            result = json.loads(content)
            
            # Validate: must be specific (not generic)
            gs = result.get('generalSubject', '').strip()
            if not gs or len(gs) < 4:
                if attempt < 2: continue
            
            generic_patterns = [
                r'^(physique|chimie|mathématiques?|svt|anglais|français|arabe|algorithmique|programmation)\b',
                r'^devoir (de|sur|d\')\s',
                r'^cours (de|sur|d\')\s',
                r'^(en|dans|sur)\s+(physique|chimie|mathématiques|anglais)',
                r'^(et|ou|ou bien|le|la|les)\s+',
            ]
            is_generic = any(re.match(p, gs.lower()) for p in generic_patterns)
            if is_generic and attempt < 2:
                # Force retry with stricter prompt
                prompt += "\n\n⚠️ ATTENTION: Ta réponse précédente était trop générique. Sois BEAUCOUP plus spécifique au contenu réel."
                continue
            
            # Verify French
            sample = result.get('summary', '') + ''.join(result.get('keyPoints', []))
            ar = sum(1 for c in sample if 'ا' <= c <= 'ي' or c in 'ءأإئؤ')
            if ar > 10 and attempt < 2:
                continue
            
            return result
        except Exception as e:
            print(f'  GPT err {attempt+1}: {e}', flush=True)
        time.sleep(2 + attempt)
    return None

# Process
total = len(files)
for idx, f in enumerate(files, 1):
    nid = f['numericId']
    text_path = f'/tmp/ilove_{nid}.txt'
    
    if not os.path.exists(text_path):
        results[str(nid)] = {'error': 'no OCR text'}
        continue
    
    with open(text_path) as fp:
        text = fp.read()
    
    print(f'[{idx}/{total}] #{nid} {f["subjectName"]} ({f["type"]})... ', end='', flush=True)
    
    result = call_gpt_gs(text, f['subjectName'] or '', f['type'] or '', f['className'] or '', f['year'] or '')
    
    if result:
        results[str(nid)] = result
        gs = result.get('generalSubject', '?')[:60]
        print(f"✅ '{gs}'")
    else:
        results[str(nid)] = {'error': 'gpt failed'}
        print('❌')
    
    with open('/tmp/ai_gs_results.json', 'w') as fp:
        json.dump(results, fp, ensure_ascii=False, indent=2)
    time.sleep(0.3)

ok = sum(1 for v in results.values() if v.get('summary'))
err = sum(1 for v in results.values() if v.get('error'))
print(f'\n=== {ok} OK, {err} errors ===', flush=True)
