# Project Technical Map

## Current Project State

تم تنفيذ مرحلة فرق عمل ومسؤوليات الإنتاج (Production Department Team & Engineer Assignments Core) ومرحلة الهيكل التشغيلي لتطبيق الإنتاج (Production Departments & Yards Core) ومرحلة إدارة الأدوار والصلاحيات الشاملة (Role Management Core & Global Permission Assignment) ومرحلة إدارة المستخدمين الأساسية (User Management Core) ومرحلة محرك الصلاحيات (Authorization Core) ومرحلة المصادقة الأساسية (Authentication Core) بالكامل ودمجها مع نموذج الجلسات وقاعدة البيانات:
- **فرق عمل ومسؤوليات الإنتاج (Production Department Team & Engineer Assignments Core)** (`src/modules/production/team/`):
  - **هيكل مسؤوليات تشغيلي مستقل**: يربط المستخدمين بالكيانات التشغيلية داخل تطبيق الإنتاج حصراً ومستقل تماماً عن HR.
  - **رئيس القسم (`Department Head`)**: لكل قسم إنتاج رئيس قسم واحد (`head_user_id` في `production_department`)، ويكون مسؤولاً تلقائياً عن جميع ساحات القسم الحالية والمستقبلية دون الحاجة لصفوف إسناد ساحات منفصلة.
  - **المهندسون وتوزيع الساحات (`Engineers & Yard Assignments`)**:
    - المهندس ينتمي لقسم إنتاج واحد فقط (`userId` فريد في `production_department_engineer`).
    - المهندس يُسند لساحة واحدة أو أكثر تتبع لنفس قسمه (`production_yard_engineer`).
    - يمكن للساحة الواحدة أن تضم أكثر من مهندس مسؤول عنها.
    - يُمنع إسناد مهندس لساحات تتبع قسماً آخر (`PRODUCTION_ENGINEER_YARD_DEPARTMENT_MISMATCH`).
    - يُمنع نقل أو أرشفة ساحة مسندة لمهندسين حالياً (`PRODUCTION_YARD_HAS_ENGINEERS`).
    - لا يتم حذف صف المهندس صلبياً بل يُعطّل (`isActive = false`) مع حذف ارتباطات ساحاته، وعند إعادة تعيينه يُعاد تفعيل نفس السجل لمنع تكرار الـ ID.
- **الهيكل التشغيلي للإنتاج - الأقسام والساحات (Production Departments & Yards Core)** (`src/modules/production/`):
  - **فصل تشغيلي تام عن الموارد البشرية**: بيانات الأقسام والساحات هنا هي بيانات تشغيلية تخص تطبيق الإنتاج (`Production Application`) حصراً ومستقلة تماماً عن الهيكل التنظيمي للموارد البشرية (`HR Structure`).
  - **بيانات أعمال ديناميكية**: بيانات الأقسام والساحات ديناميكية بالكامل وتُدار عبر الواجهة وقاعدة البيانات ولا تحتوي على أي Enums صلبة.
  - **خدمة أقسام الإنتاج `ProductionDepartmentService`** (`src/modules/production/department/production-department.service.ts`):
    - `listDepartments`: استرجاع قائمة أقسام الإنتاج مع ترقيم الصفحات (Pagination) والبحث بالاسم أو الرمز، واسترجاع رئيس القسم، وحساب إجمالي الساحات (`yardCount`) والساحات النشطة (`activeYardCount`) في استعلام تجميعي واحد بدون N+1، واستبعاد المحذوفين ناعماً.
    - `getDepartmentById`: استرجاع تفاصيل قسم إنتاج محدد مع رئيس القسم وحساب عدد الساحات ورمي `NotFoundError` برمز `PRODUCTION_DEPARTMENT_NOT_FOUND` إذا لم يوجد.
    - `createDepartment`: إنشاء قسم إنتاج جديد مع تحديد رئيس القسم الإلزامي (`headUserId`)، والتحقق من نشاط المستخدم وصلاحيته، مع فحص مسبق لفرادة الرمز التقني (`code.trim().toUpperCase()`) متضمناً السجلات المحذوفة ناعماً (`withDeleted()`) والتقاط تضارب المفتاح الفريد وتحويله إلى `ConflictError` برمز `PRODUCTION_DEPARTMENT_CODE_ALREADY_EXISTS` (409).
    - `updateDepartment`: تحديث بيانات القسم (الاسم، الوصف، حالة التفعيل) داخل Transaction مع قفل تشاؤمي للكتابة (`pessimistic_write`) على سجل القسم (`Department row`)، مع ثبات الرمز التقني وعدم السماح بتعديله، وتطبيق قاعدة منع تعطيل القسم طالما يمتلك ساحات نشطة (`PRODUCTION_DEPARTMENT_HAS_ACTIVE_YARDS`).
    - `softDeleteDepartment`: أرشفة القسم (Soft Delete) وضبط `isActive = false` داخل Transaction مع قفل تشاؤمي على سجل القسم، وتطبيق قاعدة منع أرشفة القسم طالما يمتلك أي ساحات غير مؤرشفة سواء كانت نشطة أو معطلة (`PRODUCTION_DEPARTMENT_HAS_YARDS`) وتطبيق قاعدة منع أرشفة القسم طالما يمتلك مهندسين نشطين (`PRODUCTION_DEPARTMENT_HAS_ACTIVE_ENGINEERS`).
    - `findAssignableDepartmentForUpdate`: دالة مساعدة لقفل والتحقق من نشاط وصلاحية القسم قبل ربط الساحات به.
    - `listActiveDepartments`: استرجاع قائمة الأقسام النشطة للاختيار في نماذج إنشاء وتعديل الساحات.
  - **خدمة ساحات الإنتاج `ProductionYardService`** (`src/modules/production/yard/production-yard.service.ts`):
    - `listYards`: استرجاع قائمة ساحات الإنتاج مع Pagination والبحث، والفلترة الاختيارية بالقسم (`departmentId`)، وضم القسم التابع (`department`) بدون N+1.
    - `getYardById`: استرجاع تفاصيل الساحة مع قسمها التابع.
    - `createYard`: إنشاء ساحة جديدة داخل Transaction متزامنة مع قفل تشاؤمي للكتابة (`pessimistic_write`) على سجل قسم الإنتاج التابع عبر `findAssignableDepartmentForUpdate` لضمان فعالية القسم ومنع التزامن مع تعطيله، وفحص فرادة رمز الساحة عبر `withDeleted()` والتقاط خطأ 409 برمز `PRODUCTION_YARD_CODE_ALREADY_EXISTS`.
    - `updateYard`: تحديث بيانات الساحة (القسم، الاسم، السعة، الوصف، حالة التفعيل) داخل Transaction مع قفل تشاؤمي على الساحة، والتحقق من نشاط القسم المستهدف عند النقل، وتطبيق قاعدة منع تفعيل الساحة إذا كان قسمها التابع معطلاً (`PRODUCTION_DEPARTMENT_NOT_FOUND_OR_INACTIVE`).
    - `softDeleteYard`: أرشفة الساحة (Soft Delete) وضبط `isActive = false` داخل Transaction مع قفل تشاؤمي.
  - **مفهوم السعة الاستيعابية للساحات (`Yard Capacity`)**:
    - السعة الاستيعابية تمثل أقصى عدد من الغرف التي تستطيع الساحة استيعابها (`1 Room = 1 Capacity Unit`) كعدد صحيح موجب (`capacity >= 1`) بغض النظر عن نوع الغرفة أو أبعادها.
    - لا يتم تخزين الإشغال الحالي (`Occupancy`) أو السعة المتبقية كأعمدة في قاعدة البيانات؛ بل تُحسب لاحقاً عند بناء دورة حياة الغرف وحركات الإنتاج.
  - **واجهات برمجة التطبيقات (API Endpoints)**:
    - `GET /api/production/departments` (محمي بـ `PRODUCTION_DEPARTMENT_VIEW`).
    - `GET /api/production/departments/:id` (محمي بـ `PRODUCTION_DEPARTMENT_VIEW` و UUID).
    - `POST /api/production/departments` (محمي بـ `PRODUCTION_DEPARTMENT_CREATE` و `CreateProductionDepartmentDto`).
    - `PATCH /api/production/departments/:id` (محمي بـ `PRODUCTION_DEPARTMENT_UPDATE` و UUID و `UpdateProductionDepartmentDto` مع وسيط `validateDepartmentUpdatePayload`).
    - `DELETE /api/production/departments/:id` (محمي بـ `PRODUCTION_DEPARTMENT_DELETE` و UUID).
    - `GET /api/production/yards` (محمي بـ `PRODUCTION_YARD_VIEW` و `ListProductionYardsQueryDto`).
    - `GET /api/production/yards/:id` (محمي بـ `PRODUCTION_YARD_VIEW` و UUID).
    - `POST /api/production/yards` (محمي بـ `PRODUCTION_YARD_CREATE` و `CreateProductionYardDto`).
    - `PATCH /api/production/yards/:id` (محمي بـ `PRODUCTION_YARD_UPDATE` و UUID و `UpdateProductionYardDto` مع وسيط `validateYardUpdatePayload`).
    - `DELETE /api/production/yards/:id` (محمي بـ `PRODUCTION_YARD_DELETE` و UUID).
  - **واجهات الويب المعروضة من الخادم (Server-rendered EJS)**:
    - `GET /production`: لوحة تحكم تطبيق الإنتاج مع بطاقات التنقل للأقسام والساحات.
    - `GET /production/departments`: جدول أقسام الإنتاج مع إجمالي والساحات النشطة وشارات الحالة، مع أزرار إجراءات مباشرة مدمجة (`d-inline-flex gap-1`) متسقة مع جداول النظام لتجنب Scrollbars داخل `table-responsive`.
    - `GET /production/departments/create`: نموذج إنشاء قسم إنتاج جديد مع التحقق بواسطة المتصفح وبواسطة Bootstrap.
    - `GET /production/departments/:id/edit`: نموذج تعديل بيانات القسم مع قفل الرمز التقني كـ Read-only.
    - `GET /production/yards`: جدول ساحات الإنتاج مع فلتر الأقسام والسعة الاستيعابية وشارات الحالة، مع أزرار إجراءات مباشرة مدمجة (`d-inline-flex gap-1`).
    - `GET /production/yards/create`: نموذج إنشاء ساحة إنتاج جديدة مع قائمة اختيار الأقسام النشطة.
    - `GET /production/yards/:id/edit`: نموذج تعديل ساحة الإنتاج مع قفل الرمز التقني.
  - **تفاعل العميل (Client Scripts)**:
    - `src/public/js/production-departments.js`: إدارة الأقسام عبر Native Fetch وتأكيد الحذف والتعطيل ومعالجة الأخطاء.
    - `src/public/js/production-yards.js`: إدارة الساحات عبر Native Fetch وتأكيد الحذف والتعطيل ومعالجة الأخطاء.
