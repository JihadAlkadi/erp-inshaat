# Project Technical Map

## Current Project State

تم تنفيذ مرحلة إدارة المستخدمين الأساسية (User Management Core) ومرحلة محرك الصلاحيات (Authorization Core) ومرحلة المصادقة الأساسية (Authentication Core) بالكامل ودمجها مع نموذج الجلسات وقاعدة البيانات:
- **إدارة المستخدمين الأساسية (User Management Core)** (`src/modules/system/user/`):
  - خدمة المستخدمين المركزية `UserService` (`src/modules/system/user/user.service.ts`):
    - `listUsers`: استرجاع قائمة المستخدمين مع Pagination، والبحث بالاسم أو رقم الهاتف، وضم الدور (Role) بكفاءة بدون N+1، واستبعاد المحذوفين ناعماً.
    - `getUserById`: استرجاع تفاصيل مستخدم محدد مع دوره واستبعاد `passwordHash`.
    - `createUser`: إنشاء مستخدم جديد بعد التحقق من فرادية رقم الهاتف (حتى مع المحذوفين ناعماً)، والتحقق من نشاط الدور، وتشفير كلمة المرور بـ bcrypt، وإرجاع كائن مستخدم آمن.
    - `updateUser`: تحديث جزئي (PATCH) لبيانات المستخدم (الاسم، الهاتف مع فحص الفرادية، الدور، حالة التفعيل) داخل Transaction مع تطبيق قواعد حماية الذات (Self Protection) وحماية آخر مدير نظام فعال (Last SYSTEM_ADMIN Protection)، وإلغاء الجلسات النشطة تلقائياً عند التعطيل.
    - `softDeleteUser`: أرشفة المستخدم (Soft Delete) عبر `deletedAt` وتعطيله مع إلغاء كافة جلساته النشطة داخل Transaction وحظر حذف الذات وحظر حذف آخر مدير نظام فعال. منع الحذف الصلب (Hard Delete) نهائياً.
  - واجهات برمجة التطبيقات (API Endpoints) المحمية بالصلاحيات:
    - `GET /api/system/users` (محمي بـ `USER_VIEW` والتحقق من الـ Query DTO).
    - `GET /api/system/users/:id` (محمي بـ `USER_VIEW` والتحقق من UUID).
    - `POST /api/system/users` (محمي بـ `USER_CREATE` و `CreateUserDto`).
    - `PATCH /api/system/users/:id` (محمي بـ `USER_UPDATE` و UUID و `UpdateUserDto`).
    - `DELETE /api/system/users/:id` (محمي بـ `USER_DELETE` و UUID).
  - واجهات الويب المعروضة من الخادم (Server-rendered EJS):
    - `GET /system/users`: قائمة المستخدمين مع جدول متجاوب، بحث، ترقيم صفحات، وشارات الحالة وإجراءات سريعة.
    - `GET /system/users/create`: نموذج إنشاء مستخدم مع التحقق بالمتصفح وبواسطة Bootstrap.
    - `GET /system/users/:id/edit`: نموذج تعديل المستخدم مع قفل الحقول الحساسة عند تعديل الحساب الشخصي.
  - تفاعل العميل (Client Scripts):
    - `src/public/js/users.js`: استخدام Native Fetch لجميع عمليات الإنشاء والتعديل والأرشفة، وتأكيد الحذف عبر SweetAlert2، ومعالجة رسائل الأخطاء والنجاح، وحظر استخدام HTMX.
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
  - التوكن مشفر وموقع حصراً بخوارزمية `HS256` مع تحديد `issuer: 'erp-inshaat'` و `audience: 'erp-users'`.
  - حمولة التوكن (Payload) مقتصرة وصغيرة فقط: `sub: userId` و `sid: sessionId` بدون أي بيانات حساسة أو صلاحيات.
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
│   ├── middleware/
│   │   ├── error-handler.middleware.ts
│   │   ├── not-found.middleware.ts
│   │   ├── validate-dto.middleware.ts
│   │   ├── validate-query-dto.middleware.ts
│   │   └── validate-uuid-param.middleware.ts
│   ├── responses/
│   │   └── api-response.ts
│   └── security/
│       ├── password.util.ts
│       └── token-hash.util.ts
├── config/
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── data-source.ts
├── modules/
│   └── system/
│       ├── access-rule/
│       │   ├── seeds/
│       │   │   └── system-admin-access-rules.seed.ts
│       │   └── access-rule.entity.ts
│       ├── auth/
│       ├── authorization/
│       │   ├── authorization.middleware.ts
│       │   └── authorization.service.ts
│       ├── permission/
│       ├── permission-grant/
│       ├── role/
│       │   ├── constants/
│       │   │   └── system-role.enum.ts
│       │   ├── seeds/
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
│           ├── user.route.ts
│           ├── user.service.ts
│           └── user.types.ts
├── public/
│   ├── css/
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
      1. التحقق من وجود المستخدم.
      2. **حماية الذات**: منع المستخدم من تعطيل حسابه الحالي أو تغيير دوره الشخصي.
      3. **فرادية الهاتف**: التحقق من عدم استخدام الهاتف الجديد من قبل حساب آخر (يشمل المحذوفين ناعماً).
      4. **حماية آخر مدير نظام**: منع تغيير دور أو تعطيل آخر مدير نظام فعال في النظام.
      5. **التحقق من الدور الجديد**: التأكد من كون الدور نشطاً وغير محذوف ناعماً.
      6. **Transaction**: حفظ التعديلات وإلغاء الجلسات النشطة تلقائياً عبر `SessionService.revokeUserSessions` في حال تحول المستخدم إلى غير نشط (`isActive = false`).
    - **Output**: `SafeUserOutput`.
  - `softDeleteUser(id: string, currentPrincipal: AuthPrincipal): Promise<{ success: boolean; message: string }>`
    - **Input**: `id`, `currentPrincipal`.
    - **Action**:
      1. التحقق من وجود المستخدم.
      2. منع حذف المستخدم لنفسه (`Self Protection`).
      3. منع حذف آخر مدير نظام فعال (`Last SYSTEM_ADMIN Protection`).
      4. **Transaction**: إلغاء الجلسات النشطة، ضبط `isActive = false`، وتنفيذ `softDelete` للكيان.
    - **Output**: `{ success: true, message: 'تم أرشفة المستخدم بنجاح' }`.
  - `countActiveSystemAdmins(manager?: EntityManager): Promise<number>`: عد مدراء النظام النشطين وغير المحذوفين.

