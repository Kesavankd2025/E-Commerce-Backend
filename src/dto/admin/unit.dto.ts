import { IsOptional, IsNotEmpty, IsString, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

export class CreateUnitDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    shortName?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
export class UpdateUnitDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    shortName?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