- **إدارة الصلاحيات المباشرة للمستخدمين (Direct User Permission Management)** (`src/modules/system/user/`):
  - خدمة الصلاحيات المباشرة للمستخدم `UserPermissionService` (`src/modules/system/user/user-permission.service.ts`):
    - `getUserGlobalPermissionStates`: استرجاع قائمة كافة الصلاحيات النشطة في النظام مع حالة الوصول المباشر والموروث من الدور لكل مستخدم (`hasDirectAllowAll`, `hasDirectDenyAll`, `hasRoleAllowAll`, `hasRoleDenyAll`) وحساب حالة الوصول الفعلي الشامل (`effectiveGlobalAccess = (hasDirectAllowAll || hasRoleAllowAll) && !(hasDirectDenyAll || hasRoleDenyAll)`) عبر استعلام تجميعي موحد بدون N+1، مع استبعاد المنح غير النشطة أو المنتهية زمنياً.
    - `setUserGlobalPermissions`: إسناد مجموعة الصلاحيات المباشرة الشاملة للمستخدم داخل TypeORM Transaction:
      - تطبيق حماية الصلاحيات الذاتية (`Self Permission Protection`): منع المستخدم من تعديل صلاحياته المباشرة بنفسه ورمي `ForbiddenError` برمز `CANNOT_MANAGE_OWN_PERMISSIONS` (HTTP 403).
      - فرض قفل تشاؤمي للكتابة (`setLock('pessimistic_write')`) على سجل المستخدم المستهدف (`User row`) داخل الـ Transaction لضمان التسلسل التام مع عمليات دورة حياة المستخدم.
      - التحقق من وجود ونشاط كافة الصلاحيات المطلوبة ورفض العملية في حال وجود أي صلاحية غير صالحة (`PERMISSION_NOT_FOUND`).
      - تفعيل وإسناد قواعد `ALLOW ALL` على المنح المباشرة للمستخدم (`userId = targetUser.id`, `roleId IS NULL`, `isActive = true`, `expiresAt = null`, `canDelegate = false`).
      - تعطيل قواعد `ALLOW ALL` النشطة على الصلاحيات غير المحددة (`isActive = false`) مع دعم تعدد المنح القديمة وتعطيل القواعد عبر كافة منح المستخدم المباشرة المطابقة.
      - الحفاظ التام والآمن على منح الأدوار (`Role Grants`)، وقواعد الحظر (`DENY`)، وقواعد النطاقات المخصصة غير الشاملة (مثل `ALLOW YARD`) دون حذفها أو تعطيلها.
  - واجهات برمجة التطبيقات (API Endpoints):
    - `GET /api/system/users/:id/global-permissions` (محمي بـ `USER_VIEW` و UUID).
    - `PUT /api/system/users/:id/global-permissions` (محمي بـ `USER_PERMISSION_MANAGE` و UUID و `SetUserGlobalPermissionsDto`).
  - واجهات الويب المعروضة من الخادم (Server-rendered EJS):
    - `GET /system/users/:id/permissions`: واجهة إسناد الصلاحيات المباشرة الشاملة للمستخدم مجمعة حسب التطبيق والمورد، مع شارات توضيح الصلاحيات الموروثة من الدور، والصلاحيات المباشرة، وقواعد الـ DENY، وقفل الشاشة كـ Read-only في حال كان المستخدم الحالي يستعرض صلاحيات حسابه الشخصي.
  - تفاعل العميل (Client Scripts):
    - `src/public/js/user-permissions.js`: استخدام Native Fetch لعملية حفظ الصلاحيات المباشرة، واستخدام Event Delegation، ومعالجة رسائل الأخطاء وعرضها، وحظر استخدام HTMX.
- **تصحيح تزامن صلاحيات الأدوار (Role Permission Concurrency Correction)**:
  - تم تصحيح `RolePermissionService.setRoleGlobalPermissions` بحيث يتم قفل سجل الدور المستهدف بـ `pessimistic_write` داخل Transaction قبل قراءة بيانات الدور أو التحقق من مدير النظام أو تعديل المنح والقواعد، مما يسلسل عمليات تعديل صلاحيات الدور مع عمليات أرشفته وتعطيله وإسناده للمستخدمين.
- **إدارة الأدوار والصلاحيات الشاملة (Role Management Core & Global Permissions)** (`src/modules/system/role/` & `src/modules/system/permission/`):
  - خدمة الأدوار المركزية `RoleService` (`src/modules/system/role/role.service.ts`):
    - `listRoles`: استرجاع قائمة الأدوار مع Pagination، والبحث بالاسم أو الرمز التقني، وحساب عدد المستخدمين غير المحذوفين المرتبطين بكل دور (`userCount`) بكفاءة دون N+1، واستبعاد السجلات المحذوفة ناعماً.
    - `getRoleById`: استرجاع تفاصيل دور محدد مع حساب `userCount` ورمي `NotFoundError` إذا لم يوجد أو كان محذوفاً ناعماً.
    - `createRole`: إنشاء دور جديد بعد تنظيف وتوحيد الرمز التقني بالأحرف الإنجليزية الكبيرة (`code.trim().toUpperCase()`)، والتحقق المسبق من عدم وجود الرمز مسبقاً (مع فحص السجلات المحذوفة ناعماً `withDeleted()`)، والتقاط أخطاء الـ Race Condition في قاعدة البيانات (`ER_DUP_ENTRY` / 1062) وتحويلها إلى `ConflictError` برمز `ROLE_CODE_ALREADY_EXISTS`.
    - `updateRole`: تحديث بيانات الدور (الاسم، الوصف، حالة التفعيل) داخل Transaction مع فرض قفل تشاؤمي (`pessimistic_write`) على سجل الدور (`Role row`)، وثبات الرمز التقني وعدم السماح بتعديله نهائياً، والتعامل الآمن مع الوصف (`undefined` لا يغير، `null` يمسح، `string` يقص والمسافات تصبح `null`)، وتطبيق حظر تعطيل دور مدير النظام (`SYSTEM_ADMIN`)، ومنع تعطيل أي دور مرتبط بمستخدمين حاليين غير محذوفين (`ROLE_HAS_ASSIGNED_USERS`).
    - `softDeleteRole`: أرشفة الدور (Soft Delete) عبر `deletedAt` وضبط `isActive = false` داخل Transaction مع فرض قفل تشاؤمي (`pessimistic_write`) على سجل الدور لمنع أي تزامن مع إسناد مستخدمين جدد، وتطبيق حظر أرشفة دور مدير النظام (`SYSTEM_ADMIN`)، ومنع أرشفة أو حذف أي دور مرتبط بمستخدمين حاليين غير محذوفين (`ROLE_HAS_ASSIGNED_USERS`). منع الحذف الصلب (Hard Delete) نهائياً والاحتفاظ بسجلات المنح وقواعد الوصول دون حذف.
    - `findAssignableRoleForUpdate`: دالة مركزية لقفل والتحقق من صلاحية ونشاط الدور (`pessimistic_write`, `isActive = true`, `deletedAt IS NULL`) لاستخدامها أثناء إسناد الأدوار للمستخدمين.
    - `countAssignedUsers`: حساب عدد المستخدمين الفعليين غير المحذوفين ناعماً (`deletedAt IS NULL`) المرتبطين بالدور.
    - `findActiveRoleById` و `listActiveRoles`: دوال مساعدة لاسترجاع الأدوار النشطة الصالحة للاختيار عند إنشاء أو تعديل المستخدمين.
  - خدمة الصلاحيات الشاملة للدور `RolePermissionService` (`src/modules/system/role/role-permission.service.ts`):
    - `getRoleGlobalPermissionStates`: استرجاع قائمة جميع الصلاحيات النشطة في النظام مع حالة الوصول الشاملة للدور (`hasAllowAll`, `hasDenyAll`, `effectiveGlobalAccess = hasAllowAll && !hasDenyAll`) عبر استعلام تجميعي موحد بدون N+1، مع استبعاد المنح غير النشطة أو المنتهية زمنياً.
    - `setRoleGlobalPermissions`: إسناد مجموعة الصلاحيات الشاملة للدور داخل TypeORM Transaction:
      - حظر تعديل صلاحيات دور مدير النظام (`SYSTEM_ADMIN`) وإرجاع `SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM` لأنها تُدار تلقائياً عبر الـ Seed.
      - التحقق من وجود ونشاط كافة الصلاحيات المطلوبة.
      - تفعيل وإسناد قواعد `ALLOW ALL` على منح الدور (`roleId`, `userId IS NULL`, `isActive = true`, `expiresAt = null`, `canDelegate = false`).
      - تعطيل قواعد `ALLOW ALL` النشطة على الصلاحيات غير المحددة (`isActive = false`) مع دعم تعدد المنح القديمة وتعطيل القواعد عبر كافة منح الدور المطابقة.
      - الحفاظ التام والآمن على أي قواعد حظر (`DENY`) أو نطاقات مخصصة غير شاملة (Non-ALL) أو منح مباشرة للمستخدمين دون حذفها أو تعطيلها.
  - خدمة استعلام الصلاحيات `PermissionService` (`src/modules/system/permission/permission.service.ts`):
    - `listActivePermissions`: استرجاع الصلاحيات النشطة غير المحذوفة ناعماً كمرجع للنظام دون بناء CRUD للصلاحيات.
  - واجهات برمجة التطبيقات (API Endpoints) المحمية بالصلاحيات:
    - `GET /api/system/roles` (محمي بـ `ROLE_VIEW` و `ListRolesQueryDto`).
    - `GET /api/system/roles/:id` (محمي بـ `ROLE_VIEW` و UUID).
    - `POST /api/system/roles` (محمي بـ `ROLE_CREATE` و `CreateRoleDto`).
    - `PATCH /api/system/roles/:id` (محمي بـ `ROLE_UPDATE` و UUID و `UpdateRoleDto` مع وسيط `validateRoleUpdatePayload` لرفض الـ PATCH الفارغ).
    - `DELETE /api/system/roles/:id` (محمي بـ `ROLE_DELETE` و UUID).
    - `GET /api/system/roles/:id/global-permissions` (محمي بـ `ROLE_VIEW` و UUID).
    - `PUT /api/system/roles/:id/global-permissions` (محمي بـ `ROLE_PERMISSION_MANAGE` و UUID و `SetRoleGlobalPermissionsDto`).
  - واجهات الويب المعروضة من الخادم (Server-rendered EJS):
    - `GET /system/roles`: جدول الأدوار مع عدد المستخدمين المرتبطين، شارات الحالة، والإجراءات المشروطة بحالة الاستخدام وصلاحيات المستخدم.
    - `GET /system/roles/create`: نموذج إنشاء دور جديد مع كلاسات `needs-validation` والتحقق بالمتصفح وبواسطة Bootstrap وتوجيهات الرمز التقني.
    - `GET /system/roles/:id/edit`: نموذج تعديل الدور مع كلاسات `needs-validation` وقفل الرمز التقني كـ Read-only وقفل التعطيل لـ `SYSTEM_ADMIN`.
    - `GET /system/roles/:id/permissions`: واجهة إسناد الصلاحيات الشاملة مجمعة حسب التطبيق والمورد، مع استخدام معرف الصلاحية الحقيقي (`RolePermissionState.permissionId`) في عناصر الاختيار، وشارات توضيح قواعد الـ DENY، وقفل الشاشة كـ Read-only لدور مدير النظام، والاعتماد الحصري على حالة قاعدة البيانات (`hasAllowAll`) عند العرض وإعادة التحميل.
  - تفاعل العميل (Client Scripts):
    - `src/public/js/roles.js`: استخدام Native Fetch لعمليات الإنشاء، التعديل، تبديل الحالة، الأرشفة، وحفظ الصلاحيات، والتحقق من معرفات الصلاحيات بصيغة UUID v4 قبل إرسال الطلب، وإعادة تحميل الصفحة بعد نجاح الحفظ لقراءة الحالة المحدثة مباشرة من قاعدة البيانات، واستخدام Event Delegation، ومعالجة رسائل الأخطاء، وحظر استخدام HTMX.
