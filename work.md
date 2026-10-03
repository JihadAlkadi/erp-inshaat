# Project Technical Map

## Current Project State

تم تنفيذ مرحلة إدارة المستخدمين الأساسية (User Management Core) ومرحلة محرك الصلاحيات (Authorization Core) ومرحلة المصادقة الأساسية (Authentication Core) بالكامل ودمجها مع نموذج الجلسات وقاعدة البيانات:
- **إدارة المستخدمين الأساسية (User Management Core)** (`src/modules/system/user/`):
  - خدمة المستخدمين المركزية `UserService` (`src/modules/system/user/user.service.ts`):
    - `listUsers`: استرجاع قائمة المستخدمين مع Pagination، والبحث بالاسم أو رقم الهاتف، وضم الدور (Role) بكفاءة بدون N+1، واستبعاد المحذوفين ناعماً.
    - `getUserById`: استرجاع تفاصيل مستخدم محدد مع دوره واستبعاد `passwordHash`.
    - `createUser`: إنشاء مستخدم جديد بعد التحقق من فرادية رقم الهاتف (حتى مع المحذوفين ناعماً)، والتحقق من نشاط الدور، وتشفير كلمة المرور بـ bcrypt، وإرجاع كائن مستخدم آمن.
    - `updateUser`: تحديث جزئي (PATCH) لبيانات المستخدم (الاسم، الهاتف مع فحص الفرادية، الدور، حالة التفعيل) داخل Transaction مع تطبيق قواعد حماية الذات (Self Protection) وحماية آخر مدير نظام فعال (Last SYSTEM_ADMIN Protection) باستخدام قفل قاعدة البيانات التشاؤمي (Pessimistic Write Lock)، وإلغاء الجلسات النشطة تلقائياً عند التعطيل.
    - `softDeleteUser`: أرشفة المستخدم (Soft Delete) عبر `deletedAt` وتعطيله مع إلغاء كافة جلساته النشطة داخل Transaction مع تطبيق حظر حذف الذات وحظر حذف آخر مدير نظام فعال بالقفل التشاؤمي. منع الحذف الصلب (Hard Delete) نهائياً.
  - واجهات برمجة التطبيقات (API Endpoints) المحمية بالصلاحيات:
    - `GET /api/system/users` (محمي بـ `USER_VIEW` والتحقق من الـ Query DTO وتخزين النتيجة في `req.validatedQuery` دون تعديل `req.query`).
    - `GET /api/system/users/:id` (محمي بـ `USER_VIEW` والتحقق من UUID).
    - `POST /api/system/users` (محمي بـ `USER_CREATE` و `CreateUserDto` مع Trim للمدخلات النصية).
    - `PATCH /api/system/users/:id` (محمي بـ `USER_UPDATE` و UUID و `UpdateUserDto` مع وسيط `validateUserUpdatePayload` لرفض الـ PATCH الفارغ).
    - `DELETE /api/system/users/:id` (محمي بـ `USER_DELETE` و UUID).
  - واجهات الويب المعروضة من الخادم (Server-rendered EJS):
    - `GET /system/users`: قائمة المستخدمين مع جدول متجاوب، بحث، ترقيم صفحات، وشارات الحالة وإجراءات سريعة باستخدام `data-*` attributes دون أي inline JavaScript string interpolation لمنع Stored XSS.
    - `GET /system/users/create`: نموذج إنشاء مستخدم مع التحقق بالمتصفح وبواسطة Bootstrap.
    - `GET /system/users/:id/edit`: نموذج تعديل المستخدم مع قفل الحقول الحساسة عند تعديل الحساب الشخصي.
  - تفاعل العميل (Client Scripts):
    - `src/public/js/users.js`: استخدام Native Fetch لجميع عمليات الإنشاء والتعديل والأرشفة، واستخدام Event Delegation على مستوى المستند، وتأكيد الحذف عبر SweetAlert2، ومعالجة رسائل الأخطاء والـ Validation Arrays وعرضها بشكل مفهوم للمستخدم، وحظر استخدام HTMX.
- **خدمة استعلام الأدوار (Role Lookup Service)** (`src/modules/system/role/role.service.ts`):
  - `findActiveRoleById`: استرجاع دور نشط وغير محذوف ناعماً للتحقق من صحة إسناد الدور للمستخدم.
  - `listActiveRoles`: استرجاع قائمة الأدوار النشطة لعرضها في نماذج إنشاء وتعديل المستخدمين.
- **إصلاحات وتصحيحات محرك الصلاحيات (Authorization Corrections)**:
  - إزالة الكود الميت `authorization.types.ts` لعدم استخدامه فعلياً.
  - تصحيح Seed منح صلاحيات `SYSTEM_ADMIN`: يضمن في كل تشغيل أن منح الدور لجميع الصلاحيات النشطة تكون `isActive = true`, `expiresAt = null`, `canDelegate = true`, `userId = null` بشكل Idempotent.
  - تصحيح Seed قواعد وصول `SYSTEM_ADMIN`: يضمن وجود وتفعيل قواعد `ALLOW ALL` لمدير النظام دون المساس أو الحذف التلقائي لقواعد `DENY` الصريحة الموجودة يدوياً.
  - الحفاظ على قاعدة تفوق الرفض (`DENY wins`) والانغلاق الافتراضي (Default Deny / Fail Closed) دون أي استثناء برمجي صلب لمدير النظام.
- **محرك الصلاحيات (Authorization Core - Phase 1)** (`src/modules/system/authorization/`):
  - خدمة الصلاحيات المركزية `AuthorizationService` (`src/modules/system/authorization/authorization.service.ts`) المسؤولة عن تقييم وصول المستخدمين عبر `hasPermission` واسترجاع قائمة الصلاحيات الفعالة الشاملة عبر `getEffectivePermissions`.
  - وسيط التحقق من الصلاحيات `requirePermission` (`src/modules/system/authorization/authorization.middleware.ts`) الذي يتحقق من هوية المستخدم الموثق ويمرر `ForbiddenError` برمز `PERMISSION_DENIED` عند عدم امتلاك الصلاحية.
  - دمج وتقييم منح الدور الأساسي للمستخدم (`Role Grants`) مع المنح المباشرة للمستخدم (`Direct User Grants`) في استعلام واحد محكم بدون N+1.
  - استبعاد المنح غير النشطة أو المنتهية زمنياً (`expires_at <= now`) والمنح التابعة لصلاحيات معطلة أو محذوفة ناعماً.
  - تطبيق قاعدة التفوق للرفض (`DENY ALL` wins) والانغلاق التلقائي (Default Deny / Fail Closed).
  - عدم وجود أي تجاوز برمجي صلب لدور مدير النظام (`No SYSTEM_ADMIN hardcoded bypass`)؛ بل يخضع لتقييم المنح والقواعد المسندة إليه في الـ Seed كأي مستخدم آخر.
  - النطاقات المكانية والفرعية غير الشاملة (مثل `DEPARTMENT`, `YARD`) تنغلق بأمان (Fail closed) في هذه المرحلة ولا تمنح وصولاً شاملاً (`ALL`).
