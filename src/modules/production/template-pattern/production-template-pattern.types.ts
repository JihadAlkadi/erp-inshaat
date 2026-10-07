import { ProductionTemplatePatternEntity } from './production-template-pattern.entity.js';
import { ProductionTemplatePatternOptionDto } from '../template-pattern-option/production-template-pattern-option.types.js';

export interface ProductionTemplatePatternDto {
  id: string;
  templateId: string;
  name: string;
  optionsCount: number;
  options?: ProductionTemplatePatternOptionDto[];
  createdAt: Date;
  updatedAt: Date;
}

export function toProductionTemplatePatternDto(
  entity: ProductionTemplatePatternEntity,
  options?: ProductionTemplatePatternOptionDto[]
): ProductionTemplatePatternDto {
  const optionsCount = options ? options.length : entity.options ? entity.options.length : 0;
  return {
    id: entity.id,
    templateId: entity.templateId,
    name: entity.name,
    optionsCount,
    options,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
