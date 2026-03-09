import { Type } from "class-transformer";
import { IsString, IsOptional, IsNumber, IS_ENUM } from "class-validator";
import { BadgeType } from "../../enum/badges";

export class CreateBadgeDto {
    @IsString()
    name: string;

    @IsOptional()
    badgeImage: {
        fileName?: string;
        Path?: string;
        originalName?: string;
    } = {
            fileName: "",
            Path: "",
            originalName: ""
        };

    @IsString()
    type?: BadgeType;

    @IsOptional()
    @Type(() => Number)
    isActive?: number;

    @IsOptional()
    @Type(() => Number)
    isDelete?: number;
}

export class UpdateBadgeDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsString()
    type?: BadgeType;

    @IsOptional()
    badgeImage: {
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
export class AssignBadgeDto {
  assignTo: "CHAPTER" | "MEMBER";
  assignToId: string;
  badgeId: string;
}