- **وحدة المصادقة (Auth Module)** (`src/modules/system/auth/`) تشمل مسارات التحقق وتسجيل الدخول `POST /api/auth/login`، واسترجاع هوية المستخدم الموثق `GET /api/auth/me`، وتسجيل الخروج وإلغاء الجلسة `POST /api/auth/logout`.
- **خدمة الجلسات (SessionService)** (`src/modules/system/session/session.service.ts`) مسؤولة عن إنشاء الجلسات، والتحقق من صحتها وتطابق الهاش، والتحديث المؤجل لآخر استخدام (Throttled `touchSession`)، وإلغاء الجلسات الفردية (`revokeSession`)، وإلغاء كافة جلسات المستخدم عند التعطيل أو الأرشفة (`revokeUserSessions`).
- **أمان التوكن والجلسة (JWT & Session Security)**:
  - التوكن موقّع حصراً بخوارزمية `HS256` (توقيع وليس تشفيراً)، ولذلك لا يحتوي الـ Payload على أي بيانات حساسة أو صلاحيات، ويقتصر فقط على: `sub: userId` و `sid: sessionId` مع تحديد `issuer: 'erp-inshaat'` و `audience: 'erp-users'`.
  - الـ JWT الخام لا يُخزن في قاعدة البيانات مطلقاً، بل يُخزن فقط الهاش الناتج عن SHA-256 بطول 64 محرفاً داخل حقل `system_session.token_hash`.
  - الـ JWT لا يُرسل في استجابات الـ JSON ولا يُخزن في `localStorage` أو `sessionStorage`، بل يُدار حصراً عبر كوكيز `HttpOnly` باسم `erp_session` بخصائص `SameSite: Lax`, `Path: /`, `Secure: isProduction`.
  - متغير البيئة `AUTH_JWT_SECRET` إلزامي ويشترط ألا يقل طوله عن 32 محرفاً بدون أي قيمة افتراضية في الكود المصدري.
  - مدة الجلسة موحدة عبر `AUTH_SESSION_TTL_DAYS` (افتراضياً 30 يوماً) لكل من انتهاء JWT، وانتهاء سجل الجلسة، وانتهاء الكوكيز.
- **استراتيجية Passport JWT** (`src/modules/system/auth/passport-jwt.strategy.ts`):
  - قراءة التوكن من كوكيز `erp_session` بواسطة Custom Cookie Extractor.
  - التحقق من توقيع الـ JWT بخوارزمية `HS256` الصريحة، ثم التحقق من وجود الجلسة في `system_session` ومطابقة الهاش والفعالية `is_active = true` وعدم الإلغاء وعدم الانتهاء الزمني، ثم التحقق من وجود المستخدم وفعاليته وعدم حذفه ناعماً.
  - تمرير هوية المستخدم الآمنة كـ `AuthPrincipal` (`id`, `fullName`, `phone`, `roleId`, `sessionId`) داخل سياق الطلب `req.user`.
- **حماية المسارات (Route Protection)**:
  - صفحات الويب الإدارية (`GET /`, `GET /system`, `GET /system/users/*`) محمية بوسيط `requireWebAuth` مع التوجيه التلقائي للمستخدمين غير المسجلين إلى `/login`، وتمرير أي أخطاء نظام إلى المعالج المركزي، وتعيين `res.locals.user` وإلغاء التخزين المؤقت `Cache-Control: no-store`.
  - صفحة تسجيل الدخول `GET /login` تستخدم وسيط `redirectIfAuthenticated` لإعادة توجيه المسجلين مسبقاً إلى `/`.
  - مسارات الـ API المحمية تستخدم `requireApiAuth` وتعيد خطأ 401 بصيغة JSON المعيارية.
  - نقطة الفحص الصحي `GET /api/health` والملفات الثابتة تبقى عامة (Public).

---

## Project Structure

```text
src/
├── bootstrap/
│   ├── database.bootstrap.ts
│   └── passport.bootstrap.ts
├── common/
│   ├── errors/
│   │   ├── app.error.ts
│   │   ├── business-rule.error.ts
│   │   ├── conflict.error.ts
│   │   ├── forbidden.error.ts
│   │   ├── not-found.error.ts
│   │   ├── unauthorized.error.ts
│   │   └── validation.error.ts
│   ├── logging/
│   │   └── logger.ts
│   ├── middleware/
│   │   ├── error-handler.middleware.ts
│   │   ├── not-found.middleware.ts
│   │   ├── validate-dto.middleware.ts
│   │   ├── validate-query-dto.middleware.ts
│   │   └── validate-uuid-param.middleware.ts
│   ├── responses/
│   │   └── api-response.ts
│   ├── security/
│   │   ├── password.util.ts
│   │   └── token-hash.util.ts
│   └── types/
│       └── express.d.ts
├── config/
│   ├── database.config.ts
│   ├── env.config.ts
│   └── multer.config.ts
├── database/
│   ├── migrations/
│   │   ├── 1710000000000-CreateSystemCoreTables.ts
│   │   └── 1710000000001-CreateSystemSessionTable.ts
│   ├── seeds/
│   │   └── system-initial.seed.ts
│   └── data-source.ts
├── modules/
│   └── system/
│       ├── access-rule/
│       │   ├── seeds/
│       │   │   └── system-admin-access-rules.seed.ts
│       │   └── access-rule.entity.ts
│       ├── auth/
│       │   ├── dto/
│       │   │   └── login.dto.ts
│       │   ├── auth.constants.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.middleware.ts
│       │   ├── auth.route.ts
│       │   ├── auth.service.ts
│       │   ├── auth.types.ts
│       │   └── passport-jwt.strategy.ts
│       ├── authorization/
│       │   ├── authorization.middleware.ts
│       │   └── authorization.service.ts
│       ├── permission/
│       │   ├── constants/
│       │   │   └── system-permission.enum.ts
│       │   ├── seeds/
│       │   │   └── system-user-permissions.seed.ts
│       │   └── permission.entity.ts
│       ├── permission-grant/
│       │   ├── seeds/
│       │   │   └── system-admin-permission-grants.seed.ts
│       │   └── permission-grant.entity.ts
│       ├── role/
│       │   ├── constants/
│       │   │   └── system-role.enum.ts
│       │   ├── seeds/
│       │   │   └── system-admin-role.seed.ts
│       │   ├── role.entity.ts
│       │   └── role.service.ts
│       ├── session/
│       │   ├── session.entity.ts
│       │   └── session.service.ts
│       └── user/
│           ├── dto/
│           │   ├── create-user.dto.ts
│           │   ├── update-user.dto.ts
│           │   └── list-users-query.dto.ts
│           ├── seeds/
│           │   └── system-admin-user.seed.ts
│           ├── user.controller.ts
│           ├── user.web.controller.ts
│           ├── user.entity.ts
│           ├── user.middleware.ts
│           ├── user.route.ts
│           ├── user.service.ts
│           └── user.types.ts
├── public/
│   ├── css/
│   │   ├── app.css
│   │   └── auth.css
│   └── js/
│       ├── app.js
│       ├── login.js
│       └── users.js
├── routes/
│   ├── api.route.ts
│   ├── index.ts
│   └── web.route.ts
├── views/
│   ├── dashboard/
│   │   ├── partials/
│   │   │   ├── footer.ejs
│   │   │   ├── head.ejs
│   │   │   ├── navbar.ejs
│   │   │   └── scripts.ejs
│   │   ├── system/
│   │   │   ├── partials/
│   │   │   │   └── sidebar.ejs
│   │   │   ├── users/
│   │   │   │   ├── create.ejs
│   │   │   │   ├── edit.ejs
│   │   │   │   └── index.ejs
│   │   │   ├── index.ejs
│   │   │   └── layout.ejs
│   │   ├── index.ejs
│   │   └── layout.ejs
│   ├── error.ejs
│   └── login.ejs
├── app.ts
└── server.ts
```

