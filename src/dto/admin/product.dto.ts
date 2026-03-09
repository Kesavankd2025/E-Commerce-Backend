import { IsOptional, IsNotEmpty, IsString, IsMongoId, IsNumber, Min, IsBoolean, IsArray } from "class-validator";
import { Type } from "class-transformer";

export class CreateProductDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsMongoId()
    @IsOptional()
    categoryId?: string;

    @IsMongoId()
    @IsOptional()
    subCategoryId?: string;

    @IsMongoId()
    @IsOptional()
    brandId?: string;

    @IsMongoId()
    @IsOptional()
    unitId?: string;

    @IsMongoId()
    @IsOptional()
    taxId?: string;

    @IsString()
    @IsOptional()
    hsnCode?: string;

    @IsNumber()
    @IsOptional()
    weight?: number;

    @IsString()
    @IsOptional()
    shortDescription?: string;

    @IsString()
    @IsOptional()
    fullDescription?: string;

    @IsBoolean()
    @IsOptional()
    refundable?: boolean;

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsNumber()
    @IsOptional()
    lowStockAlert?: number;

    @IsString()
    @IsOptional()
    metaTitle?: string;

    @IsString()
    @IsOptional()
    metaKeywords?: string;

    @IsString()
    @IsOptional()
    metaDescription?: string;

    @IsArray()
    @IsOptional()
    attributes?: any[];

    @IsArray()
    @IsOptional()
    specifications?: any[];
}
export class UpdateProductDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsMongoId()
    @IsOptional()
    categoryId?: string;

    @IsMongoId()
    @IsOptional()
    subCategoryId?: string;

    @IsMongoId()
    @IsOptional()
    brandId?: string;

    @IsMongoId()
    @IsOptional()
    unitId?: string;

    @IsMongoId()
    @IsOptional()
    taxId?: string;

    @IsString()
    @IsOptional()
    hsnCode?: string;

    @IsNumber()
    @IsOptional()
    weight?: number;

    @IsString()
    @IsOptional()
    shortDescription?: string;

    @IsString()
    @IsOptional()
    fullDescription?: string;

    @IsBoolean()
    @IsOptional()
    refundable?: boolean;

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsNumber()
    @IsOptional()
    lowStockAlert?: number;

    @IsString()
    @IsOptional()
    metaTitle?: string;

    @IsString()
    @IsOptional()
    metaKeywords?: string;

    @IsString()
    @IsOptional()
    metaDescription?: string;

    @IsArray()
    @IsOptional()
    attributes?: any[];

    @IsArray()
    @IsOptional()
    specifications?: any[];
}
