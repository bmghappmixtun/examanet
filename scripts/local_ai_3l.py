#!/usr/bin/env python3
"""
Local AI attribute generator for 3ème Langue files.
100% local - no OpenAI, no external APIs.
"""

import os
import sys
import json
import re
import warnings
warnings.filterwarnings('ignore')

# Load .env.local
env_path = '/workspace/edutunisie/.env.local'
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                k, v = line.split('=', 1)
                os.environ[k] = v.strip().strip('"').strip("'")

import nltk
nltk.download('stopwords', quiet=True)
from nltk.corpus import stopwords

from langdetect import detect, DetectorFactory
DetectorFactory.seed = 0

from keybert import KeyBERT
from summa import summarizer

# Load models ONCE
print('Loading models...', file=sys.stderr)
kw_model = KeyBERT('paraphrase-multilingual-MiniLM-L12-v2')
print('Models loaded.', file=sys.stderr)

# Curated 3L vocab by language
LANG_TOPICS = {
    'de': [
        'Familie', 'Schule', 'Freundschaft', 'Liebe', 'Reisen', 'Essen', 'Gesundheit',
        'Sport', 'Musik', 'Filme', 'Bücher', 'Technologie', 'Umwelt', 'Wetter',
        'Mode', 'Arbeit', 'Wohnung', 'Stadt', 'Land', 'Feste', 'Traditionen',
        'Kindheit', 'Jugend', 'Träume', 'Ängste', 'Glück', 'Einsamkeit',
        'Kommunikation', 'Medien', 'Internet', 'Geld', 'Einkaufen',
    ],
    'it': [
        'Famiglia', 'Amicizia', 'Amore', 'Viaggi', 'Cibo', 'Salute', 'Scuola',
        'Lavoro', 'Sport', 'Musica', 'Cinema', 'Libri', 'Tecnologia',
        'Ambiente', 'Meteo', 'Moda', 'Casa', 'Città', 'Campagna', 'Feste',
        'Tradizioni', 'Infanzia', 'Gioventù', 'Sogni', 'Paure', 'Solitudine',
        'Comunicazione', 'Media', 'Internet', 'Soldi', 'Acquisti',
    ],
    'es': [
        'Familia', 'Amistad', 'Amor', 'Viajes', 'Comida', 'Salud', 'Escuela',
        'Trabajo', 'Deporte', 'Música', 'Cine', 'Libros', 'Tecnología',
        'Medio ambiente', 'Tiempo', 'Moda', 'Casa', 'Ciudad', 'Campo', 'Fiestas',
        'Tradiciones', 'Infancia', 'Juventud', 'Sueños', 'Miedos', 'Soledad',
        'Comunicación', 'Medios', 'Internet', 'Dinero', 'Compras',
    ],
}

NOISE = re.compile(
    r'^(prof|professeur|mr|mrs|ms|miss|m\.|mme|lycee|lycée|college|collège|'
    r'ecole|école|school|secondary|primaire|page|classe|section|niveau|'
    r'série|exercice|ex|activité|activite|td|tp|cours|devoir|controle|contrôle|'
    r'synthese|synthèse|ds|dc|trimestre|année|year|'
    r'trim\d|sep|oct|nov|dec|jan|feb|mar|apr|mai|jun|page|'
    r'gymnasium|realschule|sekundarstufe|note|name|date|number|class|'
    r'tel|gsm|email|web|www|http|com|net|org|'
    r'___+|_+|…+|testaufgabe|schuljahr|klasse|stufe|lehrer|teacher|'
    r'compito|lavoro|esercizio|grammatica|lessico|comprensione|'
    r'grammaire|grammatik|lesen|schreiben|sprechen|hören|'
    r'leçon|lecon|exercice|activité|evaluation|test|examen|'
    r'lehrer|schüler|schuler|insegnante|allievo|alunno|studente)\.?$',
    re.IGNORECASE
)

