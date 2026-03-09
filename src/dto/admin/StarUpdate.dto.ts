import { Type } from "class-transformer";
import { IsString, IsOptional, IsArray, IsNotEmpty, ValidateNested, IsObject, IsDateString, IsMongoId, IsBoolean, IsNumber } from "class-validator";
class LocationDto {

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsNumber()
    latitude: number;

    @IsNotEmpty()
    @IsNumber()
    longitude: number;
}
export class CreateStarUpdateDto {
    @IsArray()
    @IsNotEmpty()
    @IsMongoId({ each: true })
    zoneIds: string[];

    @IsArray()
    @IsNotEmpty()
    @IsMongoId({ each: true })
    regionIds: string[];

    @IsArray()
    @IsNotEmpty()
    @IsMongoId({ each: true })
    chapterIds: string[];

    @IsArray()
    @IsNotEmpty()
    @IsMongoId({ each: true })
    categoryIds: string[];

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsDateString()
    lastDate?: string;

    @IsOptional()
    @IsString()
    details?: string;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => LocationDto)
    location: LocationDto;

    @IsOptional()
    @IsString()
    contactName?: string;

    @IsOptional()
    @IsString()
    contactPhoneNumber?: string;

    @IsOptional()
    @IsObject()
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsBoolean()
    @IsNotEmpty()
    immediateRequirement: boolean;
}



export class UpdateStarUpdateDto {
    @IsOptional()
    @IsArray()
    @IsMongoId({ each: true })
    zoneIds?: string[];

    @IsOptional()
    @IsArray()
    @IsMongoId({ each: true })
    regionIds?: string[];

    @IsOptional()
    @IsArray()
    @IsMongoId({ each: true })
    chapterIds?: string[];

    @IsOptional()
    @IsArray()
    @IsMongoId({ each: true })
    categoryIds?: string[];

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsDateString()
    lastDate?: string;

    @IsOptional()
    @IsString()
    details?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => LocationDto)
    location?: LocationDto;

    @IsOptional()
    @IsString()
    contactName?: string;

    @IsOptional()
    @IsString()
    contactPhoneNumber?: string;

    @IsOptional()
    @IsObject()
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsOptional()
    @IsBoolean()
    immediateRequirement?: boolean;
}
