# Project Technical Map

## Current Project State

تم تنفيذ مرحلة المصادقة الأساسية (Authentication Core) بالكامل ودمجها مع نموذج الجلسات الدائمة وقاعدة البيانات:
- **وحدة المصادقة (Auth Module)** (`src/modules/system/auth/`) تشمل مسارات التحقق وتسجيل الدخول `/api/auth/login`، ومعلومات المستخدم الحالي `/api/auth/me`، وتسجيل الخروج وإلغاء الجلسة `/api/auth/logout`.
- **خدمة الجلسات (SessionService)** (`src/modules/system/session/session.service.ts`) مسؤولة عن إنشاء الجلسات، والتحقق من صحتها وحالتها، وتحديث آخر استخدام (Throttled)، وإلغائها عند تسجيل الخروج.
- **تأمين التوكن (JWT Security)**: يتم توليد التوكن بتوقيع خوارزمية HS256 متضمناً `sub: userId` و `sid: sessionId` فقط دون أي بيانات حساسة، مع تشفير التوكن بـ SHA-256 قبل حفظه في جدول `system_session` (لا يُخزن الـ JWT الخام في قاعدة البيانات مطلقاً)، وتمرير التوكن للمتصفح عبر كوكيز محمية `HttpOnly` باسم `erp_session`.
- **استراتيجية Passport JWT** (`src/modules/system/auth/passport-jwt.strategy.ts`) تستخرج التوكن من الكوكيز وتتحقق من توقيعه، وتطابق الهاش مع الجلسة النشطة غير الملغاة وغير المنتهية في قاعدة البيانات، وتتحقق من فعالية المستخدم قبل منحه هوية الطلب (`AuthPrincipal`).
- **حماية المسارات (Route Protection)**:
  - مسارات صفحات الويب (`GET /`, `GET /system`) محمية بوسيط `requireWebAuth` مع التوجيه التلقائي إلى `/login` وتعيين `res.locals.user` وإلغاء التخزين المؤقت `Cache-Control: no-store`.
  - صفحة تسجيل الدخول `GET /login` تستخدم وسيط `redirectIfAuthenticated` لإعادة توجيه المستخدمين المسجلين مسبقاً إلى الصفحة الرئيسية `/`.
  - مسارات الـ API المحمية تستخدم `requireApiAuth` وتعيد أخطاء بصيغة JSON المعيارية `UNAUTHORIZED` (401).
  - نقطة الفحص الصحي `GET /api/health` والملفات الثابتة تبقى عامة (Public).
- **واجهة المستخدم والعميل (Frontend Auth Flow)**:
  - نموذج تسجيل الدخول (`src/public/js/login.js`) يعتمد على Native Fetch مع التحقق من الحقول بـ Bootstrap وعرض الأخطاء القادمة من الخادم.
  - شريط التنقل (`src/views/dashboard/partials/navbar.ejs`) يعرض الاسم الكامل للمستخدم الحالي، وزر تسجيل الخروج ينفذ `POST /api/auth/logout` عبر `src/public/js/app.js`.
- موديول منح الصلاحيات المستقل `permission-grant` وموديول قواعد نطاق الوصول `access-rule` ودور مدير النظام `SYSTEM_ADMIN` والـ Seeds الخاصة بها تعمل بنجاح وبشكل متكامل.

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

## Authentication & Session Architecture

### Core Components & Classes

#### `AuthService` (`src/modules/system/auth/auth.service.ts`)
- **Purpose**: التحقق من بيانات الدخول، وتوليد الـ JWT، وإنشاء سجل الجلسة الدائمة.
- **Methods**:
  - `login(dto: LoginDto, context: AuthContext): Promise<LoginResult>`
    - Input: `LoginDto` (`phone`, `password`), `context` (`ipAddress`, `userAgent`).
    - Action: يتحقق من وجود المستخدم وتطابق كلمة المرور، وفعالية الحساب، وينشئ `sessionId` UUID، ويوقع JWT، ويخزن الهاش في `system_session` عبر `SessionService`.
    - Output: `{ user: SafeUser, token: string, expiresAt: Date, sessionId: string }`.
    - Throws: `UnauthorizedError` عند خطأ رقم الهاتف أو كلمة المرور (حماية ضد User Enumeration)، `ForbiddenError` عند كون الحساب غير فعّال.

