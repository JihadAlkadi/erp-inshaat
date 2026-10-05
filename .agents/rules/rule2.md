---
trigger: always_on
---

# 30. Authentication وAuthorization

افصل المفهومين:

```text
Authentication = من المستخدم؟
Authorization = ماذا يستطيع؟
```

الجلسات لكل جهاز تكون مستقلة.

- تُحفظ جلسات المصادقة بشكل دائم في جدول `system_session`.
- يُمنع تخزين الـ Tokens الخام (Raw Tokens / Raw JWT) داخل قاعدة البيانات نهائيًا، بل يُخزن فقط الـ Hash الخاص بها (`token_hash`).
- يمكن للمستخدم الواحد امتلاك عدة جلسات متزامنة نشطة.
- تخضع صلاحية الجلسة لحالتها (`is_active` و `revoked_at` و `expires_at`).
- تُمنع العلاقات التلقائية `eager: true` على كيانات الجلسات.
- حماية CSRF المرتبطة بالجلسة (Session-Bound CSRF Protection):
  - يبقى الـ JWT محمياً داخل `HttpOnly` Cookie ولا يُعرض نهائياً لبيئة JavaScript.
  - رمز الـ CSRF مستقل تماماً عن الـ JWT، غير مخزن في قاعدة البيانات، ومشتق عبر HMAC-SHA256 بمفتاح مخصص `AUTH_CSRF_SECRET` (يختلف وجوباً عن `AUTH_JWT_SECRET`) مع معرف الجلسة `sessionId`.
  - التحقق من الـ CSRF يتم عبر مدقق مركزي وحيد (`validateCsrfToken`) يُركب بعد نجاح المصادقة في وسائط الحماية (`requireApiAuth` و `requireWebAuth`).
  - تخضع جميع الطرق غير الآمنة (`POST`, `PUT`, `PATCH`, `DELETE`, etc.) للتحقق الإلزامي من ترويسة `X-CSRF-Token` في الطلبات الموثقة، وتعتمد واجهات العميل حصراً على `window.erpFetch` دون أي Fallback إلى raw fetch.
  - الطرق الآمنة والقراءة فقط (`GET`, `HEAD`, `OPTIONS`) معفاة من فحص الـ CSRF.
  - مسار تسجيل الدخول (`POST /api/auth/login`) معفى من رمز الـ CSRF لكونه غير موثق بعد، بينما مسار تسجيل الخروج (`POST /api/auth/logout`) محمي برمز CSRF الجلسة.
  - حماية تسجيل الدخول من التزوير (Login CSRF Protection):
    - مسار تسجيل الدخول يقبل حصراً طلبات JSON (`Content-Type: application/json` بما فيها الصيغ التي تحتوي charset).
    - يتم رفض كافة أنواع الوسائط الأخرى (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`، وغياب الترويسة) برمز الحالة HTTP 415 ورمز الخطأ الثابت `AUTH_LOGIN_JSON_REQUIRED`.
    - مسار تسجيل الدخول محمي بالترتيب الصارم: محدد المعدل (`loginRateLimiter`) أولاً -> مدقق نوع المحتوى (`requireLoginJsonContentType`) ثانياً -> التحقق من الـ DTO ثالثاً -> وحدة التحكم والتشفير (`bcrypt`) أخيراً.
    - يبقى مسار تسجيل الدخول مساراً محلياً لنفس النطاق (same-origin)، ويُحظر نهائياً كشفه عبر سياسات CORS متساهلة أو اعتمادية (`permissive credentialed CORS`).
    - في حال إضافة CORS مستقبلاً، يجب قصر مسارات المصادقة على سياسة قائمة بيضاء صريحة وموثوقة (`explicit trusted-origin allowlist`).
  - فحص الـ CSRF يتم حصراً بعد نجاح التحقق من المصادقة (Authentication First)؛ والطلبات غير الموثقة تفشل برمز 401 دون تسريب أخطاء CSRF.
  - خاصية `SameSite=Lax` تبقى خط دفاع إضافي (Defense in Depth).
  - مقارنة رموز الـ CSRF تتم حصراً عبر دوال التوقيت الآمن (`crypto.timingSafeEqual`).
  - يُمنع كلياً تسجيل (Logging) رموز الـ CSRF أو المفاتيح السرية أو قيم الكوكيز الخام في السجلات.
- حماية معدل تسجيل الدخول والبروكسي (Login Rate Limiting & Proxy Invariants):
  - حماية مسار `POST /api/auth/login` حصراً بمحدد معدل الطلبات عبر وسيط يسبق التحقق من الـ DTO ويسبق عمليات تشفير الـ Bcrypt لحماية موارد المعالج من الاستنزاف.
  - استراتيجية التقييد تعتمد على عنوان الـ IP الخاص بالعميل (`req.ip`) بالاعتماد على خوارزمية المفتاح الافتراضية الآمنة للمكتبة دون تحليل يدوي لترويسة `X-Forwarded-For`.
  - استثناء عمليات تسجيل الدخول الناجحة من استهلاك حصة الفشل (`skipSuccessfulRequests: true`).
  - الاستجابة عند تجاوز الحد تكون برمز الحالة HTTP 429 مع رمز الخطأ الثابت `AUTH_LOGIN_RATE_LIMITED` وترويسة `Retry-After` بالثواني (قيمة موجبة) عبر `TooManyRequestsError` ومعالج الأخطاء المركزي.
  - فحص المتغيرات البيئية الأمنية يتم بصرامة تامة (`parseStrictIntegerEnv`)؛ أي قيمة مشوهة تؤدي لفشل تشغيل التطبيق فوراً.
  - يعتمد محدد المعدل على `MemoryStore` محلي للعملية الواحدة (process-local)؛ والنشر المتعدد على عدة خوادم يستلزم اعتماد مخزن مشترك (مثل Redis) قبل التوسع الأفقي.
  - عدم قفل الحسابات الدائم أو تعديل بنية قاعدة البيانات؛ التقييد وقتي على مستوى الاتصال فقط.
  - ضبط إعداد `trust proxy` في Express يتم حصراً وبشكل صريح عبر عدد القفزات الموثوقة `TRUST_PROXY_HOPS > 0`، والافتراضي 0 (تعطيل كامل للثقة بالبروكسي المجهول)، ويُشترط حظر الوصول المباشر لمنفذ التطبيق من الإنترنت عند ضبط قفزات موجبة.

قواعد محرك الصلاحيات (Authorization Engine Rules):
- الرفض الافتراضي (Default Deny / Fail Closed): غياب أي قاعدة `ALLOW` صريحة يعني رفض الوصول تلقائياً.
- تفوق الرفض (`DENY` overrides `ALLOW`): أي قاعدة `DENY ALL` نشطة على أي منحة مطبقة للمستخدم تلغي وتتفوق على أي `ALLOW ALL`.
- التقييم المشترك: تُدمج وتُقيّم منح الدور الأساسي للمستخدم (`Role Grants`) مع المنح المباشرة للمستخدم (`Direct User Grants`) معاً.
- لا استثناء لمدير النظام: دور `SYSTEM_ADMIN` يخضع لنفس محرك الصلاحيات دون أي تجاوز برمجي صلب (No hardcoded bypass)، ويستمد وصوله من المنح وقواعد `ALLOW ALL` المسندة إليه في الـ Seed.
- فصل قابلية التفويض: حقل `can_delegate` مخصص لإمكانية منح الصلاحية للغير ولا يؤثر على وصول المستخدم الحالي للعملية.
- تقييم الوصول الشامل والنطاقات المكانية: خدمة الصلاحيات العامة (`AuthorizationService`) تقيّم الوصول الشامل عبر قواعد `ALL` الصالحة فقط ولا تعتبر النطاقات المكانية/الفرعية (مثل `PRODUCTION_DEPARTMENT` و `PRODUCTION_YARD`) وصولاً شاملاً؛ بينما تتولى محركات السياسات الخاصة بالموارد (مثل `ProductionAccessPolicyService`) تفسير وتطبيق النطاقات المكانية والديناميكية على مستوى الصفوف.

قواعد إدارة المستخدمين والأدوار والأمان (User & Role Management & Security Invariants):
- حذف المستخدمين والأدوار يتم حصراً عبر الحذف الناعم (Soft Delete)؛ يُمنع الحذف الصلب (Hard Delete) نهائياً.
- يُمنع إرجاع `passwordHash` في أي استجابات Backend (API أو Views أو List أو Detail).
- تعطيل المستخدم أو أرشفته/حذفه ناعماً يؤدي تلقائياً إلى إلغاء كافة جلساته النشطة (Revoke Active Sessions).
- حماية الذات (Self Protection): لا يمكن للمستخدم تعطيل حسابه الحالي أو حذفه ناعماً أو تغيير دوره من خلال إدارة المستخدمين العامة.
- حماية مدير النظام الأخير (Last SYSTEM_ADMIN Protection): لا يمكن تعطيل أو أرشفة أو تغيير دور آخر مدير نظام فعال وغير محذوف في النظام.
- ثبات الرمز التقني للدور: رمز الدور (`role.code`) ثابت وغير قابل للتعديل بعد الإنشاء.
- حماية دور مدير النظام (`SYSTEM_ADMIN`): لا يمكن تعطيل دور مدير النظام أو حذفه ناعماً، وتُدار صلاحياته الأساسية تلقائياً عبر النظام (Seeds) ولا تُعدل من واجهة إسناد الصلاحيات.
- قواعد محرك وإدارة قواعد الوصول والصلاحيات (Permission & Access Rule Administration Invariants):
  - فصل حالة التفعيل عن قواعد المنح: تفعيل الصلاحية (Checkbox) يعني فقط وجود منحة نشطة (`PermissionGrant.isActive = true`)، ولا يعني إطلاقاً إنشاء قاعدة منح شامل (`ALLOW ALL`) تلقائياً.
  - الانغلاق الأمني لغياب قواعد المنح: منحة الصلاحية النشطة بدون أي قاعدة منح (`ALLOW`) نشطة لا تمنح أي وصول فعلي (Fail Closed).
  - تعدد قواعد الوصول: يمكن للصلاحية الواحدة أن تمتلك عدة قواعد وصول (`0..N AccessRules`) تجمع بين المنح (`ALLOW`) والحظر/الاستثناء (`DENY`).
  - اتحاد المنح وتفوق الحظر: قواعد المنح تتحد (`ALLOW 1 OR ALLOW 2 ...`) وقواعد الحظر تستثني (`AND NOT (DENY 1 OR DENY 2 ...)`). أي قاعدة `DENY ALL` تلغي الوصول تماماً.
  - تقييم القواعد المباشرة وقواعد الدور معاً: تُدمج قواعد الدور وقواعد المستخدم المباشرة معاً، ولا يمكن لقاعدة `ALLOW` مباشرة تضييق قاعدة `ALLOW ALL` للدور؛ بل يتطلب التضييق استخدام قاعدة `DENY` صريحة.
  - منع استقبال JSON أو SQL خام من العميل: العميل يرسل فقط قوالب محددة (`Presets`) مع المعرفات المستهدفة، والـ Backend وحده يبني ويدير هيكل الـ JSON.
  - فحص قدرات الصلاحية (Capability Registry): تخضع قوالب النطاقات للتحقق الصارم في الـ Backend حسب قدرات كل صلاحية؛ صلاحيات النظام تقبل فقط `ALL` بينما تقبل صلاحيات الإنتاج القوالب المحددة تشغيلياً. أي صلاحية إنتاجية مجهولة تبدأ بـ `production.*` دون قيد صريح في الـ Registry لا تدعم أي نطاق وتفشل مغلقة (`Fail Closed` / `presets = []`).
  - التحقق من الأهداف المحددة (Specific IDs Validation): المعرفات المحددة (`departmentIds` / `yardIds`) يتم التحقق من وجودها وعدم أرشفتها في قاعدة البيانات عند الكتابة، وتُزال التكرارات وتُرتب حتمياً وبحد أقصى 200 معرف لكل قاعدة.
  - التحقق الصارم من النطاقات المحددة المخزنة أثناء التقييم (Stored Specific Scope Runtime Validation): بيانات النطاق المحدد المخزنة هي عقود أمنية (`Security Contracts`) ويجب إعادة التحقق منها وقت تقييم الصلاحيات (`Authorization Evaluation`) بمطابقة المفاتيح الحصرية (`exact keys`), وطول المصفوفة (1..200), وصحة صيغة المعرفات كـ UUID v4, وعدم وجود تكرارات وتطابق الترتيب الحتمي.
  - أمان القواعد التالفة (Malformed Rules Security): أي قاعدة حظر (`DENY`) تالفة أو غير معروفة تؤدي للرفض التام (`denyAll = true` / Fail Closed)، وأي قاعدة منح (`ALLOW`) تالفة لا تمنح شيئاً.
  - حظر تحويل القواعد المجهولة إلى ALL في الإدارة (No Unknown Rule Fallback to ALL): أي قاعدة وصول مجهولة أو تالفة تُعرض صراحة كقاعدة غير صالحة (`isValid = false`, `preset = null`) ويُمنع تعديلها بنموذج التعديل العادي ويتاح فقط تعطيلها.
  - حظر الـ DOM XSS واستخدام DOM APIs الآمنة: يُمنع نهائياً دمج أو تضمين أي قيم نصية قادمة من الـ API أو قاعدة البيانات أو المدخلات داخل `innerHTML`؛ يتم بناء عناصر واجهة المستخدم حصراً عبر Native DOM APIs وضبط النصوص عبر `textContent` والخصائص عبر `dataset` و `setAttribute`.
  - التحقق الصارم من عقد النطاق الشامل (Strict ALL Scope Runtime Contract): قاعدة الوصول الشاملة (`ALL`) صالحة حصراً عندما يكون `scopeType = 'ALL'` و `scope = null`. أي قاعدة `ALLOW ALL` تالفة (`scope !== null`) لا تمنح أي وصول إطلاقاً، وأي قاعدة `DENY ALL` تالفة (`scope !== null`) تفشل مغلقة (`Fail Closed`) وتمنع الوصول تماماً.
  - تسلسل عمليات تعديل الصلاحيات: جميع عمليات تعديل صلاحيات وقواعد الدور تتسلسل عبر قفل تشاؤمي على صف الدور (`Role row` via `pessimistic_write`)، وجميع عمليات تعديل صلاحيات وقواعد المستخدم تتسلسل عبر قفل تشاؤمي على صف المستخدم (`User row` via `pessimistic_write`).
  - التحقق الصارم من ملكية القاعدة (Rule Ownership): تعديل أو تعطيل أي قاعدة وصول يتحقق بدقة من تبعيتها لـ Grant و Subject (Role/User) والصلاحية المستهدفة.
  - حماية سجل قواعد الوصول: يُمنع الحذف الصلب لقواعد الوصول؛ يتم التعطيل حصراً عبر (`isActive = false`).

قواعد الملف الإداري الموحد للمستخدم (User Portfolio Invariants):
- طبقة قراءة وتجميع (Read / Composition Layer): ملف المستخدم الإداري الموحد هو طبقة عرض وتجميع للبيانات ولا يملك منطق الأعمال ولا يكرر استعلامات أو قواعد النطاقات الخاصة بالوحدات الأخرى.
- استقلالية التخويل لكل قسم (Independent Section Authorization): كل قسم من أقسام الملف الإداري يخضع للتخويل الخاص به؛ صلاحية `USER_VIEW` تتيح رؤية الملف الأساسي والحساب ولا تمنح تلقائياً رؤية المسؤولية التشغيلية للإنتاج.
- حماية نطاق المسؤولية التشغيلية (Production Responsibility Scope Protection): عرض المسؤولية التشغيلية يخضع حصراً لصلاحية `PRODUCTION_ASSIGNMENT_VIEW` ونطاق الوصول على مستوى الصفوف للقسم والساحات الخاصة بالفاعل (`Actor`).
- حظر تسريب البيانات خارج النطاق (No Out-of-Scope Leakage): إذا كان المستخدم مسؤولاً في قسم خارج نطاق وصول الفاعل، تُعاد حالة محايدة (`NOT_VISIBLE`) دون كشف اسم القسم أو رمزه أو ساحاته.
- حظر كشف بيانات الوحدات المستقبلية دون صلاحيات صريحة: يُمنع كشف الجلسات (`Sessions`)، أو الإعدادات (`Settings`)، أو سجل التدقيق (`Audit`) داخل ملف المستخدم دون وجود صلاحيات ونماذج أمنية مخصصة ومعتمدة.
- إعادة التحقق بعد الاستطلاع (TOCTOU & Responsibility Revalidation): استعلام المسؤولية التشغيلية يجب أن يعيد التحقق من ملكية رئيس القسم (`headUserId`) ومن إسناد المهندس الفعال للقسم المصرح به (`departmentId`) بعد تصنيف الـ Resolver المبدئي وقبل العرض.
- تفوق قواعد الحظر وعدم تجاوزها بـ `allowAll`: يُمنع استخدام `allowAll` بمفرده لتجاوز قواعد الحظر؛ يتم فحص الأقسام المستهدفة دائماً عبر `canAccessDepartment`.
- حماية حالات عدم الاتساق متعددة الأقسام (Multi-Department Inconsistent States Scope Protection): لا يجوز كشف حالة عدم الاتساق التشغيلي (`INCONSISTENT`) إلا إذا كانت كافة الأقسام المعنية بالتناقض ضمن نطاق رؤية الفاعل؛ وإلا تفشل مغلقة (`NOT_VISIBLE`) لمنع كشف وجود أقسام خارج النطاق.
- حماية حالة انعدام المسؤولية للمشاهد المقيد (Safe NONE Visibility for Scoped Viewers): لا يجوز كشف حالة انعدام المسؤولية (`NONE`) للمشاهد المقيد بنطاق أو المعرض لقواعد حظر جزئية لمنع التمييز بين غياب المسؤولية ووجودها في قسم محظور/خارج النطاق (`NOT_VISIBLE`).
- الانغلاق الأمني لارتباطات الساحات التالفة (Fail Closed on Yard Mapping Corruption): يُمنع الفلترة الصامتة للساحات المفقودة أو المحذوفة ناعماً أو التابعة لأقسام أخرى؛ أي تلف في الارتباطات يمنع العرض الطبيعي (`VISIBLE`) ويتحول إلى (`INCONSISTENT` أو `NOT_VISIBLE` وفق نطاق الأقسام المعنية).
- التحقق الشامل من الساحات المؤرشفة والمفقودة (Unresolved & Soft-Deleted Yard Resolution): لا يجوز افتراض تبعية الساحة لنفس القسم عند تعذر حل العلاقة؛ بل يتم جلب الساحات المرجعية بما فيها المؤرشفة (`withDeleted()`) لتحديد قسمها الأصلي. وإذا كانت الساحة مفقودة تماماً (`Hard Missing`) أو تعذر إثبات وقوع قسمها ضمن نطاق الفاعل، يتم الانغلاق الأمني فوراً إلى `NOT_VISIBLE`.

قواعد كتالوج المنتجات والمستودعات الأساسية (Inventory Product Catalog Invariants):
- شجرة الفئات (Category Hierarchy): تعتمد قائمة الجوار (Adjacency List)، مع حظر الحلقات الدائرية (No Ancestry Cycles) وحظر تعيين الفئة أباً لنفسها (Self-Parenting Blocked).
- قيود أرشفة الفئات (Category Archive Restrictions): يُمنع تعطيل أو أرشفة الفئة في حال وجود فئات فرعية تابعة لها (حتى لو كانت معطلة) أو وجود منتجات تابعة لها (Fail Closed).
- ثبات وفرادة رموز المنتجات والفئات (Immutable & Unique Codes): رمز الفئة ورمز المنتج فريدان عالمياً بما يشمل السجلات المؤرشفة ناعماً (`withDeleted: true`) وغير قابلين للتعديل إطلاقاً بعد الإنشاء.
- قاعدة الوحدة الأساسية الإلزامية (Base Unit Invariant): كل منتج صالح وغير محذوف يجب أن يمتلك وحدة أساسية واحدة صالحة ومرتبطة به ذرية (`product.baseUnitId != null`)؛ وأي منتج تالف يفتقد الوحدة الأساسية يفشل مغلقاً (`INVENTORY_PRODUCT_BASE_UNIT_INCONSISTENT`).
- حظر حذف أو تغيير معادلة الوحدة الأساسية: لا يمكن حذف الوحدة الأساسية للمنتج أو تعديل معادلة تحويلها.
- انحصار مرجعية الوحدات (Same-Product Unit Reference): يُمنع نهائياً إسناد وحدة مقابلة (`equivalentToUnitId`) تتبع لمنتج آخر.
- انتهاء سلسلة التحويل بالوحدة الأساسية (Conversion Chain Termination): كل سلسلة تحويل للوحدات الإضافية يجب أن تنتهي حتماً بالوحدة الأساسية وتخلو من الحلقات الدائرية.
- بروتوكول أقفال الوحدات (Unit Mutation Lock Root): كل عملية تعديل أو إضافة أو حذف لوحدات المنتج تبدأ بقفل سجل المنتج أولاً تشاؤمياً (`Product row` via `pessimistic_write`) لضمان تسلسل العمليات ومنع التعارضات.
- فرادة الباركود عالمياً: رمز الباركود فريد على مستوى النظام بالكامل بما يشمل السجلات المؤرشفة.
- اقتصار النطاق على البيانات المرجعية: لا توجد كميات أو أرصدة مخزنية (No Stock Quantities) في هذه المرحلة، وحقل مكان وجود المادة هو مجرد نص وصفي اختياري.
- حظر الإصلاح الصامت (No Silent Repair): أي تلف في الهيكل الهرمي أو سلسلة تحويل الوحدات يُرفض فوراً برموز أخطاء ثابتة دون أي تصحيح تلقائي صامت.



سياسة حماية القواعد والنزاهة المنطقية (Business Invariant Policy):
- Business invariants must be enforced at the backend transaction boundary, not only by UI filtering.
- Where an invariant can be safely represented by a database constraint, use one as the final integrity barrier.
- Concurrency-sensitive invariants must use a consistent serialization/locking point.
- Do not duplicate derived state when it can be calculated safely.
- Do not silently repair contradictory business state; reject unsafe requests (Fail Closed).

قواعد الهيكل التشغيلي للإنتاج (Production Departments & Yards Invariants):
- أقسام وساحات الإنتاج بيانات تشغيلية تخص تطبيق الإنتاج (Production Application) حصراً، ومستقلة تماماً عن الهيكل التنظيمي للموارد البشرية (HR Structure).
- بيانات الأقسام والساحات ديناميكية بالكامل وتُدار عبر قاعدة البيانات ويُمنع تعريفها كـ Enums.
- سعة الساحات تقاس بعدد الغرف (Room Count)، وكل غرفة تستهلك وحدة سعة واحدة (1 Room = 1 Capacity Unit) بغض النظر عن نوع الغرفة أو أبعادها.
- يُمنع تخزين الإشغال الحالي (Occupancy) في قاعدة البيانات؛ بل يُحسب ديناميكياً من الغرف الفعلية الموجودة في الساحة.
- لا يمكن تفعيل أو إنشاء ساحة تابعة لقسم إنتاج معطل أو محذوف ناعماً.
- بروتوكول قفل سجلات الإنتاج الموحد ومنع التعارضات (Production Unified Lock Protocol & Deadlock Prevention):
  - القاعدة الصارمة: يُمنع نهائياً طلب قفل سجل قسم (`Department`) بعد حيازة قفل سجل ساحة (`Yard`). ترتيب الأقفال دائماً `Department(s) -> Yard`.
  - لعمليات تعديل أو أرشفة الساحة (`updateYard`, `softDeleteYard`):
    1. القراءة الاستطلاعية المسبقة للساحة (`Pre-read`) تتم خارج الـ Transaction لمعرفة معرفات الأقسام المعنية (`sourceDepartmentId` و `targetDepartmentId`).
    2. عند الحاجة لقفل أكثر من Production Department، يجب الحصول على الأقفال واحداً تلو الآخر بترتيب UUID تصاعدي ثابت (`for (const deptId of sortedDeptIds)`)؛ لا يُعتمد على ترتيب القيم داخل `IN(...)` لضمان ترتيب Row Locks.
    3. قفل سجل الساحة تشاؤمياً (`Yard row` via `pessimistic_write`) بعد اكتمال قفل كافة الأقسام المعنية.
    4. إعادة التحقق من تطابق تبعية الساحة للقسم المقفول (`Revalidate consistency: yard.departmentId === sourceDepartmentId`) لمنع التعديلات المتزامنة (`PRODUCTION_YARD_CONCURRENTLY_CHANGED`).
    5. التحقق من القواعد التشغيلية (منع النقل أو الأرشفة في حال وجود مهندسين مسندين، واشتراط فعالية القسم عند التفعيل) ثم الحفظ.
  - لعمليات إنشاء ساحة جديدة (`createYard`): قفل القسم التابع تشاؤمياً ثم التحقق وإنشاء الساحة.
  - لعمليات إنشاء قسم جديد (`createDepartment`): قفل سجل المستخدم المرشح للرئاسة (`User row` via `pessimistic_write`) ثم إنشاء القسم (لا يوجد صف قسم مسبق لقفله).
  - لعمليات فريق ومسؤولي الإنتاج (`Production Team Operations`):
    1. قسم الإنتاج (`Department row` via `pessimistic_write`)
    2. سجل المستخدم (`User row` via `pessimistic_write` إن وجد)
    3. سجل تعيين المهندس (`Assignment row` via `pessimistic_write` إن وجد)
    4. سجلات الساحات مرتبة تصاعدياً حسب المعرف (`Yards sorted ascending by ID` via `pessimistic_write` إن وجدت)
    5. كتابة المخططات والروابط (`Mapping writes / mutations`)

قواعد هيكل المسؤوليات وفريق عمل الإنتاج (Production Department Team & Engineer Assignments Invariants):
- لكل قسم إنتاج رئيس قسم واحد (`head_user_id` في `production_department`) مع قيد فرادة في قاعدة البيانات (`UQ_production_department_head_user`).
- المستخدم الواحد يمكن أن يكون رئيساً لقسم إنتاج واحد فقط غير مؤرشف (A user may head at most one non-deleted production department).
- تعارض الأدوار التشغيلية (Mutual Exclusivity): لا يجوز للمستخدم في نفس الوقت أن يكون رئيساً لأي قسم إنتاج ومهندساً مسنداً لساحات إنتاج (A user cannot simultaneously hold a current Production Department Head responsibility and a current Yard Engineer assignment).
- مرشح رئاسة القسم (Department Head Candidate): يجب أن يكون مستخدماً نشطاً، غير مؤرشف/محذوف ناعماً، ليس رئيساً لأي قسم إنتاج غير مؤرشف (بما في ذلك القسم الحالي في واجهة الاختيار)، ليس مهندساً نشطاً في أي قسم إنتاج (`PRODUCTION_ENGINEER_CANNOT_BE_DEPARTMENT_HEAD`)، وليس لديه أي ارتباطات بساحات إنتاج (`PRODUCTION_USER_HAS_EXISTING_YARD_ASSIGNMENTS`).
- رئيس القسم مسؤول تلقائياً عن جميع ساحات القسم الحالية والمستقبلية دون الحاجة لصفوف إسناد منفصلة.
- عند أرشفة قسم الإنتاج (`softDeleteDepartment`)، يتم تحرير رئيس القسم تلقائياً بجعل `head_user_id = null` مع ضبط `deleted_at` وتعيين `is_active = false` لإتاحة إسناده لقسم آخر دون تعارض مع قيد الفرادة.
- مرشح وظيفة المهندس (Engineer Candidate): يجب أن يكون مستخدماً نشطاً، غير مؤرشف، ليس رئيساً لأي قسم إنتاج (`PRODUCTION_DEPARTMENT_HEAD_CANNOT_BE_ENGINEER`)، ليس مهندساً نشطاً في القسم المستهدف (`PRODUCTION_ENGINEER_ALREADY_ASSIGNED`) ولا في أي قسم إنتاج آخر (`PRODUCTION_ENGINEER_ASSIGNED_TO_OTHER_DEPARTMENT`)، ولا يملك ارتباطات ساحات متعارضة أو قديمة (`PRODUCTION_ENGINEER_HAS_EXISTING_YARD_ASSIGNMENTS`). السجل التاريخي المعطل النظيف (0 ارتباطات) مؤهل لإعادة الاستخدام.
- المهندس الواحد ينتمي لقسم إنتاج واحد فقط (`userId` فريد في `production_department_engineer` عبر `UQ_production_department_engineer_user`).
- المهندس يُسند لساحة واحدة أو أكثر تتبع لنفس قسمه (`production_yard_engineer` مع قيد فرادة الزوج `UQ_production_yard_engineer_assignment`).
- يمكن للساحة الواحدة أن تضم أكثر من مهندس مسؤول عنها.
- يُمنع إسناد مهندس لساحات تتبع قسماً آخر (`PRODUCTION_ENGINEER_YARD_DEPARTMENT_MISMATCH`).
- يُمنع نقل أو أرشفة ساحة مسندة لمهندسين حالياً (`PRODUCTION_YARD_HAS_ENGINEERS`).
- لا يتم حذف صف المهندس صلبياً بل يُعطّل (`isActive = false`) مع حذف ارتباطات ساحاته، ولا يُعاد تفعيل السجل إلا إذا كانت ارتباطات الساحات مساوية للصفر (Fail closed on stale mappings: `PRODUCTION_ENGINEER_HAS_EXISTING_YARD_ASSIGNMENTS`).
- المستخدمون المؤرشفون المرتبطون تاريخياً كرؤساء أقسام أو مهندسين تظل هوياتهم محفوظة وظاهرة في واجهة الفريق مع تمييز حالتهم بوسم "مؤرشف / غير متاح" ودون كشف أي بيانات حساسة.
- قواعد تعديل إسناد ساحات المهندس (Engineer Yard Assignment Update Invariants):
  - فحص الارتباطات الحالية مسبقاً (`Existing mappings inspection`) قبل تنفيذ أي تعديل أو استبدال.
  - الانغلاق الأمني الفوري (`Fail Closed` / `PRODUCTION_ENGINEER_HAS_UNEDITABLE_YARD_ASSIGNMENTS`) في حال وجود أي ارتباط حالي لساحة معطلة أو مؤرشفة أو تتبع قسماً آخر أو مفقودة، ويُمنع نهائياً حذف أو تصليح الارتباطات التالفة بصمت (`No silent repair / No silent deletion`).
  - مجموعة أقفال الساحات هي اتحاد الساحات الحالية والمطلوبة (`lockYardIds = union(existing, requested)`).
  - قفل الساحات يتم حصراً بشكل تسلسلي واحدة تلو الأخرى بترتيب معرفات UUID تصاعدي (`Sequential one-by-one locking in ascending UUID order`)؛ يُمنع استخدام `IN (...)` مع القفل التشاؤمي.
  - بروتوكول القفل الموحد إلزامي: `Department -> User -> Assignment -> Yards (individually sorted) -> Mutations`.
- فلترة المرشحين في واجهة المستخدم (UI Filtering) هي لتحسين تجربة المستخدم فقط، بينما التحقق الصارم في طبقة الخدمات والـ Transactions هو الحامي للمنطق التشغيلي وقيود قاعدة البيانات هي خط الدفاع النهائي.

قواعد نطاقات الوصول وديناميكية الصلاحيات على مستوى الصفوف (Dynamic Production Access Scopes & Row-Level Authorization Invariants):
- الصلاحية تحدد نوع العملية (`Permission = WHAT`) وقاعدة الوصول تحدد نطاق البيانات المسموحة (`AccessRule = WHICH DATA`).
- الإسناد أو المسؤولية التشغيلية (`Operational Assignment`) لا تمنح صلاحية للمستخدم تلقائياً بل تحدد نطاق البيانات إذا امتلك الصلاحية.
- تُحل النطاقات الديناميكية (`Dynamic Scopes`) عند وقت الطلب (`Request time`) بناءً على الحالة التشغيلية الحالية للمستخدم في قاعدة البيانات.
- يُفرض نطاق الوصول حصراً على مستوى `QueryBuilder` قبل الـ Pagination والـ Counting؛ يُمنع الفلترة اللاحقة بعد الجلب (`No post-fetch filtering for security`).
- يُمنع نهائياً تخزين أسماء أعمدة أو شروط SQL داخل `AccessRule.scope` JSON؛ المترجمات (`Resource-Specific Translators`) الصريحة فقط هي المسؤولة عن بناء شروط SQL عبر `TypeORM parameters`.
- تفوق الرفض (`DENY wins`): أي قاعدة حظر متطابقة تتفوق على أي منح.
- انغلاق الأمان (Fail Closed): قواعد المنح (`ALLOW`) غير المعروفة أو غير الصالحة لا تمنح شيئاً، وقواعد الحظر (`DENY`) غير المعروفة أو غير الصالحة تؤدي للرفض التام (`denyAll = true`). في حال وجود تعارض أو فساد في الحالة التشغيلية للمستخدم (`isConsistent = false`)، يتم إبطال النطاقات الديناميكية تلقائياً.
- Dynamic responsibility resolver must fail closed on inconsistent Department/Yard mappings.
- Active Production Engineer must have at least one current Yard mapping; zero Yard mappings on an active engineer assignment is an inconsistent operational state and dynamic scope resolution must fail closed.
- Engineer Yard scope must only resolve yards belonging to the engineer's current Production Department.
- Soft-deleted Department/Yard relationships in a current assignment are inconsistent state.
- Scope JSON payloads are exact-shape contracts; extra keys are invalid.
- Authorization-protected lookup metadata such as dropdown/filter options must also be scoped at DB query level (`listActiveDepartmentsForPolicy`, `listAccessibleDepartmentOptions`).
- UI dropdown data is subject to authorization like normal business rows; no post-fetch filtering.
- For scoped mutable resources, an authorization-aware pre-read must reject out-of-scope resources before entering a locking transaction, while the locked entity must still be re-authorized and revalidated inside the transaction.
- Target-specific errors must not be revealed before current resource scope authorization (`updateYard` verifies source yard access before target errors).
- كاش الصلاحيات والمسؤوليات تشغيلي على مستوى الطلب فقط (`Request-level cache via WeakMap`)؛ يُمنع استخدام Redis أو تخزين النطاقات داخل JWT أو Session.
- الدلالة الأمنية للاستجابات: عند عدم وجود وصول فعال للعملية يُرجع `403 (ACCESS_SCOPE_DENIED)`، وعند طلب سجل محدد خارج نطاق الوصول يُرجع `404 (RESOURCE_NOT_FOUND)` لمنع كشف وجود البيانات (`Prevent Information Leakage`).

---

# 31. EJS وBootstrap

EJS للعرض فقط.

ممنوع داخله:

- DB Queries
- Business Logic
- Cost calculations
- Workflow decisions

استخدم EJS Partials للأجزاء المتكررة مثل:

- alerts
- pagination
- form errors
- navigation
- table actions
- modals

استخدم Bootstrap أولًا قبل Custom CSS أو UI Framework آخر.

Client-side JavaScript لتحسين UX فقط، والBackend يبقى المصدر النهائي للحقيقة.

---

# 32. common/

`src/common` فقط للكود المشترك فعليًا:

```text
errors/
middleware/
decorators/
logging/
types/
utils/
```

أي Utility خاصة بـDomain تبقى داخل Domain.

---

# 33. Avoid Over-Abstraction

تجنب مبكرًا:

```text
BaseCrudService<T>
BaseController<T>
UniversalRepository<T>
DynamicManager
```

لا تنشئ Abstraction معقدة فقط لتقليل أسطر بسيطة.

---

# 34. Methods وComments

كل Method يجب أن يكون لها هدف واضح.

أسماء جيدة:

```text
createProductionOrder
approveInspection
recordMaterialConsumption
assignRoomToYard
```

أسماء سيئة:

```text
handle
process
execute2
doTask
```

التعليقات تشرح "لماذا" وليس ما هو واضح من الكود.

ممنوع Dead Code أو Imports غير مستخدمة أو كود قديم داخل Comments.

---

# 35. ESLint وPrettier

استخدم ESLint وPrettier من البداية.

Scripts مقترحة:

```text
dev
build
start
typecheck
lint
format
test
migration:generate
migration:run
migration:revert
seed
```

---

# 36. Testing

اجعل Business Logic قابلة للاختبار.

ركز على:

- calculations
- business rules
- state transitions
- transactions
- edge cases
- failure cases

لا تختبر Happy Path فقط.

---

# 37. Performance

تجنب:

- N+1 queries
- Query داخل Loop
- Relations غير مطلوبة
- Select لحقول ضخمة في Lists

أضف Indexes للحقول المستخدمة بكثرة في WHERE/JOIN/ORDER BY.

لا تعمل Optimization معقد قبل الحاجة.

---

# 38. Attachments

لا تحفظ PDF/Images/Binary داخل MySQL افتراضيًا.

احفظ Metadata مثل:

```text
file_name
storage_key
mime_type
size
```

والملف نفسه في File Storage.

تحقق من MIME/extension/max size/generated filename عند Upload.

---

# 39. API-ready Architecture

حتى لو النظام يستخدم EJS، Services لا تعتمد على View Layer حتى يمكن إضافة REST API أو Mobile لاحقًا بدون إعادة كتابة Business Logic.

---

# 40. Module Boundaries

لا تجعل Modules تنفذ Queries على Tables الخاصة ببعضها بشكل عشوائي.

تعامل عبر Services واضحة عند الحاجة.

تجنب Circular Dependencies.

---

# 41. State Management

أي Entity له Lifecycle يجب أن تكون حالاته وانتقالاته واضحة.

لا تعدّل `status` عشوائيًا من عدة أماكن.

استخدم Use Cases واضحة مثل:

```text
approveOrder
completeOrder
cancelOrder
```

---

# 42. Idempotency وConcurrency

العمليات التي قد تتكرر يجب أن تكون Idempotent عند الحاجة.

استخدم Transactions/locking/version checks عند العمليات الحساسة مثل capacity/stock/approvals/assignments.

---

# 43. Dynamic Data vs Enums

أي Business Data يمكن أن تضيفه الإدارة مستقبلًا لا يكون Hardcoded:

- room types
- stages
- materials
- yards
- patterns
- options

Enums فقط للقيم الثابتة فعلًا.

---

# 44. Seeders
 
نظم Seeders حسب Module / Application.

- يجب أن تكون Idempotent وتعتمد على المفاتيح الطبيعية.
- يُمنع تخزين كلمات المرور كنص صريح أو وجود كلمات مرور افتراضية (No default password fallback) في الكود المصدري.
- دور `SYSTEM_ADMIN` يحصل تلقائيًا على جميع الصلاحيات النشطة عند تشغيل الـ Seed.
- تتبع ملفات الـ Seeds للموديول المالك للكيان (مثل `permission-grant` و `access-rule`).
- عند إيقاف الخادم (Shutdown)، يجب انتظار إغلاق خادم HTTP قبل إغلاق اتصال قاعدة البيانات.

---

# 45. Documentation Files

في جذر المشروع:

```text
README.md
PROJECT_OVERVIEW.md
PROJECT_RULES.md
work.md
```

يمكن استخدام `docs/adr/` للقرارات المعمارية الكبيرة.

---

# 46. Minimal Changes

أي Feature يجب أن تعدل فقط الملفات المطلوبة.

أي Refactor كبير يكون Task مستقل.

أي Breaking Change في Schema/Route/API/Behavior يجب ذكره بوضوح.

لا تخترع Business Requirements. إذا الغموض مؤثر، اسأل قبل التنفيذ.

---

# 47. Security by Default

أي Endpoint جديد Protected افتراضيًا ما لم يكن Public بشكل صريح.

لا تثق بالFrontend.

استخدم عند الحاجة Helmet, secure cookies, rate limiting, CSRF protection وفق نمط Authentication.

---

# 48. JSON Columns

استخدم JSON فقط للبيانات المرنة فعلًا.

لا تستخدم JSON بدل Relational Design عندما تحتاج FK/JOIN/Search/Constraints.

أي JSON يجب أن يكون له TypeScript type/interface وValidator موثق.

ممنوع `Record<string, any>` المفتوح بلا سبب.

---

# 49. قواعد AI Coding Agent

قبل كل Task:

1. اقرأ `PROJECT_RULES.md`.
2. اقرأ `PROJECT_OVERVIEW.md`.
3. اقرأ `work.md`.
4. افهم المطلوب.
5. حدد الملفات المرتبطة.
6. افتح فقط الملفات اللازمة.
7. نفذ أقل تغيير مطلوب.
8. شغّل validation/tests المناسبة.
9. حدّث `work.md`.
10. لا تعتبر المهمة مكتملة قبل تحديث `work.md`.

---

# 50. قاعدة صارمة: `work.md` هو الخريطة التقنية الحية للمشروع

يجب إنشاء ملف `work.md` في جذر المشروع.

هذا الملف **ليس Changelog** وليس سجل أحداث يومي.

وظيفته أن يكون مرجعًا حيًا ومحدثًا للحالة الحالية للمشروع، ويحتوي على:

- هيكلية الملفات المهمة.
- وظيفة كل ملف.
- أهم Classes/Entities/DTOs/Interfaces/Types داخله.
- أهم Fields والبيانات المهمة.
- أهم Methods/Functions.
- Inputs لكل Method مهمة.
- Purpose/Action لكل Method.
- Outputs.
- Side Effects المهمة.
- Dependencies المهمة.
- العلاقات بين Modules.
- الجداول والعلاقات والConstraints المهمة.
- القرارات المعمارية الحالية المهمة.

الهدف أن يستطيع المطور فهم أين يوجد كل شيء بدون إعادة قراءة المشروع بالكامل في كل طلب.

---

# 51. `work.md` يعكس Current State فقط

لا تضف سجلًا لكل تعديل صغير.

لا تكتب:

```text
اليوم عدلت typo
اليوم غيرت variable
اليوم أضفت CSS
```

بدلًا من ذلك، إذا تغير ملف أو Method أو Entity:

> عدّل وصفه الحالي داخل `work.md` ليعكس الحالة الجديدة.

إذا حُذف File، احذفه من `work.md`.

إذا تغيرت وظيفة File، حدّث Purpose.

إذا تغير Input/Output، حدّثه.

إذا تغيرت Relation أو Constraint، حدّثها.

إذا تغير Dependency، حدّثها.

---

# 52. قالب توثيق الملفات داخل `work.md`

لكل ملف مهم:

```md
### `path/to/file.ts`

**Purpose**
شرح مختصر لوظيفة الملف.

**Contains**

- Class / Entity / DTO / Interface / Types

**Main Functions / Methods**

#### `methodName(input)`

- Input:
- Purpose:
- Output:
- Side Effects:
- Dependencies:

**Used By**

- الملفات أو الخدمات المهمة التي تعتمد عليه.

**Depends On**

- الملفات أو الخدمات المهمة التي يعتمد عليها.
```

لا توثق كل Import بسيط.

---

# 53. توثيق Entity داخل `work.md`

```md
### `EmployeeEntity`

Table:
`hr_employee`

Purpose:
يمثل بيانات الموظف.

Important Fields:

- id
- fullName
- departmentId

Relations:

- department
- position

Constraints / Indexes:

- ...
```

لا تنسخ Decorators أو Source Code كاملًا.

---

# 54. توثيق Service داخل `work.md`

```md
### `EmployeeService`

Purpose:
Business Logic الخاصة بالموظفين.

#### `createEmployee(dto, context)`

Input:

- CreateEmployeeDto
- RequestContext

Action:

- يتحقق من Business Rules
- ينشئ الموظف

Output:

- EmployeeEntity / ViewModel

Database Side Effects:

- INSERT hr_employee

Dependencies:

- DepartmentService
```

---

# 55. توثيق Controller/DTO/Route داخل `work.md`

Controller:

```md
### `EmployeeController`

Purpose:
HTTP layer للموظفين.

Methods:

- createEmployee → calls EmployeeService.createEmployee
```

DTO:

```md
### `CreateEmployeeDto`

Purpose:
بيانات إنشاء موظف.

Fields:

- fullName
- departmentId
- positionId
```

Route:

```md
### `employee.route.ts`

Routes:

- GET /hr/employees
- POST /hr/employees
```

---

# 56. Database Structure داخل `work.md`

أنشئ قسمًا ثابتًا:

```md
## Database Structure
```

لكل جدول مهم:

- Table Name
- Entity
- Purpose
- Important Fields
- Relations
- Constraints
- Indexes
- Historical/Snapshot behavior إن وجد

---

# 57. Project Structure داخل `work.md`

احتفظ بشجرة الملفات المهمة فقط.

مثال:

```text
src/
├── config/
├── database/
├── modules/
│   ├── system/
│   ├── hr/
│   └── production/
└── ...
```

تحت كل File مهم أضف وصفًا مختصرًا.

---

# 58. Cross-Module Dependencies داخل `work.md`

وثّق فقط Dependencies المهمة، مثل:

```text
ProductionOrderService
→ TemplateService
→ RoomService
→ StageCopyService
```

لا توثق كل Import.

---

# 59. لا تنسخ الكود في `work.md`

`work.md` ليس نسخة من Source Code.

اكتب فقط:

- Purpose
- Inputs
- Outputs
- Side Effects
- Dependencies
- Current responsibility

---

# 60. تحديث `work.md` إلزامي في نفس Task

أي عملية من التالية تتطلب تحديث `work.md`:

- إنشاء File
- حذف File
- نقل File
- Rename File
- إضافة/حذف Class
- إضافة/حذف Method مهمة
- تعديل Input/Output
- تعديل Entity
- تعديل Relation
- تعديل Constraint/Index
- تعديل DTO
- تعديل Service responsibility
- تعديل Route
- تعديل Cross-module dependency مهمة

لا تعتبر المهمة مكتملة قبل التحديث.

---

# 61. `work.md` ليس بديلًا عن Source Code

قبل تعديل ملف، يجب قراءة النسخة الحالية منه.

`work.md` يستخدم لفهم الهيكل وتحديد الملفات المطلوبة، وليس للتخمين حول الكود الحالي.

إذا تعارض `work.md` مع Source Code:

> Source Code هو الحقيقة النهائية، ويجب تحديث `work.md` فورًا.

---

# 62. قاعدة Minimal File Reading

بعد بناء `work.md` بشكل جيد:

- لا تعمل Scan شامل للمشروع في كل Task.
- اقرأ `work.md` أولًا.
- حدد الملفات المطلوبة.
- افتح الملفات المرتبطة فعليًا فقط.

هذا يقلل وقت التحليل ويمنع إعادة اكتشاف المشروع من الصفر.

---

# 63. قالب `work.md` المقترح

```md
# Project Technical Map

## Project Summary

شرح مختصر للمشروع.

## Project Structure

شجرة الملفات المهمة.

## Application Modules

- system
- hr
- inventory
- studies
- production
- quality
- transportation
- costing
- reporting

## Database Structure

الجداول والعلاقات والConstraints المهمة.

## Module: System

...

## Module: HR

...

## Module: Production

...

## Important Cross-Module Dependencies

...

## Shared Infrastructure

...

## Current Architectural Decisions

...

## Known Technical Constraints

...
```

---

# 64. قاعدة الإنهاء

لا تعتبر أي Task مكتملة إلا بعد:

1. تنفيذ المطلوب فقط.
2. التأكد من TypeScript/build/lint/tests المناسبة.
3. تحديث `work.md` ليعكس Current State الجديد.
4. التأكد أن `work.md` لا يحتوي معلومات قديمة تخص الملفات المعدلة.

---

# 65. المبدأ النهائي

الهدف ليس بناء ERP يعمل اليوم فقط.

الهدف هو بناء ERP يمكن لفريق جديد فهمه وصيانته وتطويره بعد سنوات دون إعادة اكتشاف المشروع من الصفر.

أي قرار معماري يجب أن يخدم:

- الوضوح
- سلامة البيانات
- سهولة التطوير
- سهولة التتبع
- سهولة الصيانة

