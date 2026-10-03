# Project Technical Map

## Current Project State

تم تنفيذ مرحلة المصادقة الأساسية (Authentication Core) ومرحلة محرك الصلاحيات وقواعد الوصول (Authorization Core - Phase 1) بالكامل ودمجهما مع نموذج الجلسات وقاعدة البيانات:
- **محرك الصلاحيات (Authorization Core - Phase 1)** (`src/modules/system/authorization/`):
  - خدمة الصلاحيات المركزية `AuthorizationService` (`src/modules/system/authorization/authorization.service.ts`) المسؤولة عن تقييم وصول المستخدمين عبر `hasPermission` واسترجاع قائمة الصلاحيات الفعالة الشاملة عبر `getEffectivePermissions`.
  - وسيط التحقق من الصلاحيات `requirePermission` (`src/modules/system/authorization/authorization.middleware.ts`) الذي يتحقق من هوية المستخدم الموثق ويمرر `ForbiddenError` برمز `PERMISSION_DENIED` عند عدم امتلاك الصلاحية.
  - دمج وتقييم منح الدور الأساسي للمستخدم (`Role Grants`) مع المنح المباشرة للمستخدم (`Direct User Grants`) في استعلام واحد محكم بدون N+1.
  - استبعاد المنح غير النشطة أو المنتهية زمنياً (`expires_at <= now`) والمنح التابعة لصلاحيات معطلة أو محذوفة ناعماً.
  - تطبيق قاعدة التفوق للرفض (`DENY ALL` wins) والانغلاق التلقائي (Default Deny / Fail Closed).
  - عدم وجود أي تجاوز برمجي صلب لدور مدير النظام (`No SYSTEM_ADMIN hardcoded bypass`)؛ بل يخضع لتقييم المنح والقواعد المسندة إليه في الـ Seed كأي مستخدم آخر.
  - النطاقات المكانية والفرعية غير الشاملة (مثل `DEPARTMENT`, `YARD`) تنغلق بأمان (Fail closed) في هذه المرحلة ولا تمنح وصولاً شاملاً (`ALL`).
- **وحدة المصادقة (Auth Module)** (`src/modules/system/auth/`) تشمل مسارات التحقق وتسجيل الدخول `POST /api/auth/login`، واسترجاع هوية المستخدم الموثق `GET /api/auth/me`، وتسجيل الخروج وإلغاء الجلسة `POST /api/auth/logout`.
- **خدمة الجلسات (SessionService)** (`src/modules/system/session/session.service.ts`) مسؤولة عن إنشاء الجلسات، والتحقق من صحتها وتطابق الهاش، والتحديث المؤجل لآخر استخدام (Throttled `touchSession`)، وإلغاء الجلسات عند تسجيل الخروج (`revokeSession`).
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
  - صفحات الويب الإدارية (`GET /`, `GET /system`) محمية بوسيط `requireWebAuth` مع التوجيه التلقائي للمستخدمين غير المسجلين إلى `/login`، وتمرير أي أخطاء نظام إلى المعالج المركزي، وتعيين `res.locals.user` وإلغاء التخزين المؤقت `Cache-Control: no-store`.
  - صفحة تسجيل الدخول `GET /login` تستخدم وسيط `redirectIfAuthenticated` لإعادة توجيه المسجلين مسبقاً إلى `/`.
  - مسارات الـ API المحمية تستخدم `requireApiAuth` وتعيد خطأ 401 بصيغة JSON المعيارية.
  - نقطة الفحص الصحي `GET /api/health` والملفات الثابتة تبقى عامة (Public).
- **واجهة المستخدم والعميل (Frontend Interaction)**:
  - صفحة تسجيل الدخول (`src/public/js/login.js`) تستخدم Native Fetch مع Bootstrap Validation لمعالجة الطلب وعرض رسائل الخطأ بأمان.
  - شريط التنقل (`src/views/dashboard/partials/navbar.ejs`) يعرض الاسم الكامل للمستخدم الموثق من `res.locals.user`، وزر تسجيل الخروج ينفذ `POST /api/auth/logout` عبر `src/public/js/app.js` ثم يوجه المتصفح إلى `/login`.
