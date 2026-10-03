---
trigger: always_on
---

# PROJECT_RULES.md

> المرجع الهندسي العام والملزم للمشروع بالكامل. يجب على أي مطور أو AI Coding Agent الالتزام به في جميع المهام.
>
> التقنيات الأساسية: Node.js, TypeScript, Express.js, TypeORM, MySQL, EJS, Bootstrap, tsyringe, class-validator, class-transformer, ESLint, Prettier.
>
> المعمارية المعتمدة: **Modular Monolith**.

---

# 1. المبادئ الأساسية

كل كود جديد يجب أن يكون:

- Simple
- Explicit
- Typed
- Modular
- Maintainable
- Testable
- Secure
- Consistent
- Traceable

ترتيب الأولويات:

```text
Correctness
→ Security
→ Data Integrity
→ Maintainability
→ Readability
→ Performance
→ Cleverness
```

ممنوع إدخال Microservices أو CQRS أو Event Bus أو Generic Frameworks أو Abstractions كبيرة بدون حاجة فعلية وطلب صريح.

---

# 2. المعمارية العامة

يتم تنظيم المشروع حسب Business Domains:

```text
src/
├── bootstrap/
├── common/
├── config/
├── database/
├── modules/
├── routes/
├── views/
├── app.ts
└── server.ts
```

Modules متوقعة:

```text
system
hr
inventory
studies
production
quality
transportation
costing
reporting
```

كل Module يمثل Domain مستقل، ويمنع جمع جميع Controllers أو Services أو Entities في مجلدات عامة مشتركة على مستوى المشروع.

---

# 3. تقسيم الـModules

الـDomain الكبير يقسم إلى Submodules واضحة.

مثال:

```text
production/
├── template/
├── production-order/
├── room/
├── stage/
├── yard/
├── transfer/
└── quality/
```

هيكل Feature نموذجي:

```text
feature-name/
├── feature-name.entity.ts
├── feature-name.dto.ts
├── feature-name.types.ts
├── feature-name.service.ts
├── feature-name.controller.ts
├── feature-name.route.ts
└── feature-name.seeder.ts
```

يمكن إضافة mapper/repository/policy/validator فقط عند وجود حاجة فعلية.

---

# 4. اتجاه الطبقات

الاتجاه الإجباري:

```text
Route
→ Middleware
→ Controller
→ DTO Validation
→ Service
→ Repository / QueryBuilder
→ Database
```

ممنوع:

```text
Service → Controller
Entity → Service
Entity → Controller
View → Database
Repository → Controller
```

---

# 5. Routes

الـRoute مسؤولة فقط عن:

- URL
- HTTP Method
- Middleware
- استدعاء Controller

ممنوع فيها:

- Business Logic
- Repository
- QueryBuilder
- Transaction
- حسابات
- Validation معقد
- إنشاء أو تعديل Entity

---

# 6. Controllers

Controller يجب أن يكون Thin Controller.

مساره:

```text
Request
→ Parse/DTO
→ Validation
→ Service
→ Response / Render / Redirect
```

ممنوع داخله:

- Repository
- QueryBuilder
- Transactions
- Business Rules
- Hashing
- Workflow معقد
- حسابات Domain

---

# 7. Services

Service هي مكان:

- Business Logic
- Use Cases
- Business Validation
- Repository access
- QueryBuilder
- Transactions
- Orchestration

قواعد:

- لا تمرر Express Request/Response إلى Service.
- استخدم مدخلات ومخرجات Typed.
- لا تجعل Service واحدة تدير Domain كامل.
- لا تكرر Business Rule في أكثر من مكان.
- لا تعتمد Service على Controller.

---

# 8. Request Context

عند الحاجة لمعلومات المستخدم أو الجلسة داخل Business Layer استخدم Context مستقل مثل:

```text
RequestContext
```

قد يحتوي:

```text
userId
sessionId
requestId
ip
```

ولا تمرر `req` نفسه إلى Service.

---

# 9. TypeScript

فعّل `strict: true`.

`any` ممنوع افتراضيًا.

استخدم:

- interface
- type
- DTO
- enum
- generic
- unknown

تجنب `as any` وNon-null assertion `!` إلا بسبب واضح.

تعامل صراحة مع null وundefined والقيم الاختيارية.

---

# 10. DTOs وValidation

كل Input خارجي يجب أن يمر عبر DTO باستخدام:

- class-validator
- class-transformer

Input Validation مكانها DTO، مثل:

- required
- UUID
- length
- primitive type
- date format

Business Validation مكانها Service، مثل:

- لا يمكن تعديل سجل في حالة معينة
- لا يمكن تنفيذ العملية مرتين
- انتقال حالة غير صالح

---

# 11. Entities

Entity مسؤولة فقط عن Persistence:

- Columns
- Relations
- Indexes
- Constraints
- Timestamps

ممنوع داخل Entity:

- HTTP Logic
- Business Workflow
- Service Calls
- Queries
- Presentation Logic

---

# 12. Naming Convention

TypeScript:

```text
Class: PascalCase
Variables/Methods: camelCase
Files: kebab-case
```

Database:

```text
Tables/Columns: snake_case
```

أمثلة:

```text
ProductionOrderEntity
createProductionOrder
production-order.service.ts
production_order
created_at
production_order_id
```

جميع Code Identifiers بالإنجليزية. النصوص الظاهرة للمستخدم يمكن أن تكون بالعربية.

---

