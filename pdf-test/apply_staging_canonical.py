#!/usr/bin/env python3
"""
Apply staging → live DB with CANONICAL normalization for schools and profs.

MODE PRUDENT (default, current):
  - School: ONLY update if live is NULL/empty (never overwrite)
  - Year:   ONLY update if live is NULL/empty AND confidence > 0.7
  - Type:   NEVER TOUCHED (user rule: leave as-is)

DRY-RUN by default. Use --apply to actually write to live DB.

Steps:
1. Load all staging records (isApplied=FALSE)
2. For each: compute canonical school AR + prof AR + year (with inversion fix)
3. Show diff (live vs canonical) for each field
4. Mark only fields where live is empty as 'would change'
5. Optional: write to live DB with --apply

Usage:
  python3 apply_staging_canonical.py --limit 10                # dry-run
  python3 apply_staging_canonical.py --limit 2000              # dry-run all Math collège
  python3 apply_staging_canonical.py --limit 2000 --apply      # WRITE TO LIVE DB
  python3 apply_staging_canonical.py --class 7eme --limit 100  # filter by class
"""
import os, json, re, sys, argparse, time
from pathlib import Path
import urllib.request

NEON_API_KEY = os.environ.get('NEON_API_KEY', '')
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'

def neon_query(sql):
    body = {'db_name': 'neondb', 'role_name': ROLE, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


# =================== CANONICAL MAPPINGS ===================

SCHOOL_MAPPING = [
    # Ali Douaj
    (['الدوعاج', 'الدوعاجر', 'الدواجر', 'الدواجي'], 'المدرسة الإعدادية علي الدوعاج'),
    # Moufida Bourguiba Hammam-Lif
    (['مفيدة بورقيبة حمام الانف', 'مفيدة بورقيبة حمام االنف', 'مفيدة بورقيبة حمام النف', 'مفيدة بورقيبة حمام الف', 'مفيدة بورقيبة حمام'], 'المدرسة الإعدادية مفيدة بورقيبة حمام الأنف'),
    (['مفيدة بورقيبة'], 'المدرسة الإعدادية مفيدة بورقيبة'),
    # Tine / Taïna
    (['طينة', 'Tine', 'Tyna', 'Tinja', 'Tain', 'Batina', 'Batine', 'Btainah', 'طــينة', 'طي نة'], 'المدرسة الإعدادية طينة'),
    # Ibn Khaldoun Bouhallel
    (['ابن خلدون ببوهلال', 'ابن خلدون ببوهةلال', 'ابن خلدون بوهةلال', 'ابن خلدون ببوهالل', 'ابن خلدون بوهالل'], 'المدرسة الإعدادية ابن خلدون ببوهلال'),
    (['ابن خلدون'], 'المدرسة الإعدادية ابن خلدون'),
    # Ibn Sina
    (['ابن سينا', 'سييا', 'سيىا', 'سيان', 'با بن سيناء', 'ابة سييا'], 'المدرسة الإعدادية ابن سينا'),
    # Ibn Al-Jazar
    (['ابن الجزار', 'ابن الجا', 'ابن جزر'], 'معهد ابن الجزار بقبلي'),
    # Ibn Rochd
    (['ابن رشد بتطاوين'], 'المدرسة الإعدادية ابن رشد بتطاوين'),
    (['ابن رشد'], 'المدرسة الإعدادية ابن رشد'),
    # Modèle
    (['النموذجية بالمنزه', 'النموذجية بالمنزة', 'النموذجية Menzeh', 'النموذجية Menzah', 'النموذجية حي الدير'], 'المدرسة الإعدادية النموذجية بالمنزه 5'),
    (['النموذجية بالكاف', 'النموذجية حي الدير الكاف'], 'المدرسة الإعدادية النموذجية بالكاف'),
    (['النموذجية قابس', 'النموذجية ــ قابس'], 'المدرسة الإعدادية النموذجية قابس'),
    (['النموذجية خير الدين'], 'المدرسة الإعدادية النموذجية خير الدين باشا سيدي بوزيد'),
    (['النموذجية ضفاف', 'النموذجيت ضفاف'], 'المدرسة الإعدادية النموذجية ضفاف البحيرة'),
    (['النموذجية بسليانة'], 'المدرسة الإعدادية النموذجية بسليانة'),
    (['النموذجية'], 'المدرسة الإعدادية النموذجية'),
    # Kerkennah
    (['قرقنة'], 'المدرسة الإعدادية بقرقنة'),
    # Saha Chouhada
    (['ساحة الشهداء بنابل'], 'إعدادية ساحة الشهداء بنابل'),
    (['ساحة الشهداء'], 'إعدادية ساحة الشهداء'),
    # Sidi Aich
    (['سيدي عيش'], 'إعدادية سيدي عيش'),
    # Asad Ibn Al-Furat
    (['اسد بن الفرات', 'اسد ابن الفرات', 'Asad Ibn', 'اسد اتن الفرات'], 'المدرسة الإعدادية أسد بن الفرات'),
    # Aouina 2
    (['العوينة 2', 'بالعوينة 2', 'Aouina 2', 'العوينة2', 'لعاوينة'], 'المدرسة الإعدادية بالعوينة 2'),
    # 20 Mars
    (['20 مارس', '20 Mars'], 'المدرسة الإعدادية 20 مارس'),
    # 18 Janvier
    (['18 جانفي', '18 Janvier'], 'المدرسة الإعدادية 18 جانفي'),
    # Wadi Al-Nour
    (['وادي النور'], 'المدرسة الإعدادية وادي النور'),
    # Biruni
    (['بيروني', 'البيــروني', 'البيروني', 'البيـروني', 'بيروني بالنفيضة', 'بيروني بال', 'البيـروني بالنفيضة'], 'المدرسة الإعدادية البيروني بالنفيضة'),
    # Bessliman
    (['بسليم', 'بسليمان', 'بسليمم', 'بسليمــــــــان', 'بسليمـــــــــــان', 'بسليمى'], 'المدرسة الإعدادية بسليمان'),
    # Farhat Hached
    (['فرحات حشاد', 'Farhat Hached'], 'المدرسة الإعدادية فرحات حشاد'),
    # Habib
    (['الحبيب', 'الشعبوني'], 'المدرسة الإعدادية الحبيب الشعبوني'),
    # Mohamed El Aroui
    (['محمد العروي', 'محمد العرو'], 'المدرسة الإعدادية محمد العروي'),
    # Fatma Bourguiba
    (['فطومة بورقيبة', 'فطّومة', 'Fatma', 'Fatouma', 'Fatima', 'فاطمة', 'فطومة'], 'المدرسة الإعدادية فطومة بورقيبة'),
    # Werdia
    (['الوردية', 'بالوردية', 'Werdia', 'Wardiya'], 'المدرسة الإعدادية بالوردية'),
    # Zahra
    (['الزهرة', 'الزةرة', 'الزهــرة', 'الزهــــرة', 'Zahra', 'الزهراء', 'الزهر'], 'المدرسة الإعدادية بالزهرة'),
    # Hay Ettadhamen
    (['حي التضامن', 'التضامن', 'Tadhamen', 'التضامن'], 'المدرسة الإعدادية حي التضامن'),
    # Beni Mtir
    (['بني مطير', 'Beni Mtir', 'Ben Mateur', 'Mtir', 'مطير', 'بني متير'], 'المدرسة الإعدادية بني مطير'),
    # 7 Novembre
    (['7 نوفمبر', '7 Novembre', 'Novembre'], 'المدرسة الإعدادية 7 نوفمبر'),
    # Sahlien
    (['الساحلين', 'Sahlien', 'بالساحل', 'بالساحلي', 'الساحلي'], 'المدرسة الإعدادية بالساحلين'),
    # Sidi Bou Ali
    (['سيدي بوعلي', 'Sidi Bou Ali'], 'المدرسة الإعدادية سيدي بوعلي'),
    # Hannibal
    (['حنبعل', 'Hannibal'], 'المدرسة الإعدادية حنبعل'),
    # Ibn Mateur
    (['ابن متير', 'Ben Mateur', 'ابن متيار', 'ماطر'], 'المدرسة الإعدادية ابن متير'),
    # Technique Sousse
    (['التقنية بسوسة', 'التقنية', 'التقنية'], 'المدرسة الإعدادية التقنية بسوسة'),
    # Khair Eddine
    (['خير الدين'], 'المدرسة الإعدادية خير الدين باشا سيدي بوزيد'),
    # Sbeiba
    (['بسبيبة', 'Sbeiba', 'بسب  بة'], 'المدرسة الإعدادية بسبيبة'),
    # Sousse
    (['سوسة'], 'المدرسة الإعدادية بسوسة'),
    # Mornag
    (['مرناق', 'Mornag'], 'المدرسة الإعدادية بمرناق'),
    # Carthage
    (['قرطاج', 'Carthage'], 'المدرسة الإعدادية بقرطاج'),
    # Jendouba
    (['جندوبة', 'Jendouba'], 'المدرسة الإعدادية بجندوبة'),
    # Jerjis
    (['جرجيس', 'Jerjis'], 'المدرسة الإعدادية بجرجيس'),
    # Foussana
    (['فوسانة', 'Foussana'], 'المدرسة الإعدادية بفوسانة'),
    # Borj El Amri
    (['برج العافري', 'برج العيفة', 'برج العامري', 'بربج العيفة'], 'المدرسة الإعدادية ببرج العريف'),
    # Ghanouch
    (['غنوش', 'Ghanouch', 'غنوش الشاطئ', 'غنوش الشاطئن'], 'المدرسة الإعدادية غنوش'),
    # Korba
    (['قربة', 'Korba', 'Qurbah'], 'المدرسة الإعدادية بقربة'),
    # Takelsa
    (['تاكلسة', 'Takelsa', 'Taklisa', 'بحاكلسة'], 'المدرسة الإعدادية بتاكلسة'),
    # Haffouz
    (['حفوز', 'Hafouz', 'حافوز'], 'المدرسة الإعدادية بحفوز'),
    # Nefida
    (['بالنفيضة', 'Nefida', 'Nfidha'], 'المدرسة الإعدادية البيروني بالنفيضة'),
    # El Mourouj
    (['المروج', 'مروج 2', 'Mourouj'], 'المدرسة الإعدادية المروج 2'),
    # El Aouina
    (['بالعوينة', 'Aouina'], 'المدرسة الإعدادية بالعوينة 2'),
    # Hay Ennour
    (['حي النور', 'Hay Ennour', 'حي النور'], 'المدرسة الإعدادية حي النور'),
    # Beni Khaled
    (['بني خالد', 'Beni Khaled'], 'المدرسة الإعدادية بني خالد'),
    # Bou Argoub
    (['بوعرقوب', 'Bou Arqoub'], 'المدرسة الإعدادية ببوعرقوب'),
    # Menzel Kamel
    (['منزل كامل', 'Menzel Kamel', 'Manzel'], 'المدرسة الإعدادية منزل كامل'),
    # Karkar
    (['بكركر', 'Karkar'], 'المدرسة الإعدادية بكركر'),
    # El Fahs
    (['الفحص', 'Fahs'], 'المدرسة الإعدادية ابن خلدون الفحص'),
    # Jilma
    (['جلمة', 'Jalma', 'Jilma'], 'المدرسة الإعدادية بجلمة'),
    # Sidi Bouzid
    (['سيدي بوزيد'], 'المدرسة الإعدادية بسيدي بوزيد'),
    # Bqalta
    (['البقالطة', 'بال بقالطة', 'ال بقالطة', 'البيقالة', 'البقالة'], 'المدرسة الإعدادية بالبقالطة'),
    # Ghazala
    (['الغزالة'], 'المدرسة الإعدادية بالغزالة'),
    # Hay Essalam
    (['حي السالمة', 'السلامة', 'السالمة'], 'المدرسة الإعدادية حي السالمة'),
    # Bkaltese
    (['بحاكلسة'], 'المدرسة الإعدادية بحاكلسة'),
    # Chabba
    (['الشبكة', 'بالشبكة', 'بالشب كة'], 'المدرسة الإعدادية بالشبكة'),
    # Bouzid
    (['الزارات', 'بالزارات'], 'المدرسة الإعدادية بالزارات'),
    # Naasan
    (['نعسان'], 'المدرسة الإعدادية نعسان'),
    # Bouhjar
    (['ببوحجر', 'بوحجر'], 'المدرسة الإعدادية ببوحجر'),
    # Zaouia Larab
    (['بزاوية العرب'], 'المدرسة الإعدادية بزاوية العرب'),
    # Souassi
    (['بالسواسي', 'السواسي'], 'المدرسة الإعدادية بالسواسي'),
    # Gabes
    (['بقابس'], 'المدرسة الإعدادية بقابس'),
    # Sousse
    (['بسوسة'], 'المدرسة الإعدادية بسوسة'),
    # Beja
    (['باجة'], 'المدرسة الإعدادية بباجة'),
    # Benbre
    (['بنبر', 'بنبرة'], 'المدرسة الإعدادية بنبرة'),
    # Dahmani
    (['الدهماني', 'دهماني'], 'المدرسة الإعدادية بالدهماني'),
    # Mknassi
    (['المكناسي'], 'المدرسة الإعدادية بالمكناسي'),
    # Shabikha
    (['الشبيكة'], 'المدرسة الإعدادية بالشبيكة'),
    # Jebiniana
    (['جبنيانة'], 'المدرسة الإعدادية بجبنيانة'),
    # Bouhjar
    (['بوعجر'], 'المدرسة الإعدادية بوعجر'),
    # Bouargoub
    (['بوعرب'], 'المدرسة الإعدادية بوعرب'),
    # Test
    (['ببنبلة'], 'المدرسة الإعدادية بببنبلة'),
    # Chambi
    (['الشعبي'], 'المدرسة الإعدادية الشعبي'),
    # North
    (['بالشمال'], 'المدرسة الإعدادية بالشمال'),
    # Ras Djebel
    (['رأس الجبل'], 'المدرسة الإعدادية رأس الجبل'),
    # Korbous
    (['قربص'], 'المدرسة الإعدادية قربص'),
    # Rafraf
    (['رفراف'], 'المدرسة الإعدادية رفراف'),
    # Kélibia
    (['قليبية'], 'المدرسة الإعدادية قليبية'),
    # Menzel Temime
    (['منزل تميم'], 'المدرسة الإعدادية منزل تميم'),
    # Hammam Sousse
    (['حمام سوسة'], 'المدرسة الإعدادية حمام سوسة'),
    # Sousse Riadh
    (['حي الرياض سوسة', 'حي الرياض'], 'المدرسة الإعدادية حي الرياض سوسة'),
    # Sousse Riadh
    (['نهج قسنطينة', 'قسنطينة', 'نهج قسنطينة سوسة'], 'المدرسة الإعدادية نهج قسنطينة سوسة'),
    # Ibn Khaldoun
    (['ابن عرفت', 'عبد الحميد'], 'المدرسة الإعدادية ابن عرفت سيدي عبد الحميد'),
    # Sidi Abdelhamid
    (['سعيدة', 'السعيدة'], 'المدرسة الإعدادية السعيدة'),
    # Tunis
    (['تونس'], 'المدرسة الإعدادية بتونس'),
    # Sfax
    (['صفاقس'], 'المدرسة الإعدادية بصفاقس'),
    # Bizerte
    (['بنزرت'], 'المدرسة الإعدادية بنزرت'),
    # Medenine
    (['مدنين'], 'المدرسة الإعدادية بمدنين'),
    # Tozeur
    (['توزر'], 'المدرسة الإعدادية بتوزر'),
    # Kebili
    (['قبلي'], 'المدرسة الإعدادية بقبلي'),
    # Tataouine
    (['تطاوين'], 'المدرسة الإعدادية بتطاوين'),
    # Kasserine
    (['القصرين'], 'المدرسة الإعدادية بالقصرين'),
    # Sidi Bouzid
    (['سيدي بوزيد'], 'المدرسة الإعدادية بسيدي بوزيد'),
    # Gafsa
    (['قفصة'], 'المدرسة الإعدادية بقفصة'),
    # Tozeur
    (['توزر'], 'المدرسة الإعدادية بتوزر'),
    # Siliana
    (['سليانة'], 'المدرسة الإعدادية بسليانة'),
    # Zaghouan
    (['زغوان'], 'المدرسة الإعدادية بزغوان'),
    # Kef
    (['الكاف'], 'المدرسة الإعدادية بالكاف'),
    # Béja
    (['باجة'], 'المدرسة الإعدادية بباجة'),
    # Jendouba
    (['جندوبة'], 'المدرسة الإعدادية بجندوبة'),
    # Bizerte
    (['بنزرت'], 'المدرسة الإعدادية ببنزرت'),
    # Ariana
    (['أريانة'], 'المدرسة الإعدادية بأريانة'),
    # Manouba
    (['منوبة'], 'المدرسة الإعدادية بمنوبة'),
    # Ben Arous
    (['بن عروس'], 'المدرسة الإعدادية ببن عروس'),
    # Nabeul
    (['نابل'], 'المدرسة الإعدادية بنابل'),
    # Zaghouan
    (['زغوان'], 'المدرسة الإعدادية بزغوان'),
    # Sousse
    (['سوسة'], 'المدرسة الإعدادية بسوسة'),
    # Monastir
    (['المنستير'], 'المدرسة الإعدادية بالمنستير'),
    # Mahdia
    (['المهدية'], 'المدرسة الإعدادية بالمهدية'),
    # Sfax
    (['صفاقس'], 'المدرسة الإعدادية بصفاقس'),
    # Gabes
    (['قابس'], 'المدرسة الإعدادية بقابس'),
    # Medenine
    (['مدنين'], 'المدرسة الإعدادية بمدنين'),
    # Tataouine
    (['تطاوين'], 'المدرسة الإعدادية بتطاوين'),
    # Test generic
    (['غير محدد', 'غير مذكور', 'غير معروف', 'Inconnu', 'N/A', 'Non spécifié', 'TunisieCollege', 'تونسي كوليج'], None),
]

PROF_MAPPING = [
    # RIDHA GHARBI
    (['رضا الغربي', 'رضا الغرن', 'رضا الغرن ال', 'رضا الغ', 'رضا ذوية', 'رضا الغرن زهير'], 'رضا الغربي'),
    (['الغربي', 'غربي', 'الغرني', 'الغريي', 'الغربيي'], 'الغربي'),
    (['فوزي الغربي', 'فوزي', 'فوزي الدبوس', 'فوزي الدبوسي', 'فوزي حيدري', 'فوشي', 'الغرسلي', 'الغرسيلي', 'الغري'], 'فوزي الغربي'),
    (['كمال الغربي', 'كمال جبراني', 'طيب الغربي', 'كمال'], 'كمال الغربي'),
    # SAMI ZAOUARI
    (['سامي الزواري', 'الزواري', 'الزوايا', 'سامي الزوري', 'الوزاري', 'الـزواري'], 'سامي الزواري'),
    # LOTFI family
    (['لطفي مثلوثي'], 'لطفي مثلوثي'),
    (['لطفي مطلوش', 'مطلوش', 'المطيبع', 'المطيع', 'المطيبي', 'المطبع', 'مطيبع', 'لطفي'], 'لطفي مطلوش'),
    (['لطفي بركالله', 'لطفي بركاهلل', 'بركا لله', 'بركاهلل', 'بركا هلل', 'بركالله', 'تركاهلل', 'بركا', 'بركة'], 'لطفي بركة الله'),
    # ZIED MAJRI
    (['زياد الماجري', 'الماجري', 'زياد الماج', 'زياد املاجري', 'زياد املاج', 'املاجري', 'املاج', 'زياد'], 'زياد الماجري'),
    (['زايد الماجري', 'زايد املاج', 'زايد املاجري', 'زايد'], 'زايد الماجري'),
    # MOHAMED BEN AMARA
    (['محمد بن عمارة', 'محم د بن عمارة', 'مكرم', 'مكرم الطرابلسي', 'الطرابلسي', 'محمد بن', 'محمد', 'محمد عمارة'], 'محمد بن عمارة'),
    # BEN ABBASIA
    (['بن عباسية', 'بن عبـاسية', 'بن عباسة', 'بن عبـاسية'], 'بن عباسية'),
    # NAJWA ALIANI
    (['نجوي العلاني', 'نجوي العالني', 'نجوي العلا', 'نجوي', 'العلاني', 'العالني'], 'نجوي العلاني'),
    # AHMED BEN ABDELKADER
    (['احمد بنعبد القادر', 'احمد بنعبدالقادر', 'عبدالعزيز بن مرزوق', 'عبد العزيز بن مرزوق', 'بنعبدالقادر', 'عبد القادر', 'حسين عبد القادر'], 'أحمد بن عبد القادر'),
    # AAMER
    (['عامر', 'عامري', 'عامر عامري'], 'عامر عامري'),
    # NACEUR
    (['ناصر', 'الناصر', 'عماد الناصر', 'عماد'], 'عماد الناصر'),
    # HAMDI ZANTOR
    (['حمدي الزنطور', 'الزنطور', 'زنطور', 'حميدي الزنطور', 'حمدي'], 'حمدي الزنطور'),
    # AMANA ALAI
    (['امنة العيادي', 'امنة', 'امنة الحلالي', 'امنة العي'], 'آمنة العيادي'),
    # ZAINAB
    (['زينب', 'زينب التكاري'], 'زينب'),
    # TEKERI
    (['التكاري', 'التكار'], 'التكاري'),
    # HAFSI
    (['الحفصي', 'سالم الحفصي', 'سالـم الحفصي', 'ســـالم الحفصي'], 'الحفصي'),
    # BOUCEFLA
    (['بلقاسم بوصة', 'بلقاسم بوصفة', 'بلقاسم'], 'بلقاسم بوصة'),
    # NIDHMI
    (['ناجح سويسي', 'ناجح'], 'ناجح سويسي'),
    # AYARI
    (['اياري', 'العياري', 'العيـاري', 'سالم العياري', 'سالم العيــــــاري', 'سالم العيـــــاري', 'سالم', 'عياري', 'ايعاري', 'العايدي', 'العيادي', 'العياير', 'سالم', 'سال', 'سالـم', 'ســـالم', 'العيـاري', 'العياري-العبيدي', 'العيـاري-العبيدي'], 'سالم العياري'),
    # ZOUFANI
    (['الزلفاني'], 'الزلفاني'),
    # WARTANI
    (['حسن الورتاني', 'حسن', 'الورتاني'], 'حسن الورتاني'),
    # ACHOURI
    (['محسن عاشوري', 'محسن', 'عاشوري'], 'محسن عاشوري'),
    # BOULERAS
    (['بولعراس'], 'بولعراس'),
    # CHAABANI
    (['حمادي الشعباني', 'الشعباني'], 'حمادي الشعباني'),
    # ABADI
    (['عبادي', 'العبادي'], 'عبادي'),
    # NADER CHAMA
    (['نادر شامة', 'شامة', 'نادر'], 'نادر شامة'),
    # WAAD
    (['وعد الشارني', 'وعد', 'الشارني'], 'وعد الشارني'),
    # GUEDHBI
    (['قحبيش', 'محمد قحبيش', 'محمد العادل قحبيش'], 'محمد قحبيش'),
    # RIDHA
    (['رضا', 'رضا الهمامي', 'رضا الزواري'], 'رضا'),
    # TAHER
    (['طاهر عثمان', 'طاهر', 'عثمان'], 'طاهر عثمان'),
    # HABIB BACCOUR
    (['الحبيب الشعبوني', 'الحبيب', 'الشعبوني'], 'الحبيب الشعبوني'),
    # SLAH FERJANI
    (['صالح الفرجاني', 'الفرجاني', 'صالح', 'صالح العلوي'], 'صالح الفرجاني'),
    # WASSIM
    (['وسام', 'وسام ناصري', 'وسام قرب'], 'وسام ناصري'),
    # HELA
    (['هالة بالحاج خليفة', 'هالة', 'دلندة المطيبع', 'دلندة'], 'هالة بالحاج خليفة'),
    # HOUNAYDA
    (['هندة شقرة', 'هندة'], 'هندة شقرة'),
    # SAMIA
    (['سامية بالطيب', 'سعاد', 'سعاد الرحيمي', 'سعاد'], 'سامية بالطيب'),
    # TAIEB
    (['الطيب المهيري', 'الطيب', 'الطيب'], 'الطيب المهيري'),
    # MOUNIR
    (['منير', 'منير عامر', 'منيرة', 'منيرة الرويسي'], 'منير عامري'),
    # WALID
    (['وليد'], 'وليد'),
    # FETHI
    (['فتحي', 'فتحي الخميري', 'فتحي'], 'فتحي الخميري'),
    # MOUFIDA
    (['مفيدة بورقيبة', 'مفيدة', 'بورقيبة', 'بورقي بة'], 'مفيدة بورقيبة'),
    # HEDI
    (['هادي بن سلطان', 'الهادي بن سلطان', 'الهادي سلطان', 'هادي بن سلطان', 'الهادي'], 'هادي بن سلطان'),
    # ABDELHAMID
    (['الههاددي العبيدي', 'الههددي العبيدي', 'الهادي العبيدي', 'اله ددي', 'اله ددي العبيدي', 'الههددي', 'الهــــــــــادي العبيدي', 'الفهاددي العبيدي'], 'الهادي العبيدي'),
    # RYADH
    (['رياض', 'رياض زعري', 'رياض زعيري', 'رياض كروطاو', 'رياض موسي', 'زعر', 'زعي', 'زعري', 'زعيري', 'زعيـر', 'الزعيـري', 'الزعيري'], 'رياض زعيري'),
    # JAMEL
    (['جمال الدين الوسالتي', 'جمال', 'جمال الدين'], 'جمال الدين الوسالتي'),
    # CHOKRI
    (['شكري', 'شكري الكافي'], 'شكري الكافي'),
    # HOUSSEM
    (['هشام', 'هشام الخش', 'هشام الخشين', 'هشام فوزاعي'], 'هشام الخشين'),
    # FETHI KHMIRI
    (['فتحي الخميري', 'طارق الخميري', 'الخميري', 'الخماسي', 'ليلي الخماسي'], 'فتحي الخميري'),
    # JAMEL BACCOUR
    (['جلال', 'جلال القفصي', 'جلال المعز', 'جلال عمامرية'], 'جلال القفصي'),
    # MONGI
    (['المنجي الصائم', 'المنجي الصالح', 'الصائم', 'الصائم المنج', 'الصائم المنجي', 'المةجي الصائم'], 'المنجي الصائم'),
    # TOUFFIK
    (['توفيق'], 'توفيق'),
    # ANOUAR
    (['انور', 'انور العوني', 'انور عرابية', 'انـور العوني', 'انـور العـونـي', 'الـعـونـي', 'العونـي', 'العوني'], 'أنور العوني'),
    # MOEZ
    (['معز', 'معز حمداوي', 'معز اصميطي'], 'معز أصميطي'),
    # MAHER
    (['ماهر', 'ماهر خليفي', 'ماهر الرياحي', 'ماهرالخل ف', 'انيس خليفي', 'خليفي', 'مراد الخليفي'], 'ماهر خليفي'),
    # AYARI ABIDI
    (['اياري - عبيدي', 'اياري-عبيدي', 'العيـاري-العبيدي', 'العياري-العبيدي'], 'العياري والعبيدي'),
    # NOUREDDINE
    (['نور الدين الكامل', 'نور الدين'], 'نور الدين الكامل'),
    # KHALED
    (['خالد', 'خالد بوشريحة'], 'خالد بوشريحة'),
    # YOSRA
    (['يسرا', 'يسر ديسم'], 'يسرا'),
    # YOUNES
    (['يونس'], 'يونس'),
    # HEDI
    (['محمد الهادي غزالة'], 'محمد الهادي غزالة'),
    # HOUCINE
    (['حسين'], 'حسين'),
    # HICHEM
    (['حاتم', 'هيثم'], 'حاتم'),
    # SABRINE
    (['سابرين', 'صبرين'], 'صبرين'),
    # ASMA
    (['اسماء'], 'اسماء'),
    # KHOULOUD
    (['خلود'], 'خلود'),
    # MAHA
    (['مها'], 'مها'),
    # RANIA
    (['رانية'], 'رانية'),
    # AMIRA
    (['اميرة'], 'اميرة'),
    # IBTIHAL
    (['ابتهال'], 'ابتهال'),
    # NADA
    (['ندى'], 'ندى'),
    # SARAH
    (['سارة', 'سارا'], 'سارة'),
    # RAWAN
    (['روان'], 'روان'),
    # MARYEM
    (['مريم'], 'مريم'),
    # FATMA
    (['فاطمة', 'فطومة'], 'فاطمة'),
    # SOUMAYA
    (['سمية'], 'سمية'),
    # NIDHAL
    (['نضال'], 'نضال'),
    # NIHEL
    (['نهيل', 'نبي', 'نبيـل'], 'نهيل'),
    # IKRAM
    (['إكرام'], 'إكرام'),
    # ANIS
    (['أنيس', 'انيس'], 'أنيس'),
    # WALID
    (['وليد'], 'وليد'),
    # HOUSSEM JR
    (['حسام'], 'حسام'),
    # TAHER
    (['طاهر'], 'طاهر'),
    # Test generic (these mean no real prof found)
    (['غير محدد', 'غير مذكور', 'غير معروف', 'Inconnu', 'N/A', 'Non spécifié', 'TunisieCollege', 'تونسي كوليج'], None),
]


# =================== NORMALIZATION ===================

def normalize_ar(text):
    if not text: return ''
    s = str(text)
    s = re.sub(r'[إأآٱ]', 'ا', s)
    s = re.sub(r'ى', 'ي', s)
    s = re.sub(r'[\u064B-\u0652\u0670\u0656-\u065F]', '', s)
    s = re.sub(r'^اال', 'ال', s)
    s = re.sub(r'\s+اال', ' ال', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def fix_year_inversion(year):
    """Fix years like '2015-2014' → '2014-2015' (wrong order)."""
    if not year: return year
    m = re.match(r'^(\d{4})-(\d{4})$', year)
    if m:
        y1, y2 = int(m.group(1)), int(m.group(2))
        # If second < first by 1, swap (typo)
        if y1 > y2 and y1 - y2 == 1:
            return f'{y2}-{y1}'
    return year


def map_type_canonical(staging_type):
    """Map AI types to live DB types (live uses EXERCISE not EXERCICE)."""
    mapping = {
        'EXERCICE': 'EXERCISE',
        'EXAMEN': 'DEVOIR',  # Group test/synthese under DEVOIR for consistency
        'RESUME': 'SUMMARY',
        'COURSE': 'COURSE',
        'DEVOIR': 'DEVOIR',
    }
    return mapping.get(staging_type, staging_type)


def apply_mapping(text, mapping):
    """Find the canonical form using mapping patterns. Returns None if should be removed."""
    if not text: return None
    s = normalize_ar(text)
    if not s: return None
    best = None
    best_len = 0
    for patterns, canonical in mapping:
        for p in patterns:
            if p in s and len(p) > best_len and len(p) >= 3:
                best = canonical
                best_len = len(p)
    return best


# =================== MAIN ===================

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=20, help='Max resources to process')
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--class', dest='class_filter', help='Filter by class (7eme/8eme/9eme)')
    ap.add_argument('--apply', action='store_true', help='Actually update live DB (default: dry-run)')
    ap.add_argument('--content', action='store_true', help='Also apply ResourceContentStaging (Tesseract text)')
    args = ap.parse_args()

    dry_run = not args.apply

    # Build filter
    class_filter = ''
    if args.class_filter:
        class_filter = f"AND c.slug = '{args.class_filter}'"

    # Get staging records + live records
    sql = f"""
    SELECT
      rms.id as staging_meta_id,
      r.id as resource_id,
      r."numericId",
      r.title as live_title,
      r.type as live_type,
      r.year as live_year,
      r."schoolName" as live_school_ar,
      r."teacherNameAr" as live_teacher_name_ar,
      rms.subject as staging_subject,
      rms.type as staging_type,
      rms."academicYear" as staging_year,
      rms."profLastNameAr" as staging_prof_ar,
      rms."profLastName" as staging_prof_fr,
      rms."schoolNameAr" as staging_school_ar,
      rms."schoolName" as staging_school_fr,
      rms.subject as staging_subject_clean,
      rms.confidence
    FROM "ResourceMetadataStaging" rms
    JOIN "Resource" r ON r.id = rms."resourceId"
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    WHERE rms."isApplied" = false
      AND s.slug = 'mathematiques'
      AND c.slug IN ('7eme','8eme','9eme')
      {class_filter}
    ORDER BY r."numericId"
    LIMIT {args.limit} OFFSET {args.offset}
    """
    result = neon_query(sql)
    if not result.get('response') or not result['response'][0].get('data', {}).get('rows'):
        print('No staging records found.')
        return

    rows = result['response'][0]['data']['rows']
    print(f'\n{"="*80}')
    print(f'{"DRY-RUN" if dry_run else "*** APPLY ***"}: {len(rows)} Math collège resources')
    print(f'{"="*80}\n')

    changes = []
    unchanged = 0
    errors = 0

    for row in rows:
        (meta_id, rid, nid, live_title, live_type, live_year, live_school_ar,
         live_teacher_name_ar,
         staging_subject, staging_type, staging_year,
         staging_prof_ar, staging_prof_fr, staging_school_ar, staging_school_fr,
         subject, confidence) = row

        # Compute canonical values
        canonical_school = apply_mapping(staging_school_ar, SCHOOL_MAPPING)
        canonical_prof = apply_mapping(staging_prof_ar, PROF_MAPPING)
        canonical_year = fix_year_inversion(staging_year) if staging_year else None

        # Decide what to update (PRUDENT MODE: only update if live is NULL/empty)
        updates = {}

        # 1. School: ONLY update if live is empty/NULL (never overwrite existing data)
        if (canonical_school
            and canonical_school != live_school_ar
            and (not live_school_ar or str(live_school_ar).strip() == '')):
            updates['schoolName'] = canonical_school

        # 2. Year: ONLY update if live is empty/NULL (never overwrite existing year)
        if (canonical_year
            and canonical_year != live_year
            and (not live_year or str(live_year).strip() == '')
            and confidence and float(confidence) > 0.7):
            updates['year'] = canonical_year

        # 3. teacherNameAr: ONLY update if live is empty/NULL
        # (New field — no FK to User, just display/SEO info)
        # SAFETY: only apply if canonical prof has both first + last name (a space).
        # A bare last name like "الغربي" is ambiguous (Ridha? Fouzi? Kamal?).
        # Better to leave it empty and let the AI card fall back to teacher.firstNameAr/lastNameAr.
        prof_has_full_name = canonical_prof and ' ' in canonical_prof.strip() and len(canonical_prof.strip()) >= 7
        if (prof_has_full_name
            and canonical_prof != live_teacher_name_ar
            and (not live_teacher_name_ar or str(live_teacher_name_ar).strip() == '')):
            updates['teacherNameAr'] = canonical_prof

        # 4. Type: NOT TOUCHED (user said: laisser tel quel)
        # Type stays as live, we don't update it.

        # Display
        print(f'━━━ #{nid} ━━━')
        print(f'  Title:  {(live_title or "")[:80]}')
        skipped = []
        if updates:
            for field, new_val in updates.items():
                old_val = {
                    'schoolName': live_school_ar,
                    'year': live_year,
                    'teacherNameAr': live_teacher_name_ar,
                }.get(field)
                print(f'  ✏️  {field}: {old_val!r} → {new_val!r}  (live was empty)')
            changes.append((rid, updates))
        else:
            unchanged += 1

        # Show why things were skipped
        if canonical_school and canonical_school == live_school_ar:
            skipped.append(f'school already = "{canonical_school}"')
        elif canonical_school and (live_school_ar and str(live_school_ar).strip() != ''):
            skipped.append(f'school live already set: "{live_school_ar}" (would overwrite but PRUDENT mode)')
        if canonical_year and canonical_year == live_year:
            skipped.append(f'year already = "{canonical_year}"')
        if canonical_prof and canonical_prof == live_teacher_name_ar:
            skipped.append(f'prof already = "{canonical_prof}"')
        elif canonical_prof and (live_teacher_name_ar and str(live_teacher_name_ar).strip() != ''):
            skipped.append(f'prof live already set: "{live_teacher_name_ar}" (PRUDENT mode)')
        elif canonical_prof and not prof_has_full_name:
            skipped.append(f'prof "{canonical_prof}" is just last name (ambiguous, skip)')

        if skipped:
            print(f'  ⏭️  Skipped: {"; ".join(skipped)}')
        elif not updates:
            print(f'  ✓ No change needed (already canonical or low confidence)')

        if canonical_prof:
            print(f'  👤 Prof (canon): {canonical_prof}  (raw: {(staging_prof_ar or "")[:30]!r})')
        if canonical_school:
            print(f'  🏫 École (canon): {canonical_school}  (raw: {(staging_school_ar or "")[:30]!r})')
        if canonical_year:
            print(f'  📅 Year (canon): {canonical_year}  (raw: {(staging_year or "")[:20]!r})')
        print()

    print(f'\n{"="*80}')
    print(f'SUMMARY (MODE PRUDENT: only fill empty live values)')
    print(f'{"="*80}')
    print(f'  Resources processed:     {len(rows)}')
    print(f'  Would change:            {len(changes)}  (live was empty)')
    print(f'  Unchanged (no update):   {unchanged}')
    print(f'  Errors:                  {errors}')

    if dry_run:
        print(f'\n  → Run with --apply to write to live DB')
    else:
        print(f'\n  Writing to live DB...')
        for rid, updates in changes:
            if not updates: continue
            set_clause = ', '.join(f'"{k}" = ${i+2}' for i, k in enumerate(updates.keys()))
            params = [rid] + list(updates.values())
            sql = f'UPDATE "Resource" SET {set_clause} WHERE id = $1'
            # Build dynamic update
            set_parts = []
            for i, (k, v) in enumerate(updates.items()):
                if v is None:
                    set_parts.append(f'"{k}" = NULL')
                else:
                    v_esc = str(v).replace("'", "''")
                    set_parts.append(f'"{k}" = \'{v_esc}\'')
            set_clause = ', '.join(set_parts)
            update_sql = f'UPDATE "Resource" SET {set_clause} WHERE id = \'{rid}\''
            try:
                r = neon_query(update_sql)
                # Mark staging as applied
                mark_sql = f'UPDATE "ResourceMetadataStaging" SET "isApplied" = true WHERE "resourceId" = \'{rid}\''
                neon_query(mark_sql)
                print(f'  ✓ #{rid[:8]}... updated')
            except Exception as e:
                print(f'  ❌ #{rid[:8]}... error: {e}')
                errors += 1
        print(f'\n  Done! Marked {len(changes)} staging records as applied.')


if __name__ == '__main__':
    main()