- **موديولات النظام الأساسية والـ Seeds**:
  - موديول الصلاحيات `permission`، ومنح الصلاحيات `permission-grant`، وقواعد نطاق الوصول `access-rule`، والأدوار `role`، والمستخدمين `user`، والجلسات `session`، والمصادقة `auth`، والتحقق من الصلاحيات `authorization`.
  - دور `SYSTEM_ADMIN` يحصل تلقائياً على كافة الصلاحيات النشطة عند تشغيل الـ Seed مع قواعد `ALLOW ALL`.

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
│   │   ├── forbidden.error.ts
│   │   ├── not-found.error.ts
│   │   ├── unauthorized.error.ts
│   │   └── validation.error.ts
│   ├── logging/
│   │   └── logger.ts
│   ├── middleware/
│   │   ├── error-handler.middleware.ts
│   │   ├── not-found.middleware.ts
│   │   └── validate-dto.middleware.ts
│   ├── responses/
│   │   └── api-response.ts
│   └── security/
│       ├── password.util.ts
│       └── token-hash.util.ts
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
│       │   ├── authorization.service.ts
│       │   └── authorization.types.ts
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
│       │   └── role.entity.ts
│       ├── session/
│       │   ├── session.entity.ts
│       │   └── session.service.ts
│       └── user/
│           ├── seeds/
│           │   └── system-admin-user.seed.ts
│           └── user.entity.ts
├── public/
│   ├── css/
│   │   ├── app.css
│   │   └── auth.css
│   └── js/
│       ├── app.js
│       └── login.js
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
│   │   │   ├── index.ejs
│   │   │   └── layout.ejs
│   │   ├── index.ejs
│   │   └── layout.ejs
│   ├── error.ejs
│   └── login.ejs
├── app.ts
└── server.ts

storage/
├── logs/
│   └── error.log
└── uploads/
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
  - `createSession(params: CreateSessionParams): Promise<SessionEntity>`: إنشاء وحفظ سجل جلسة جديد.
  - `validateSession(sessionId: string, userId: string, rawToken: string): Promise<SessionEntity | null>`:
    - حساب SHA-256 للـ `rawToken`.
    - التحقق من وجود الجلسة ومطابقة `id`, `user_id`, `token_hash`, وكونها `is_active: true`, و `revoked_at IS NULL`, و `expires_at > now`.
  - `touchSession(sessionId: string, currentLastUsedAt: Date): Promise<void>`:
    - تحديث مؤجل (Throttled) لحقل `last_used_at` إذا كان الفارق الزمني 5 دقائق أو أكثر لتجنب الضغط على قاعدة البيانات.
  - `revokeSession(sessionId: string, reason: string = 'LOGOUT'): Promise<void>`:
    - إلغاء الجلسة بوضع `is_active = false`, `revoked_at = now()`, `revoked_reason = reason`.

### `AuthController` (`src/modules/system/auth/auth.controller.ts`)
- **Purpose**: طبقة HTTP للتعامل مع طلبات المصادقة وإدارة الكوكيز.
- **Methods**:
  - `login(req, res, next)`: استدعاء `AuthService.login`، وضبط كوكيز `erp_session` الآمنة (`httpOnly`, `sameSite: 'lax'`, `secure: isProduction`)، وإرجاع بيانات المستخدم الآمنة فقط بصيغة JSON.
  - `me(req, res)`: إرجاع بيانات `req.user` (`AuthPrincipal`).
  - `logout(req, res, next)`: إلغاء الجلسة الحالية في قاعدة البيانات، ومسح كوكيز `erp_session`، وإرجاع استجابة نجاح.

