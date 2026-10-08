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
  isPatternActive: boolean;
  isSelectedOptionActive: boolean;
  isHistorical: boolean;
  availableOptions: ProductionOrderLinePatternOptionSummaryDto[];
}