- **إدارة المستخدمين الأساسية (User Management Core)** (`src/modules/system/user/`):
  - خدمة المستخدمين المركزية `UserService` (`src/modules/system/user/user.service.ts`):
    - `listUsers`: استرجاع قائمة المستخدمين مع Pagination، والبحث بالاسم أو رقم الهاتف، وضم الدور (Role) بكفاءة بدون N+1، واستبعاد المحذوفين ناعماً.
    - `getUserById`: استرجاع تفاصيل مستخدم محدد مع دوره واستبعاد `passwordHash`.
    - `createUser`: إنشاء مستخدم جديد داخل Transaction متزامنة مع قفل تشاؤمي (`pessimistic_write`) على سجل الدور المستهدف عبر `findAssignableRoleForUpdate` (وتشفير كلمة المرور مسبقاً قبل فتح الـ Transaction)، والتحقق المسبق من فرادية رقم الهاتف (حتى مع المحذوفين ناعماً)، والتقاط أخطاء الـ Race Condition في قاعدة البيانات (`ER_DUP_ENTRY` / 1062) وتحويلها إلى `ConflictError` برمز `USER_PHONE_ALREADY_EXISTS`، وإرجاع كائن مستخدم آمن.
    - `updateUser`: تحديث جزئي (PATCH) لبيانات المستخدم داخل Transaction مع فرض قفل تشاؤمي للكتابة (`pessimistic_write`) على سجل المستخدم المستهدف (`User row`)، وتطبيق حماية الذات، وحماية آخر مدير نظام فعال بالقفل التشاؤمي، وقفل تشاؤمي (`pessimistic_write`) على الدور الجديد المستهدف عند تغيير الدور، والتحقق من فرادية الهاتف مع التقاط خطأ 409، وإلغاء الجلسات النشطة تلقائياً عند التعطيل.
    - `softDeleteUser`: أرشفة المستخدم (Soft Delete) عبر `deletedAt` وتعطيله مع إلغاء كافة جلساته النشطة داخل Transaction مع فرض قفل تشاؤمي للكتابة (`pessimistic_write`) على سجل المستخدم المستهدف (`User row`) وتطبيق حظر حذف الذات وحظر حذف آخر مدير نظام فعال بالقفل التشاؤمي. منع الحذف الصلب (Hard Delete) نهائياً.
  - واجهات برمجة التطبيقات (API Endpoints) المحمية بالصلاحيات:
    - `GET /api/system/users` (محمي بـ `USER_VIEW` والتحقق من الـ Query DTO وتخزين النتيجة في `req.validatedQuery` دون تعديل `req.query`).
    - `GET /api/system/users/:id` (محمي بـ `USER_VIEW` والتحقق من UUID).
    - `POST /api/system/users` (محمي بـ `USER_CREATE` و `CreateUserDto` مع Trim للمدخلات النصية).
    - `PATCH /api/system/users/:id` (محمي بـ `USER_UPDATE` و UUID و `UpdateUserDto` مع وسيط `validateUserUpdatePayload` لرفض الـ PATCH الفارغ).
    - `DELETE /api/system/users/:id` (محمي بـ `USER_DELETE` و UUID).
  - واجهات الويب المعروضة من الخادم (Server-rendered EJS):
    - `GET /system/users`: قائمة المستخدمين مع جدول متجاوب، بحث، ترقيم صفحات، زر الصلاحيات، وشارات الحالة وإجراءات سريعة باستخدام `data-*` attributes دون أي inline JavaScript string interpolation لمنع Stored XSS.
    - `GET /system/users/create`: نموذج إنشاء مستخدم مع التحقق بالمتصفح وبواسطة Bootstrap.
    - `GET /system/users/:id/edit`: نموذج تعديل المستخدم مع قفل الحقول الحساسة عند تعديل الحساب الشخصي.
  - تفاعل العميل (Client Scripts):
    - `src/public/js/users.js`: استخدام Native Fetch لجميع عمليات الإنشاء والتعديل والأرشفة، واستخدام Event Delegation على مستوى المستند، وتأكيد الحذف عبر SweetAlert2، ومعالجة رسائل الأخطاء والـ Validation Arrays وعرضها بشكل مفهوم للمستخدم، وحظر استخدام HTMX.
- **محرك الصلاحيات (Authorization Core - Phase 1)** (`src/modules/system/authorization/`):
  - خدمة الصلاحيات المركزية `AuthorizationService` (`src/modules/system/authorization/authorization.service.ts`) المسؤولة عن تقييم وصول المستخدمين عبر `hasPermission` واسترجاع قائمة الصلاحيات الفعالة الشاملة عبر `getEffectivePermissions`.
  - وسيط التحقق من الصلاحيات `requirePermission` (`src/modules/system/authorization/authorization.middleware.ts`) الذي يتحقق من هوية المستخدم الموثق ويمرر `ForbiddenError` برمز `PERMISSION_DENIED` عند عدم امتلاك الصلاحية.
  - دمج وتقييم منح الدور الأساسي للمستخدم (`Role Grants`) مع المنح المباشرة للمستخدم (`Direct User Grants`) في استعلام واحد محكم بدون N+1.
  - استبعاد المنح غير النشطة أو المنتهية زمنياً (`expires_at <= now`) والمنح التابعة لصلاحيات معطلة أو محذوفة ناعماً.
  - تطبيق قاعدة التفوق للرفض (`DENY ALL` wins) والانغلاق التلقائي (Default Deny / Fail Closed).
  - عدم وجود أي تجاوز برمجي صلب لدور مدير النظام (`No SYSTEM_ADMIN hardcoded bypass`)؛ بل يخضع لتقييم المنح والقواعد المسندة إليه في الـ Seed كأي مستخدم آخر.
  - النطاقات المكانية والفرعية غير الشاملة (مثل `DEPARTMENT`, `YARD`) تنغلق بأمان (Fail closed) في هذه المرحلة ولا تمنح وصولاً شاملاً (`ALL`).
  - قرار معماري: لا يتم فحص `role.isActive` داخل `AuthorizationService` لأن بروتوكول قفل الأدوار وقواعد الأعمال تمنع تماماً إنشاء أو بقاء أي مستخدم غير محذوف مرتبط بدور معطل أو محذوف ناعماً (In-use Role Protection & Concurrency Invariant).
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
  - تمرير هوية المستخدم الآمنة كـ `AuthPrincipal` (`id`, `fullName`, `phone`, `roleId`, `roleCode`, `sessionId`) داخل سياق الطلب `req.user`.
