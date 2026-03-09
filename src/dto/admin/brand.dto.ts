import { IsOptional, IsNotEmpty, IsString, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

export class CreateBrandDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsOptional()
    logo?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
export class UpdateBrandDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsOptional()
    logo?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    status?: boolean;
}
