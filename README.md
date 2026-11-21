---
title: "Little Minds AI: Human vs. Machine"
emoji: 🎨
colorFrom: yellow
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Compete with a deep learning model on children's drawings
---

# Little Minds AI: Human vs. Machine Gallery

> ## تحديث الواجهة: هوية العرض التقديمي + العربية
>
> - **الاسم والشخصية:** اسم اللعبة **شخبط وخمّن!**، والعنوان الفرعي «كل رسمة وراها حكاية… تقدر تخمّنها قبل هيا؟». الشخصية المرافقة (Pip سابقاً، في `static/js/pip.js`) اسمها الآن **هيا**، بالشكل والحركات والسلوك نفسها. كل النصوص تذكّر بأن هيا تخمّن فئة الرسمة في البيانات، لا مشاعر الطفل.
> - **الألوان:** لوحة ألوان الموقع مأخوذة الآن من العرض التقديمي "From Crayons to Intelligence" (الورق `#F8F3E9`، والحبر `#1D2232`، والمرجاني `#E88E85`/`#E8574A`، والخزامى `#AFA1D1`/`#7B62B8`، والشمس `#F5C75E`/`#F2B705`، والمريمية `#78B79B`/`#4FA35A`، والسماء `#75BBD2`/`#3D8FD1`). التصميم والرسوم وPip والحركات كما هي. ألوان أقلام الرسم في المرسم **لم تتغير**، لأنها تحدد البكسلات التي يستقبلها النموذج.
> - **العربية:** كل النصوص الظاهرة مترجمة، والصفحة `dir="rtl"`. التخطيط العام (الشريط العلوي، ومنصة التحدي، والمرسم، والكتاب، والمبارزة، والمخططات) محفوظ كما كان، والنص وحده يُقرأ من اليمين. قيم الفئات الداخلية (`Happiness`/`Sadness`) ومسارات API لم تتغير؛ تُترجم للعرض فقط (`labelAr` في `static/js/game.js`). رسائل الخادم الإنجليزية تُترجم في الواجهة (`static/js/api.js`) دون تعديل الخادم.
> - **الخط:** خط **IBM Plex Sans Arabic** للنصوص العربية كلها (الأوزان 300 إلى 700)، من `static/fonts/ibm-plex-sans-arabic/`. الخط مقيّد بالحروف العربية (`unicode-range`)، فيبقى اسم Little Minds AI والأرقام والمصطلحات التقنية بالخطوط الأصلية المرسومة باليد.
>   الخط مفتوح المصدر بترخيص **SIL Open Font License 1.1**؛ نص الرخصة وإشعار حقوق IBM في `static/fonts/ibm-plex-sans-arabic/OFL.txt` وفي `THIRD_PARTY_NOTICES.md`، فيمكن نشره علناً مع الموقع.
> - **نسخة احتياطية:** الملفات الأصلية قبل التعديل في `_original_frontend_backup/`.
> - **الملفات المعدلة:** `static/index.html`، و`static/css/main.css`، و`static/js/{app,api,game,doodle,sketch}.js`، و`static/img/favicon.svg`، و`tests/test_game.mjs`، و`tests/ui_smoke.py` (نصوص التحقق فقط). مجلد `app/` والنموذج لم يتغيرا.
>
> ### التشغيل على macOS
>
> ```bash
> cd kids
> python3 -m venv .venv && source .venv/bin/activate
> pip install -r requirements.txt
> # مرة واحدة: بناء المعرض من صور الاختبار المرفقة (20 من كل فئة + تخزين تنبؤات النموذج)
> python scripts/build_gallery.py --test-dir kido_test --per-class 20 --model model/final_model.keras --force
> uvicorn app.main:app --port 7860
> # ثم افتح http://localhost:7860
> ```

معرض فني رقمي تفاعلي يتنافس فيه الزائر مع نموذج Deep Learning الذي دربناه (MobileNetV2 مع fine-tuning) على تصنيف رسومات أطفال من بيانات KIDO إلى **Happiness** أو **Sadness**.

> النموذج يتنبأ **بفئة الرسمة في البيانات** (الموضوع الذي طُلب من الطفل رسمه)، ولا يعرف شعور الطفل. هذا ليس تشخيصاً نفسياً.

---

## 0. ما الذي اختُبر فعلاً وما الذي لم يُختبر