TYPE_PATTERNS = [
    (r'contrôle|controle|^dc\b', 'Devoir de Contrôle'),
    (r'synth[eè]se|^ds\b', 'Devoir de Synthèse'),
    (r'série|s[ée]rie|^s[ée]rie\b', "Série d'exercices"),
    (r'cours', 'Cours'),
    (r'evaluation|évaluation|test', 'Évaluation'),
    (r'bac|examen', 'Examen'),
    (r'correction|corrigé', 'Devoir Corrigé'),
    (r'r[eé]vision', 'Révision'),
    (r'compr[eé]hension [eé]crite', 'Compréhension écrite'),
    (r'compr[eé]hension orale|[eé]coute|hören', 'Compréhension orale'),
]

LEVEL_PATTERNS = [
    (r'7[eè]?me|7eme', '7ème année'),
    (r'8[eè]?me|8eme', '8ème année'),
    (r'9[eè]?me|9eme', '9ème année'),
    (r'1[aè]?re|1ère|1ere|1AS|1as', '1ère année'),
    (r'2[aè]?me|2ème|2eme|2AS|2as', '2ème année'),
    (r'3[aè]?me|3ème|3eme|3AS|3as|lycée|lycee', '3ème année'),
    (r'4[aè]?me|4ème|4eme|4AS|4as|bac', '4ème année'),
]