### `AuthPrincipal` (`src/modules/system/auth/auth.types.ts`)
- **Purpose**: تمثيل الهوية الآمنة للمستخدم الموثق داخل `req.user`.
- **Fields**: `id`, `fullName`, `phone`, `roleId`, `sessionId`.

### `PassportJwtStrategy` (`src/modules/system/auth/passport-jwt.strategy.ts`)
- **Purpose**: استراتيجية Passport لاستخراج الـ JWT من الكوكيز، والتحقق من التوقيع بالخوارزمية المقيدة `HS256` والمصدر والجمهور، ثم مطابقة الجلسة وقاعدة البيانات.

### `Auth Middlewares` (`src/modules/system/auth/auth.middleware.ts`)
- `requireApiAuth`: وسيط لمسارات الـ API المحمية، يمرر `UnauthorizedError` عند غياب أو فشل المصادقة، ويمرر أخطاء النظام إلى المعالج المركزي.
- `requireWebAuth`: وسيط لصفحات الويب الإدارية، يوجه الطلب إلى `/login` إذا لم يكن المستخدم موثقاً، ويعين `res.locals.user` ويعطل التخزين المؤقت (`Cache-Control: no-store`)، ويمرر أخطاء النظام إلى المعالج المركزي.
- `redirectIfAuthenticated`: وسيط لصفحة `/login` يوجه المستخدمين المسجلين مسبقاً إلى `/` ويمرر أخطاء النظام إلى المعالج المركزي.

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
4. **SYSTEM_ADMIN Permission Grants Seed** (`src/modules/system/permission-grant/seeds/system-admin-permission-grants.seed.ts`) $\rightarrow$ يمنح دور `SYSTEM_ADMIN` تلقائياً جميع الصلاحيات النشطة (`isActive: true`) مع `can_delegate: true` و `granted_by: adminUser.id`.
5. **SYSTEM_ADMIN Access Rules Seed** (`src/modules/system/access-rule/seeds/system-admin-access-rules.seed.ts`) $\rightarrow$ ينشئ قواعد `ALLOW` / `ALL` لكل منحة صلاحية خاصة بمدير النظام.

### Seed Idempotency & Security Rules
- **Idempotency**: يعتمد التحقق على المفاتيح الطبيعية (`Role.code`, `Permission.name`, `User.phone`, `Grant(roleId + permissionId)`, `Rule(grantId + effect + scopeType)`).
- **Password Security**:
  - متغير البيئة `SEED_SYSTEM_ADMIN_PASSWORD` إلزامي فقط عند إنشاء مستخدم المدير لأول مرة.
  - لا توجد أي كلمة مرور افتراضية (No fallback) في الكود المصدري.
  - تشفير كلمة المرور بـ `bcrypt` قبل التخزين.
  - حماية كلمات مرور المستخدمين المنشئين مسبقاً من إعادة التعيين أو التغيير عند تكرار تشغيل `npm run seed`.
- **SYSTEM_ADMIN Auto-Grants**: عند إضافة أي صلاحيات جديدة نشطة في النظام وإعادة تشغيل الـ Seed، يحصل دور `SYSTEM_ADMIN` عليها تلقائياً مع قواعد `ALLOW ALL`.
- **Decoupled Module Seeds**: كل Seeder يتبع للموديول المالك للكيان، ومشغل الـ Seed (`src/database/seeds/system-initial.seed.ts`) ينسق التنفيذ داخل Transaction موحدة.

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

1. **System Permission & Access Control Architecture (Implemented Phase 1)**:
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