| الجزء | الحالة |
|---|---|
| منطق اللعبة والنتائج (`game.js`) | ✅ اختُبر (`node tests/test_game.mjs`) |
| المعالجة المسبقة للرفع: خلفية بيضاء بدل الشفافة، واتجاه EXIF، ورفض الملفات غير الصالحة | ✅ اختُبر (`pytest`) |
| قواعد الجلسات: التسمية مخفية، وإجابة واحدة لكل جولة، وكل رسمة مرة واحدة، وتوازن الفئتين | ✅ اختُبر (`pytest`) |
| الواجهة كاملة في متصفح حقيقي (desktop + mobile): 10 جولات، والنتيجة النهائية، والاستوديو، ووضع المعرض | ✅ اختُبرت بـ Playwright، مع ردود API تجريبية ثابتة |
| طبقة FastAPI (`tests/test_api.py`) | ⚠️ مكتوبة، لكنها لم تُشغَّل في بيئة البناء لعدم توفر FastAPI فيها. شغّلوها عندكم |
| **النموذج الحقيقي `final_model.keras`** | ❌ **لم يُختبر.** الملف لم يكن مرفقاً، وTensorFlow غير متوفر في بيئة البناء. الـ parity test جاهز لتشغّلوه أنتم (القسم 2) |
| النشر على Hugging Face | ❌ لم يُنشر. الخطوات في القسم 5 |

---

## الهوية البصرية: "رسمة طفل تدبّ فيها الحياة"

- **المواد:** ورق بملمس حبيبي، وتظليل بأقلام ملونة (SVG hatch patterns)، وحواف crayon محببة (فلتر `#crayon`)، وخطوط مهتزة كأنها مرسومة باليد (`#wobble`، و`doodle.js` يرسم حدود الأزرار والبطاقات بخطوط sketchy).
- **Pip (`static/js/pip.js`):** رفيق أصلي على شكل كرة مرسومة بالقلم، فوق رأسه هوائي بشرارة. حالاته: idle، thinking، confident، unsure، happy، oops، celebrate. حالته تتبع **الرد الحقيقي** من الخادم: يظهر متردداً (unsure) عندما تكون الدرجة قريبة من 0.5، ويفرح أو يعتذر حسب صحة تنبؤه. ملامحه تعبّر عن حالته هو، لا عن موضوع الرسمة.
- **قرار مسؤول:** بطاقتا Happiness وSadness بنفس لون الورق ونفس الحبر، فلا لون يوحي بأنه "لون الفرح" أو "لون الحزن".
- **الخطوط:** Shantell Sans للعناوين والواجهة، وCaveat للملاحظات المكتوبة باليد، وInter للنصوص الطويلة. تُحمَّل من Google Fonts، وبدون إنترنت تظهر خطوط بديلة ويبقى التصميم يعمل.
- **إمكانية الوصول:** مع `prefers-reduced-motion` تتوقف الحركات وتظهر الرسوم مكتملة فوراً.

## 1. البنية ببساطة

```
المتصفح (HTML/CSS/JS)  ──►  FastAPI (Python)  ──►  final_model.keras (TensorFlow)
        ▲                         │
        └──── صفحة الموقع ────────┘   ← خدمة واحدة، ورابط واحد، ومنفذ 7860
```

- **الواجهة** (`static/`): HTML وCSS وJavaScript عادي. لا React ولا build step، فلا شيء معقد لتتعلموه.
- **الخادم** (`app/`): FastAPI يقدّم الصفحة ويستقبل طلبات التنبؤ.
- **النموذج** يُحمَّل مرة واحدة عند التشغيل.
- **الاستضافة**: Hugging Face Spaces (Docker) مجاناً.

### المعالجة المسبقة (مطابقة للـ notebook، الخليتان 37 و40)

```
decode_image(channels=3) → resize إلى (180, 256) → ÷ 255   ⟵ القيم بين 0 و1
داخل النموذج: Rescaling(2, -1) → MobileNetV2 → GAP → Dropout → Dense(sigmoid)
p = مخرج sigmoid = Sadness score  ·  p > 0.5 → Sadness  ·  Happiness score = 1 − p
```