#### `SessionService` (`src/modules/system/session/session.service.ts`)
- **Purpose**: إدارة دورة حياة الجلسات في جدول `system_session`.
- **Methods**:
  - `createSession(params: CreateSessionParams): Promise<SessionEntity>`
  - `validateSession(sessionId, userId, rawToken): Promise<SessionEntity | null>`: يتحقق من مطابقة الهاش، والفعالية `is_active: true`، وعدم الإلغاء `revoked_at IS NULL`، وعدم الانتهاء الزمني `expires_at > now`.
  - `touchSession(sessionId, currentLastUsedAt): Promise<void>`: تحديث مؤجل (Throttled كل 5 دقائق على الأقل) لحقل `last_used_at` لمنع كثرة عمليات الكتابة على قاعدة البيانات.
  - `revokeSession(sessionId, reason): Promise<void>`: إلغاء الجلسة بوضع `is_active: false` وتوثيق وقت الإلغاء والسبب (`LOGOUT`).

#### `AuthController` (`src/modules/system/auth/auth.controller.ts`)
- **Purpose**: معالجة طلبات HTTP للمصادقة وإدارة الكوكيز.
- **Methods**:
  - `login(req, res, next)`: يستدعي `authService.login`، ويضبط الكوكيز `erp_session` كـ `HttpOnly` و `SameSite: Lax` و `Secure: production`، ويعيد بيانات المستخدم الآمنة فقط.
  - `me(req, res)`: يعيد بيانات `req.user` (`AuthPrincipal`).
  - `logout(req, res, next)`: يستدعي `sessionService.revokeSession` لجلسة المستخدم الحالية، ويمسح الكوكيز `erp_session`، ويعيد رسالة نجاح.

#### `AuthPrincipal` (`src/modules/system/auth/auth.types.ts`)
- **Purpose**: تمثيل هوية المستخدم الموثق داخل سياق الطلب (`req.user`).
- **Fields**: `id`, `fullName`, `phone`, `roleId`, `sessionId`.

#### `PassportJwtStrategy` (`src/modules/system/auth/passport-jwt.strategy.ts`)
- **Purpose**: استخراج التوكن من الكوكيز `erp_session` والتحقق من صلاحية التوكن وقاعدة البيانات.

#### `Auth Middlewares` (`src/modules/system/auth/auth.middleware.ts`)
- `requireApiAuth`: وسيط لمسارات الـ API المحمية، يمرر `UnauthorizedError` إلى معالج الأخطاء المركزي عند فشل المصادقة.
- `requireWebAuth`: وسيط لصفحات الويب المحمية، يوجه الطلب غير المصادق إلى `/login` ويملأ `res.locals.user` ويعطل التخزين المؤقت `Cache-Control: no-store`.
- `redirectIfAuthenticated`: يوجه المستخدم المسجل إلى `/` عند محاولة فتح `/login`.

---

## Constants & Enums

### `SystemRole`
- **File**: `src/modules/system/role/constants/system-role.enum.ts`
- **Purpose**: المصدر الثابت لتعريف كودات أدوار النظام (`SYSTEM_ADMIN = 'SYSTEM_ADMIN'`).

### `SystemPermission`
- **File**: `src/modules/system/permission/constants/system-permission.enum.ts`
- **Purpose**: المصدر الثابت لكودات صلاحيات النظام (`USER_VIEW`, `USER_CREATE`, `USER_UPDATE`, `USER_DELETE`).

### `AuthConstants`
- **File**: `src/modules/system/auth/auth.constants.ts`
- **Values**:
  - `AUTH_COOKIE_NAME = 'erp_session'`
  - `AUTH_JWT_ISSUER = 'erp-inshaat'`
  - `AUTH_JWT_AUDIENCE = 'erp-users'`

---

## Seed Infrastructure