---

## Constants & Enums

### `SystemRole`
- **File**: `src/modules/system/role/constants/system-role.enum.ts`
- **Purpose**: المصدر الثابت لتعريف كودات أدوار النظام.
- **Values**:
  - `SYSTEM_ADMIN = 'SYSTEM_ADMIN'` (مدير النظام)

### `SystemPermission`
- **File**: `src/modules/system/permission/constants/system-permission.enum.ts`
- **Purpose**: المصدر الثابت والوحيد (Single Source of Truth) لكودات صلاحيات النظام.
- **Values**:
  - `USER_VIEW = 'system.user.view'` (عرض المستخدمين)
  - `USER_CREATE = 'system.user.create'` (إنشاء مستخدم)
  - `USER_UPDATE = 'system.user.update'` (تعديل بيانات المستخدم)
  - `USER_DELETE = 'system.user.delete'` (حذف المستخدم)

### `AuthConstants`
- **File**: `src/modules/system/auth/auth.constants.ts`
- **Purpose**: الثوابت الخاصة بالمصادقة والكوكيز.
- **Values**:
  - `AUTH_COOKIE_NAME = 'erp_session'`
  - `AUTH_JWT_ISSUER = 'erp-inshaat'`
  - `AUTH_JWT_AUDIENCE = 'erp-users'`

---

## User Management Core Infrastructure

### `UserService` (`src/modules/system/user/user.service.ts`)
- **Purpose**: تنفيذ منطق الأعمال، وقواعد التحقق، وحماية الحسابات، وإدارة دورة حياة المستخدمين.
- **Methods**:
  - `listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersResult>`
    - **Input**: `query` (`page`, `limit`, `search`).
    - **Action**: استعلام مقسم لصفحات مع البحث بالاسم أو رقم الهاتف، ضم اسم الدور، استبعاد السجلات المحذوفة ناعماً، وترتيب النتائج تنازلياً حسب تاريخ الإنشاء.
    - **Output**: `{ items: SafeUserOutput[], total, page, limit, totalPages }`.
  - `getUserById(id: string): Promise<SafeUserOutput>`
    - **Input**: `id` (UUID).
    - **Action**: استرجاع المستخدم غير المحذوف ناعماً مع دوره ورمي `NotFoundError` إذا لم يوجد.
    - **Output**: `SafeUserOutput` (بدون `passwordHash`).
  - `createUser(dto: CreateUserDto): Promise<SafeUserOutput>`
    - **Input**: `CreateUserDto` (`fullName`, `phone`, `password`, `roleId`, `isActive`).
    - **Action**:
      1. التحقق من عدم وجود رقم الهاتف مسبقاً (مع فحص السجلات المحذوفة ناعماً `withDeleted()`) ورمي `ConflictError` عند التكرار.
      2. التحقق من وجود ونشاط الدور المحدد عبر `RoleService.findActiveRoleById` ورمي `NotFoundError` إذا لم يكن صالحاً.
      3. تشفير كلمة المرور باستخدام `hashPassword`.
      4. حفظ المستخدم وإرجاع بياناته الآمنة.
    - **Output**: `SafeUserOutput`.
  - `updateUser(id: string, dto: UpdateUserDto, currentPrincipal: AuthPrincipal): Promise<SafeUserOutput>`
    - **Input**: `id`, `UpdateUserDto` (`fullName`, `phone`, `roleId`, `isActive`), `currentPrincipal`.
    - **Action**:
      1. **حماية الذات**: التحقق المبدئي من منع المستخدم من تعطيل حسابه الحالي.
      2. **Transaction**: بدء Transaction وإعادة تحميل المستخدم المستهدف من قاعدة البيانات.
      3. **حماية الدور الشخصي**: منع المستخدم من تغيير دوره الخاص على السجل المحمل حديثاً.
      4. **حماية آخر مدير نظام بقفل تشاؤمي**: إذا كانت العملية ستؤدي لتعطيل مدير نظام فعال أو نقله لدور آخر، يتم فرض Pessimistic Write Lock (`setLock('pessimistic_write')`) على سجلات مدراء النظام الفعالة والتحقق من أن عددهم يتجاوز 1 لمنع أي Race Condition متزامن.
      5. **التحقق من الدور الجديد**: التأكد من كون الدور نشطاً وغير محذوف ناعماً.
      6. **فرادية الهاتف**: التحقق من عدم استخدام الهاتف الجديد من قبل حساب آخر (يشمل المحذوفين ناعماً).
      7. **حفظ التعديلات**: حفظ الكيان وإلغاء الجلسات النشطة تلقائياً عبر `SessionService.revokeUserSessions` في حال تحول المستخدم إلى غير نشط (`isActive = false`).
    - **Output**: `SafeUserOutput`.
  - `softDeleteUser(id: string, currentPrincipal: AuthPrincipal): Promise<{ success: boolean; message: string }>`
    - **Input**: `id`, `currentPrincipal`.
    - **Action**:
      1. منع حذف المستخدم لنفسه (`Self Protection`).
      2. **Transaction**: إعادة تحميل المستخدم وفرض Pessimistic Write Lock على مدراء النظام في حال كان المستهدف مدير نظام فعال للتحقق من عدم كونه الأخير.
      3. إلغاء الجلسات النشطة، ضبط `isActive = false`، وتنفيذ `softDelete` للكيان.
    - **Output**: `{ success: true, message: 'تم أرشفة المستخدم بنجاح' }`.

