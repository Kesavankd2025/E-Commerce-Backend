import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  IsArray,
  ArrayNotEmpty,
  Min,
  Max
} from "class-validator";
import { Type } from "class-transformer";

export class CreateRegionDto {
  @IsMongoId()
  zoneId: string;

  @IsString()
  @IsNotEmpty()
  region: string;

  @IsMongoId()
  edId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  rdIds: string[];

  @IsOptional()
  @Type(() => Number)
  isActive?: number;
}

export class UpdateRegionDto {
  @IsOptional()
  @IsMongoId()
  zoneId?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsMongoId()
  edId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  rdIds?: string[];

  @IsOptional()
  @Type(() => Number)
  isActive?: number;
}
