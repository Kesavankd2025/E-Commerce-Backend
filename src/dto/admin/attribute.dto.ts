import { IsOptional, IsNotEmpty, IsString, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

export class CreateAttributeDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsOptional()
    value?: any;

    @IsString()
    @IsOptional()
    displayName?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
export class UpdateAttributeDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsOptional()
    value?: any;

    @IsString()
    @IsOptional()
    displayName?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