### `RoleService` (`src/modules/system/role/role.service.ts`)
- **Purpose**: خدمة مساعدة لاستعلام الأدوار الصالحة للإسناد في إدارة المستخدمين.
- **Methods**:
  - `findActiveRoleById(roleId: string, manager?: EntityManager): Promise<RoleEntity | null>`: استرجاع دور نشط وغير محذوف ناعماً.
  - `listActiveRoles(manager?: EntityManager): Promise<RoleEntity[]>`: استرجاع قائمة جميع الأدوار النشطة غير المحذوفة مرتبة أبجدياً.

### `User DTOs` (`src/modules/system/user/dto/`)
- `CreateUserDto`: التحقق من الاسم الكامل (2-150 مع Trim تلقائي عبر `@Transform`)، الهاتف (`^09[0-9]{8}$` مع Trim)، كلمة المرور (6 محارف على الأقل بدون Trim)، `roleId` (UUID v4)، وحالة التفعيل الاختيارية.
- `UpdateUserDto`: يدعم التحديث الجزئي (PATCH) مع Trim للمدخلات النصية وخلوه التام من حقول كلمات المرور أو الصلاحيات.
- `ListUsersQueryDto`: التحقق وتحويل معاملات الاستعلام (`page` افتراضي 1، `limit` افتراضي 20 بحد أقصى 100، `search` نصي مع Trim).

### `Generic Middlewares & Types` (`src/common/middleware/`)
- `validateQueryDto(DtoClass)`: وسيط لإجراء التحقق من استعلامات الـ URL (`req.query`) باستخدام `class-transformer` و `class-validator` وتخزين الكائن المحقق داخل `req.validatedQuery` دون التعديل على `req.query`.
- `validateUuidParam(paramName)`: وسيط للتحقق من صحة معاملات الـ URL (`req.params`) وتطابقها مع نمط UUID v4.
- `validateUserUpdatePayload`: وسيط مخصص للتحقق من احتواء طلب الـ PATCH على حقل واحد على الأقل مع قبول `isActive: false` كقيمة صحيحة.

---

## Authentication & Core Services

### `AuthService` (`src/modules/system/auth/auth.service.ts`)
- **Purpose**: تنفيذ منطق التحقق من بيانات الدخول، وتوليد JWT، وإنشاء سجلات الجلسات في قاعدة البيانات.
- **Methods**:
  - `login(dto: LoginDto, context: AuthContext): Promise<LoginResult>`
    - **Input**: `LoginDto` (`phone`, `password`), `context` (`ipAddress`, `userAgent`).
    - **Action**:
      1. البحث عن المستخدم في جدول `system_user` برقم الهاتف (مع استبعاد المحذوفين ناعماً).
      2. التحقق من تطابق كلمة المرور باستخدام `comparePassword` (bcrypt).
      3. إذا لم يوجد المستخدم أو كانت كلمة المرور غير متطابقة، يتم إرجاع `UnauthorizedError` موحدة لحماية النظام من هجمات تخمين الحسابات (User Enumeration).
      4. التحقق من فعالية المستخدم `user.isActive`، ورمي `ForbiddenError` إذا كان الحساب معطلاً.
      5. توليد `sessionId` كـ UUID v4.
      6. توقيع JWT بخوارزمية `HS256` يحتوي فقط على `{ sub: user.id, sid: sessionId }` مع مدة صلاحية محددة.
      7. حساب الهاش SHA-256 للـ JWT وتمريره لخدمة الجلسات لإنشاء سجل `system_session`.
    - **Output**: `{ user: SafeUser, token: string, expiresAt: Date, sessionId: string }`.

### `SessionService` (`src/modules/system/session/session.service.ts`)
- **Purpose**: إدارة دورة حياة الجلسات في قاعدة البيانات (`system_session`).
- **Methods**:
  - `createSession(params: CreateSessionParams, manager?: EntityManager): Promise<SessionEntity>`: إنشاء وحفظ سجل جلسة جديد.
  - `validateSession(sessionId: string, userId: string, rawToken: string): Promise<SessionEntity | null>`:
    - حساب SHA-256 للـ `rawToken`.
    - التحقق من وجود الجلسة ومطابقة `id`, `user_id`, `token_hash`, وكونها `is_active: true`, و `revoked_at IS NULL`, و `expires_at > now`.
  - `touchSession(sessionId: string, currentLastUsedAt: Date): Promise<void>`:
    - تحديث مؤجل (Throttled) لحقل `last_used_at` إذا كان الفارق الزمني 5 دقائق أو أكثر لتجنب الضغط على قاعدة البيانات.
  - `revokeSession(sessionId: string, reason: string = 'LOGOUT', manager?: EntityManager): Promise<void>`:
    - إلغاء الجلسة بوضع `is_active = false`, `revoked_at = now()`, `revoked_reason = reason`.
  - `revokeUserSessions(userId: string, reason: string = 'USER_DEACTIVATED', manager?: EntityManager): Promise<void>`:
    - إلغاء كافة الجلسات النشطة لمستخدم معين عند تعطيل حسابه أو أرشفته ناعماً.

---

## Authorization Core Services (Phase 1)

### `AuthorizationService` (`src/modules/system/authorization/authorization.service.ts`)
- **Purpose**: تقييم الصلاحيات الفعالة للمستخدمين بناءً على المنح المطبقة (منح الدور + المنح المباشرة) وقواعد الوصول المقترنة بها.
- **Methods**:
  - `hasPermission(principal: AuthPrincipal, permissionName: string): Promise<boolean>`
    - **Input**: `principal` (`AuthPrincipal`), `permissionName` (`string`).
    - **Action**:
      1. يستعلم عن جميع القواعد الفعالة (`rule.isActive = true`, `rule.scopeType = 'ALL'`) التابعة لمنح فعالة (`grant.isActive = true`, `grant.expiresAt > now OR NULL`) الموجهة لدور المستخدم (`roleId`) أو للمستخدم مباشرة (`userId`).
      2. يتأكد من كون الصلاحية نشطة (`permission.isActive = true`) وغير محذوفة ناعماً (`permission.deletedAt IS NULL`).
      3. إذا وجدت أي قاعدة `DENY`، ترجع الدالة `false` فوراً (`DENY ALL` wins).
      4. إذا وجدت قاعدة واحدة على الأقل `ALLOW` ولم يوجد أي `DENY`، ترجع الدالة `true`.
      5. في حال غياب قواعد `ALLOW ALL`، ترجع الدالة `false` (Fail Closed / Default Deny).
    - **Output**: `boolean`.
  - `getEffectivePermissions(principal: AuthPrincipal): Promise<string[]>`
    - **Input**: `principal` (`AuthPrincipal`).
    - **Action**: استعلام تجميعي موحد (Single aggregated QueryBuilder without N+1) يستخرج كافة أسماء الصلاحيات التي يمتلك المستخدم عليها قاعدة `ALLOW ALL` نشطة بدون أي قاعدة `DENY ALL`.
    - **Output**: `string[]` (مثل `['system.user.view', 'system.user.create', ...]`).

