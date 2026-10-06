export interface ProductionTemplateStageDto {
  id: string;
  templateId: string;
  departmentId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  estimatedDurationMinutes: number | null;
  estimatedCost: string | null;
  createdAt: Date;
  updatedAt: Date;
  department?: {
    id: string;
    name: string;
    code: string;
  };
  plannedMaterials?: Array<{
    id: string;
    stageId: string;
    productId: string;
    productUnitId: string;
    plannedQuantity: string;
    product?: {
      id: string;
      name: string;
      code: string;
    };
    productUnit?: {
      id: string;
      name: string;
    };
  }>;
}

export interface ProductionTemplateStageBrowserDto {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  sortOrder: number;
  estimatedDurationMinutes: number | null;
  estimatedCost: string | null;
  plannedMaterialsCount: number;
  attachmentsCount: number;
}

export interface ConsecutiveDepartmentGroup<T = ProductionTemplateStageBrowserDto> {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  stages: T[];
}