### Seed Execution Order & Module Ownership
1. **System Admin Role Seed** (`src/modules/system/role/seeds/system-admin-role.seed.ts`) $\rightarrow$ ينشئ أو يسترجع دور `SystemRole.SYSTEM_ADMIN`.
2. **System User Permissions Seed** (`src/modules/system/permission/seeds/system-user-permissions.seed.ts`) $\rightarrow$ ينشئ أو يسترجع الصلاحيات المعرفة في `SystemPermission`.
3. **System Admin User Seed** (`src/modules/system/user/seeds/system-admin-user.seed.ts`) $\rightarrow$ ينشئ مستخدم مدير النظام `0912312312` ويستدعي منح الصلاحيات وقواعد الوصول.
4. **SYSTEM_ADMIN Permission Grants Seed** (`src/modules/system/permission-grant/seeds/system-admin-permission-grants.seed.ts`) $\rightarrow$ يمنح دور `SYSTEM_ADMIN` تلقائياً جميع الصلاحيات النشطة (`isActive: true`) مع `can_delegate: true` و `granted_by: adminUser.id`.
5. **SYSTEM_ADMIN Access Rules Seed** (`src/modules/system/access-rule/seeds/system-admin-access-rules.seed.ts`) $\rightarrow$ ينشئ قواعد `ALLOW` / `ALL` لكل منحة صلاحية خاصة بمدير النظام.

---

## Database Structure

### `system_role`
- **Entity**: `RoleEntity` (`src/modules/system/role/role.entity.ts`)
- **Fields**: `id` (UUID), `name`, `code` (UNIQUE), `description`, `is_active`, `created_at`, `updated_at`, `deleted_at`.

### `system_user`
- **Entity**: `UserEntity` (`src/modules/system/user/user.entity.ts`)
- **Fields**: `id` (UUID), `full_name`, `phone` (UNIQUE), `password_hash`, `role_id` (FK), `is_active`, `created_at`, `updated_at`, `deleted_at`.

### `system_permission`
- **Entity**: `PermissionEntity` (`src/modules/system/permission/permission.entity.ts`)
- **Fields**: `id` (UUID), `name` (UNIQUE), `description`, `is_active`, `created_at`, `updated_at`, `deleted_at`.

### `system_permission_grant`
- **Entity**: `PermissionGrantEntity` (`src/modules/system/permission-grant/permission-grant.entity.ts`)
- **Fields**: `id` (UUID), `permission_id` (FK), `user_id` (FK), `role_id` (FK), `can_delegate`, `granted_by` (FK), `granted_at`, `expires_at`, `is_active`, `reason`, `created_at`, `updated_at`.

### `system_access_rule`
- **Entity**: `AccessRuleEntity` (`src/modules/system/access-rule/access-rule.entity.ts`)
- **Fields**: `id` (UUID), `permission_grant_id` (FK), `effect` ('ALLOW' | 'DENY'), `scope_type`, `scope` (JSON), `is_active`, `description`, `created_at`, `updated_at`.

