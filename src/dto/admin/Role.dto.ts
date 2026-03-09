// dto/CreateRole.dto.ts
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsMongoId,
  IsOptional,
  IsEnum
} from "class-validator";
import { Type } from "class-transformer";
import { ObjectId } from "mongodb";
import { RoleType } from "../../enum/role";

class PermissionActionsDto {
  @IsBoolean()
  view: boolean;

  @IsBoolean()
  add: boolean;

  @IsBoolean()
  edit: boolean;

  @IsBoolean()
  delete: boolean;
}

class RolePermissionDto {
  @IsMongoId()
  @IsNotEmpty()
  moduleId: ObjectId; // 🔥 comes from Modules._id

  @ValidateNested()
  @Type(() => PermissionActionsDto)
  actions: PermissionActionsDto;
}

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions: RolePermissionDto[];

  @IsOptional()
  @IsEnum(RoleType)
  roleType: RoleType;

  @IsOptional()
  @IsBoolean()
  mobileAdminAccess?: boolean;
}
export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions: RolePermissionDto[];

  @IsOptional()
  @IsEnum(RoleType)
  roleType: RoleType;

  @IsOptional()
  @IsBoolean()
  mobileAdminAccess?: boolean;
}