### `RoleService` (`src/modules/system/role/role.service.ts`)
- **Purpose**: خدمة مساعدة لاستعلام الأدوار الصالحة للإسناد في إدارة المستخدمين.
- **Methods**:
  - `findActiveRoleById(roleId: string, manager?: EntityManager): Promise<RoleEntity | null>`: استرجاع دور نشط وغير محذوف ناعماً.
  - `listActiveRoles(manager?: EntityManager): Promise<RoleEntity[]>`: استرجاع قائمة جميع الأدوار النشطة غير المحذوفة مرتبة أبجدياً.

### `User DTOs` (`src/modules/system/user/dto/`)
- `CreateUserDto`: التحقق من الاسم الكامل (2-150)، الهاتف (`^09[0-9]{8}$`)، كلمة المرور (6 محارف على الأقل)، `roleId` (UUID v4)، وحالة التفعيل الاختيارية.
- `UpdateUserDto`: يدعم التحديث الجزئي (PATCH) مع اشتراط تقديم حقل واحد على الأقل، وخلوه تماماً من حقول كلمات المرور أو الصلاحيات.
- `ListUsersQueryDto`: التحقق وتحويل معاملات الاستعلام (`page` افتراضي 1، `limit` افتراضي 20 بحد أقصى 100، `search` نصي).