2. **User Role & Session Architecture**:
   - لكل مستخدم دور أساسي واحد فقط (`system_user.role_id` $\rightarrow$ `system_role.id`).
   - للمستخدم الواحد عدة جلسات نشطة في نفس الوقت (`system_user` $1 \rightarrow N$ `system_session`).
   - **قاعدة الأمان للـ Token**: الـ JWT الأصلي لا يُخزن مطلقاً داخل قاعدة البيانات، بل يُخزن `token_hash` فقط (SHA-256 بطول 64 محرفاً)، بينما يبقى الـ JWT الفعلي داخل HttpOnly Cookie.
   - **دورة حياة الجلسة (Session Lifecycle)**: تعتمد صلاحية الجلسة على `(is_active = true AND revoked_at IS NULL AND expires_at > now AND token_hash matches)`. لا يتم استخدام Soft Delete للجلسات للاحتفاظ بسجل تدقيق كامل.
   - بيانات الجهاز (`device_type`, `device_name`, `browser`, `os`, `user_agent`) هي بيانات وصفية للعرض وإدارة الأجهزة وليست مصدراً للثقة الأمنية.

3. **Authentication Flows (Implemented)**:
   - **تدفق تسجيل الدخول (Login Flow)**:
     `phone + password` $\rightarrow$ `DTO Validation (LoginDto)` $\rightarrow$ `Find User in DB` $\rightarrow$ `Verify Password (bcrypt compare)` $\rightarrow$ `Verify User Active` $\rightarrow$ `Generate Session UUID (sid)` $\rightarrow$ `Sign JWT (sub=userId, sid=sessionId, algorithm=HS256)` $\rightarrow$ `Compute Token Hash (SHA-256)` $\rightarrow$ `Create system_session in DB` $\rightarrow$ `Set HttpOnly Cookie (erp_session)` $\rightarrow$ `Return Safe User JSON`.
   - **تدفق الطلب الموثق (Authenticated Request Flow)**:
     `Request with HttpOnly Cookie (erp_session)` $\rightarrow$ `Extract JWT` $\rightarrow$ `Verify JWT Signature (Passport with algorithm HS256, issuer, audience)` $\rightarrow$ `Compute Token Hash (SHA-256)` $\rightarrow$ `Validate Session in DB (sid, sub, token_hash, isActive=true, revokedAt=null, expiresAt>now)` $\rightarrow$ `Validate User in DB (active, un-deleted)` $\rightarrow$ `Throttled Await touchSession (last_used_at)` $\rightarrow$ `Attach req.user (AuthPrincipal)` $\rightarrow$ `Set res.locals.user & No-Store Headers` $\rightarrow$ `Route Handler / Render / JSON`.
   - **تدفق تسجيل الخروج (Logout Flow)**:
     `POST /api/auth/logout (Protected)` $\rightarrow$ `Revoke Current Session (isActive=false, revokedAt=now, reason='LOGOUT')` $\rightarrow$ `Clear erp_session HttpOnly Cookie` $\rightarrow$ `Return Success JSON` $\rightarrow$ `Client Redirects to /login`.

4. **Data Integrity & Persistence**:
   - جميع المفاتيح الأساسية UUID v4.
   - جميع العلاقات `eager: false` و `cascade: false` (باستثناء حذف منحة الصلاحية الذي يحذف قواعد الوصول التابعة لها `CASCADE`).
   - الحذف الناعم (Soft Delete) عبر `deleted_at` للكيانات الأساسية (`Role`, `User`, `Permission`).
   - جميع تعديلات المخطط (Schema) تتم حصراً عبر الـ Migrations مع بقاء `synchronize: false`.

5. **Seed Architecture & Rules**:
   - كل Seeder ينتمي حصراً إلى الـ Module المالك للبيانات (`permission-grant` للـ Grants، و `access-rule` للـ Rules).
   - الـ Seed Runner مسؤول فقط عن تهيئة الاتصال وتنظيم تسلسل التنفيذ داخل Transaction.
   - الـ Seed Idempotent بالكامل ويعتمد على المفاتيح الطبيعية لمنع التكرار.
   - منع وجود أي كلمات مرور افتراضية (Fallback) في الكود، وإلزامية متغير البيئة عند إنشاء مدير النظام لأول مرة.
   - حماية كلمات مرور المستخدمين المنشئين مسبقاً من إعادة التعيين أثناء إعادة تشغيل الـ Seed.
   - استخدام ثوابت الصلاحيات من `SystemPermission` enum وثوابت الأدوار من `SystemRole` enum بدلاً من تكرار النصوص.
   - دور `SYSTEM_ADMIN` يحصل تلقائياً على جميع الصلاحيات النشطة عند تشغيل الـ Seed مع قواعد `ALLOW ALL`.

