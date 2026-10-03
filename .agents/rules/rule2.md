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

