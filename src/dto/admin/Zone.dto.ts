import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max
} from "class-validator";
import { Type } from "class-transformer";

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsOptional()
  @Type(() => Number)
  isActive?: number;
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @Type(() => Number)
  isActive?: number;
}