- **حماية المسارات (Route Protection)**:
  - صفحات الويب الإدارية (`GET /`, `GET /system`, `GET /system/users/*`, `GET /system/roles/*`) محمية بوسيط `requireWebAuth` مع التوجيه التلقائي للمستخدمين غير المسجلين إلى `/login`، وتمرير أي أخطاء نظام إلى المعالج المركزي، وتعيين `res.locals.user` وإلغاء التخزين المؤقت `Cache-Control: no-store`.
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
│   │   ├── 1710000000001-CreateSystemSessionTable.ts
│   │   ├── 1710000000002-CreateProductionDepartmentsAndYards.ts
│   │   └── 1710000000003-CreateProductionTeamAssignments.ts
│   ├── seeds/
│   │   └── system-initial.seed.ts
│   └── data-source.ts
├── modules/
│   ├── production/
│   │   ├── department/
│   │   │   ├── dto/
│   │   │   │   ├── create-production-department.dto.ts
│   │   │   │   ├── list-production-departments-query.dto.ts
│   │   │   │   └── update-production-department.dto.ts
│   │   │   ├── production-department.controller.ts
│   │   │   ├── production-department.entity.ts
│   │   │   ├── production-department.middleware.ts
│   │   │   ├── production-department.route.ts
│   │   │   ├── production-department.service.ts
│   │   │   ├── production-department.types.ts
│   │   │   └── production-department.web.controller.ts
│   │   ├── team/
│   │   │   ├── dto/
│   │   │   │   ├── create-production-engineer-assignment.dto.ts
│   │   │   │   ├── set-production-department-head.dto.ts
│   │   │   │   └── update-production-engineer-yards.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── production-department-engineer.entity.ts
│   │   │   │   └── production-yard-engineer.entity.ts
│   │   │   ├── production-team.controller.ts
│   │   │   ├── production-team.route.ts
│   │   │   ├── production-team.service.ts
│   │   │   ├── production-team.types.ts
│   │   │   └── production-team.web.controller.ts
│   │   └── yard/
│   │       ├── dto/
│   │       │   ├── create-production-yard.dto.ts
│   │       │   ├── list-production-yards-query.dto.ts
│   │       │   └── update-production-yard.dto.ts
│   │       ├── production-yard.controller.ts
│   │       ├── production-yard.entity.ts
│   │       ├── production-yard.middleware.ts
│   │       ├── production-yard.route.ts
│   │       ├── production-yard.service.ts
│   │       ├── production-yard.types.ts
│   │       └── production-yard.web.controller.ts
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
│       │   ├── permission.entity.ts
│       │   └── permission.service.ts
│       ├── permission-grant/
│       │   ├── seeds/
│       │   │   └── system-admin-permission-grants.seed.ts
│       │   └── permission-grant.entity.ts
│       ├── role/
│       │   ├── constants/
│       │   │   └── system-role.enum.ts
│       │   ├── dto/
│       │   │   ├── create-role.dto.ts
│       │   │   ├── list-roles-query.dto.ts
│       │   │   ├── set-role-global-permissions.dto.ts
│       │   │   └── update-role.dto.ts
│       │   ├── seeds/
│       │   │   └── system-admin-role.seed.ts
│       │   ├── role.controller.ts
│       │   ├── role.entity.ts
│       │   ├── role.middleware.ts
│       │   ├── role.route.ts
│       │   ├── role.service.ts
│       │   ├── role.types.ts
│       │   ├── role.web.controller.ts
│       │   └── role-permission.service.ts
│       ├── session/
│       │   ├── session.entity.ts
│       │   └── session.service.ts
│       └── user/
│           ├── dto/
│           │   ├── create-user.dto.ts
│           │   ├── list-users-query.dto.ts
│           │   ├── set-user-global-permissions.dto.ts
│           │   └── update-user.dto.ts
│           ├── seeds/
│           │   └── system-admin-user.seed.ts
│           ├── user.controller.ts
│           ├── user.entity.ts
│           ├── user.middleware.ts
│           ├── user.route.ts
│           ├── user.service.ts
│           ├── user.types.ts
│           ├── user.web.controller.ts
│           └── user-permission.service.ts
├── public/
│   ├── css/
│   │   ├── app.css
│   │   └── auth.css
│   └── js/
│       ├── app.js
│       ├── login.js
│       ├── production-departments.js
│       ├── production-team.js
│       ├── production-yards.js
│       ├── roles.js
│       ├── user-permissions.js
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
│   │   ├── production/
│   │   │   ├── departments/
│   │   │   │   ├── create.ejs
│   │   │   │   ├── edit.ejs
│   │   │   │   └── index.ejs
│   │   │   ├── partials/
│   │   │   │   └── sidebar.ejs
│   │   │   ├── team/
│   │   │   │   ├── create-engineer.ejs
│   │   │   │   ├── edit-engineer.ejs
│   │   │   │   └── index.ejs
│   │   │   ├── yards/
│   │   │   │   ├── create.ejs
│   │   │   │   ├── edit.ejs
│   │   │   │   └── index.ejs
│   │   │   ├── index.ejs
│   │   │   └── layout.ejs
│   │   ├── system/
│   │   │   ├── partials/
│   │   │   │   └── sidebar.ejs
│   │   │   ├── roles/
│   │   │   │   ├── create.ejs
│   │   │   │   ├── edit.ejs
│   │   │   │   └── index.ejs
│   │   │   │   └── permissions.ejs
│   │   │   ├── users/
│   │   │   │   ├── create.ejs
│   │   │   │   ├── edit.ejs
│   │   │   │   └── index.ejs
│   │   │   │   └── permissions.ejs
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
  - `USER_PERMISSION_MANAGE = 'system.user.permission.manage'` (إدارة وإسناد صلاحيات المستخدم المباشرة)
  - `ROLE_VIEW = 'system.role.view'` (عرض الأدوار والصلاحيات)
  - `ROLE_CREATE = 'system.role.create'` (إنشاء دور جديد)
  - `ROLE_UPDATE = 'system.role.update'` (تعديل بيانات الدور)
  - `ROLE_DELETE = 'system.role.delete'` (أرشفة / حذف الدور)
  - `ROLE_PERMISSION_MANAGE = 'system.role.permission.manage'` (إدارة وإسناد صلاحيات الدور)
  - `PRODUCTION_DEPARTMENT_VIEW = 'production.department.view'` (عرض أقسام الإنتاج)
  - `PRODUCTION_DEPARTMENT_CREATE = 'production.department.create'` (إنشاء قسم إنتاج)
  - `PRODUCTION_DEPARTMENT_UPDATE = 'production.department.update'` (تعديل بيانات قسم الإنتاج)
  - `PRODUCTION_DEPARTMENT_DELETE = 'production.department.delete'` (أرشفة / حذف قسم الإنتاج)
  - `PRODUCTION_YARD_VIEW = 'production.yard.view'` (عرض ساحات الإنتاج)
  - `PRODUCTION_YARD_CREATE = 'production.yard.create'` (إنشاء ساحة إنتاج)
  - `PRODUCTION_YARD_UPDATE = 'production.yard.update'` (تعديل بيانات ساحة الإنتاج)
  - `PRODUCTION_YARD_DELETE = 'production.yard.delete'` (أرشفة / حذف ساحة الإنتاج)
  - `PRODUCTION_ASSIGNMENT_VIEW = 'production.assignment.view'` (عرض تعيينات فرق الإنتاج)
  - `PRODUCTION_ASSIGNMENT_MANAGE = 'production.assignment.manage'` (إدارة رؤساء الأقسام والمهندسين وساحات مسؤوليتهم)

### `AuthConstants`
- **File**: `src/modules/system/auth/auth.constants.ts`
- **Purpose**: الثوابت الخاصة بالمصادقة والكوكيز.
- **Values**:
  - `AUTH_COOKIE_NAME = 'erp_session'`
  - `AUTH_JWT_ISSUER = 'erp-inshaat'`
  - `AUTH_JWT_AUDIENCE = 'erp-users'`

---

## Production Infrastructure (Departments, Yards & Teams)

### `ProductionDepartmentService` (`src/modules/production/department/production-department.service.ts`)
- **Purpose**: تنفيذ منطق الأعمال، والتحقق من فرادة الرمز التقني، وتعيين رئيس القسم الإلزامي، وحماية الأقسام التي تمتلك ساحات أو مهندسين، وإدارة دورة حياة أقسام الإنتاج التشغيلية مع قفل تشاؤمي موحد لمنع التزامن غير المتسق.
- **Methods**:
  - `listDepartments(query: ListProductionDepartmentsQueryDto): Promise<PaginatedProductionDepartmentsResult>`
    - **Input**: `query` (`page`, `limit`, `search`).
    - **Action**: استعلام مقسم لصفحات مع البحث بالاسم أو الرمز، تجميع وحساب عدد الساحات الإجمالي (`yardCount`) والساحات النشطة (`activeYardCount`) واسترجاع اسم رئيس القسم (`headUserName`) لكل قسم بكفاءة بدون N+1، استبعاد الأقسام المحذوفة ناعماً، وترتيب النتائج تصاعدياً حسب تاريخ الإنشاء.
    - **Output**: `{ items: SafeProductionDepartmentOutput[], total, page, limit, totalPages }`.
  - `getDepartmentById(id: string): Promise<SafeProductionDepartmentOutput>`
    - **Input**: `id` (UUID).
    - **Action**: استرجاع قسم الإنتاج غير المحذوف ناعماً مع حسابه لـ `yardCount` و `activeYardCount` ورئيس القسم، ورمي `NotFoundError` برمز `PRODUCTION_DEPARTMENT_NOT_FOUND` إذا لم يوجد.
    - **Output**: `SafeProductionDepartmentOutput`.
  - `createDepartment(dto: CreateProductionDepartmentDto): Promise<SafeProductionDepartmentOutput>`
    - **Input**: `CreateProductionDepartmentDto` (`name`, `code`, `headUserId`, `description`, `isActive`).
    - **Action**:
      1. تنظيف الرمز التقني وتحويله إلى أحرف إنجليزية كبيرة (`code.trim().toUpperCase()`).
      2. معالجة الوصف (`string` يقص ويتحول الفارغ إلى `null`).
      3. التحقق المسبق من عدم وجود الرمز (مع المحذوفين ناعماً) ورمي `ConflictError` (`PRODUCTION_DEPARTMENT_CODE_ALREADY_EXISTS`).
      4. التحقق من وجود ونشاط مستخدم رئيس القسم (`headUserId`) وعدم حذفه ناعماً ورمي `BusinessRuleError` (`PRODUCTION_DEPARTMENT_HEAD_USER_NOT_AVAILABLE`) في حال عدم توفره.
      5. حفظ الكيان مع التقاط أخطاء الـ Race Condition في قاعدة البيانات وتحويلها إلى 409 `PRODUCTION_DEPARTMENT_CODE_ALREADY_EXISTS`.
    - **Output**: `SafeProductionDepartmentOutput`.
  - `updateDepartment(id: string, dto: UpdateProductionDepartmentDto): Promise<SafeProductionDepartmentOutput>`
    - **Input**: `id`, `UpdateProductionDepartmentDto` (`name`, `description`, `isActive`).
    - **Action**:
      1. بدء Transaction وإعادة تحميل القسم المستهدف مع قفل تشاؤمي (`pessimistic_write`).
      2. منع تعديل الرمز التقني نهائياً (`code` is immutable).
      3. معالجة الوصف بشكل آمن: `undefined` يبقي القيمة الحالية دون تغيير، `null` يمسح الوصف، و `string` يتم تنظيفه.
      4. إذا كان المطلوب تعطيل القسم (`isActive = false`): التحقق من عدم امتلاك القسم لأي ساحات نشطة غير محذوفة (`PRODUCTION_DEPARTMENT_HAS_ACTIVE_YARDS`).
      5. حفظ التعديلات وإرجاع الكائن المحدث مع عدد الساحات.
    - **Output**: `SafeProductionDepartmentOutput`.
  - `softDeleteDepartment(id: string): Promise<{ success: boolean; message: string }>`
    - **Input**: `id`.
    - **Action**:
      1. بدء Transaction وإعادة تحميل القسم المستهدف مع قفل تشاؤمي (`pessimistic_write`).
      2. التحقق من عدم امتلاك القسم لأي ساحات غير محذوفة سواء كانت نشطة أو معطلة (`PRODUCTION_DEPARTMENT_HAS_YARDS`).
      3. التحقق من عدم امتلاك القسم لأي مهندسين نشطين مسندين للقسم (`PRODUCTION_DEPARTMENT_HAS_ACTIVE_ENGINEERS`).
      4. ضبط `isActive = false` وتنفيذ `softDelete`.
    - **Output**: `{ success: true, message: 'تم أرشفة قسم الإنتاج بنجاح' }`.
  - `findAssignableDepartmentForUpdate(departmentId: string, manager: EntityManager): Promise<ProductionDepartmentEntity | null>`:
    - **Input**: `departmentId`, `manager`.
    - **Action**: البحث عن قسم نشط وغير محذوف ناعماً مع فرض قفل تشاؤمي للكتابة (`setLock('pessimistic_write')`) لنقطة تسلسل موحدة أثناء إنشاء/نقل/تفعيل الساحات أو تعيين المهندسين.
    - **Output**: `ProductionDepartmentEntity | null`.
  - `listActiveDepartments(): Promise<Array<{ id: string; name: string; code: string }>>`:
    - **Action**: استرجاع قائمة الأقسام النشطة غير المحذوفة للاختيار في الواجهات.

