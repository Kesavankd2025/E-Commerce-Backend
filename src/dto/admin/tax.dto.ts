import { IsOptional, IsNotEmpty, IsString, IsNumber, Min, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

export class CreateTaxDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    taxType?: string;

    @IsNumber()
    @IsOptional()
    percentage?: number;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
export class UpdateTaxDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    taxType?: string;

    @IsNumber()
    @IsOptional()
    percentage?: number;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
