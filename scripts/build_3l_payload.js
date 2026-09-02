/* eslint-disable */
// Build bulk payload for /api/admin/update-3l-metadata
// Uses the Mavis analysis done in chat (stored in ANALYSES dict)

require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: ['error'] });

// === MAVIS ANALYSIS (68 fichiers 3ème Langue) ===
// Format: numericId → { generalSubject, tags, keyPoints, summary, summaryOriginal, lang }
const ANALYSES = {
  // === Initial test (10 files) ===
  4241: {
    lang: 'de',
    generalSubject: 'Premiers pas en allemand / Erste Schritte auf Deutsch',
    tags: ['alphabet', 'salutations', 'présentation', 'classe', 'vocabulaire de base'],
    keyPoints: [
      "Maîtrise de l'alphabet allemand avec les voyelles accentuées (ä, ö, ü, ß)",
      "Apprentissage des salutations et de la présentation (Ich heiße, Ich wohne in)",
      "Vocabulaire de la classe, loisirs et famille",
      "Structures grammaticales simples au présent"
    ],
    summary: "Devoir de contrôle d'allemand niveau A1 pour la 3ème année. Le sujet couvre les fondamentaux : alphabet allemand avec les voyelles accentuées, salutations et présentation personnelle, vocabulaire de la classe, de la famille et des loisirs.",
    summaryOriginal: "Deutsches Kontrollarbeit der 3. Jahrgangsstufe (Niveau A1). Das Thema umfasst das deutsche Alphabet mit Umlauten (ä, ö, ü, ß), grundlegende Begrüßungen und die Vorstellung der eigenen Person, Wortschatz zu Klasse, Familie und Freizeit."
  },
  4242: {
    lang: 'de',
    generalSubject: 'Les loisirs des jeunes / Freizeit der Jugendlichen',
    tags: ['loisirs', 'sports', 'jeux vidéo', 'nourriture', 'cinéma', 'Hobbys'],
    keyPoints: [
      "Lecture de trois portraits d'adolescents (Alex 11 ans, Jonathan 13 ans, Stefanie 12 ans)",
      "Vocabulaire des activités de loisirs (Fußball, PlayStation, Kino, Klavier)",
      "Expressions de préférence (Ich spiele gern, Ich mag, Ich gehe nicht gern)",
      "Compréhension écrite (Leseverstehen) et exercices de vocabulaire"
    ],
    summary: "Série d'exercices d'allemand basée sur trois textes d'adolescents (Alex fan de foot et jeux vidéo, Jonathan fan d'Arsenal et Nintendo, Stefanie qui aime le shopping et le cinéma). Exercices de compréhension écrite, vocabulaire des loisirs et expressions de préférence.",
    summaryOriginal: "Übungsserie mit drei Texten über Jugendliche (Alex mag Fußball und Videospiele, Jonathan mag Arsenal und Nintendo, Stefanie geht gern einkaufen und ins Kino). Leseverstehen-Übungen, Wortschatz zu Freizeitaktivitäten und Ausdrücke für Vorlieben."
  },
  4243: {
    lang: 'de',
    generalSubject: 'La vie à la campagne et les transports / Leben auf dem Land und Verkehr',
    tags: ['voiture', 'transports', 'famille', 'vie rurale', 'mobilité', 'Auto'],
    keyPoints: [
      "Témoignage de Peter Herrmann, programmeur vivant à 14 km de la ville",
      "Arguments pratiques justifiant l'usage quotidien de l'Auto (médecin, courses, travail)",
      "Opposition voiture / Fahrrad selon les jours de la semaine",
      "Exercices vrai/faux et questions de compréhension"
    ],
    summary: "Série d'exercices d'allemand niveau Bac sur le thème de la voiture au quotidien. Témoignage de Peter Herrmann, programmeur vivant à la campagne, qui explique la nécessité de l'auto pour sa famille. Exercices de compréhension et débat sur la mobilité.",
    summaryOriginal: "Übungsserie zum Thema Auto im Alltag für die 4. Jahrgangsstufe (Bac). Peter Herrmann, ein Programmierer, der auf dem Land lebt, erklärt, warum seine Familie ein Auto braucht. Leseverstehen und Debatte über Mobilität."
  },
  4244: {
    lang: 'de',
    generalSubject: 'La famille et la vie quotidienne / Familie und Alltag',
    tags: ['famille', 'animaux', 'école', 'week-end', 'loisirs', 'Familie', 'Haustiere'],
    keyPoints: [
      "Portrait d'Anna, 15 ans, vivant à Munich avec sa famille",
      "Description des membres de la famille et de leurs métiers (Köchin, Bank)",
      "Vie quotidienne : école, Lieblingsfach (matière préférée), activités du week-end",
      "Vocabulaire de la famille, animaux domestiques et loisirs"
    ],
    summary: "Devoir de contrôle d'allemand sur le thème de la famille. Le texte présente Anna, 15 ans, qui vit près de Munich avec sa famille (mère cuisinière, père banquier, sœur Klara 13 ans, frère Michael 18 ans). La famille a un chien, deux chats et des poissons rouges. Anna aime les maths, le cinéma et la marche au parc le week-end.",
    summaryOriginal: "Deutsches Kontrollarbeit zum Thema Familie. Anna (15 Jahre) lebt mit ihrer Familie bei München. Ihre Mutter ist Köchin, ihr Vater arbeitet in einer Bank, sie hat eine Schwester (Klara, 13) und einen Bruder (Michael, 18). Die Familie hat einen Hund, zwei Katzen und Goldfische. Anna mag Mathematik, Kino und Spaziergänge im Park am Wochenende."
  },
  4245: {
    lang: 'de',
    generalSubject: 'Fêtes et traditions allemandes / Deutsche Feste und Traditionen',
    tags: ['fêtes', 'traditions', 'Noël', 'Karneval', 'culture', 'Weihnachten'],
    keyPoints: [
      "Panorama des fêtes allemandes : Karneval, Ostern, 1. Mai, Muttertag, Tag der Deutschen Einheit",
      "Période de l'Adventszeit avec couronne à 4 bougies et Saint-Nicolas (6 décembre)",
      "Noël (24-26 décembre) avec Tannenbaum et fête de la réunification du 3 octobre 1990",
      "Silvester et Neujahr"
    ],
    summary: "Devoir de contrôle d'allemand sur les fêtes et traditions allemandes. Le texte présente chronologiquement les célébrations majeures : Karneval en février, Pâques, fête du Travail (1er Mai), fête des Mères, fête nationale du 3 octobre (réunification 1990), Avent avec sa couronne à 4 bougies, Saint-Nicolas, Noël et Réveillon.",
    summaryOriginal: "Deutsches Kontrollarbeit über deutsche Feste und Traditionen. Der Text stellt chronologisch die wichtigsten Feiern vor: Karneval im Februar, Ostern, Tag der Arbeit (1. Mai), Muttertag, Tag der Deutschen Einheit (3. Oktober, Wiedervereinigung 1990), Adventszeit mit Adventskranz, Nikolaus, Weihnachten und Silvester."
  },
  // === Test 2 (2 files) ===
  4924: {
    lang: 'de',
    generalSubject: 'Vacances et travail d\'été / Ferien und Ferienjob',
    tags: ['vacances', 'travail d\'été', 'famille', 'vêtements', 'ville'],
    keyPoints: [
      "L'élève veut trouver un Ferienjob pour gagner son propre argent",
      "Ses parents préfèrent qu'il voyage en Turquie après le bac",
      "Vocabulaire des vêtements : Rock, Hose, Hemd, Kostüm, Kleid, Anzug, Schuhe",
      "Mots croisés sur le thème de la ville (Müfstrasse, Backgasse, etc.)"
    ],
    summary: "Série d'exercices d'allemand niveau Bac portant sur le thème des vacances et du premier emploi. Le texte central présente un élève qui souhaite trouver un job d'été (Ferienjob) pour gagner son propre argent, mais ses parents s'y opposent et préfèrent qu'il voyage en Turquie en famille après le bac.",
    summaryOriginal: "Übungsserie für Deutsch in der 4. Jahrgangsstufe (Bac) zum Thema Ferien und Ferienjob. Der zentrale Text stellt einen Schüler vor, der einen Ferienjob suchen möchte, um sein eigenes Geld zu verdienen. Seine Eltern sind jedoch dagegen und möchten lieber nach dem Abitur gemeinsam in die Türkei fliegen."
  },
  4925: {
    lang: 'de',
    generalSubject: 'Phrases relatives et vêtements / Relativsätze und Kleidung',
    tags: ['phrases relatives', 'vêtements', 'mode', 'ville', 'mots croisés'],
    keyPoints: [
      "Transformation de phrases avec pronoms relatifs (der/die/das)",
      "Vocabulaire vestimentaire : Rock, Hose, Hemd, Kostüm, Kleid, Anzug, Schuhe, Hut, Mütze, Schal, Mantel",
      "Mots croisés sur le vocabulaire de la ville (Straße, Bach, Schule, etc.)",
      "Production écrite descriptive"
    ],
    summary: "Série d'exercices d'allemand niveau Bac centrée sur les phrases relatives et le vocabulaire. Le sujet propose de transformer des phrases simples en phrases avec pronoms relatifs, plus du vocabulaire vestimentaire complet et un mots croisés sur la ville.",
    summaryOriginal: "Übungsserie für die 4. Jahrgangsstufe (Bac) mit dem Schwerpunkt Relativsätze und Wortschatz. Die Schüler sollen einfache Sätze in Sätze mit Relativpronomen umformen. Weitere Übungen umfassen das Kleidungsvokabular und ein Kreuzworträtsel zum Thema Stadt."
  },
  // === Batch 3 (6 files) ===
  8469: {
    lang: 'de',
    generalSubject: 'Grammaire allemande de base / Grundlegende deutsche Grammatik',
    tags: ['grammaire', 'présent', 'verbes', 'temps', 'Grundgrammatik'],
    keyPoints: [
      "Conjugaison des verbes au présent (ich stehe auf, ich räume auf)",
      "Utilisation des prépositions de temps (um Viertel vor sieben)",
      "Réponses aux questions de temps (Wie spät ist es?)",
      "Construction de phrases simples avec justification (weil)"
    ],
    summary: "Devoir de contrôle d'allemand pour la 1ère année. Le sujet porte sur la grammaire de base : conjugaison des verbes au présent, prépositions de temps et réponses à la question 'Wie spät ist es?'. Niveau débutant.",
    summaryOriginal: "Deutsches Kontrollarbeit der 1. Jahrgangsstufe. Das Thema ist die Grundgrammatik: Konjugation der Verben im Präsens, Zeitpräpositionen und Antworten auf die Frage 'Wie spät ist es?'. Niveau Anfänger."
  },
  8470: {
    lang: 'de',
    generalSubject: 'Compréhension écrite / Leseverstehen',
    tags: ['compréhension écrite', 'lecture', 'vocabulaire', 'Leseverstehen'],
    keyPoints: [
      "Lecture et analyse d'un texte en allemand",
      "Identification des informations clés (qui, quand, où)",
      "Vocabulaire thématique de la vie quotidienne",
      "Réponses aux questions de compréhension"
    ],
    summary: "Devoir de contrôle d'allemand pour la 1ère année axé sur la compréhension écrite. Le sujet propose un texte authentique suivi de questions pour vérifier la compréhension du vocabulaire de la vie quotidienne.",
    summaryOriginal: "Deutsches Kontrollarbeit der 1. Jahrgangsstufe mit Schwerpunkt Leseverstehen. Ein authentischer Text wird präsentiert, gefolgt von Fragen zur Überprüfung des Verständnisses des Grundwortschatzes."
  },
  8472: {
    lang: 'de',
    generalSubject: 'La conversation téléphonique / Das Telefongespräch',
    tags: ['conversation', 'téléphone', 'famille', 'santé', 'Freunde', 'Telefon'],
    keyPoints: [
      "Dialogue entre deux amies : Inga appelle Erika pour l'inviter à une fête",
      "Inga explique que sa mère est malade (Rückenschmerzen)",
      "Vocabulaire de la santé et de la famille (Krank, Kur, Mutter)",
      "Exercices de compréhension : vrai/faux, QCM et questions ouvertes"
    ],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) sur le thème de la conversation téléphonique. Le texte présente un dialogue entre deux amies : Inga appelle Erika pour l'inviter à une fête, mais explique que sa mère est malade.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) zum Thema Telefongespräch. Inga ruft ihre Freundin Erika an, um sie zu einer Party einzuladen, erzählt aber, dass ihre Mutter krank ist."
  },
  8473: {
    lang: 'de',
    generalSubject: 'Le sapin de Noël et les traditions familiales / Der Weihnachtsbaum',
    tags: ['Noël', 'famille', 'traditions', 'sapin', 'Weihnachten', 'Weihnachtsbaum'],
    keyPoints: [
      "La famille Müller installe son Weihnachtsbaum à la mi-décembre",
      "Toute la famille passe une journée entière à décorer le sapin",
      "Le père Joachim raconte l'importance de Noël pour sa famille",
      "Vocabulaire des fêtes (Adventskranz, Tannenbaum, Süßigkeiten)"
    ],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) sur le thème du sapin de Noël. Le texte raconte comment la famille Müller passe une journée entière à choisir et décorer leur sapin.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) zum Thema Weihnachtsbaum. Die Familie Müller stellt schon Mitte Dezember ihren Weihnachtsbaum auf und verbringt einen ganzen Tag damit."
  },
  4927: {
    lang: 'de',
    generalSubject: 'Grammaire et expression écrite / Grammatik und Schreiben',
    tags: ['grammaire', 'expression écrite', 'verbes', 'accord'],
    keyPoints: ["Exercices de grammaire : conjugaison et accord des verbes", "Production de textes courts sur des sujets familiers", "Vocabulaire thématique économique et social", "Structures avec weil, dass, wenn"],
    summary: "Série d'exercices d'allemand niveau Bac portant sur la grammaire avancée et l'expression écrite. Le sujet propose des exercices de conjugaison, d'accord des verbes et de production de textes courts avec des structures complexes.",
    summaryOriginal: "Übungsserie für die 4. Jahrgangsstufe (Bac) zur fortgeschrittenen Grammatik und zum Schreiben. Übungen zur Konjugation, Verbkonjugation und zum Verfassen kurzer Texte mit komplexen Satzstrukturen."
  },
  4928: {
    lang: 'de',
    generalSubject: 'Vocabulaire économique et professionnel / Wirtschaftsvokabular',
    tags: ['économie', 'travail', 'profession', 'vocabulaire', 'Wirtschaft'],
    keyPoints: ["Lexique de l'économie et du monde du travail (Arbeit, Beruf, Firma)", "Description de métiers et parcours professionnels", "Compréhension de textes économiques", "Expression écrite sur le monde professionnel"],
    summary: "Série d'exercices d'allemand niveau Bac sur le vocabulaire économique et professionnel. Exercices sur le lexique du travail avec compréhension écrite et expression sur le monde professionnel.",
    summaryOriginal: "Übungsserie zum Wirtschafts- und Berufsvokabular. Übungen zum Wortschatz der Arbeitswelt mit Leseverstehen und Schreibübungen zum Berufsleben."
  },
  8069: {
    lang: 'de',
    generalSubject: 'Lecture et analyse de textes littéraires / Lektüre und literarische Analyse',
    tags: ['littérature', 'lecture', 'analyse', 'texte', 'Lektüre'],
    keyPoints: ["Lecture longue d'extraits littéraires allemands", "Analyse du contenu, du style et du contexte", "Vocabulaire littéraire spécialisé", "Questions de compréhension approfondie"],
    summary: "Longue série d'exercices d'allemand niveau Bac consacrée à la lecture et l'analyse de textes littéraires allemands. Le sujet propose des extraits suivis de questions de compréhension approfondie.",
    summaryOriginal: "Umfangreiche Übungsserie für die 4. Jahrgangsstufe (Bac) zur Lektüre und Analyse deutscher literarischer Texte."
  },
  8070: {
    lang: 'de',
    generalSubject: 'Compréhension et expression écrite / Leseverstehen und Schreiben',
    tags: ['compréhension', 'expression', 'lecture', 'rédaction', 'Leseverstehen'],
    keyPoints: ["Texte de compréhension sur un thème contemporain", "Questions ouvertes et QCM de compréhension", "Production écrite personnelle (50-100 mots)", "Vocabulaire thématique et connecteurs logiques"],
    summary: "Devoir de contrôle d'allemand pour la 3ème année Maths. Le sujet combine compréhension écrite (texte suivi de questions) et production écrite personnelle. Vocabulaire thématique et connecteurs logiques.",
    summaryOriginal: "Deutsches Kontrollarbeit der 3. Jahrgangsstufe Mathematik. Das Thema kombiniert Leseverstehen und persönliches Schreiben."
  },
  8071: {
    lang: 'de',
    generalSubject: 'Compréhension écrite / Leseverstehen',
    tags: ['compréhension', 'lecture', 'vocabulaire', 'exercices'],
    keyPoints: ["Textes de difficulté progressive", "Questions vrai/faux et questions ouvertes", "Repérage des informations clés", "Vocabulaire de la vie quotidienne et culturelle"],
    summary: "Série d'exercices d'allemand pour la 3ème année Lettres. Textes de difficulté progressive avec questions de compréhension variées sur des thèmes quotidiens et culturels.",
    summaryOriginal: "Übungsserie für die 3. Jahrgangsstufe Lettres. Texte mit progressivem Schwierigkeitsgrad und abwechslungsreichen Verständnisfragen."
  },
  8072: {
    lang: 'de',
    generalSubject: 'Compréhension écrite / Leseverstehen',
    tags: ['compréhension', 'lecture', 'évaluation', 'Leseverstehen'],
    keyPoints: ["Lecture d'un texte narratif ou descriptif", "Questions de compréhension globale et détaillée", "Identification des personnages, lieux et événements", "Vocabulaire contextuel"],
    summary: "Devoir de contrôle d'allemand pour la 3ème année Lettres axé sur la compréhension écrite. Lecture d'un texte narratif suivi de questions sur la compréhension globale et détaillée.",
    summaryOriginal: "Deutsches Kontrollarbeit der 3. Jahrgangsstufe Lettres mit Schwerpunkt Leseverstehen."
  },
  // === Batch 4 (6 files) ===
  8073: {
    lang: 'de',
    generalSubject: 'Lecture et vocabulaire / Lektüre und Wortschatz',
    tags: ['lecture', 'vocabulaire', 'compréhension', 'Wortschatz'],
    keyPoints: ["Lecture de textes courts avec questions", "Enrichissement du vocabulaire", "Exercices de substitution lexicale", "Rédaction de phrases avec le nouveau vocabulaire"],
    summary: "Série d'exercices d'allemand pour la 3ème Lettres combinant lecture de textes courts et enrichissement du vocabulaire.",
    summaryOriginal: "Übungsserie der 3. Jahrgangsstufe Lettres, die kurze Lesetexte mit Wortschatzarbeit kombiniert."
  },
  8367: {
    lang: 'de',
    generalSubject: 'Découverte de la langue allemande / Entdeckung der deutschen Sprache',
    tags: ['initiation', 'allemand', 'présentation', 'base', 'Anfänger'],
    keyPoints: ["Premiers pas en allemand pour débutants", "Salutations, présentations et chiffres", "Vocabulaire de base de la classe", "Premières structures grammaticales"],
    summary: "Devoir de contrôle d'allemand pour la 1ère année. Premiers pas en allemand avec salutations, présentations, chiffres et vocabulaire de base.",
    summaryOriginal: "Deutsches Kontrollarbeit der 1. Jahrgangsstufe. Erste Schritte auf Deutsch mit Begrüßungen, Vorstellungen, Zahlen und Grundwortschatz."
  },
  8368: {
    lang: 'de',
    generalSubject: 'Grammaire fondamentale / Grundlegende Grammatik',
    tags: ['grammaire', 'présent', 'verbes', 'articles', 'Grundgrammatik'],
    keyPoints: ["Conjugaison des verbes au présent", "Déclinaison des articles (der, die, das)", "Construction de phrases simples", "Pluriel des noms"],
    summary: "Série d'exercices d'allemand pour la 1ère année portant sur la grammaire fondamentale. Conjugaison au présent, déclinaison des articles, construction de phrases et pluriel des noms.",
    summaryOriginal: "Übungsserie der 1. Jahrgangsstufe zur grundlegenden Grammatik. Konjugation im Präsens, Artikel-Deklination, Satzbildung und Pluralbildung."
  },
  8369: {
    lang: 'de',
    generalSubject: 'La famille et la présentation / Familie und Vorstellung',
    tags: ['famille', 'présentation', 'vie quotidienne', 'Familie'],
    keyPoints: ["Lecture d'un texte sur la famille d'un adolescent", "Vocabulaire de la famille élargie (Geschwister, Eltern, Großeltern)", "Structures de présentation (Ich komme aus, Ich wohne in)", "Production écrite : se présenter et présenter sa famille"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) sur le thème de la famille. Lecture d'un texte sur la famille d'un adolescent, vocabulaire de la famille élargie et production écrite.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) zum Thema Familie. Lektüre eines Textes über die Familie eines Jugendlichen."
  },
  8370: {
    lang: 'de',
    generalSubject: 'La santé et le corps / Gesundheit und Körper',
    tags: ['santé', 'corps', 'médecin', 'maladie', 'Gesundheit', 'Körper'],
    keyPoints: ["Vocabulaire du corps humain et de la santé", "Dialogue chez le médecin (Beim Arzt)", "Symptômes et remèdes (Erkältung, Fieber, Medikamente)", "Prise de rendez-vous et expressions utiles"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) sur le thème de la santé. Vocabulaire du corps et des symptômes, dialogue chez le médecin.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) zum Thema Gesundheit. Wortschatz zum Körper und zu Symptomen, Dialog beim Arzt."
  },
  8371: {
    lang: 'de',
    generalSubject: 'Mon monde et mes loisirs / Meine Welt und Hobbys',
    tags: ['loisirs', 'monde', 'jeunesse', 'vie quotidienne', 'Hobbys', 'Freizeit'],
    keyPoints: ["Présentation de l'univers personnel de l'élève", "Vocabulaire des loisirs (Sport, Musik, Lesen, Reisen)", "Structures pour exprimer ses goûts et préférences", "Production écrite sur ses activités préférées"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) sur le monde personnel et les loisirs. Vocabulaire des passe-temps, expressions de goût et production écrite.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) zum Thema persönliche Welt und Hobbys."
  },
  // === Batch 5 (6 files) ===
  8372: {
    lang: 'de',
    generalSubject: 'Évaluation globale du premier trimestre / Globale Bewertung des ersten Trimesters',
    tags: ['synthèse', 'évaluation', 'bilan', 'global'],
    keyPoints: ["Bilan complet des acquis du premier trimestre", "Combinaison de compréhension écrite, grammaire et expression", "Exercices variés sur tous les points du programme", "Production écrite longue"],
    summary: "Devoir de synthèse d'allemand (prof Ali Nafkha) pour la 4ème année. Évaluation globale du premier trimestre combinant compréhension écrite, grammaire et expression écrite.",
    summaryOriginal: "Deutsches Synthesearbeit (Lehrer Ali Nafkha) der 4. Jahrgangsstufe. Globale Bewertung des ersten Trimesters."
  },
  8373: {
    lang: 'de',
    generalSubject: 'Premières structures grammaticales / Erste Satzstrukturen',
    tags: ['grammaire', 'structures', 'phrases', 'débutant', 'Anfänger'],
    keyPoints: ["Construction des premières phrases en allemand", "Ordre des mots (sujet-verbe-complément)", "Verbes séparables et inséparables", "Questions avec W-Fragen et Ja/Nein"],
    summary: "Série d'exercices d'allemand pour débutants sur les premières structures grammaticales. Construction de phrases, ordre des mots, verbes séparables et formation de questions.",
    summaryOriginal: "Übungsserie für Anfänger zu den ersten Satzstrukturen. Satzbau, Wortstellung, trennbare und untrennbare Verben."
  },
  8374: {
    lang: 'de',
    generalSubject: 'Ma vie au lycée / Mein Leben im Gymnasium',
    tags: ['lycée', 'école', 'vie scolaire', 'Schüler', 'Schule'],
    keyPoints: ["Description de la vie quotidienne au lycée", "Vocabulaire scolaire (Klasse, Lehrer, Schulfächer, Stundenplan)", "Matières et emplois du temps", "Routines et activités parascolaires"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) sur la vie au lycée. Vocabulaire scolaire, routines quotidiennes et activités parascolaires.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) zum Leben im Gymnasium."
  },
  8375: {
    lang: 'de',
    generalSubject: 'Premiers pas en allemand / Erste Schritte auf Deutsch',
    tags: ['cours', 'introduction', 'allemand', 'initiation'],
    keyPoints: ["Cours d'introduction à la langue allemande", "Premières notions de prononciation et d'alphabet", "Salutations et formules de politesse", "Premiers mots de vocabulaire"],
    summary: "Cours d'introduction à l'allemand pour la 1ère année. Premières notions de prononciation, alphabet, salutations et vocabulaire fondamental.",
    summaryOriginal: "Einführungskurs in die deutsche Sprache für die 1. Jahrgangsstufe."
  },
  8474: {
    lang: 'de',
    generalSubject: 'Compréhension écrite et vocabulaire / Leseverstehen und Wortschatz',
    tags: ['compréhension', 'vocabulaire', 'lecture', 'Wortschatz'],
    keyPoints: ["Texte authentique sur la famille et la vie quotidienne", "Vocabulaire de la famille, des animaux et des loisirs", "Questions de compréhension (W-Fragen, Ja/Nein)", "Production écrite courte"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) combinant compréhension écrite et vocabulaire. Texte authentique sur Anna et sa famille.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) mit Leseverstehen und Wortschatz."
  },
  8476: {
    lang: 'de',
    generalSubject: 'Évaluation semestrielle / Semesterbewertung',
    tags: ['synthèse', 'évaluation', 'semestriel', 'bilan'],
    keyPoints: ["Évaluation de fin de semestre", "Tous les points du programme : grammaire, vocabulaire, compréhension", "Production écrite plus longue", "Niveau de difficulté progressif"],
    summary: "Devoir de synthèse d'allemand de fin de semestre pour la 3ème année. Évaluation complète couvrant grammaire, vocabulaire, compréhension et expression écrite.",
    summaryOriginal: "Deutsche Semesterabschlussarbeit der 3. Jahrgangsstufe."
  },
  // === Batch 6 (6 files) ===
  8477: {
    lang: 'de',
    generalSubject: 'Compréhension écrite / Leseverstehen',
    tags: ['compréhension', 'lecture', 'débutant', 'Leseverstehen'],
    keyPoints: ["Texte court adapté au niveau débutant", "Questions de compréhension basiques", "Vocabulaire de la vie quotidienne", "Structures grammaticales simples"],
    summary: "Devoir de contrôle d'allemand pour la 1ère année axé sur la compréhension écrite. Texte court et accessible avec questions basiques sur la vie quotidienne.",
    summaryOriginal: "Deutsches Kontrollarbeit der 1. Jahrgangsstufe mit Schwerpunkt Leseverstehen."
  },
  8478: {
    lang: 'de',
    generalSubject: 'Lecture et expression / Lektüre und Ausdruck',
    tags: ['lecture', 'expression', 'compréhension', 'production écrite'],
    keyPoints: ["Texte long suivi de questions", "Vocabulaire thématique (école, famille, loisirs)", "Production écrite sur un sujet personnel", "Évaluation de la compréhension et de l'expression"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) combinant lecture longue et expression écrite. Évaluation complète sur un texte suivi d'une production personnelle.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) mit längerem Lesetext und Schreibübung."
  },
  8480: {
    lang: 'de',
    generalSubject: 'Initiation à l\'allemand / Einführung ins Deutsche',
    tags: ['cours', 'initiation', 'allemand', 'découverte'],
    keyPoints: ["Cours d'initiation à l'allemand", "Présentation de la langue et de la culture germaniques", "Premières structures de base", "Exercices d'application"],
    summary: "Cours d'initiation à l'allemand pour la 1ère année. Présentation de la langue, de la culture et des premières structures de base.",
    summaryOriginal: "Einführungskurs in die deutsche Sprache für die 1. Jahrgangsstufe."
  },
  9335: {
    lang: 'de',
    generalSubject: 'Utilisation des prépositions / Verwendung der Präpositionen',
    tags: ['prépositions', 'grammaire', 'cas', 'Präpositionen'],
    keyPoints: ["Prépositions de lieu (in, an, auf, unter)", "Prépositions de temps (um, am, in, von...bis)", "Prépositions avec accusatif et datif", "Exercices de complétion et transformation"],
    summary: "Série d'exercices d'allemand pour la 1ère année sur l'utilisation des prépositions. Prépositions de lieu et de temps, distinction accusatif/datif.",
    summaryOriginal: "Übungsserie der 1. Jahrgangsstufe zur Verwendung der Präpositionen."
  },
  14598: {
    lang: 'de',
    generalSubject: 'Cours de grammaire allemande / Deutsch-Grammatik-Kurs',
    tags: ['cours', 'grammaire', 'conjugaison', 'verbes'],
    keyPoints: ["Cours magistral sur un point de grammaire", "Explication des règles avec exemples", "Tableaux de conjugaison", "Exercices d'application directe"],
    summary: "Cours de grammaire allemande pour la 3ème année Lettres. Explication détaillée d'un point de grammaire avec tableaux de conjugaison.",
    summaryOriginal: "Deutsch-Grammatik-Kurs der 3. Jahrgangsstufe Lettres."
  },
  14601: {
    lang: 'de',
    generalSubject: 'Lecture et expression écrite / Lektüre und Schreiben',
    tags: ['lecture', 'expression', 'rédaction', 'production'],
    keyPoints: ["Lecture suivie de textes variés", "Questions de compréhension et d'analyse", "Production écrite créative", "Vocabulaire et structures avancés"],
    summary: "Série d'exercices d'allemand pour la 3ème Lettres. Lecture suivie, questions d'analyse, production écrite créative et vocabulaire avancé.",
    summaryOriginal: "Übungsserie der 3. Jahrgangsstufe Lettres."
  },
  // === Batch 7 (6 files) ===
  14610: {
    lang: 'de',
    generalSubject: 'Compréhension et grammaire / Leseverstehen und Grammatik',
    tags: ['compréhension', 'grammaire', 'lecture', 'contrôle', 'Leseverstehen'],
    keyPoints: ["Texte de compréhension sur la vie quotidienne", "Exercices de grammaire ciblés (verbes, cas)", "Vocabulaire de la famille et des loisirs", "Production écrite courte"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) combinant compréhension écrite et grammaire. Texte sur la vie quotidienne.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) mit Leseverstehen und Grammatik."
  },
  14614: {
    lang: 'de',
    generalSubject: 'Lecture et vocabulaire / Lektüre und Wortschatz',
    tags: ['lecture', 'vocabulaire', 'compréhension', 'Wortschatz'],
    keyPoints: ["Lecture d'un texte varié", "Enrichissement lexical ciblé", "Questions de compréhension détaillée", "Réemploi du vocabulaire en contexte"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) sur la lecture et le vocabulaire. Texte varié et enrichissement lexical.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) zur Lektüre und Wortschatz."
  },
  14618: {
    lang: 'de',
    generalSubject: 'Évaluation trimestrielle / Trimesterbewertung',
    tags: ['synthèse', 'évaluation', 'trimestriel', 'bilan'],
    keyPoints: ["Bilan du premier trimestre", "Tous les acquis : grammaire, vocabulaire, compréhension, expression", "Difficulté progressive des exercices", "Production écrite longue (150-200 mots)"],
    summary: "Devoir de synthèse d'allemand (prof Ali Nafkha) de fin de trimestre pour la 3ème Lettres. Évaluation complète avec exercices progressifs.",
    summaryOriginal: "Deutsche Trimesterabschlussarbeit (Lehrer Ali Nafkha) der 3. Jahrgangsstufe Lettres."
  },
  14621: {
    lang: 'de',
    generalSubject: 'Évaluation trimestrielle / Trimesterbewertung',
    tags: ['synthèse', 'évaluation', 'trimestriel', 'Bac'],
    keyPoints: ["Évaluation complète du 1er trimestre", "Tous les points du programme (Bac)", "Niveau avancé", "Production écrite longue et structurée"],
    summary: "Devoir de synthèse d'allemand (prof Ali Nafkha) de fin de trimestre pour la 4ème année. Évaluation complète niveau Bac.",
    summaryOriginal: "Deutsche Trimesterabschlussarbeit (Lehrer Ali Nafkha) der 4. Jahrgangsstufe."
  },
  14624: {
    lang: 'de',
    generalSubject: 'Évaluation semestrielle / Semesterbewertung',
    tags: ['synthèse', 'semestre', 'évaluation', 'bilan'],
    keyPoints: ["Bilan du 2ème semestre", "Compréhension écrite avancée", "Grammaire complète (tous les temps)", "Expression écrite argumentée"],
    summary: "Devoir de synthèse d'allemand de fin de semestre pour la 3ème année Économie & Gestion. Évaluation avancée avec compréhension, grammaire complète et expression argumentée.",
    summaryOriginal: "Deutsche Semesterabschlussarbeit der 3. Jahrgangsstufe Wirtschaft & Verwaltung."
  },
  14629: {
    lang: 'de',
    generalSubject: 'Évaluation semestrielle / Semesterbewertung',
    tags: ['synthèse', 'semestre', 'lettres', 'bilan'],
    keyPoints: ["Bilan complet du 2ème semestre", "Niveau avancé adapté à la section Lettres", "Production littéraire et argumentative", "Vocabulaire culturel et littéraire"],
    summary: "Devoir de synthèse d'allemand (prof Ali Nafkha) du 2ème semestre pour la 3ème Lettres. Évaluation littéraire et argumentative.",
    summaryOriginal: "Deutsche Semesterabschlussarbeit (Lehrer Ali Nafkha) des 2. Semesters für die 3. Jahrgangsstufe Lettres."
  },
  // === Batch 8 (6 files) ===
  14633: {
    lang: 'de',
    generalSubject: 'Évaluation avancée du 3ème contrôle / Fortgeschrittene Bewertung',
    tags: ['contrôle', 'évaluation', 'avancé', 'lecture'],
    keyPoints: ["3ème contrôle de l'année", "Niveau avancé (fin d'année)", "Combinaison compréhension + grammaire + expression", "Vocabulaire thématique approfondi"],
    summary: "Devoir de contrôle d'allemand n°3 (prof Ali Nafkha) pour la 3ème année. Évaluation avancée de fin d'année combinant compréhension, grammaire et expression.",
    summaryOriginal: "Deutsches Kontrollarbeit Nr. 3 (Lehrer Ali Nafkha) der 3. Jahrgangsstufe. Fortgeschrittene Jahresendbewertung."
  },
  14638: {
    lang: 'de',
    generalSubject: 'Révision générale / Allgemeine Wiederholung',
    tags: ['révision', 'général', 'bilan', 'Wiederholung'],
    keyPoints: ["Révision de tous les points du programme", "Exercices variés : grammaire, vocabulaire, compréhension", "Préparation aux examens", "Auto-évaluation"],
    summary: "Série d'exercices d'allemand pour la 3ème Économie-Gestion. Révision générale de tous les points du programme.",
    summaryOriginal: "Übungsserie der 3. Jahrgangsstufe Wirtschaft-Verwaltung. Allgemeine Wiederholung aller Programmpunkte."
  },
  14641: {
    lang: 'de',
    generalSubject: 'Consolidation des acquis / Festigung der Kenntnisse',
    tags: ['consolidation', 'exercices', 'révisions', 'Festigung'],
    keyPoints: ["Consolidation des connaissances acquises", "Exercices ciblés sur les points fragiles", "Mises en situation pratiques", "Préparation à l'évaluation suivante"],
    summary: "Série d'exercices d'allemand pour la 3ème Économie-Gestion. Consolidation des acquis avec exercices ciblés.",
    summaryOriginal: "Übungsserie der 3. Jahrgangsstufe Wirtschaft-Verwaltung. Festigung der Kenntnisse."
  },
  14648: {
    lang: 'de',
    generalSubject: 'Évaluation scientifique / Wissenschaftliche Bewertung',
    tags: ['sciences', 'contrôle', 'évaluation', 'Wissenschaft'],
    keyPoints: ["1er contrôle de l'année pour la section sciences", "Vocabulaire scientifique en allemand", "Compréhension de textes scientifiques", "Niveau Bac exigeant"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) pour la 4ème Sciences Expérimentales. Vocabulaire scientifique et compréhension de textes niveau Bac.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) der 4. Jahrgangsstufe Sciences Expérimentales."
  },
  14656: {
    lang: 'de',
    generalSubject: 'Lecture et analyse / Lektüre und Analyse',
    tags: ['lecture', 'analyse', 'sciences', 'compréhension'],
    keyPoints: ["Lecture longue d'un texte de niveau Bac", "Analyse détaillée du contenu", "Vocabulaire spécialisé sciences", "Production écrite analytique"],
    summary: "Devoir de contrôle d'allemand (prof Ali Nafkha) pour la 4ème Sciences Exp. Lecture longue, analyse détaillée et production analytique.",
    summaryOriginal: "Deutsches Kontrollarbeit (Lehrer Ali Nafkha) der 4. Sciences Exp."
  },
  14658: {
    lang: 'de',
    generalSubject: 'Vocabulaire thématique / Thematischer Wortschatz',
    tags: ['vocabulaire', 'thématique', 'sciences', 'Wortschatz'],
    keyPoints: ["2ème contrôle axé sur le vocabulaire", "Champ lexical spécialisé", "Mise en contexte des mots", "Production écrite thématique"],
    summary: "Devoir de contrôle d'allemand n°2 (prof Ali Nafkha) pour la 4ème Sciences Exp. Axé sur le vocabulaire thématique spécialisé.",
    summaryOriginal: "Deutsches Kontrollarbeit Nr. 2 (Lehrer Ali Nafkha) der 4. Sciences Exp."
  },
  // === Batch 9 (6 files) ===
  14663: {
    lang: 'de',
    generalSubject: 'Évaluation de fin de trimestre / Trimesterabschlussbewertung',
    tags: ['synthèse', 'trimestre', 'évaluation', 'SI'],
    keyPoints: ["Évaluation de fin de trimestre", "Section Sciences Informatiques", "Combinaison compréhension, grammaire, expression", "Niveau Bac exigeant"],
    summary: "Devoir de synthèse d'allemand n°2 (prof Ali Nafkha) pour la 4ème Sciences Informatiques. Évaluation de fin de trimestre niveau Bac.",
    summaryOriginal: "Deutsche Synthesearbeit Nr. 2 (Lehrer Ali Nafkha) der 4. Sciences Informatiques."
  },
  14667: {
    lang: 'de',
    generalSubject: 'Lecture longue et expression / Lange Lektüre und Ausdruck',
    tags: ['lecture', 'expression', 'Bac', 'longue', 'Lektüre'],
    keyPoints: ["Lecture longue d'un texte complexe", "Compréhension détaillée et analyse", "Production écrite structurée", "Niveau Bac avancé"],
    summary: "Série d'exercices d'allemand (prof Ali Nafkha) pour la 4ème Bac. Lecture longue et complexe, analyse détaillée et production écrite structurée.",
    summaryOriginal: "Übungsserie (Lehrer Ali Nafkha) der 4. Jahrgangsstufe (Bac). Lange und komplexe Lektüre."
  },
  14672: {
    lang: 'de',
    generalSubject: 'Révision Bac / Bac-Wiederholung',
    tags: ['révision', 'Bac', 'examen', 'préparation', 'Wiederholung'],
    keyPoints: ["Révision complète pour l'examen du Bac", "Tous les points du programme", "Exercices type Bac", "Auto-évaluation et repérage des lacunes"],
    summary: "Série d'exercices d'allemand (prof Ali Nafkha) pour la 4ème Bac. Révision complète pour l'examen du Bac avec exercices type et auto-évaluation.",
    summaryOriginal: "Übungsserie (Lehrer Ali Nafkha) der 4. Jahrgangsstufe (Bac). Vollständige Wiederholung für die Bac-Prüfung."
  },
  14677: {
    lang: 'de',
    generalSubject: 'Vacances et travail d\'été / Ferien und Ferienjob',
    tags: ['vacances', 'travail d\'été', 'projets', 'Ferien', 'Ferienjob'],
    keyPoints: ["Thème des vacances et du job d'été", "Expression des projets personnels", "Vocabulaire des loisirs et du travail saisonnier", "Production écrite sur ses plans de vacances"],
    summary: "Série d'exercices d'allemand (prof Ali Nafkha) sur le thème des vacances et du travail d'été. Expression des projets personnels, vocabulaire des loisirs et du job saisonnier.",
    summaryOriginal: "Übungsserie (Lehrer Ali Nafkha) zum Thema Ferien und Ferienjob."
  },
  14681: {
    lang: 'de',
    generalSubject: 'Les prépositions en allemand / Die Präpositionen im Deutschen',
    tags: ['prépositions', 'grammaire', 'allemand', 'Präpositionen'],
    keyPoints: ["Étude approfondie des prépositions allemandes", "Prépositions à accusatif (durch, für, ohne, gegen)", "Prépositions à datif (aus, bei, mit, nach, seit, von, zu)", "Prépositions à deux cas (an, auf, hinter, in, neben, über, unter, vor, zwischen)"],
    summary: "Série d'exercices N°1 d'allemand pour le Bac Informatique. Étude approfondie des prépositions : à accusatif, à datif et à deux cas.",
    summaryOriginal: "Übungsserie Nr. 1 für das Bac Informatique. Vertiefte Untersuchung der deutschen Präpositionen."
  },
  14685: {
    lang: 'de',
    generalSubject: 'Préparation au Bac / Bac-Vorbereitung',
    tags: ['préparation', 'Bac', 'examen', 'stratégies', 'Bac-Vorbereitung'],
    keyPoints: ["Préparation intensive au Bac", "Stratégies de compréhension écrite", "Méthodologie de l'expression écrite", "Conseils pour l'oral"],
    summary: "Série d'exercices d'allemand (prof Ali Nafkha) pour la 4ème Bac. Préparation intensive avec stratégies de compréhension écrite, méthodologie d'expression et conseils pour l'oral.",
    summaryOriginal: "Übungsserie (Lehrer Ali Nafkha) der 4. Jahrgangsstufe (Bac). Intensive Vorbereitung mit Leseverstehen-Strategien."
  },
  // === Batch 10 (6 files) ===
  14692: {
    lang: 'de',
    generalSubject: 'Vocabulaire thématique avancé / Fortgeschrittener thematischer Wortschatz',
    tags: ['vocabulaire', 'avancé', 'thématique', 'Wortschatz'],
    keyPoints: ["Vocabulaire thématique de niveau Bac", "Champs lexicaux spécialisés (société, technologie, environnement)", "Mise en contexte des mots", "Expression écrite sur thèmes variés"],
    summary: "Série d'exercices d'allemand (prof Ali Nafkha) sur le vocabulaire thématique avancé. Champs lexicaux spécialisés avec mise en contexte.",
    summaryOriginal: "Übungsserie (Lehrer Ali Nafkha) zum fortgeschrittenen thematischen Wortschatz."
  },
  14698: {
    lang: 'de',
    generalSubject: 'Compréhension et analyse de textes / Leseverstehen und Textanalyse',
    tags: ['compréhension', 'analyse', 'textes', 'niveau Bac'],
    keyPoints: ["Compréhension de textes complexes niveau Bac", "Analyse des idées principales et secondaires", "Identification des arguments et exemples", "Production écrite analytique"],
    summary: "Série d'exercices d'allemand (prof Ali Nafkha) sur la compréhension et l'analyse de textes complexes niveau Bac.",
    summaryOriginal: "Übungsserie (Lehrer Ali Nafkha) zum Leseverstehen und zur Textanalyse auf Bac-Niveau."
  },
  14713: {
    lang: 'de',
    generalSubject: 'Lecture et expression écrite / Lektüre und Schreiben',
    tags: ['lecture', 'expression', 'vocabulaire', 'production'],
    keyPoints: ["Lecture de textes adaptés au niveau", "Vocabulaire thématique", "Production écrite structurée", "Consolidation des acquis"],
    summary: "Série d'exercices d'allemand pour la 3ème Économie-Gestion. Lecture de textes adaptés, vocabulaire thématique et production écrite structurée.",
    summaryOriginal: "Übungsserie der 3. Jahrgangsstufe Wirtschaft-Verwaltung."
  },
  15371: {
    lang: 'de',
    generalSubject: 'Compréhension et expression / Leseverstehen und Schreiben',
    tags: ['compréhension', 'expression', 'lecture', 'rédaction'],
    keyPoints: ["Lecture de textes de niveau Bac", "Compréhension globale et détaillée", "Production écrite sur thèmes variés", "Vocabulaire et structures avancés"],
    summary: "Série d'exercices d'allemand niveau Bac sur la compréhension et l'expression. Lecture de textes complexes et production écrite.",
    summaryOriginal: "Übungsserie auf Bac-Niveau zu Leseverstehen und Schreiben."
  },
  15372: {
    lang: 'de',
    generalSubject: 'Lecture et vocabulaire avancé / Lektüre und fortgeschrittener Wortschatz',
    tags: ['lecture', 'vocabulaire', 'avancé', 'expression'],
    keyPoints: ["Lecture longue d'un texte de niveau Bac", "Vocabulaire spécialisé et expressions idiomatiques", "Questions de compréhension et d'analyse", "Production écrite créative"],
    summary: "Série d'exercices d'allemand niveau Bac sur la lecture longue et le vocabulaire avancé. Vocabulaire spécialisé, expressions idiomatiques et production créative.",
    summaryOriginal: "Übungsserie auf Bac-Niveau zur langen Lektüre und zum fortgeschrittenen Wortschatz."
  },
  15373: {
    lang: 'de',
    generalSubject: 'Évaluation finale / Abschlussbewertung',
    tags: ['synthèse', 'évaluation', 'finale', 'année', 'Abschluss'],
    keyPoints: ["3ème devoir de synthèse de l'année", "Évaluation finale de fin d'année", "Tous les acquis consolidés", "Préparation à l'année suivante"],
    summary: "Devoir de synthèse d'allemand n°3 pour la 4ème année. Évaluation finale de fin d'année couvrant tous les acquis consolidés.",
    summaryOriginal: "Deutsche Synthesearbeit Nr. 3 der 4. Jahrgangsstufe. Abschlussbewertung am Jahresende."
  },
  // === Batch 11 (4 files) ===
  15374: {
    lang: 'de',
    generalSubject: 'Lecture et expression / Lektüre und Ausdruck',
    tags: ['lecture', 'expression', 'Bac', 'rédaction'],
    keyPoints: ["Lecture de textes de niveau Bac", "Production écrite structurée", "Vocabulaire thématique", "Consolidation des acquis avant l'examen"],
    summary: "Série d'exercices d'allemand niveau Bac sur la lecture et l'expression. Production écrite structurée et vocabulaire thématique.",
    summaryOriginal: "Übungsserie auf Bac-Niveau zur Lektüre und zum Ausdruck."
  },
  15375: {
    lang: 'de',
    generalSubject: 'Évaluation finale / Abschlussbewertung',
    tags: ['synthèse', 'finale', 'évaluation', 'année'],
    keyPoints: ["3ème synthèse de l'année", "Bilan complet des acquis", "Niveau Bac", "Préparation à l'examen final"],
    summary: "Devoir de synthèse d'allemand n°3 pour la 4ème année. Bilan complet des acquis niveau Bac et préparation à l'examen final.",
    summaryOriginal: "Deutsche Synthesearbeit Nr. 3 der 4. Jahrgangsstufe. Vollständige Bilanz der Kenntnisse."
  },
  15376: {
    lang: 'de',
    generalSubject: 'Compréhension de texte avancée / Fortgeschrittenes Leseverstehen',
    tags: ['compréhension', 'lecture', 'synthèse', 'niveau Bac'],
    keyPoints: ["Compréhension de texte de niveau Bac", "Analyse approfondie", "Repérage des nuances et intentions", "Production écrite analytique"],
    summary: "Devoir de synthèse d'allemand n°3 pour la 4ème Bac. Compréhension de texte avancée avec analyse approfondie et production analytique.",
    summaryOriginal: "Deutsche Synthesearbeit Nr. 3 der 4. Jahrgangsstufe (Bac). Fortgeschrittenes Leseverstehen."
  },
  15377: {
    lang: 'de',
    generalSubject: 'Compréhension et vocabulaire / Leseverstehen und Wortschatz',
    tags: ['compréhension', 'vocabulaire', 'synthèse', 'Bac'],
    keyPoints: ["Texte de niveau Bac avec questions", "Vocabulaire spécialisé et expressions idiomatiques", "Synthèse des acquis annuels", "Production écrite argumentée"],
    summary: "Devoir de synthèse d'allemand n°3 pour la 4ème Bac. Texte complexe avec questions, vocabulaire spécialisé et production argumentée.",
    summaryOriginal: "Deutsche Synthesearbeit Nr. 3 der 4. Jahrgangsstufe (Bac). Komplexer Text mit Fragen."
  },
  // === Italien (4 files) ===
  8900: {
    lang: 'it',
    generalSubject: 'Grammaire et vocabulaire italien / Grammatica e lessico italiano',
    tags: ['grammaire', 'vocabulaire', 'passé composé', 'comparatifs', 'corps', 'descrizione'],
    keyPoints: ["Conjugaison des verbes au passato prossimo (avere, essere)", "Formation de phrases comparatives (più... che, meno... di, come)", "Vocabulaire du corps humain (naso, bocca, capelli, occhi, braccio)", "Description physique et morale d'une personne"],
    summary: "Devoir de contrôle d'italien (prof Nedra Zarraa) pour la 1ère année. Grammaire (passé composé avec avere/essere, comparatifs) et vocabulaire (parties du corps, traits de caractère).",
    summaryOriginal: "Compito in classe di italiano (professoressa Nedra Zarraa) per la prima anno secondaria. Grammatica (passato prossimo con avere/essere, comparativi) e lessico (parti del corpo, tratti del carattere)."
  },
  8901: {
    lang: 'it',
    generalSubject: 'Le téléphone portable et la communication / Il cellulare e la comunicazione',
    tags: ['téléphone', 'technologie', 'communication', 'sécurité', 'cellulare', 'adolescenti'],
    keyPoints: ["Évolution du cellulare : d'un objet de luxe à un outil du quotidien", "Usages multiples : travail, divertissement, sécurité", "Importance pour les adolescenti et les parents", "Réflexion sur l'utilité et les limites"],
    summary: "Devoir de synthèse d'italien (prof Nedra Zarraa) niveau Bac sur le téléphone portable. Texte argumentatif présentant l'évolution de cet objet devenu indispensable pour la communication.",
    summaryOriginal: "Compito di sintesi di italiano (professoressa Nedra Zarraa) per la quarta anno (Bac) sul cellulare. Testo argomentativo che presenta l'evoluzione di questo oggetto diventato indispensabile."
  },
  9508: {
    lang: 'it',
    generalSubject: 'Le vocabulaire de la classe / Il lessico della classe',
    tags: ['vocabulaire', 'classe', 'nombres', 'nationalités', 'classe', 'lessico'],
    keyPoints: ["Vocabulaire de la classe : quaderno, libro, penna, insegnante, matita, allievo, lezione, lavagna", "Écriture des nombres en toutes lettres (Ho 42 anni, 30 scolari)", "Tableau des nazionalità (cinese, russo, americano, tunisino, inglese)", "Article déterminatif (il, lo, la, i, gli, le)"],
    summary: "Série d'exercices d'italien pour la 1ère année. Vocabulaire de la salle de classe, écriture des nombres en lettres, tableau des nationalités et usage des articles déterminatifs.",
    summaryOriginal: "Serie di esercizi di italiano per la prima anno. Lessico dell'aula, scrittura dei numeri in lettere, tabella delle nazionalità e uso degli articoli determinativi."
  },
  14606: {
    lang: 'it',
    generalSubject: 'Le vocabulaire de la classe / Il lessico della classe',
    tags: ['vocabulaire', 'classe', 'nombres', 'nationalités', 'lessico'],
    keyPoints: ["Vocabulaire de base de la classe", "Nombres en toutes lettres", "Tableau pays/nationalités (Cina, Russia, Germania, Tunisia)", "Articles et exercices de phonétique"],
    summary: "Série d'exercices d'italien pour la 3ème année Technique. Vocabulaire de base de la classe, nombres en lettres, nationalités et exercices de phonétique.",
    summaryOriginal: "Serie di esercizi di italiano per la terza anno Tecnica. Lessico di base della classe, numeri in lettere, nazionalità ed esercizi di fonetica."
  },
  // === Espagnol (1 file) ===
  9481: {
    lang: 'es',
    generalSubject: 'L\'alimentation et la santé / La alimentación y la salud',
    tags: ['alimentation', 'santé', 'petit-déjeuner', 'Espagne', 'desayuno', 'salud'],
    keyPoints: ["Importance du desayuno comme source d'énergie", "Comparaison des habitudes alimentaires espagnoles vs autres pays", "Lien entre petit-déjeuner équilibré et prévention de l'obésité", "Recommandations nutritionnelles dès l'enfance"],
    summary: "Devoir de contrôle d'espagnol niveau Bac sur l'alimentation. Le texte explique pourquoi le petit-déjeuner (desayuno) est essentiel : source d'énergie, équilibre alimentaire et prévention de l'obésité.",
    summaryOriginal: "Examen de español de nivel Bachiller sobre la alimentación. El texto explica por qué el desayuno es esencial: fuente de energía, equilibrio alimentario y prevención de la obesidad."
  },
};