- **لا نستدعي** `mobilenet_v2.preprocess_input`، لأن النموذج يحتوي طبقة Rescaling أصلاً.
- صور المعرض تدخل النموذج **بايت ببايت** كما في الـ notebook.
- الصور المرفوعة في الاستوديو تُنظَّف أولاً بـ Pillow:
  - تُلصق الشفافية على خلفية **بيضاء**، لأن `decode_image(channels=3)` يحوّل الشفاف إلى أسود.
  - يُطبَّق اتجاه EXIF وتُحذف البيانات الوصفية.
  - بعدها تمر بنفس دالة الـ notebook.

---

## 2. تجهيز النموذج والمعرض واختبار التطابق (الأسهل في Kaggle)

افعلوا هذا في **نفس الـ notebook على Kaggle** الذي درّبتم فيه، لأن فيه البيانات ونفس نسخة TensorFlow.

**أ) سجّلوا ما يتنبأ به الـ notebook:** بعد آخر خلية، الصقوا محتوى `scripts/notebook_parity_cell.py` في خلية جديدة وشغّلوها. ستُنشئ `parity_reference.json`، وتطبع نسخة TensorFlow (ضعوها في `requirements.txt` إن اختلفت عن 2.20.0).

**ب) ارفعوا ملف المشروع إلى Kaggle:** Add Input ← Upload ← ملف `little-minds-ai.zip`. ثم في خلية:

```python
!cp -r /kaggle/input/<اسم-الرفع>/little-minds-ai /kaggle/working/app_repo
%cd /kaggle/working/app_repo
!mkdir -p model && cp /kaggle/working/final_model.keras model/

# اختبار التطابق
!python scripts/parity_test.py --reference /kaggle/working/parity_reference.json \
    --test-dir "{EMOTION_DIR}/test" --model model/final_model.keras

# بناء المعرض (20 رسمة من كل فئة من الـ test set + تخزين تنبؤات النموذج الحقيقية)
!python scripts/build_gallery.py --test-dir "{EMOTION_DIR}/test" --per-class 20 \
    --model model/final_model.keras --force
```

النتيجة المطلوبة من اختبار التطابق: `RESULT: PASS ✅`. معناها أن أقصى فرق أقل من `1e-4` وأن التسميات متطابقة 100%.

**ج) راجعوا الصور:** افتحوا `gallery/review.html` واحذفوا أي صورة يظهر فيها اسم طفل أو مدرسة أو أي معلومة شخصية (احذفوا ملف الصورة نفسه، والتطبيق يتجاهل الناقص تلقائياً).

**د) نزّلوا المجلدين:** `model/` و`gallery/` من `/kaggle/working/app_repo` إلى نسختكم من المشروع.

> قاعدة علمية: صور المعرض من الـ test set. **لا تستخدموا نتائج اللعب لتعديل النموذج أو اختياره.**

---

## 3. ⚠️ ترخيص KIDO: تحققوا قبل النشر العلني

لم أستطع التأكد من الرخصة: صفحة Kaggle لم تكن متاحة لي، وصفحة البيانات على Hugging Face لا تذكر رخصة وتطلب الاستشهاد بالورقة فقط. لذلك **لم نفترض أن نشر الصور علناً مسموح**.

1. افتحوا صفحة البيانات على Kaggle وانظروا إلى خانة **License** في الشريط الجانبي.
2. حسب ما تجدون:
   - **رخصة تسمح بإعادة النشر (مثل CC BY 4.0):** انشروا Space عاماً، والاستشهاد موجود أصلاً في تذييل الموقع.
   - **لا رخصة، أو رخصة تمنع إعادة النشر:** اختاروا أحد البديلين:
     - **Space خاص (Private):** يراه فريقكم ومدربوكم فقط عبر حساباتهم.
     - **التشغيل محلياً على لابتوب العرض** (القسم 4)، والصور لا تغادر الجهاز.
3. **بديل مستقل تماماً:** "معرض المجتمع". رسومات من متطوعين وافقوا، وكل صاحب رسمة يحدد الموضوع الذي قصده. ضعوها في `community/Happiness/` و`community/Sadness/` ثم شغّلوا:
   ```bash
   python scripts/build_gallery.py --test-dir community --per-class 10 \
       --model model/final_model.keras --source "Little Minds community set (not KIDO)" --force
   ```
   الموقع سيعرض اسم المصدر الصحيح، ولا تقدّموا نتائجه كأنها دقة KIDO.

---

## 4. التشغيل على جهازك

### الطريقة 1: بدون Docker (الأسهل للتجربة)

```bash
cd little-minds-ai
python -m venv .venv
# Windows:  .venv\Scripts\activate
# Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 7860
```