### `Authorization Middleware` (`src/modules/system/authorization/authorization.middleware.ts`)
- `requirePermission(permissionName: string)`:
  - **Input**: `permissionName` (اسم الصلاحية المطلوب فحصها).
  - **Action**:
    1. يتحقق من وجود المستخدم الموثق `req.user`، وإذا لم يوجد يمرر `UnauthorizedError` (HTTP 401).
    2. يستدعي `authorizationService.hasPermission(req.user, permissionName)`.
    3. إذا كانت النتيجة `true`، يمرر التنفيذ للوسيط التالي عبر `next()`.
    4. إذا كانت النتيجة `false`، يمرر `ForbiddenError('ليس لديك صلاحية لتنفيذ هذا الإجراء', 'PERMISSION_DENIED')` (HTTP 403) إلى معالج الأخطاء المركزي.

---

## Seed Infrastructure

### Seed Execution Order & Module Ownership
1. **System Admin Role Seed** (`src/modules/system/role/seeds/system-admin-role.seed.ts`) $\rightarrow$ ينشئ أو يسترجع دور `SystemRole.SYSTEM_ADMIN`.
2. **System User Permissions Seed** (`src/modules/system/permission/seeds/system-user-permissions.seed.ts`) $\rightarrow$ ينشئ أو يسترجع الصلاحيات المعرفة في `SystemPermission`.
3. **System Admin User Seed** (`src/modules/system/user/seeds/system-admin-user.seed.ts`) $\rightarrow$ ينشئ مستخدم مدير النظام `0912312312` ويستدعي منح الصلاحيات وقواعد الوصول.
4. **SYSTEM_ADMIN Permission Grants Seed** (`src/modules/system/permission-grant/seeds/system-admin-permission-grants.seed.ts`) $\rightarrow$ يضمن في كل تشغيل أن دور `SYSTEM_ADMIN` يمتلك منحة نشطة وغير منتهية مع `can_delegate: true` و `userId = null` لكل صلاحية نشطة.
5. **SYSTEM_ADMIN Access Rules Seed** (`src/modules/system/access-rule/seeds/system-admin-access-rules.seed.ts`) $\rightarrow$ يضمن وجود وتفعيل قواعد `ALLOW` / `ALL` لكل منحة صلاحية خاصة بمدير النظام دون حذف قواعد الـ DENY الصريحة.

### Seed Idempotency & Security Rules
- **Idempotency**: يعتمد التحقق على المفاتيح الطبيعية (`Role.code`, `Permission.name`, `User.phone`, `Grant(roleId + permissionId)`, `Rule(grantId + effect + scopeType)`).
- **Password Security**:
  - متغير البيئة `SEED_SYSTEM_ADMIN_PASSWORD` إلزامي فقط عند إنشاء مستخدم المدير لأول مرة.
  - لا توجد أي كلمة مرور افتراضية (No fallback) في الكود المصدري.
  - تشفير كلمة المرور بـ `bcrypt` قبل التخزين.
  - حماية كلمات مرور المستخدمين المنشئين مسبقاً من إعادة التعيين أو التغيير عند تكرار تشغيل `npm run seed`.
- **SYSTEM_ADMIN Auto-Grants & Safe Updates**: عند تشغيل الـ Seed، يتم تحديث أي منح قديمة معطلة أو منتهية لمدير النظام لتصبح نشطة ودائمة مع قواعد `ALLOW ALL`، مع الحفاظ على أي قواعد `DENY` صريحة أضافها المستخدم يدوياً.

---

## Database Structure

### `system_role`
- **Entity**: `RoleEntity` (`src/modules/system/role/role.entity.ts`)
- **Purpose**: تعريف الأدوار الأساسية للمستخدمين في النظام.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `name`: varchar(100), NOT NULL
  - `code`: varchar(50), NOT NULL, UNIQUE (`UQ_system_role_code`)
  - `description`: text, NULL
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
  - `deleted_at`: datetime(6), NULL (Soft Delete)