# 13. أسماء الجداول حسب التطبيق

قاعدة إلزامية:

```text
<application>_<entity>
```

أمثلة:

```text
system_user
system_role
system_permission
hr_employee
hr_department
inventory_material
studies_template
production_order
production_room
quality_inspection
transportation_request
costing_entry
```

---

# 14. UUID

استخدم UUID للكيانات الرئيسية مثل User, Employee, Role, Permission, Template, ProductionOrder, Room, Material, Transfer, Inspection.

---

# 15. TypeORM وMySQL

استخدم Repository للاستعلامات البسيطة:

- find
- findOne
- findAndCount
- save
- update
- softDelete

استخدم QueryBuilder للاستعلامات المعقدة:

- Joins
- Dynamic Filters
- Reports
- Aggregations
- Access Scopes

ممنوع SQL String Concatenation. استخدم Parameters دائمًا.

---

# 16. Transactions

أي عملية متعددة الخطوات تعتمد على بعضها يجب أن تكون Transaction.

مثال:

```text
Create Production Order
+ Create Items
+ Create Rooms
+ Copy Stages
+ Copy Options
```

إما تنجح كلها أو تفشل كلها.

---

# 17. Database Integrity

لا تعتمد على Validation في التطبيق فقط.

استخدم عند الحاجة:

- UNIQUE
- NOT NULL
- FOREIGN KEY
- CHECK
- INDEX

---

# 18. Migrations

كل تغيير Schema يتم عبر Migration.

ممنوع الاعتماد على `synchronize: true` في Production.

---

# 19. Relations

كل Relation يجب تحديد:

- nullable
- cascade
- onDelete
- onUpdate
- eager

لا تستخدم cascade أو eager تلقائيًا.

الأصل للعلاقات الكبيرة: `eager: false`.

---

# 20. Pagination

أي List يمكن أن تكبر يجب أن تكون Paginated.

Contract موحد:

Input:

```text
page
limit
search
sortBy
sortDirection
filters
```

Output:

```text
items
total
page
limit
totalPages
```

Filters يجب أن تكون Typed، وليس `params: any`.

---

# 21. Soft Delete والتاريخ

استخدم Soft Delete أو Status للكيانات ذات القيمة التاريخية.

قاعدة ERP أساسية:

> تعديل Master Data لا يجب أن يغيّر Transaction History السابق.

استخدم Snapshots عندما تكون البيانات التاريخية مطلوبة.

---

# 22. Master Data vs Transaction Data

Master Data مثل:

- Material
- Template
- Employee
- Department
- Yard

Transaction Data مثل:

- Production Order
- Room
- Material Consumption
- Transfer
- Inspection

لا تجعل تعديل Master Data يعيد كتابة Transactions السابقة.

---

# 23. الأموال والكميات

استخدم DECIMAL للأموال والكميات القابلة للكسر.

ممنوع Float/Double للأموال.

مثال:

```text
DECIMAL(18,4)
```

---

# 24. Dates وTimezone

اعتمد سياسة زمنية موحدة.

لا توزع Date/Timezone logic عشوائيًا داخل Controllers.

---

# 25. Configuration وEnvironment

ضع Configuration داخل:

```text
src/config/
```

وتحقق من Environment Variables عند Startup.

إذا متغير أساسي مفقود، يفشل التطبيق برسالة واضحة.

ممنوع تخزين Secrets أو Passwords أو Tokens داخل Git أو Source Code أو Seeder.

---

# 26. Dependency Injection

استخدم `tsyringe` وConstructor Injection.

لا تنشئ Services يدويًا بشكل عشوائي باستخدام `new`.

---

# 27. Error Architecture

اعتمد Error hierarchy مثل:

```text
AppError
├── ValidationError
├── NotFoundError
├── ConflictError
├── ForbiddenError
├── UnauthorizedError
└── BusinessRuleError
```

استخدم Central Error Handler.

يفضل وجود Error Code ثابت مثل:

```text
EMPLOYEE_NOT_FOUND
PRODUCTION_ORDER_LOCKED
INVALID_STAGE_STATE
```

---

# 28. Logging

استخدم Logger مركزي بمستويات:

- info
- warn
- error
- debug

يمكن إضافة Context مثل requestId/userId/module/action.

ممنوع Logging لـPasswords أو Tokens أو Secrets أو بيانات حساسة غير لازمة.

---

# 29. Auditability

يجب أن تسمح المعمارية بتتبع:

- من قام بالفعل
- ماذا فعل
- على أي سجل
- متى
- القيمة السابقة
- القيمة الجديدة

خصوصًا الموافقات والتكاليف والصلاحيات والإنتاج والجودة.

---

# 49. Frontend Communication

- HTMX is used for Web navigation and HTML partial loading.
- fetch is used for JSON API communication.
- Web routes return HTML.
- API routes return JSON.
- HTMX is not used for CRUD form submission by default.
- fetch must use the standard ApiResponse structure.
- Do not implement a custom SPA router.
- Direct page URLs must remain refreshable/bookmarkable.

---

# 50. Backend Validation

Route
→ validateDto(Dto)
→ Controller
→ Service

- DTO validation uses class-validator/class-transformer.
- Controllers must not duplicate DTO validation.
- Validation middleware must not build HTTP responses directly.
- Validation failures flow through Global Error Handler.
- Unknown DTO fields are rejected (whitelist & forbidNonWhitelisted).
- `any` is not allowed.

---