### `ProductionYardService` (`src/modules/production/yard/production-yard.service.ts`)
- **Purpose**: إدارة ساحات الإنتاج التشغيلية، وسعاتها الاستيعابية، وربطها بأقسام الإنتاج، ومنع نقل أو أرشفة الساحات المسندة لمهندسين مع فرض قواعد التسلسل والتزامن.
- **Methods**:
  - `listYards(query: ListProductionYardsQueryDto): Promise<PaginatedProductionYardsResult>`
    - **Input**: `query` (`page`, `limit`, `search`, `departmentId`).
    - **Action**: استعلام مقسم لصفحات مع البحث بالاسم أو الرمز، والفلترة الاختيارية بالقسم، وضم القسم التابع (`department`) بكفاءة بدون N+1، واستبعاد الساحات المحذوفة ناعماً، وترتيب النتائج تصاعدياً.
    - **Output**: `{ items: SafeProductionYardOutput[], total, page, limit, totalPages }`.
  - `getYardById(id: string): Promise<SafeProductionYardOutput>`
    - **Input**: `id` (UUID).
    - **Action**: استرجاع تفاصيل الساحة غير المحذوفة مع بيانات قسمها التابع ورمي `NotFoundError` برمز `PRODUCTION_YARD_NOT_FOUND` إذا لم توجد.
    - **Output**: `SafeProductionYardOutput`.
  - `createYard(dto: CreateProductionYardDto): Promise<SafeProductionYardOutput>`
    - **Input**: `CreateProductionYardDto` (`departmentId`, `name`, `code`, `capacity`, `description`, `isActive`).
    - **Action**:
      1. تنظيف الرمز التقني وتحويله لأحرف كبيرة.
      2. فتح Transaction:
         - قفل سجل قسم الإنتاج التابع بـ `pessimistic_write` عبر `findAssignableDepartmentForUpdate` والتحقق من نشاطه وعدم حذفه ورمي `NotFoundError('PRODUCTION_DEPARTMENT_NOT_FOUND_OR_INACTIVE')` في حال عدم صلاحيته.
         - التحقق المسبق من فرادة رمز الساحة عبر `withDeleted()`.
         - حفظ الساحة داخل نفس الـ Transaction.
      3. التقاط خطأ التضارب في قاعدة البيانات وتحويله إلى 409 `PRODUCTION_YARD_CODE_ALREADY_EXISTS`.
    - **Output**: `SafeProductionYardOutput`.
  - `updateYard(id: string, dto: UpdateProductionYardDto): Promise<SafeProductionYardOutput>`
    - **Input**: `id`, `UpdateProductionYardDto` (`departmentId`, `name`, `capacity`, `description`, `isActive`).
    - **Action**:
      1. فتح Transaction وإعادة تحميل الساحة مع قفل تشاؤمي (`pessimistic_write`).
      2. منع تعديل الرمز التقني نهائياً (`code` is immutable).
      3. إذا تم تغيير القسم التابع:
         - التحقق من عدم ارتباط الساحة بأي مهندسين حالياً في `production_yard_engineer` ورمي `BusinessRuleError` (`PRODUCTION_YARD_HAS_ENGINEERS`).
         - قفل والتحقق من نشاط القسم الجديد عبر `findAssignableDepartmentForUpdate`.
      4. إذا كانت الساحة ستصبح نشطة (`isActive = true`): قفل والتحقق من نشاط القسم الحالي/الجديد لمنع وجود ساحة نشطة تتبع لقسم معطل.
      5. حفظ التعديلات وإرجاع الكائن المحدث مع بيانات القسم.
    - **Output**: `SafeProductionYardOutput`.
  - `softDeleteYard(id: string): Promise<{ success: boolean; message: string }>`
    - **Input**: `id`.
    - **Action**:
      1. فتح Transaction وإعادة تحميل الساحة مع قفل تشاؤمي (`pessimistic_write`).
      2. التحقق من عدم ارتباط الساحة بأي مهندسين حالياً في `production_yard_engineer` ورمي `BusinessRuleError` (`PRODUCTION_YARD_HAS_ENGINEERS`).
      3. ضبط `isActive = false` وتنفيذ `softDelete`.
    - **Output**: `{ success: true, message: 'تم أرشفة ساحة الإنتاج بنجاح' }`.

### `ProductionTeamService` (`src/modules/production/team/production-team.service.ts`)
- **Purpose**: إدارة فريق عمل ومسؤوليات قسم الإنتاج، بما فيها تعيين رئيس القسم وتوزيع المهندسين وساحات مسؤوليتهم.
- **Methods**:
  - `getDepartmentTeam(departmentId: string): Promise<DepartmentTeamOutput>`
    - **Input**: `departmentId`.
    - **Action**: استرجاع بيانات القسم ورئيس القسم وقائمة المهندسين النشطين مع ساحاتهم المسندة داخل استعلام محكم بدون N+1.
    - **Output**: `{ department, head, engineers }`.
  - `setDepartmentHead(departmentId: string, userId: string): Promise<{ success: boolean; message: string; head: SafeHeadUserOutput }>`
    - **Input**: `departmentId`, `userId`.
    - **Action**: فتح Transaction، قفل القسم والمستخدم بـ `pessimistic_write`، التحقق من نشاط المستخدم وصلاحيته، تحديث `headUserId` وحفظ القسم.
    - **Output**: `{ success: true, message, head }`.
  - `addEngineerToDepartment(departmentId: string, dto: CreateProductionEngineerAssignmentDto): Promise<SafeEngineerAssignmentOutput>`
    - **Input**: `departmentId`, `dto` (`userId`, `yardIds`).
    - **Action**:
      1. فتح Transaction، قفل سجل القسم وسجل المستخدم بـ `pessimistic_write`.
      2. التحقق من نشاط وصلاحية المستخدم ونشاط القسم.
      3. التحقق من عدم إسناد المستخدم لأي قسم إنتاج آخر (حظر التعدد عبر الأقسام `PRODUCTION_ENGINEER_ASSIGNED_TO_OTHER_DEPARTMENT`).
      4. قفل والتحقق من أن جميع الساحات المحددة تتبع لنفس القسم ونشطة (`PRODUCTION_ENGINEER_YARD_DEPARTMENT_MISMATCH`).
      5. إنشاء التعيين أو إعادة تفعيل سجل سابق مع تحديث ارتباطات الساحات في `production_yard_engineer`.
    - **Output**: `SafeEngineerAssignmentOutput`.
  - `updateEngineerYards(departmentId: string, assignmentId: string, dto: UpdateProductionEngineerYardsDto): Promise<SafeEngineerAssignmentOutput>`
    - **Input**: `departmentId`, `assignmentId`, `dto` (`yardIds`).
    - **Action**: فتح Transaction، قفل سجل المهندس والساحات المستهدفة، التحقق من تبعيتها لنفس القسم، واستبدال ارتباطات الساحات ذرياً داخل `production_yard_engineer`.
    - **Output**: `SafeEngineerAssignmentOutput`.
  - `removeEngineerFromDepartment(departmentId: string, assignmentId: string): Promise<{ success: boolean; message: string }>`
    - **Input**: `departmentId`, `assignmentId`.
    - **Action**: فتح Transaction، قفل سجل المهندس، حذف كافة ارتباطات الساحات من `production_yard_engineer`، وضبط `isActive = false` دون حذف السجل صلبياً.
    - **Output**: `{ success: true, message: 'تمت إزالة المهندس من قسم الإنتاج بنجاح' }`.
  - `listActiveUsersForAssignment(): Promise<ActiveUserSelectOption[]>`: استرجاع قائمة المستخدمين النشطين غير المحذوفين لخيارات الإسناد.
  - `listDepartmentActiveYards(departmentId: string)`: استرجاع الساحات النشطة التابعة للقسم.

### `Production DTOs`
- `CreateProductionDepartmentDto`: التحقق من الاسم (2-100 مع Trim)، الرمز التقني (`^[A-Z][A-Z0-9_]*$` بطول 2-50 مع تحويل تلقائي للأحرف الكبيرة والتنظيف)، معرف رئيس القسم (`headUserId` UUID v4 إلزامي)، الوصف الاختياري، وحالة التفعيل.
- `UpdateProductionDepartmentDto`: يدعم التحديث الجزئي (PATCH) للاسم، الوصف، وحالة التفعيل، مع قفل تام لتعديل الرمز التقني.
- `ListProductionDepartmentsQueryDto`: التحقق من معاملات الاستعلام (`page`, `limit`, `search`).
- `SetProductionDepartmentHeadDto`: التحقق من معرف المستخدم (`userId` UUID v4).
- `CreateProductionEngineerAssignmentDto`: التحقق من معرف المهندس (`userId` UUID v4) ومصفوفة معرفات الساحات (`yardIds` UUID v4 مع ساحة واحدة على الأقل).
- `UpdateProductionEngineerYardsDto`: التحقق من مصفوفة معرفات الساحات (`yardIds` UUID v4 مع ساحة واحدة على الأقل).
- `CreateProductionYardDto`: التحقق من معرف القسم (`departmentId` UUID v4)، الاسم، الرمز التقني، السعة (`capacity >= 1` كعدد صحيح موجب)، الوصف، وحالة التفعيل.
- `UpdateProductionYardDto`: يدعم التحديث الجزئي للقسم، الاسم، السعة، الوصف، وحالة التفعيل، مع قفل تام لتعديل الرمز.
- `ListProductionYardsQueryDto`: التحقق من معاملات الاستعلام مع فلتر اختياري لمعرف القسم (`departmentId`).

### `Production Controllers & Web Controllers`
- `ProductionDepartmentController` & `ProductionYardController`: معالجة طلبات الـ JSON API لمسارات `/api/production/departments` و `/api/production/yards`.
- `ProductionTeamController`: معالجة طلبات الـ JSON API لمسارات فريق العمل `/api/production/departments/:departmentId/team/...`.
- `ProductionDepartmentWebController` & `ProductionYardWebController`: معالجة وعرض صفحات الـ EJS لمسارات `/production/departments` و `/production/yards`.
- `ProductionTeamWebController`: معالجة وعرض صفحات الـ EJS لمسارات إدارة فريق العمل `/production/departments/:departmentId/team/...`.

---

## Role Management Core Infrastructure

