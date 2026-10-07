import { ProductionTemplatePatternOptionEntity } from './production-template-pattern-option.entity.js';
import { ProductionTemplatePatternOptionTaskDto } from '../template-pattern-option-task/production-template-pattern-option-task.types.js';

export interface ProductionTemplatePatternOptionDto {
  id: string;
  patternId: string;
  name: string;
  sortOrder: number;
  tasksCount: number;
  tasks?: ProductionTemplatePatternOptionTaskDto[];
  createdAt: Date;
  updatedAt: Date;
}

export function toProductionTemplatePatternOptionDto(
  entity: ProductionTemplatePatternOptionEntity,
  tasks?: ProductionTemplatePatternOptionTaskDto[]
): ProductionTemplatePatternOptionDto {
  const tasksCount = tasks ? tasks.length : entity.tasks ? entity.tasks.length : 0;
  return {
    id: entity.id,
    patternId: entity.patternId,
    name: entity.name,
    sortOrder: entity.sortOrder,
    tasksCount,
    tasks,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
