import { Type } from "class-transformer";
import { IsString, IsOptional } from "class-validator";

export class CreateProductCategoryDto {
    @IsString()
    name: string;

    @IsOptional()
    categoryImage: {
        fileName?: string;
        Path?: string;
        originalName?: string;
    } = {
            fileName: "",
            Path: "",
            originalName: ""
        };

    @IsOptional()
    @Type(() => Number)
    isActive?: number;
}

export class UpdateProductCategoryDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    categoryImage: {
        fileName?: string;
        Path?: string;
        originalName?: string;
    } = {
            fileName: "",
            Path: "",
            originalName: ""
        };

    @IsOptional()
    @Type(() => Number)
    isActive?: number;

    @IsOptional()
    @Type(() => Number)
    isDelete?: number;
}
