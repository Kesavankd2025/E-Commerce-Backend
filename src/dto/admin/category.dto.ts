import { IsOptional, IsNotEmpty, IsString, IsBoolean, IsNumber } from "class-validator";
import { Type } from "class-transformer";

export class CreateCategoryDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsOptional()
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsString()
    @IsOptional()
    metaTitle?: string;

    @IsString()
    @IsOptional()
    metaKeywords?: string;

    @IsString()
    @IsOptional()
    metaDescription?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}
export class UpdateCategoryDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsOptional()
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsString()
    @IsOptional()
    metaTitle?: string;

    @IsString()
    @IsOptional()
    metaKeywords?: string;

    @IsString()
    @IsOptional()
    metaDescription?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}