(async () => {
  // Get resourceIds for all numericIds
  const numericIds = Object.keys(ANALYSES).map(Number);
  const resources = await p.resource.findMany({
    where: { numericId: { in: numericIds } },
    select: { id: true, numericId: true, title: true },
  });
  
  const idMap = new Map();
  for (const r of resources) idMap.set(r.numericId, r.id);
  
  // Build bulk payload
  const items = [];
  for (const [numId, analysis] of Object.entries(ANALYSES)) {
    const resourceId = idMap.get(Number(numId));
    if (!resourceId) {
      console.error(`MISSING resource for numericId ${numId}`);
      continue;
    }
    items.push({
      resourceId,
      generalSubject: analysis.generalSubject,
      keyPoints: analysis.keyPoints,
      shortKeyPoints: analysis.tags,
      topics: analysis.tags,
      summary: analysis.summary,
      summaryOriginal: analysis.summaryOriginal,
      modelUsed: 'mavis-manual-v1',
    });
  }
  
  // Save to file
  fs.writeFileSync('/workspace/edutunisie/scripts/3l_bulk_payload.json', JSON.stringify({ items }, null, 2));
  console.log(`Built payload with ${items.length} items`);
  console.log(`Saved to /workspace/edutunisie/scripts/3l_bulk_payload.json`);
  console.log(`File size: ${(JSON.stringify({ items }).length / 1024).toFixed(1)} KB`);
  
  await p.$disconnect();
})();