### `RoleService` (`src/modules/system/role/role.service.ts`)
- **Purpose**: تنفيذ منطق الأعمال، والتحقق من فرادة الرمز التقني، وحماية الأدوار المستخدمة، وإدارة دورة حياة الأدوار مع قفل تشاؤمي موحد لمنع التزامن غير المتسق.
- **Methods**:
  - `listRoles(query: ListRolesQueryDto): Promise<PaginatedRolesResult>`
    - **Input**: `query` (`page`, `limit`, `search`).
    - **Action**: استعلام مقسم لصفحات مع البحث بالاسم أو الرمز، تجميع وحساب عدد المستخدمين غير المحذوفين ناعماً لكل دور (`userCount`) بكفاءة، استبعاد الأدوار المحذوفة ناعماً، وترتيب النتائج تصاعدياً حسب تاريخ الإنشاء.
    - **Output**: `{ items: SafeRoleOutput[], total, page, limit, totalPages }`.
  - `getRoleById(id: string): Promise<SafeRoleOutput>`
    - **Input**: `id` (UUID).
    - **Action**: استرجاع الدور غير المحذوف ناعماً مع حسابه لـ `userCount` ورمي `NotFoundError` إذا لم يوجد.
    - **Output**: `SafeRoleOutput`.
  - `createRole(dto: CreateRoleDto): Promise<SafeRoleOutput>`
    - **Input**: `CreateRoleDto` (`name`, `code`, `description`, `isActive`).
    - **Action**:
      1. تنظيف الرمز التقني وتحويله إلى أحرف إنجليزية كبيرة.
      2. معالجة الوصف (`string` يقص ويتحول الفارغ إلى `null`).
      3. التحقق المسبق من عدم وجود الرمز (مع المحذوفين ناعماً) ورمي `ConflictError` (`ROLE_CODE_ALREADY_EXISTS`).
      4. حفظ الكيان مع التقاط أخطاء الـ Race Condition في قاعدة البيانات وتحويلها إلى 409 `ROLE_CODE_ALREADY_EXISTS`.
    - **Output**: `SafeRoleOutput`.
  - `updateRole(id: string, dto: UpdateRoleDto): Promise<SafeRoleOutput>`
    - **Input**: `id`, `UpdateRoleDto` (`name`, `description`, `isActive`).
    - **Action**:
      1. بدء Transaction وإعادة تحميل الدور المستهدف مع قفل تشاؤمي (`pessimistic_write`).
      2. منع تعديل الرمز التقني نهائياً (`code` is immutable).
      3. معالجة الوصف بشكل آمن: `undefined` يبقي القيمة الحالية دون تغيير، `null` يمسح الوصف (`targetRole.description = null`)، و `string` يتم تنظيفه وتحويل الفراغات إلى `null`.
      4. إذا كان المطلوب تعطيل الدور: منع تعطيل `SYSTEM_ADMIN` (`CANNOT_DEACTIVATE_SYSTEM_ADMIN_ROLE`)، والتحقق من عدم ارتباط الدور بأي مستخدم غير محذوف (`ROLE_HAS_ASSIGNED_USERS`).
      5. حفظ التعديلات وإرجاع الكائن المحدث مع `userCount`.
    - **Output**: `SafeRoleOutput`.
  - `softDeleteRole(id: string): Promise<{ success: boolean; message: string }>`
    - **Input**: `id`.
    - **Action**:
      1. بدء Transaction وإعادة تحميل الدور المستهدف مع قفل تشاؤمي (`pessimistic_write`).
      2. منع أرشفة أو حذف دور `SYSTEM_ADMIN` (`CANNOT_DELETE_SYSTEM_ADMIN_ROLE`).
      3. التحقق من عدم وجود أي مستخدم غير محذوف مرتبط بالدور (`ROLE_HAS_ASSIGNED_USERS`).
      4. ضبط `isActive = false` وتنفيذ `softDelete` دون حذف منح الصلاحيات التابعة للدور.
    - **Output**: `{ success: true, message: 'تم أرشفة الدور بنجاح' }`.
  - `findAssignableRoleForUpdate(roleId: string, manager: EntityManager): Promise<RoleEntity | null>`:
    - **Input**: `roleId`, `manager`.
    - **Action**: البحث عن دور نشط وغير محذوف ناعماً (`role.id = :roleId AND role.deletedAt IS NULL AND role.isActive = true`) مع فرض قفل تشاؤمي للكتابة (`setLock('pessimistic_write')`) لنقطة تسلسل موحدة أثناء إسناد الأدوار للمستخدمين.
    - **Output**: `RoleEntity | null`.
  - `countAssignedUsers(roleId: string, manager?: EntityManager): Promise<number>`:
    - **Action**: استعلام سريع لعدد سجلات `system_user` غير المحذوفة ناعماً المرتبطة بالدور.
  - `findActiveRoleById` و `listActiveRoles`: استرجاع الأدوار النشطة غير المحذوفة.

### `RolePermissionService` (`src/modules/system/role/role-permission.service.ts`)
- **Purpose**: إدارة وتقييم الصلاحيات الشاملة للدور وإسنادها مع الحفاظ على قواعد الـ DENY والنطاقات المخصصة.
- **Methods**:
  - `getRoleGlobalPermissionStates(roleId: string): Promise<RoleGlobalPermissionsResponse>`
    - **Input**: `roleId`.
    - **Action**: جلب الدور وكافة الصلاحيات النشطة، واستخراج المنح الفعالة وقواعد الوصول الشاملة (`ALLOW ALL` و `DENY ALL`) للدور، وحساب `effectiveGlobalAccess = hasAllowAll && !hasDenyAll` لكل صلاحية في استعلام تجميعي محكم بدون N+1، مع استبعاد المنح غير النشطة أو المنتهية زمنياً.
    - **Output**: `{ role: SafeRoleOutput, permissions: RolePermissionState[], isSystemAdmin: boolean }`.
  - `setRoleGlobalPermissions(roleId: string, desiredPermissionIds: string[], actor: AuthPrincipal): Promise<{ success: boolean; message: string }>`
    - **Input**: `roleId`, `desiredPermissionIds: string[]`, `actor`.
    - **Action**:
      1. منع تعديل صلاحيات دور مدير النظام (`SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM`).
      2. التحقق من صحة ووجود ونشاط كافة الصلاحيات الممررة في `desiredPermissionIds`.
      3. داخل Transaction:
         - لكل صلاحية مطلوبة: البحث عن منحة دور نشطة أو إعادة تفعيل منحة معطلة/منتهية (أو إنشاء منحة جديدة مع `canDelegate=false`, `grantedBy=actor.id`)، والتأكد من وجود وتفعيل قاعدة `ALLOW ALL` عليها.
         - لكل صلاحية غير مطلوبة: البحث عن جميع منح الدور المطابقة وتعطيل قواعد `ALLOW ALL` النشطة عليها (`isActive = false`) لمنع بقاء أي وصول فعال من منح متعددة.
         - عدم المساس أو الحذف لأي قواعد `DENY` أو قواعد بنطاقات فرعية غير شاملة أو منح مباشرة للمستخدمين.
    - **Output**: `{ success: true, message: 'تم حفظ صلاحيات الدور بنجاح' }`.

### `PermissionService` (`src/modules/system/permission/permission.service.ts`)
- **Purpose**: خدمة استعلامية لقراءة الصلاحيات النشطة المتاحة في النظام.
- **Methods**:
  - `listActivePermissions(manager?: EntityManager): Promise<PermissionEntity[]>`: استرجاع جميع الصلاحيات النشطة غير المحذوفة مرتبة بالاسم.

### `Role DTOs` (`src/modules/system/role/dto/`)
- `CreateRoleDto`: التحقق من الاسم (2-100 مع Trim)، الرمز التقني (`^[A-Z][A-Z0-9_]*$` بطول 2-50 مع تحويل تلقائي للأحرف الكبيرة والتنظيف)، الوصف الاختياري، وحالة التفعيل.
- `UpdateRoleDto`: يدعم التحديث الجزئي (PATCH) للاسم، الوصف (`string | null` بحيث `undefined` لا يغير، `null` يمسح، و `string` يتم تنظيفه)، وحالة التفعيل، مع قفل تام وعدم إتاحة تعديل الرمز التقني.
- `ListRolesQueryDto`: التحقق وتحويل معاملات الاستعلام (`page`, `limit`, `search`).
- `SetRoleGlobalPermissionsDto`: التحقق من مصفوفة معرفات الصلاحيات (`permissionIds`) كمعرفات UUID v4 فريدة ومصفوفة صالحة.

### `Role Controllers & Web Controllers`
- `RoleController` (`src/modules/system/role/role.controller.ts`): معالجة طلبات الـ JSON API لمسارات `/api/system/roles`.
- `RoleWebController` (`src/modules/system/role/role.web.controller.ts`): معالجة وعرض صفحات الـ EJS لمسارات `/system/roles` مع تمرير الصلاحيات الفعالة وشارات الحماية.

---

## User Management Core Infrastructure

### `UserService` (`src/modules/system/user/user.service.ts`)
- **Purpose**: تنفيذ منطق الأعمال، وقواعد التحقق، وحماية الحسابات، وإدارة دورة حياة المستخدمين مع قفل تشاؤمي على الأدوار لمنع التزامن غير المتسق.
- **Methods**:
  - `listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersResult>`
    - **Input**: `query` (`page`, `limit`, `search`).
    - **Action**: استعلام مقسم لصفحات مع البحث بالاسم أو رقم الهاتف، وضم الدور (Role) بكفاءة بدون N+1، واستبعاد المحذوفين ناعماً.
    - **Output**: `{ items: SafeUserOutput[], total, page, limit, totalPages }`.
  - `getUserById(id: string): Promise<SafeUserOutput>`
    - **Input**: `id` (UUID).
    - **Action**: استرجاع المستخدم غير المحذوف ناعماً مع دوره ورمي `NotFoundError` إذا لم يوجد.
    - **Output**: `SafeUserOutput` (بدون `passwordHash`).
  - `createUser(dto: CreateUserDto): Promise<SafeUserOutput>`
    - **Input**: `CreateUserDto` (`fullName`, `phone`, `password`, `roleId`, `isActive`).
    - **Action**:
      1. تشفير كلمة المرور مسبقاً (`hashPassword`) لتقليل زمن حجز القفل في قاعدة البيانات.
      2. فتح Transaction:
         - التحقق من عدم وجود رقم الهاتف مسبقاً (مع فحص السجلات المحذوفة ناعماً `withDeleted()`) ورمي `ConflictError` عند التكرار.
         - قفل سجل الدور المستهدف بـ `pessimistic_write` عبر `RoleService.findAssignableRoleForUpdate` والتحقق من كونه نشطاً وغير محذوف ناعماً ورمي `NotFoundError('ROLE_NOT_FOUND_OR_INACTIVE')` في حال عدم صلاحيته.
         - حفظ المستخدم داخل نفس الـ Transaction وإرجاع بياناته الآمنة.
      3. التقاط أخطاء الـ Race Condition في قاعدة البيانات (`ER_DUP_ENTRY` / 1062) وتحويلها إلى `ConflictError` برمز `USER_PHONE_ALREADY_EXISTS`.
    - **Output**: `SafeUserOutput`.
  - `updateUser(id: string, dto: UpdateUserDto, currentPrincipal: AuthPrincipal): Promise<SafeUserOutput>`
    - **Input**: `id`, `UpdateUserDto` (`fullName`, `phone`, `roleId`, `isActive`), `currentPrincipal`.
    - **Action**:
      1. **حماية الذات**: التحقق المبدئي من منع المستخدم من تعطيل حسابه الحالي.
      2. **Transaction**: بدء Transaction وإعادة تحميل المستخدم المستهدف من قاعدة البيانات.
      3. **حماية الدور الشخصي**: منع المستخدم من تغيير دوره الخاص على السجل المحمل حديثاً.
      4. **حماية آخر مدير نظام بقفل تشاؤمي**: إذا كانت العملية ستؤدي لتعطيل مدير نظام فعال أو نقله لدور آخر، يتم فرض Pessimistic Write Lock (`setLock('pessimistic_write')`) على سجلات مدراء النظام الفعالة والتحقق من أن عددهم يتجاوز 1 لمنع أي Race Condition متزامن.
      5. **التحقق من الدور الجديد وقفله**: في حال تغيير الدور، يتم قفل الدور الجديد بـ `pessimistic_write` عبر `findAssignableRoleForUpdate` والتحقق من كونه نشطاً وغير محذوف ناعماً.
      6. **فرادية الهاتف**: التحقق من عدم استخدام الهاتف الجديد من قبل حساب آخر (يشمل المحذوفين ناعماً) والتقاط خطأ التكرار 409.
      7. **حفظ التعديلات**: حفظ الكيان وإلغاء الجلسات النشطة تلقائياً عبر `SessionService.revokeUserSessions` في حال تحول المستخدم إلى غير نشط (`isActive = false`).
    - **Output**: `SafeUserOutput`.
  - `softDeleteUser(id: string, currentPrincipal: AuthPrincipal): Promise<{ success: boolean; message: string }>`
    - **Input**: `id`, `currentPrincipal`.
    - **Action**:
      1. منع حذف المستخدم لنفسه (`Self Protection`).
      2. **Transaction**: إعادة تحميل المستخدم وفرض Pessimistic Write Lock على مدراء النظام في حال كان المستهدف مدير نظام فعال للتحقق من عدم كونه الأخير.
      3. إلغاء الجلسات النشطة، ضبط `isActive = false`، وتنفيذ `softDelete` للكيان.
    - **Output**: `{ success: true, message: 'تم أرشفة المستخدم بنجاح' }`.

