export interface SafeHeadUserOutput {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
}

export interface SafeEngineerYardOutput {
  id: string;
  name: string;
  code: string;
  capacity: number;
  isActive: boolean;
}

export interface SafeEngineerAssignmentOutput {
  assignmentId: string;
  userId: string;
  fullName: string;
  phone: string;
  userIsActive: boolean;
  assignmentIsActive: boolean;
  yards: SafeEngineerYardOutput[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentTeamOutput {
  department: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    isActive: boolean;
  };
  head: SafeHeadUserOutput | null;
  engineers: SafeEngineerAssignmentOutput[];
}

export interface ActiveUserSelectOption {
  id: string;
  fullName: string;
  phone: string;
}