### `Generic Middlewares` (`src/common/middleware/`)
- `validateQueryDto(DtoClass)`: وسيط لإجراء التحقق من استعلامات الـ URL (`req.query`) باستخدام `class-transformer` و `class-validator` مع تفعيل `whitelist` و `forbidNonWhitelisted`.
- `validateUuidParam(paramName)`: وسيط للتحقق من صحة معاملات الـ URL (`req.params`) وتطابقها مع نمط UUID v4.

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

### `system_permission`
- **Entity**: `PermissionEntity` (`src/modules/system/permission/permission.entity.ts`)
- **Purpose**: تعريف الصلاحيات المتاحة في النظام بنمط `<application>.<resource>.<action>`.

### `system_permission_grant`
- **Entity**: `PermissionGrantEntity` (`src/modules/system/permission-grant/permission-grant.entity.ts`)
- **Purpose**: تمثيل منح صلاحية محددة إما لمستخدم مباشرة أو لدور معين (Exactly one target via XOR check).

### `system_access_rule`
- **Entity**: `AccessRuleEntity` (`src/modules/system/access-rule/access-rule.entity.ts`)
- **Purpose**: تحديد نطاق البيانات المسموح أو الممنوع لمنحة صلاحية معينة.

### `system_session`
- **Entity**: `SessionEntity` (`src/modules/system/session/session.entity.ts`)
- **Purpose**: تخزين جلسات تسجيل دخول المستخدمين بشكل دائم مع التحقق من الهاش، وتعدد الأجهزة، وتتبع آخر استخدام، وتاريخ الإلغاء.

---

## Architectural Rules

1. **User Management & Security Invariants**:
   - حذف المستخدمين يتم حصراً عبر الحذف الناعم (`Soft Delete`)؛ يُمنع الحذف الصلب (`Hard Delete`) نهائياً.
   - يُمنع إرجاع `passwordHash` في أي استجابات Backend (API أو Views أو List أو Detail).
   - تعطيل المستخدم أو أرشفته/حذفه ناعماً يؤدي تلقائياً إلى إلغاء كافة جلساته النشطة داخل Transaction (`Revoke Active Sessions`).
   - حماية الذات (`Self Protection`): لا يمكن للمستخدم تعطيل حسابه الحالي أو حذفه ناعماً أو تغيير دوره من خلال إدارة المستخدمين العامة.
   - حماية مدير النظام الأخير (`Last SYSTEM_ADMIN Protection`): لا يمكن تعطيل أو أرشفة أو تغيير دور آخر مدير نظام فعال وغير محذوف في النظام.
   - إخفاء العناصر والأزرار في واجهة المستخدم (`UI Visibility`) ليس بديلاً عن الصلاحيات الأمنية؛ يجب على الـ APIs التحقق الصارم من الصلاحيات.
   - فرادية رقم الهاتف (`Unique Phone`): يُمنع تكرار رقم الهاتف مع أي حساب موجود في النظام بما في ذلك الحسابات المحذوفة ناعماً.

2. **System Permission & Access Control Architecture**:
   - الرفض الافتراضي (`Default Deny / Fail Closed`).
   - تفوق الرفض (`DENY ALL` wins).
   - دمج منح الدور مع المنح المباشرة في استعلام موحد.
   - لا استثناء لمدير النظام (`No SYSTEM_ADMIN hardcoded bypass`).

3. **User Role & Session Architecture**:
   - لكل مستخدم دور أساسي واحد فقط.
   - الـ JWT الأصلي لا يُخزن مطلقاً داخل قاعدة البيانات، بل يُخزن `token_hash` فقط.

4. **Client Interaction & Views**:
   - صفحات الواجهة تعتمد على العرض من طرف الخادم (Server-rendered EJS pages).
   - التفاعل مع الواجهات البرمجية يتم باستخدام `native fetch`.
   - منع استخدام مكتبة HTMX أو كتابة صيغ TypeScript في ملفات المتصفح `.js`.