6. **Client Interaction & Views**:
   - صفحات الواجهة تعتمد على العرض من طرف الخادم (Server-rendered EJS pages).
   - التفاعل مع الواجهات البرمجية يتم باستخدام `native fetch` للعمليات التي تعتمد على JSON API.
   - المشروع لا يعتمد ولا يستخدم مكتبة HTMX.

7. **Graceful Shutdown**:
   - عند استقبال إشارات الإيقاف (`SIGINT`, `SIGTERM`)، يتم انتظار إغلاق خادم HTTP (`server.close()`) وتوقف استقبال الطلبات، ثم محاولة إغلاق اتصال قاعدة البيانات (`AppDataSource.destroy()`) بشكل مستقل حتى في حال فشل إغلاق خادم HTTP.
   - وجود حماية تمنع تنفيذ الإيقاف أكثر من مرة بالتوازي (`isShuttingDown` guard).
   - ضبط `process.exitCode` (0 عند النجاح، 1 عند وجود خطأ في أي مرحلة) بدلاً من الخروج القسري المباشر.

8. **Backend Validation Flow**:
   - `Route` $\rightarrow$ `validateDto(Dto)` $\rightarrow$ `Controller` $\rightarrow$ `Service`.
   - استخدام `class-validator` و `class-transformer`.
   - عدم تكرار التحقق من الـ DTO داخل الـ Controllers.
   - عدم بناء استجابات HTTP مباشرة داخل وسيط التحقق، وتمرير الأخطاء عبر المعالج المركزي.
   - حظر ورفض أي حقول غير معرفة في الـ DTO تلقائياً.
   - منع استخدام `any` في تعريفات التحقق والـ Types.

9. **Known Follow-ups & Security Hardening**:
   - تعزيز حماية CSRF على الـ State-changing APIs قبل التوسع في بناء موديولات الأعمال.
   - تطبيق Rate Limiting على نقطة تسجيل الدخول لحماية الحسابات من هجمات التخمين (Brute-force).
   - بناء محرك النطاقات السياقية المتقدمة (Context-aware Dynamic Scopes & Row Filtering).
   - بناء محرك التفويض وتفويض الصلاحيات (Delegation Engine & canDelegate evaluation).
   - بناء واجهات إدارة الأجهزة والجلسات وخيار تسجيل الخروج من كافة الأجهزة (Logout all devices).
   - بناء واجهات إدارة المستخدمين والأدوار ومنح الصلاحيات (User/Role/Grant Management UI).

---

## Implemented Infrastructure

- Centralized Authorization Module (`src/modules/system/authorization/`).
- Permission Evaluation Service `AuthorizationService` (`src/modules/system/authorization/authorization.service.ts`).
- Route Authorization Middleware `requirePermission` (`src/modules/system/authorization/authorization.middleware.ts`).
- Full Authentication Module (`src/modules/system/auth/`).
- Database Session Service (`src/modules/system/session/session.service.ts`).
- Passport JWT Authentication Strategy & Cookie Extractor with HS256 restriction (`src/bootstrap/passport.bootstrap.ts`, `passport-jwt.strategy.ts`).
- Route Protection Middlewares (`requireWebAuth`, `requireApiAuth`, `redirectIfAuthenticated`).
- Standardized `UnauthorizedError` (HTTP 401) and `ForbiddenError` (HTTP 403).
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
- Client scripts (`src/public/js/app.js`, `src/public/js/login.js`).
- TypeORM MySQL connection and robust graceful shutdown.
