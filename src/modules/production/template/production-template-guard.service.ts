import { DataSource, EntityManager, Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../database/data-source.js';
import { ProductionTemplateEntity } from './production-template.entity.js';
import { ProductionTemplateStageEntity } from '../template-stage/production-template-stage.entity.js';
import { NotFoundError } from '../../../common/errors/not-found.error.js';

export class ProductionTemplateGuardService {
  private templateRepo: Repository<ProductionTemplateEntity>;
  private stageRepo: Repository<ProductionTemplateStageEntity>;

  constructor(private dataSource: DataSource = AppDataSource) {
    this.templateRepo = this.dataSource.getRepository(ProductionTemplateEntity);
    this.stageRepo = this.dataSource.getRepository(ProductionTemplateStageEntity);
  }

  /**
   * Guards read access: ensures template exists and is NOT archived.
   */
  async requireExistingTemplate(
    templateId: string,
    manager?: EntityManager
  ): Promise<ProductionTemplateEntity> {
    const repo = manager ? manager.getRepository(ProductionTemplateEntity) : this.templateRepo;
    const template = await repo.findOne({
      where: { id: templateId, deletedAt: IsNull() },
    });

    if (!template) {
      throw new NotFoundError('القالب غير موجود', 'PRODUCTION_TEMPLATE_NOT_FOUND');
    }

    return template;
  }

  /**
   * Guards mutation access: ensures template exists and is active/not archived.
   */
  async requireMutableTemplate(
    templateId: string,
    manager?: EntityManager
  ): Promise<ProductionTemplateEntity> {
    const repo = manager ? manager.getRepository(ProductionTemplateEntity) : this.templateRepo;
    const template = await repo.findOne({
      where: { id: templateId, deletedAt: IsNull() },
    });

    if (!template) {
      throw new NotFoundError('القالب غير موجود أو تم أرشفته', 'PRODUCTION_TEMPLATE_NOT_FOUND');
    }

    return template;
  }

  /**
   * Guards read access to a stage: ensures parent template is active and stage belongs to it.
   */
  async requireStageBelongsToTemplate(
    templateId: string,
    stageId: string,
    manager?: EntityManager
  ): Promise<{ template: ProductionTemplateEntity; stage: ProductionTemplateStageEntity }> {
    const template = await this.requireExistingTemplate(templateId, manager);

    const stageRepo = manager ? manager.getRepository(ProductionTemplateStageEntity) : this.stageRepo;
    const stage = await stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });

    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    return { template, stage };
  }

  /**
   * Guards mutation access to a stage: ensures parent template is mutable and stage belongs to it.
   */
  async requireMutableStageBelongsToTemplate(
    templateId: string,
    stageId: string,
    manager?: EntityManager
  ): Promise<{ template: ProductionTemplateEntity; stage: ProductionTemplateStageEntity }> {
    const template = await this.requireMutableTemplate(templateId, manager);

    const stageRepo = manager ? manager.getRepository(ProductionTemplateStageEntity) : this.stageRepo;
    const stage = await stageRepo.findOne({
      where: { id: stageId, templateId, deletedAt: IsNull() },
    });

    if (!stage) {
      throw new NotFoundError('المرحلة غير موجودة', 'PRODUCTION_TEMPLATE_STAGE_NOT_FOUND');
    }

    return { template, stage };
  }
}

export const productionTemplateGuardService = new ProductionTemplateGuardService();
