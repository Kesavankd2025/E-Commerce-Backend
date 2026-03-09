import { IsString, IsArray, IsObject, IsEnum, IsNotEmpty, IsOptional } from "class-validator";
import { CommunityType } from "../../entity/Community";

export class CreateCommunityDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    details: string;

    @IsArray()
    @IsOptional()
    category?: string[];

    @IsString()
    @IsOptional()
    location?: string;

    @IsEnum(CommunityType)
    @IsNotEmpty()
    type: CommunityType;

    @IsOptional()
    photos?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    } = {
            fileName: "",
            path: "",
            originalName: ""
        };
}
