import { Type } from "class-transformer";
import { IsString, IsOptional, IsNumber } from "class-validator";

export class CreateAwardDto {
    @IsString()
    name: string;

    @IsOptional()
    @Type(() => Number)
    isActive?: number;
}

export class UpdateAwardDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @Type(() => Number)
    isActive?: number;

    @IsOptional()
    @Type(() => Number)
    isDelete?: number;
}