def clean_text(text):
    """Remove prof/school noise, page numbers, etc."""
    # Remove blog credits
    text = re.sub(r'Correction\s+propos[ée]e\s+par\s*:?\s*[^.]+\.\s*', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'blogspot\.com', ' ', text, flags=re.IGNORECASE)
    # Remove repeated prof info
    text = re.sub(r'(\bProf\s*:?\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s*){2,}', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'(\bMr\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s*){2,}', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'(\bLehrer\s*:?\s*[A-Z][a-z]+\s*[A-Z][a-z]*\s*){2,}', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'(\bTeacher\s*:?\s*[A-Z][a-z]+\s*[A-Z][a-z]*\s*){2,}', ' ', text, flags=re.IGNORECASE)
    # Remove "GSM : XX XXX XXX" repeated
    text = re.sub(r'(\b(?:GSM|Tel|T[eé]l|Phone)\s*:?\s*[\d\s]{6,}\s*){2,}', ' ', text, flags=re.IGNORECASE)
    # Remove prof+phone combos
    text = re.sub(r'\b(Prof|Teacher|Lehrer)\s*:?\s*[A-Z][a-z]+\s+[A-Z][a-z]*\s+[\d\s+]{6,}', ' ', text, flags=re.IGNORECASE)
    # Remove page markers
    text = re.sub(r'\bPage\s+\d+\s*(?:sur\s+\d+)?\b', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'---\s*PAGE\s*BREAK\s*---', ' ', text, flags=re.IGNORECASE)
    # Remove URLs and emails
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'\b[\w.-]+@[\w.-]+\.\w+\b', '', text)
    # Remove underscores (placeholders like "____")
    text = re.sub(r'_{2,}', ' ', text)
    text = re.sub(r'\.{3,}', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_resource_type(title, text):
    combined = title + ' ' + text[:500]
    for pat, tname in TYPE_PATTERNS:
        if re.search(pat, combined, re.IGNORECASE):
            return tname
    return 'Ressource'


def extract_level(title):
    for pat, lvl in LEVEL_PATTERNS:
        if re.search(pat, title, re.IGNORECASE):
            return lvl
    return ''


def extract_topic(text, lang):
    text_lower = text.lower()
    topics = LANG_TOPICS.get(lang, [])
    found = []
    for topic in topics:
        pattern = r'\b' + re.escape(topic.lower()) + r'\b'
        count = len(re.findall(pattern, text_lower))
        if count > 0:
            found.append((topic, count))
    found.sort(key=lambda x: -x[1])
    if found:
        return found[0][0]
    return ''


def extract_tags_keybert(text, lang, n=5):
    try:
        sw_map = {'de': 'german', 'it': 'italian', 'es': 'spanish'}
        sw = set(stopwords.words(sw_map.get(lang, 'french')))
        # Always include French/English too
        sw |= set(stopwords.words('french'))
        sw |= set(stopwords.words('english'))
        # Add specific noise
        sw.update(['tel', 'gsm', 'page', 'classe', 'clase', 'klasse', 'classe',
                   'prof', 'professeur', 'lehrer', 'teacher', 'mr', 'mrs', 'mme',
                   'name', 'note', 'number', 'date', 'sekundarstufe', 'gymnasium',
                   'lycée', 'lycee', 'school', 'class', 'section', 'niveau',
                   'serie', 'série', 'exercice', 'devoir', 'trimestre', 'année',
                   'page', 'compréhension', 'comprhension', 'correction', 'corrige'])
        
        tags = kw_model.extract_keywords(
            text[:3000],  # First 3000 chars for speed
            keyphrase_ngram_range=(1, 2),
            stop_words=list(sw),
            top_n=n + 5,
            diversity=0.6,
        )
        result = []
        for t, score in tags:
            t_clean = t.strip().lower()
            if len(t_clean) < 3 or len(t_clean) > 30:
                continue
            if NOISE.match(t_clean):
                continue
            if any(NOISE.match(w) for w in t_clean.split()):
                continue
            if t_clean in [t.lower() for t in result]:
                continue
            # Skip very generic words
            if t_clean in ['écrit', 'schriftlich', 'mündlich', 'oral', 'texte', 'text', 'read', 'write']:
                continue
            result.append(t_clean)
            if len(result) >= n:
                break
        return result
    except Exception as e:
        return []


def extract_keypoints_textrank(text, lang, n=3):
    try:
        # Get top sentences via TextRank
        lang_map = {'de': 'german', 'it': 'italian', 'es': 'spanish', 'fr': 'french'}
        summa_lang = lang_map.get(lang, 'english')
        
        # Get summary of ~150 words
        summary = summarizer.summarize(text, ratio=0.2, words=180, language=summa_lang)
        if not summary:
            return []
        
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', summary)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 30]
        return sentences[:n]
    except Exception as e:
        return []


def extract_summary(text, lang, max_len=300):
    cleaned = clean_text(text)
    sentences = re.split(r'(?<=[.!?])\s+', cleaned)
    # Filter
    meaningful = []
    for s in sentences:
        s = s.strip()
        if len(s) < 40 or len(s) > 200:
            continue
        first_word = s.split()[0] if s.split() else ''
        if NOISE.match(first_word):
            continue
        meaningful.append(s)
    
    summary_parts = []
    total_len = 0
    for s in meaningful[:6]:
        if total_len + len(s) > max_len:
            break
        summary_parts.append(s)
        total_len += len(s) + 1
        if len(summary_parts) >= 3:
            break
    
    return ' '.join(summary_parts) if summary_parts else ''


def extract_general_subject(text, lang, title):
    topic = extract_topic(text, lang)
    if topic:
        return topic
    if ':' in title:
        candidate = title.split(':')[-1].strip()
        if 3 < len(candidate) < 60:
            return candidate
    return ''


def generate_short_kp(text, lang, n=3):
    return extract_tags_keybert(text, lang, n=n)


def generate_long_kp(text, lang, n=3):
    return extract_keypoints_textrank(text, lang, n=n)


def generate_ai_summary(text, lang, title, type_name, level):
    summary = extract_summary(text, lang, max_len=350)
    if summary:
        return summary
    return f"{type_name} {level} - {title}"


# Test on sample
if __name__ == '__main__':
    sample = json.load(sys.stdin)
    
    text = sample.get('text', '')
    title = sample.get('title', '')
    numeric_id = sample.get('id', 0)
    lang = sample.get('lang', 'de')
    
    text = clean_text(text)
    
    print(f"\n{'='*70}")
    print(f"#{numeric_id} | {title[:70]}")
    print(f"Lang: {lang} | Text len: {len(text)}")
    print(f"{'='*70}")
    
    gs = extract_general_subject(text, lang, title)
    print(f"\n📚 generalSubject: {gs}")
    
    rtype = extract_resource_type(title, text)
    print(f"📝 type: {rtype}")
    
    lvl = extract_level(title)
    print(f"🎓 level: {lvl}")
    
    short_kp = generate_short_kp(text, lang, n=4)
    print(f"\n🏷️  shortKeyPoints (tags): {short_kp}")
    
    long_kp = generate_long_kp(text, lang, n=3)
    print(f"\n🔑 longKeyPoints (TextRank):")
    for kp in long_kp:
        print(f"  - {kp[:200]}")
    
    summary = generate_ai_summary(text, lang, title, rtype, lvl)
    print(f"\n📄 summary: {summary[:300]}")