افتحوا **http://localhost:7860**. الشارة أعلى يمين الصفحة يجب أن تقول **Live model**.

### الطريقة 2: Docker

```bash
docker build -t little-minds .
docker run -p 7860:7860 little-minds
```

### الاختبارات

```bash
pip install -r requirements-dev.txt
python -m pytest tests -q          # الخادم والمعالجة المسبقة والجلسات
node tests/test_game.mjs           # منطق النقاط
playwright install chromium && python tests/ui_smoke.py   # جولة كاملة في المتصفح + صور شاشة
```

---

## 5. النشر على Hugging Face Spaces (مجاناً)

1. أنشئوا حساباً على huggingface.co.
2. **New Space**:
   - Name: `little-minds-ai`
   - SDK: **Docker** ← Blank
   - Hardware: **CPU basic (free)**
   - Visibility: **Private** (حتى تتأكدوا من الرخصة، القسم 3)
3. **ارفعوا الملفات من المتصفح** (لا تحتاجون git): Files ← Add file ← Upload files، واسحبوا محتوى مجلد المشروع كله (`app/`، `static/`، `model/`، `gallery/`، `Dockerfile`، `requirements.txt`، `README.md`، ...). الرفع من المتصفح يتعامل مع ملف النموذج الكبير تلقائياً.
4. انتظروا تبويب **Logs** حتى يظهر `Model loaded` و`Application startup complete`. أول بناء يأخذ 5-10 دقائق بسبب TensorFlow.
5. افتحوا الـ Space وتأكدوا أن الشارة **Live model**.

**بديل git (اختياري):**
```bash
git lfs install
git clone https://huggingface.co/spaces/<USERNAME>/little-minds-ai
# انسخوا ملفات المشروع داخل المجلد، ثم:
git add . && git commit -m "Little Minds AI" && git push
```
(`.gitattributes` يجعل `*.keras` يُرفع عبر Git LFS تلقائياً.)

> **قبل العرض بـ 10 دقائق:** افتحوا الرابط. الـ Space المجاني ينام بعد فترة خمول، ويحتاج دقيقة ليستيقظ.

---

## 6. الإعدادات (Environment variables)

| المتغير | الافتراضي | المعنى |
|---|---|---|
| `PREDICTION_SOURCE` | `auto` | `auto`: النموذج الحي إن وُجد، وإلا التنبؤات المخزنة · `live`: الحي فقط · `cached`: المخزنة فقط (**وضع العرض الآمن**) |
| `MODEL_PATH` | `model/final_model.keras` | مسار النموذج |
| `GALLERY_DIR` | `gallery` | مجلد المعرض |
| `ROUNDS_PER_GAME` | `10` | عدد الجولات |
| `MAX_UPLOAD_MB` | `8` | أقصى حجم للرفع |

في Hugging Face: Settings ← Variables.

**وضع العرض الآمن:**
- التنبؤات "المخزنة" (cached) **حقيقية**: حسبها `final_model.keras` نفسه أثناء بناء المعرض. وليست عشوائية.
- الموقع يكتب بوضوح في كل جولة إن كانت *Live inference* أو *Cached real prediction*.
- الاستوديو يحتاج النموذج الحي دائماً، ولا يعرض تنبؤات وهمية أبداً.

---

## 7. وضع المعرض (Exhibition Mode) وسيناريو العرض

اضغطوا **Exhibition Mode** أعلى الصفحة، أو افتحوا `/?exhibition=1#/challenge`. الوضع:
- يفتح ملء الشاشة ويكبّر الخطوط.
- يخفي التشتيت.
- يفعّل لوحة المفاتيح: `H` فرح، `S` حزن، `Enter` للتثبيت ثم للتالي، `Esc` للخروج.

**سيناريو 2-3 دقائق:**

| الوقت | ماذا نفعل |
|---|---|
| 0:00-0:20 | صفحة الدخول (الأبواب تُفتح). "هل ترى ما يراه الذكاء الاصطناعي؟" |
| 0:20-1:10 | **Enter the Gallery**. متطوع من الجمهور يختار في جولتين أو ثلاث، والقاعة كلها ترى الكشف: إجابته، ثم تنبؤ النموذج، ثم التسمية الأصلية |
| 1:10-1:40 | أكملوا بقية الجولات بسرعة بلوحة المفاتيح. يمكن تجهيز لعبة مكتملة مسبقاً في تبويب آخر |
| 1:40-2:10 | **The Final Verdict**: النتيجة، والجدول الزمني، ورسالة "10 رسومات لا تقيس الدقة الحقيقية، 70.53% على 1,632 رسمة" |
| 2:10-2:40 | **AI Art Studio**: ارسموا رسمة سريعة أو ارفعوا واحدة جاهزة، واشرحوا ماذا يعني الرقم |
| 2:40-3:00 | **Behind the AI**: لقطة سريعة لتجارب الألوان والحدود. الخاتمة: "النموذج يقرأ الرسمة، لا الطفل" |

