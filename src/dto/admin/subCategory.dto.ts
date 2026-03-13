import { IsOptional, IsNotEmpty, IsMongoId, IsString, IsBoolean, IsNumber } from "class-validator";
import { Type } from "class-transformer";

export class CreateSubCategoryDto {
    @IsMongoId()
    @IsOptional()
    categoryId?: string;

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
export class UpdateSubCategoryDto {
    @IsMongoId()
    @IsOptional()
    categoryId?: string;

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
