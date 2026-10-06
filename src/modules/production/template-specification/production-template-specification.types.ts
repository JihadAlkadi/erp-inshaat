export interface ProductionTemplateSpecificationDto {
  id: string;
  templateId: string;
  name: string;
  value: string;
  unit: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
