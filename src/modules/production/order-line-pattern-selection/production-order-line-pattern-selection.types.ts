export interface ProductionOrderLinePatternOptionSummaryDto {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ProductionOrderLinePatternSelectionDto {
  id: string;
  templatePatternId: string;
  patternName: string;
  selectedOptionId: string;
  selectedOptionName: string;
  availableOptions: ProductionOrderLinePatternOptionSummaryDto[];
}