### `system_session`
- **Entity**: `SessionEntity` (`src/modules/system/session/session.entity.ts`)
- **Purpose**: تخزين جلسات تسجيل دخول المستخدمين بشكل دائم مع التحقق من الهاش.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `user_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `system_user.id`
  - `token_hash`: varchar(64), NOT NULL, UNIQUE (`UQ_system_session_token_hash`)
  - `device_type`: varchar(50), NULL
  - `device_name`: varchar(150), NULL
  - `browser`: varchar(50), NULL
  - `os`: varchar(50), NULL
  - `user_agent`: text, NULL
  - `ip_address`: varchar(45), NULL
  - `last_used_at`: datetime(6), NOT NULL
  - `expires_at`: datetime(6), NOT NULL
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `revoked_at`: datetime(6), NULL
  - `revoked_reason`: text, NULL
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)

---

## Architectural Rules

1. **Authentication Flow (Implemented)**:
   - **عند تسجيل الدخول (Login)**:
     `Login Request (phone, password)` $\rightarrow$ `Validate DTO` $\rightarrow$ `Find User by Phone` $\rightarrow$ `Verify Password Hash (bcrypt)` $\rightarrow$ `Check User Active` $\rightarrow$ `Generate UUID sessionId` $\rightarrow$ `Sign JWT (sub, sid)` $\rightarrow$ `Hash JWT with SHA-256` $\rightarrow$ `Create system_session in DB` $\rightarrow$ `Set HttpOnly Cookie (erp_session)` $\rightarrow$ `Return Safe User JSON`.
   - **عند كل طلب لاحق (Subsequent Request)**:
     `Request with HttpOnly Cookie` $\rightarrow$ `Extract JWT` $\rightarrow$ `Verify JWT Signature (Passport HS256)` $\rightarrow$ `Hash JWT (SHA-256)` $\rightarrow$ `Query system_session (sessionId, userId, tokenHash, isActive, unrevoked, unexpired)` $\rightarrow$ `Query system_user (isActive, un-deleted)` $\rightarrow$ `Throttled Touch last_used_at` $\rightarrow$ `Attach req.user (AuthPrincipal)` $\rightarrow$ `Continue / Render / Respond`.
   - **عند تسجيل الخروج (Logout)**:
     `POST /api/auth/logout` $\rightarrow$ `Revoke session (is_active: false, revoked_at: now, reason: LOGOUT)` $\rightarrow$ `Clear HttpOnly Cookie` $\rightarrow$ `Return Success`.

2. **Security & Session Rules**:
   - الـ JWT الخام لا يُخزن في قاعدة البيانات مطلقاً؛ جدول `system_session` يحتوي على `token_hash` فقط (SHA-256 بطول 64 محرفاً).
   - الـ JWT لا يُرسل في استجابات الـ JSON ولا يُخزن في `localStorage` أو `sessionStorage`، بل يبقى حصراً داخل `HttpOnly` Cookie.
   - كوكيز الجلسة `erp_session` مضبوطة بخصائص `HttpOnly: true`, `SameSite: Lax`, `Path: /`, `Secure: isProduction`.
   - متغير البيئة `AUTH_JWT_SECRET` إلزامي ويجب أن يكون بطول 32 محرفاً على الأقل بدون أي قيمة افتراضية في الكود المصدري.
   - مدة صلاحية الجلسة موحدة عبر `AUTH_SESSION_TTL_DAYS` لكل من انتهاء الـ JWT وانتهاء سجل قاعدة البيانات والكوكيز.

3. **Known Follow-ups & Security Hardening**:
   - تعزيز حماية CSRF على الـ State-changing APIs قبل التوسع في بناء موديولات الأعمال.
   - تطبيق Rate Limiting على نقطة تسجيل الدخول لحماية الحسابات من هجمات التخمين (Brute-force).
   - بناء محرك الصلاحيات وقواعد الوصول (Authorization Engine).
   - بناء واجهات إدارة الأجهزة والجلسات وخيار تسجيل الخروج من كافة الأجهزة (Logout all devices).

4. **Graceful Shutdown**:
   - إغلاق خادم HTTP أولاً، ثم إغلاق اتصال قاعدة البيانات TypeORM بشكل مستقل، وضبط `process.exitCode` المناسب.

---

## Implemented Infrastructure

- Full Authentication Module (`src/modules/system/auth/`).
- Session Service (`src/modules/system/session/session.service.ts`).
- Passport JWT Authentication Strategy & Cookie Extractor (`src/bootstrap/passport.bootstrap.ts`, `passport-jwt.strategy.ts`).
- Route Protection Middlewares (`requireWebAuth`, `requireApiAuth`, `redirectIfAuthenticated`).
- Standardized `UnauthorizedError` (HTTP 401).
- Token Hashing Utility (`src/common/security/token-hash.util.ts`).
- System Modules Organization (`auth`, `permission`, `permission-grant`, `access-rule`, `role`, `session`, `user`).
- System Session Data Model & Migration (`SessionEntity`, `system_session`).
- Initial System Seed Data & Runner (`npm run seed`).
- Password Hashing & Comparison Utilities (`src/common/security/password.util.ts`).
- Migrations (`1710000000000-CreateSystemCoreTables.ts`, `1710000000001-CreateSystemSessionTable.ts`).
- Centralized DTO Validation Middleware (`src/common/middleware/validate-dto.middleware.ts`).
- Standardized `ValidationError` representation (`src/common/errors/validation.error.ts`).
- Centralized Error Handling (`AppError`, `errorHandlerMiddleware`).
- Standardized typed `ApiResponse` for API endpoints.
- EJS + `express-ejs-layouts` server-rendered views.
- Static assets serving (`src/public`).
- TypeORM MySQL connection and robust graceful shutdown.