- **Relations**:
  - `users`: OneToMany $\rightarrow$ `UserEntity` (`eager: false`, `cascade: false`)
  - `permissionGrants`: OneToMany $\rightarrow$ `PermissionGrantEntity` (`eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `UQ_system_role_code`: UNIQUE(`code`)

---

### `system_user`
- **Entity**: `UserEntity` (`src/modules/system/user/user.entity.ts`)
- **Purpose**: تمثيل حسابات المستخدمين في النظام مع ارتباط كل مستخدم بدور أساسي واحد.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `full_name`: varchar(150), NOT NULL
  - `phone`: varchar(20), NOT NULL, UNIQUE (`UQ_system_user_phone`)
  - `password_hash`: varchar(255), NOT NULL
  - `role_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `system_role.id`
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
  - `deleted_at`: datetime(6), NULL (Soft Delete)
- **Relations**:
  - `role`: ManyToOne $\rightarrow$ `RoleEntity` (`role_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, `eager: false`)
  - `permissionGrants`: OneToMany $\rightarrow$ `PermissionGrantEntity` (Direct grants to user, `eager: false`, `cascade: false`)
  - `grantedPermissions`: OneToMany $\rightarrow$ `PermissionGrantEntity` (Grants issued by this user, `eager: false`, `cascade: false`)
  - `sessions`: OneToMany $\rightarrow$ `SessionEntity` (Active and past user sessions, `eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `UQ_system_user_phone`: UNIQUE(`phone`)
  - `IDX_system_user_role_id`: INDEX(`role_id`)
  - `FK_system_user_role_id`: FOREIGN KEY (`role_id`) REFERENCES `system_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE

---

### `system_permission`
- **Entity**: `PermissionEntity` (`src/modules/system/permission/permission.entity.ts`)
- **Purpose**: تعريف الصلاحيات المتاحة في النظام بنمط `<application>.<resource>.<action>`.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `name`: varchar(150), NOT NULL, UNIQUE (`UQ_system_permission_name`)
  - `description`: text, NULL
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
  - `deleted_at`: datetime(6), NULL (Soft Delete)
- **Relations**:
  - `permissionGrants`: OneToMany $\rightarrow$ `PermissionGrantEntity` (`eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `UQ_system_permission_name`: UNIQUE(`name`)

---

### `system_permission_grant`
- **Entity**: `PermissionGrantEntity` (`src/modules/system/permission-grant/permission-grant.entity.ts`)
- **Purpose**: تمثيل منح صلاحية محددة إما لمستخدم مباشرة أو لدور معين (Exactly one target via XOR check).
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `permission_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `system_permission.id`
  - `user_id`: varchar(36) UUID, NULL, FK $\rightarrow$ `system_user.id`
  - `role_id`: varchar(36) UUID, NULL, FK $\rightarrow$ `system_role.id`
  - `can_delegate`: tinyint(1), NOT NULL, default: 0
  - `granted_by`: varchar(36) UUID, NULL, FK $\rightarrow$ `system_user.id`
  - `granted_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `expires_at`: datetime(6), NULL
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `reason`: text, NULL
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
- **Relations**:
  - `permission`: ManyToOne $\rightarrow$ `PermissionEntity` (`permission_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`)
  - `user`: ManyToOne $\rightarrow$ `UserEntity` (`user_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, nullable: true)
  - `role`: ManyToOne $\rightarrow$ `RoleEntity` (`role_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, nullable: true)
  - `grantedByUser`: ManyToOne $\rightarrow$ `UserEntity` (`granted_by`, `onDelete: SET NULL`, `onUpdate: CASCADE`, nullable: true)
  - `accessRules`: OneToMany $\rightarrow$ `AccessRuleEntity` (`eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `CHK_system_permission_grant_target`: CHECK `((user_id IS NOT NULL AND role_id IS NULL) OR (user_id IS NULL AND role_id IS NOT NULL))`
  - `IDX_system_permission_grant_permission_id`: INDEX(`permission_id`)
  - `IDX_system_permission_grant_user_id`: INDEX(`user_id`)
  - `IDX_system_permission_grant_role_id`: INDEX(`role_id`)
  - `IDX_system_permission_grant_granted_by`: INDEX(`granted_by`)
  - `IDX_system_permission_grant_is_active`: INDEX(`is_active`)
  - `IDX_system_permission_grant_expires_at`: INDEX(`expires_at`)

---

### `system_access_rule`
- **Entity**: `AccessRuleEntity` (`src/modules/system/access-rule/access-rule.entity.ts`)
- **Purpose**: تحديد نطاق البيانات (Row/Scope Filter) المسموح أو الممنوع لمنحة صلاحية معينة.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `permission_grant_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `system_permission_grant.id`
  - `effect`: varchar(10), NOT NULL ('ALLOW' | 'DENY')
  - `scope_type`: varchar(50), NOT NULL
  - `scope`: json, NULL (Business metadata for scope filtering)
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `description`: text, NULL
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
- **Relations**:
  - `permissionGrant`: ManyToOne $\rightarrow$ `PermissionGrantEntity` (`permission_grant_id`, `onDelete: CASCADE`, `onUpdate: CASCADE`)
- **Constraints / Indexes**:
  - `CHK_system_access_rule_effect`: CHECK `(effect IN ('ALLOW', 'DENY'))`
  - `IDX_system_access_rule_permission_grant_id`: INDEX(`permission_grant_id`)
  - `IDX_system_access_rule_effect`: INDEX(`effect`)
  - `IDX_system_access_rule_scope_type`: INDEX(`scope_type`)
  - `IDX_system_access_rule_is_active`: INDEX(`is_active`)

---

### `system_session`
- **Entity**: `SessionEntity` (`src/modules/system/session/session.entity.ts`)
- **Purpose**: تخزين جلسات تسجيل دخول المستخدمين بشكل دائم مع التحقق من الهاش، وتعدد الأجهزة، وتتبع آخر استخدام، وتاريخ الإلغاء.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `user_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `system_user.id`
  - `token_hash`: varchar(64), NOT NULL, UNIQUE (`UQ_system_session_token_hash`)
  - `device_type`: varchar(50), NULL (نوع الجهاز بصورة عامة للعرض)
  - `device_name`: varchar(150), NULL (اسم وصفي للجهاز للعرض)
  - `browser`: varchar(50), NULL (اسم المتصفح)
  - `os`: varchar(50), NULL (نظام التشغيل)
  - `user_agent`: text, NULL (نص User-Agent الخام القادم من الطلب)
  - `ip_address`: varchar(45), NULL (عنوان IP للطلب يدعم IPv4 و IPv6)
  - `last_used_at`: datetime(6), NOT NULL (آخر وقت تم فيه استخدام الجلسة بنجاح)
  - `expires_at`: datetime(6), NOT NULL (وقت الانتهاء التلقائي للجلسة)
  - `is_active`: tinyint(1), NOT NULL, default: 1 (حالة فعالية الجلسة)
  - `revoked_at`: datetime(6), NULL (تاريخ ووقت إلغاء الجلسة يدوياً إن وُجد)
  - `revoked_reason`: text, NULL (سبب إلغاء الجلسة مثل Logout أو Admin Revoke)
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
- **Relations**:
  - `user`: ManyToOne $\rightarrow$ `UserEntity` (`user_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, `eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `UQ_system_session_token_hash`: UNIQUE(`token_hash`)
  - `IDX_system_session_user_id`: INDEX(`user_id`)
  - `IDX_system_session_expires_at`: INDEX(`expires_at`)
  - `IDX_system_session_is_active`: INDEX(`is_active`)
  - `IDX_system_session_user_is_active`: INDEX(`user_id`, `is_active`)

---

## Architectural Rules

1. **User Management & Security Invariants**:
   - حذف المستخدمين يتم حصراً عبر الحذف الناعم (`Soft Delete`)؛ يُمنع الحذف الصلب (`Hard Delete`) نهائياً.
   - يُمنع إرجاع `passwordHash` في أي استجابات Backend (API أو Views أو List أو Detail).
   - تعطيل المستخدم أو أرشفته/حذفه ناعماً يؤدي تلقائياً إلى إلغاء كافة جلساته النشطة داخل Transaction (`Revoke Active Sessions`).
   - حماية الذات (`Self Protection`): لا يمكن للمستخدم تعطيل حسابه الحالي أو حذفه ناعماً أو تغيير دوره من خلال إدارة المستخدمين العامة.
   - حماية مدير النظام الأخير (`Last SYSTEM_ADMIN Protection`): يتم التحقق منها داخل نفس الـ Transaction الخاصة بالعملية، مع قفل سجلات مدراء النظام الفعالة عبر Database Pessimistic Write Lock (`setLock('pessimistic_write')`) لمنع حدوث أي Race Condition عند حدوث طلبات تعديل/تعطيل/حذف متزامنة.
   - إخفاء العناصر والأزرار في واجهة المستخدم (`UI Visibility`) ليس بديلاً عن الصلاحيات الأمنية؛ يجب على الـ APIs التحقق الصارم من الصلاحيات.
   - فرادية رقم الهاتف (`Unique Phone`): يُمنع تكرار رقم الهاتف مع أي حساب موجود في النظام بما في ذلك الحسابات المحذوفة ناعماً.

2. **System Permission & Access Control Architecture (Implemented Phase 1)**:
   - **المفاهيم الأساسية**:
     - **Authentication**: من هو المستخدم؟ (`Identity`)
     - **Authorization**: ماذا يستطيع المستخدم فعله؟ (`Permissions & Access`)
     - **Permission**: يحدد نوع العملية فقط (`WHAT`) مثل `system.user.view`، ولا يحتوي على نطاقات بيانات أو شروط.
     - **PermissionGrant**: يحدد المستفيد من المنحة (`WHO`) إما مستخدم محدد أو دور محدد (حصراً أحدهما عبر XOR constraint).
     - **AccessRule**: يحدد نطاق البيانات المتاح للمنحة (`WHICH DATA`) مع تحديد الأثر (`ALLOW` أو `DENY`).
   - **قواعد التقييم الفعال (Evaluation Rules)**:
     - **المصادر المدمجة**: تُجمع المنح المطبقة للمستخدم من مصدرين: منح دوره الأساسي (`Role Grants`) ومنحه المباشرة (`Direct User Grants`).
     - **التحقق من الصلاحية والفعالية**: تُستبعد أي منحة غير نشطة (`isActive = false`) أو منتهية زمنياً (`expiresAt <= now`) أو مرتبطة بصلاحية معطلة أو محذوفة ناعماً.
     - **قاعدة الحسم**: `(ALLOW 1 OR ALLOW 2 ...) AND NOT (DENY 1 OR DENY 2 ...)`.
     - **تفوق الرفض (`DENY ALL` wins)**: أي قاعدة `DENY ALL` على أي منحة مطبقة للمستخدم لنفس الصلاحية تلغي وتتفوق على أي `ALLOW ALL` قادمة من Role أو Direct Grant.
     - **الانغلاق الافتراضي (Fail Closed / Default Deny)**: غياب أي قاعدة `ALLOW ALL` نشطة يعني رفض الوصول مباشرة.
     - **النطاقات غير المدعومة**: النطاقات الفرعية (مثل `DEPARTMENT`, `YARD`) لا تمنح وصولاً شاملاً (`ALL`) في هذه المرحلة وتنغلق بأمان.
     - **عدم وجود استثناء لمدير النظام**: دور `SYSTEM_ADMIN` لا يمتلك أي Hardcoded Bypass، ويمر عبر نفس محرك الصلاحيات مستنداً إلى المنح والقواعد المعرفة في الـ Seed.
     - **فصل التفويض**: حقل `can_delegate` لا يؤثر على وصول المستخدم الحالي للعملية.

3. **User Role & Session Architecture**:
   - لكل مستخدم دور أساسي واحد فقط (`system_user.role_id` $\rightarrow$ `system_role.id`).
   - للمستخدم الواحد عدة جلسات نشطة في نفس الوقت (`system_user` $1 \rightarrow N$ `system_session`).
   - **قاعدة الأمان للـ Token**: الـ JWT الأصلي لا يُخزن مطلقاً داخل قاعدة البيانات، بل يُخزن `token_hash` فقط (SHA-256 بطول 64 محرفاً)، بينما يبقى الـ JWT الفعلي داخل HttpOnly Cookie.
   - **دورة حياة الجلسة (Session Lifecycle)**: تعتمد صلاحية الجلسة على `(is_active = true AND revoked_at IS NULL AND expires_at > now AND token_hash matches)`. لا يتم استخدام Soft Delete للجلسات للاحتفاظ بسجل تدقيق كامل.
   - بيانات الجهاز (`device_type`, `device_name`, `browser`, `os`, `user_agent`) هي بيانات وصفية للعرض وإدارة الأجهزة وليست مصدراً للثقة الأمنية.

4. **Authentication Flows (Implemented)**:
   - **تدفق تسجيل الدخول (Login Flow)**:
     `phone + password` $\rightarrow$ `DTO Validation (LoginDto)` $\rightarrow$ `Find User in DB` $\rightarrow$ `Verify Password (bcrypt compare)` $\rightarrow$ `Verify User Active` $\rightarrow$ `Generate Session UUID (sid)` $\rightarrow$ `Sign JWT (sub=userId, sid=sessionId, algorithm=HS256)` $\rightarrow$ `Compute Token Hash (SHA-256)` $\rightarrow$ `Create system_session in DB` $\rightarrow$ `Set HttpOnly Cookie (erp_session)` $\rightarrow$ `Return Safe User JSON`.
   - **تدفق الطلب الموثق (Authenticated Request Flow)**:
     `Request with HttpOnly Cookie (erp_session)` $\rightarrow$ `Extract JWT` $\rightarrow$ `Verify JWT Signature (Passport with algorithm HS256, issuer, audience)` $\rightarrow$ `Compute Token Hash (SHA-256)` $\rightarrow$ `Validate Session in DB (sid, sub, token_hash, isActive=true, revokedAt=null, expiresAt>now)` $\rightarrow$ `Validate User in DB (active, un-deleted)` $\rightarrow$ `Throttled Await touchSession (last_used_at)` $\rightarrow$ `Attach req.user (AuthPrincipal)` $\rightarrow$ `Set res.locals.user & No-Store Headers` $\rightarrow$ `Route Handler / Render / JSON`.
   - **تدفق تسجيل الخروج (Logout Flow)**:
     `POST /api/auth/logout (Protected)` $\rightarrow$ `Revoke Current Session (isActive=false, revokedAt=now, reason='LOGOUT')` $\rightarrow$ `Clear erp_session HttpOnly Cookie` $\rightarrow$ `Return Success JSON` $\rightarrow$ `Client Redirects to /login`.

5. **Data Integrity & Persistence**:
   - جميع المفاتيح الأساسية UUID v4.
   - جميع العلاقات `eager: false` و `cascade: false` (باستثناء حذف منحة الصلاحية الذي يحذف قواعد الوصول التابعة لها `CASCADE`).
   - الحذف الناعم (Soft Delete) عبر `deleted_at` للكيانات الأساسية (`Role`, `User`, `Permission`).
   - جميع تعديلات المخطط (Schema) تتم حصراً عبر الـ Migrations مع بقاء `synchronize: false`.

6. **Seed Architecture & Rules**:
   - كل Seeder ينتمي حصراً إلى الـ Module المالك للبيانات (`permission-grant` للـ Grants، و `access-rule` للـ Rules).
   - الـ Seed Runner مسؤول فقط عن تهيئة الاتصال وتنظيم تسلسل التنفيذ داخل Transaction.
   - الـ Seed Idempotent بالكامل ويعتمد على المفاتيح الطبيعية لمنع التكرار.
   - منع وجود أي كلمات مرور افتراضية (Fallback) في الكود، وإلزامية متغير البيئة عند إنشاء مدير النظام لأول مرة.
   - حماية كلمات مرور المستخدمين المنشئين مسبقاً من إعادة التعيين أثناء إعادة تشغيل الـ Seed.
   - استخدام ثوابت الصلاحيات من `SystemPermission` enum وثوابت الأدوار من `SystemRole` enum بدلاً من تكرار النصوص.
   - دور `SYSTEM_ADMIN` يحصل تلقائياً على جميع الصلاحيات النشطة عند تشغيل الـ Seed مع قواعد `ALLOW ALL`.

7. **Client Interaction & Views**:
   - صفحات الواجهة تعتمد على العرض من طرف الخادم (Server-rendered EJS pages).
   - التفاعل مع الواجهات البرمجية يتم باستخدام `native fetch` للعمليات التي تعتمد على JSON API.
   - استخدام `data-*` attributes والـ Event Delegation لمنع حقن نصوص المستخدم في JavaScript والوقاية من ثغرات Stored XSS.
   - المشروع لا يعتمد ولا يستخدم مكتبة HTMX.

8. **Graceful Shutdown**:
   - عند استقبال إشارات الإيقاف (`SIGINT`, `SIGTERM`)، يتم انتظار إغلاق خادم HTTP (`server.close()`) وتوقف استقبال الطلبات، ثم محاولة إغلاق اتصال قاعدة البيانات (`AppDataSource.destroy()`) بشكل مستقل حتى في حال فشل إغلاق خادم HTTP.
   - وجود حماية تمنع تنفيذ الإيقاف أكثر من مرة بالتوازي (`isShuttingDown` guard).
   - ضبط `process.exitCode` (0 عند النجاح، 1 عند وجود خطأ في أي مرحلة) بدلاً من الخروج القسري المباشر.

9. **Backend Validation Flow**:
   - `Route` $\rightarrow$ `validateDto(Dto)` $\rightarrow$ `Controller` $\rightarrow$ `Service`.
   - استخدام `class-validator` و `class-transformer`.
   - تنظيف وتجريد المدخلات النصية (`Trim via @Transform`) قبل تشغيل قواعد التحقق لمنع إدخال مسافات فارغة فقط.
   - عدم تكرار التحقق من الـ DTO داخل الـ Controllers.
   - عدم بناء استجابات HTTP مباشرة داخل وسيط التحقق، وتمرير الأخطاء عبر المعالج المركزي.
   - حظر ورفض أي حقول غير معرفة في الـ DTO تلقائياً.
   - منع استخدام `any` في تعريفات التحقق والـ Types.

10. **Known Follow-ups & Security Hardening**:
    - تعزيز حماية CSRF على الـ State-changing APIs قبل التوسع في بناء موديولات الأعمال.
    - تطبيق Rate Limiting على نقطة تسجيل الدخول لحماية الحسابات من هجمات التخمين (Brute-force).
    - بناء محرك النطاقات السياقية المتقدمة (Context-aware Dynamic Scopes & Row Filtering).
    - بناء محرك التفويض وتفويض الصلاحيات (Delegation Engine & canDelegate evaluation).
    - بناء واجهات إدارة الأجهزة والجلسات وخيار تسجيل الخروج من كافة الأجهزة (Logout all devices).
    - بناء واجهات إدارة الأدوار ومنح الصلاحيات (Role & Permission Assignment UI).

---

## Implemented Infrastructure

- Centralized User Management Module (`src/modules/system/user/`).
- User Service with Pessimistic Locking and Transactional Invariants (`src/modules/system/user/user.service.ts`).
- Role Lookup Service (`src/modules/system/role/role.service.ts`).
- Centralized Authorization Module (`src/modules/system/authorization/`).
- Permission Evaluation Service `AuthorizationService` (`src/modules/system/authorization/authorization.service.ts`).
- Route Authorization Middleware `requirePermission` (`src/modules/system/authorization/authorization.middleware.ts`).
- Full Authentication Module (`src/modules/system/auth/`).
- Database Session Service (`src/modules/system/session/session.service.ts`).
- Passport JWT Authentication Strategy & Cookie Extractor with HS256 restriction (`src/bootstrap/passport.bootstrap.ts`, `passport-jwt.strategy.ts`).
- Route Protection Middlewares (`requireWebAuth`, `requireApiAuth`, `redirectIfAuthenticated`).
- Generic Validated Query Middleware (`src/common/middleware/validate-query-dto.middleware.ts`) & Type Augmentation (`src/common/types/express.d.ts`).
- Generic UUID Param Validation Middleware (`src/common/middleware/validate-uuid-param.middleware.ts`).
- Standardized `ConflictError` (HTTP 409), `BusinessRuleError` (HTTP 400), `UnauthorizedError` (HTTP 401), and `ForbiddenError` (HTTP 403).
- Token Hashing Utility (`src/common/security/token-hash.util.ts`).
- System Modules Organization (`auth`, `authorization`, `permission`, `permission-grant`, `access-rule`, `role`, `session`, `user`).
- System Session Data Model & Migration (`SessionEntity`, `system_session`).
- Initial System Seed Data & Runner (`npm run seed`).
- Password Hashing & Comparison Utilities (`src/common/security/password.util.ts`).
- Migrations:
  - `1710000000000-CreateSystemCoreTables.ts` (executed).
  - `1710000000001-CreateSystemSessionTable.ts` (executed).
- Centralized DTO Validation Middleware (`src/common/middleware/validate-dto.middleware.ts`).
- Standardized `ValidationError` representation (`src/common/errors/validation.error.ts`).
- Centralized Error Handling (`AppError`, `errorHandlerMiddleware`).
- Standardized typed `ApiResponse` for API endpoints.
- EJS + `express-ejs-layouts` server-rendered views.
- Static assets serving (`src/public`).
- Client scripts (`src/public/js/app.js`, `src/public/js/login.js`, `src/public/js/users.js`).
- TypeORM MySQL connection and robust graceful shutdown.