### `User DTOs` (`src/modules/system/user/dto/`)
- `CreateUserDto`: التحقق من الاسم الكامل (2-150 مع Trim تلقائي عبر `@Transform`)، الهاتف (`^09[0-9]{8}$` مع Trim)، كلمة المرور (6 محارف على الأقل بدون Trim)، `roleId` (UUID v4)، وحالة التفعيل الاختيارية.
- `UpdateUserDto`: يدعم التحديث الجزئي (PATCH) مع Trim للمدخلات النصية وخلوه التام من حقول كلمات المرور أو الصلاحيات.
- `ListUsersQueryDto`: التحقق وتحويل معاملات الاستعلام (`page` افتراضي 1، `limit` افتراضي 20 بحد أقصى 100، `search` نصي مع Trim).

### `Generic Middlewares & Types` (`src/common/middleware/`)
- `validateQueryDto(DtoClass)`: وسيط لإجراء التحقق من استعلامات الـ URL (`req.query`) باستخدام `class-transformer` و `class-validator` وتخزين الكائن المحقق داخل `req.validatedQuery` دون التعديل على `req.query`.
- `validateUuidParam(paramName)`: وسيط للتحقق من صحة معاملات الـ URL (`req.params`) وتطابقها مع نمط UUID v4.
- `validateUserUpdatePayload`: وسيط مخصص للتحقق من احتواء طلب الـ PATCH على حقل واحد على الأقل مع قبول `isActive: false` كقيمة صحيحة.
- `validateRoleUpdatePayload`: وسيط مخصص للتحقق من احتواء طلب تعديل الدور على حقل واحد على الأقل.

---

### `User Controllers & Web Controllers`
- `UserController` (`src/modules/system/user/user.controller.ts`): معالجة طلبات الـ JSON API لمسارات `/api/system/users` بما فيها `getGlobalPermissions` و `setGlobalPermissions`.
- `UserWebController` (`src/modules/system/user/user.web.controller.ts`): معالجة وعرض صفحات الـ EJS لمسارات `/system/users` بما فيها واجهة إسناد الصلاحيات المباشرة `renderUserPermissionsForm`.

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
    - **Output**: `string[]` (مثل `['system.user.view', 'system.user.create', 'system.role.view', ...]`).

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
2. **System User Permissions Seed** (`src/modules/system/permission/seeds/system-user-permissions.seed.ts`) $\rightarrow$ ينشئ أو يسترجع الصلاحيات المعرفة في `SystemPermission` (صلاحيات المستخدمين وصلاحيات الأدوار).
3. **System Admin User Seed** (`src/modules/system/user/seeds/system-admin-user.seed.ts`) $\rightarrow$ ينشئ مستخدم مدير النظام `0912312312` ويستدعي منح الصلاحيات وقواعد الوصول.
4. **SYSTEM_ADMIN Permission Grants Seed** (`src/modules/system/permission-grant/seeds/system-admin-permission-grants.seed.ts`) $\rightarrow$ يضمن في كل تشغيل أن دور `SYSTEM_ADMIN` يمتلك منحة نشطة وغير منتهية مع `can_delegate: true` و `userId = null` لكل صلاحية نشطة.
5. **SYSTEM_ADMIN Access Rules Seed** (`src/modules/system/access-rule/seeds/system-admin-access-rules.seed.ts`) $\rightarrow$ يضمن وجود وتفعيل قواعد `ALLOW` / `ALL` لكل منحة صلاحية خاصة بمدير النظام دون حذف قواعد الـ DENY الصريحة.

### Seed Idempotency & Security Rules
- **Idempotency**: يعتمد التحقق على المفاتيح الطبيعية (`Role.code`, `Permission.name`, `User.phone`, `Grant(roleId + permissionId)`, `Rule(grantId + effect + scopeType)`).
- **Password Security**:
  - متغير البيئة `SEED_SYSTEM_ADMIN_PASSWORD` إلزامي فقط عند إنشاء مستخدم المدير لأول مرة.
  - لا توجد أي كلمة مرور افتراضية (No fallback) في الكود المصدري.
  - تشفير كلمة المرور بـ `bcrypt` قبل التخزين.
  - حماية كلمات مرور المستخدمين المنشئين مسبقاً من إعادة التعيين أثناء إعادة تشغيل الـ Seed.
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

### `production_department`
- **Entity**: `ProductionDepartmentEntity` (`src/modules/production/department/production-department.entity.ts`)
- **Purpose**: تمثيل الهيكل التنظيمي التشغيلي لأقسام تطبيق الإنتاج (مثل الصب، الإكساء، الجودة، النقل) كبيانات أعمال ديناميكية منفصلة تماماً عن HR، مع ارتباط كل قسم برئيس قسم واحد.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `name`: varchar(100), NOT NULL
  - `code`: varchar(50), NOT NULL, UNIQUE (`UQ_production_department_code`), Immutable
  - `head_user_id`: varchar(36) UUID, NULL, FK $\rightarrow$ `system_user.id` (Department Head)
  - `description`: text, NULL
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
  - `deleted_at`: datetime(6), NULL (Soft Delete)