**خطة احتياط:**
- شغّلوا نسخة محلية على اللابتوب (القسم 4) مع `PREDICTION_SOURCE=cached` إذا ضعف الإنترنت.
- سجّلوا فيديو للعرض كاحتياط أخير.

---

## 8. الخصوصية والذكاء الاصطناعي المسؤول

- الصور المرفوعة تُعالج **في الذاكرة فقط**: لا تُحفظ على القرص، ولا يُسجَّل محتواها في السجلات (`"stored": false`).
- قبل التحليل:
  - يُتحقق من نوع الملف بمحتواه، لا بامتداده.
  - الحد 8 MB و40 مليون بكسل.
  - تُحذف بيانات EXIF/GPS.
- صور المعرض:
  - تُقدَّم بمعرّفات مجهولة (`g001`). أسماء ملفات KIDO الأصلية فيها أرقام الطلاب ولا تظهر أبداً.
  - لا وصول لأي ملف خارج `gallery/images/`.
- التسمية الأصلية لا تُرسل للمتصفح قبل تثبيت الإجابة، والخادم يفرض هذا. إجابة الزائر لا تُمرَّر للنموذج أبداً.
- الموقع لا يدّعي تشخيصاً، ولا يقدّم الرقم كاحتمال صحة، ولا ينسب معنى لألوان أو أشكال معينة.

---

## 9. حل المشاكل

| المشكلة | الحل |
|---|---|
| الشارة تقول **Model offline** | افتحوا `/api/health` واقرأوا `model.error`. غالباً الملف ليس في `model/`، أو نسخة TensorFlow/Keras مختلفة عن نسخة التدريب |
| `Could not load model ... keras` | ضعوا في `requirements.txt` نفس نسخة TensorFlow التي طبعتها خلية الـ parity |
| **Parity test فشل** | ١) تأكدوا من تطابق نسخة TF. ٢) لا تعدّلوا `app/preprocessing.py`. ٣) فروق أقل من `1e-3` مع تسميات متطابقة سببها غالباً اختلاف نسخ المكتبات، وليست مشكلة في المعالجة |
| `The gallery isn't installed` | شغّلوا `build_gallery.py` (القسم 2) |
| الـ Space بطيء أول مرة | كان نائماً. انتظروا دقيقة |

---

## 10. هيكل المشروع

```
little-minds-ai/
├── app/                    # FastAPI backend
│   ├── main.py             # المسارات: /api/health, /api/gallery/*, /api/predict, والصفحة
│   ├── preprocessing.py    # مطابق للـ notebook + تنظيف الرفع + تفسير الدرجة
│   ├── inference.py        # تحميل final_model.keras والتنبؤ
│   ├── gallery.py          # manifest + جلسات اللعب وقواعد العدالة
│   └── config.py           # الإعدادات
├── static/                 # الواجهة (HTML/CSS/JS)
│   ├── index.html
│   ├── css/main.css
│   └── js/ app.js · api.js · game.js · sketch.js · doodle.js · pip.js
├── model/                  # ← ضعوا final_model.keras هنا
├── gallery/                # ← يملؤه build_gallery.py
├── scripts/
│   ├── notebook_parity_cell.py   # يُلصق في الـ notebook
│   ├── parity_test.py            # مقارنة التطبيق بالـ notebook
│   └── build_gallery.py          # بناء المعرض من الـ test set
├── tests/                  # pytest + node + Playwright
├── docs/screenshots/       # لقطات من اختبار الواجهة (رسومات تجريبية، ليست من KIDO)
├── Dockerfile · requirements.txt · README.md
```

---

**Dataset citation:** S. Çiftçi et al., "Emotion Analysis of Children's Drawings," *IEEE Access*, vol. 13, pp. 159730-159748, 2025. doi:10.1109/ACCESS.2025.3606359