- **Relations**:
  - `headUser`: ManyToOne $\rightarrow$ `UserEntity` (`head_user_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, `eager: false`, `cascade: false`)
  - `yards`: OneToMany $\rightarrow$ `ProductionYardEntity` (`eager: false`, `cascade: false`)
  - `engineers`: OneToMany $\rightarrow$ `ProductionDepartmentEngineerEntity` (`eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `UQ_production_department_code`: UNIQUE(`code`)
  - `IDX_production_department_head_user_id`: INDEX(`head_user_id`)
  - `IDX_production_department_is_active`: INDEX(`is_active`)
  - `IDX_production_department_deleted_at`: INDEX(`deleted_at`)
  - `FK_production_department_head_user_id`: FOREIGN KEY (`head_user_id`) REFERENCES `system_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE

---

### `production_yard`
- **Entity**: `ProductionYardEntity` (`src/modules/production/yard/production-yard.entity.ts`)
- **Purpose**: تمثيل ساحات الإنتاج التشغيلية التابعة لأقسام الإنتاج، مع تحديد السعة الاستيعابية بوحدات الغرف (`1 Room = 1 Capacity Unit`).
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `department_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `production_department.id`
  - `name`: varchar(100), NOT NULL
  - `code`: varchar(50), NOT NULL, UNIQUE (`UQ_production_yard_code`), Immutable
  - `capacity`: int, NOT NULL (`CHK_production_yard_capacity`: capacity >= 1)
  - `description`: text, NULL
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
  - `deleted_at`: datetime(6), NULL (Soft Delete)
- **Relations**:
  - `department`: ManyToOne $\rightarrow$ `ProductionDepartmentEntity` (`department_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, `eager: false`, `cascade: false`)
  - `engineerMappings`: OneToMany $\rightarrow$ `ProductionYardEngineerEntity` (`eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `UQ_production_yard_code`: UNIQUE(`code`)
  - `IDX_production_yard_department_id`: INDEX(`department_id`)
  - `IDX_production_yard_is_active`: INDEX(`is_active`)
  - `IDX_production_yard_deleted_at`: INDEX(`deleted_at`)
  - `CHK_production_yard_capacity`: CHECK `(capacity >= 1)`
  - `FK_production_yard_department_id`: FOREIGN KEY (`department_id`) REFERENCES `production_department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE

---

### `production_department_engineer`
- **Entity**: `ProductionDepartmentEngineerEntity` (`src/modules/production/team/entities/production-department-engineer.entity.ts`)
- **Purpose**: تمثيل إسناد المهندس لقسم إنتاج تشغيلي محدد، مع حظر انتماء المهندس لأكثر من قسم في نفس الوقت (`user_id` فريد).
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `department_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `production_department.id`
  - `user_id`: varchar(36) UUID, NOT NULL, UNIQUE (`UQ_production_department_engineer_user_id`), FK $\rightarrow$ `system_user.id`
  - `is_active`: tinyint(1), NOT NULL, default: 1
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
  - `updated_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
- **Relations**:
  - `department`: ManyToOne $\rightarrow$ `ProductionDepartmentEntity` (`department_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, `eager: false`)
  - `user`: ManyToOne $\rightarrow$ `UserEntity` (`user_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, `eager: false`)
  - `yardMappings`: OneToMany $\rightarrow$ `ProductionYardEngineerEntity` (`eager: false`, `cascade: false`)
- **Constraints / Indexes**:
  - `UQ_production_department_engineer_user_id`: UNIQUE(`user_id`)
  - `IDX_production_dept_engineer_department_id`: INDEX(`department_id`)
  - `IDX_production_dept_engineer_user_id`: INDEX(`user_id`)
  - `IDX_production_dept_engineer_is_active`: INDEX(`is_active`)
  - `FK_production_dept_engineer_department_id`: FOREIGN KEY (`department_id`) REFERENCES `production_department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
  - `FK_production_dept_engineer_user_id`: FOREIGN KEY (`user_id`) REFERENCES `system_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE

---

### `production_yard_engineer`
- **Entity**: `ProductionYardEngineerEntity` (`src/modules/production/team/entities/production-yard-engineer.entity.ts`)
- **Purpose**: جدول ربط الوسيط بين إسناد المهندس في القسم وساحات الإنتاج التابعة لنفس القسم المسندة لمسؤوليته.
- **Fields**:
  - `id`: varchar(36) UUID, Primary Key
  - `department_engineer_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `production_department_engineer.id`
  - `yard_id`: varchar(36) UUID, NOT NULL, FK $\rightarrow$ `production_yard.id`
  - `created_at`: datetime(6), NOT NULL, default: CURRENT_TIMESTAMP(6)
- **Relations**:
  - `departmentEngineer`: ManyToOne $\rightarrow$ `ProductionDepartmentEngineerEntity` (`department_engineer_id`, `onDelete: CASCADE`, `onUpdate: CASCADE`, `eager: false`)
  - `yard`: ManyToOne $\rightarrow$ `ProductionYardEntity` (`yard_id`, `onDelete: RESTRICT`, `onUpdate: CASCADE`, `eager: false`)
- **Constraints / Indexes**:
  - `UQ_production_yard_engineer_assignment`: UNIQUE(`department_engineer_id`, `yard_id`)
  - `IDX_production_yard_engineer_dept_eng_id`: INDEX(`department_engineer_id`)
  - `IDX_production_yard_engineer_yard_id`: INDEX(`yard_id`)
  - `FK_production_yard_engineer_dept_eng_id`: FOREIGN KEY (`department_engineer_id`) REFERENCES `production_department_engineer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
  - `FK_production_yard_engineer_yard_id`: FOREIGN KEY (`yard_id`) REFERENCES `production_yard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE

---

## Architectural Rules

1. **User & Role Management & Security Invariants**:
   - حذف المستخدمين والأدوار يتم حصراً عبر الحذف الناعم (`Soft Delete`)؛ يُمنع الحذف الصلب (`Hard Delete`) نهائياً.
   - يُمنع إرجاع `passwordHash` في أي استجابات Backend (API أو Views أو List أو Detail).
   - تعطيل المستخدم أو أرشفته/حذفه ناعماً يؤدي تلقائياً إلى إلغاء كافة جلساته النشطة داخل Transaction (`Revoke Active Sessions`).
   - حماية الذات (`Self Protection`): لا يمكن للمستخدم تعطيل حسابه الحالي أو حذفه ناعماً أو تغيير دوره من خلال إدارة المستخدمين العامة.
   - حماية مدير النظام الأخير (`Last SYSTEM_ADMIN Protection`): يتم التحقق منها داخل نفس الـ Transaction الخاصة بالعملية، مع قفل سجلات مدراء النظام الفعالة عبر Database Pessimistic Write Lock (`setLock('pessimistic_write')`) لمنع حدوث أي Race Condition عند حدوث طلبات تعديل/تعطيل/حذف متزامنة.
   - ثبات الرمز التقني للدور: رمز الدور (`role.code`) هو معرّف تقني ثابت لا يمكن تعديله بعد الإنشاء.
   - حماية دور مدير النظام (`SYSTEM_ADMIN`): لا يمكن تعطيل دور مدير النظام أو حذفه ناعماً، وتُدار صلاحياته الأساسية تلقائياً عبر النظام (Seeds) ولا تُعدل من واجهة إسناد الصلاحيات (`SYSTEM_ADMIN_PERMISSIONS_MANAGED_BY_SYSTEM`).
   - منع تعطيل أو حذف الأدوار المستخدمة (Role in Use): لا يمكن تعطيل أو أرشفة/حذف أي دور طالما يوجد مستخدمون غير محذوفين مرتبطون به (`ROLE_HAS_ASSIGNED_USERS`).
   - بروتوكول قفل سجل الدور لمنع التزامن غير المتسق (`Role Lock Protocol`):
     - سجل الدور المستهدف في `system_role` هو نقطة التسلسل المركزية (`Serialization Point`) لجميع عمليات إسناد الأدوار ودورة حياة الأدوار.
     - كل عملية تسند دوراً لمستخدم (إنشاء مستخدم جديد `createUser` أو تعديل دور مستخدم `updateUser`)، وكل عملية تغير دورة حياة الدور (تعطيل الدور `updateRole` أو أرشفة الدور `softDeleteRole`)، يجب أن تنفذ داخل Transaction وتحصل على قفل تشاؤمي للكتابة (`setLock('pessimistic_write')`) على نفس سجل الدور المستهدف.
     - هذا البروتوكول يضمن رياضياً وتزامنياً استحالة وجود أي مستخدم غير محذوف مرتبط بدور معطل أو محذوف ناعماً تحت أي ظروف تزامن متوازية.
   - نطاق إدارة صلاحيات الدور: واجهة إدارة صلاحيات الأدوار تدير فقط الصلاحيات الشاملة (`ALLOW ALL`) للدور، ويُمنع حذف أو إلغاء قواعد الحظر (`DENY`) أو النطاقات المخصصة أو المنح المباشرة للمستخدمين.
   - معالجة أخطاء فرادة المفاتيح في قاعدة البيانات: يتم التقاط أخطاء التزامن الخاصة بفرادة رقم الهاتف (`USER_PHONE_ALREADY_EXISTS`) وفرادة رمز الدور (`ROLE_CODE_ALREADY_EXISTS`) وتحويلها إلى أخطاء تضارب آمنة (`ConflictError` 409) دون إظهار استثناءات قاعدة البيانات الخام (500).
   - إخفاء العناصر والأزرار في واجهة المستخدم (`UI Visibility`) ليس بديلاً عن الصلاحيات الأمنية؛ يجب على الـ APIs التحقق الصارم من الصلاحيات.
   - فرادية رقم الهاتف (`Unique Phone`): يُمنع تكرار رقم الهاتف مع أي حساب موجود في النظام بما في ذلك الحسابات المحذوفة ناعماً.

2. **System Permission & Access Control Architecture (Implemented Phase 1 & Direct Permissions)**:
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

11. **Production Organizational & Concurrency Invariants**:
    - **الفصل التشغيلي**: أقسام الإنتاج وساحاته تتبع لتطبيق الإنتاج فقط، ومستقلة تماماً عن هيكل الموارد البشرية (HR) أو أي أقسام عامة في النظام.
    - **البيانات الديناميكية**: لا توجد Enums صلبة للأقسام أو الساحات، بل تُدار عبر قاعدة البيانات وتدعم التوسع المستقبلي.
    - **السعة الاستيعابية للساحات (`Yard Capacity`)**: السعة تمثل أقصى عدد من الغرف التي تستوعبها الساحة (`1 Room = 1 Capacity Unit`) كعدد صحيح موجب (`capacity >= 1`). لا يتم تخزين الإشغال الحالي أو السعة المتبقية كأعمدة في DB لتجنب تكرار البيانات.
    - **الحذف الناعم فقط**: حذف الأقسام والساحات يتم حصراً عبر الحذف الناعم (`Soft Delete` مع `deleted_at`).
    - **ثبات الرمز التقني**: الرمز التقني (`code`) لكل من القسم والساحة ثابت وغير قابل للتعديل بعد الإنشاء.
    - **بروتوكول قفل سجل القسم (`Department Lock Protocol`)**:
      - سجل قسم الإنتاج المستهدف في `production_department` هو نقطة التسلسل المركزية (`Serialization Point`) لكافة عمليات الساحات التابعة ودورة حياة القسم.
      - إنشاء ساحة جديدة، أو نقل ساحة لقسم آخر، أو إعادة تفعيل ساحة معطلة، يتطلب قفل تشاؤمي للكتابة (`pessimistic_write`) على سجل القسم والتحقق من كونه نشطاً وغير محذوف ناعماً.
      - تعطيل قسم إنتاج مشروط بعدم امتلاكه أي ساحات نشطة غير محذوفة (`PRODUCTION_DEPARTMENT_HAS_ACTIVE_YARDS`).
      - أرشفة قسم إنتاج مشروطة بعدم امتلاكه أي ساحات غير محذوفة سواء كانت نشطة أو معطلة (`PRODUCTION_DEPARTMENT_HAS_YARDS`).

---

## Implemented Infrastructure

- Production Organizational Structure Module (`src/modules/production/department/`, `src/modules/production/yard/`).
- Production Department Service with Yard Aggregations, Lock Protocol, and Invariants (`src/modules/production/department/production-department.service.ts`).
- Production Yard Service with Positive Capacity Invariant, Department Locking, and Invariants (`src/modules/production/yard/production-yard.service.ts`).
- Production API & Web Controllers with EJS Views & Native Fetch Client Scripts (`src/public/js/production-departments.js`, `src/public/js/production-yards.js`).
- Centralized Direct User Permissions Management Module (`src/modules/system/user/user-permission.service.ts`).
- Centralized Role Management Module & Global Permission Assignment (`src/modules/system/role/`, `src/modules/system/permission/`).
- Role Service with Assignment Count, Pessimistic Lock Protocol, Code Immutability, and Safe Description Handling (`src/modules/system/role/role.service.ts`).
- Role Global Permission Service (`src/modules/system/role/role-permission.service.ts`).
- Permission Lookup Service (`src/modules/system/permission/permission.service.ts`).
- Centralized User Management Module (`src/modules/system/user/`).
- User Service with Concurrency Phone Uniqueness Hardening, Pessimistic Locking on Role Assignment and Invariants (`src/modules/system/user/user.service.ts`).
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
  - `1710000000002-CreateProductionDepartmentsAndYards.ts` (executed).
- Centralized DTO Validation Middleware (`src/common/middleware/validate-dto.middleware.ts`).
- Standardized `ValidationError` representation (`src/common/errors/validation.error.ts`).
- Centralized Error Handling (`AppError`, `errorHandlerMiddleware`).
- Standardized typed `ApiResponse` for API endpoints.
- EJS + `express-ejs-layouts` server-rendered views with Bootstrap validation.
- Static assets serving (`src/public`).
- Client scripts (`src/public/js/app.js`, `src/public/js/login.js`, `src/public/js/users.js`, `src/public/js/roles.js`, `src/public/js/user-permissions.js`, `src/public/js/production-departments.js`, `src/public/js/production-yards.js`).
- TypeORM MySQL connection and robust graceful shutdown.
