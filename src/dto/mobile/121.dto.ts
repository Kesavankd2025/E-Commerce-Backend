// dto/CreateOneToOneMeeting.dto.ts
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
// dto/Photo.dto.ts

export class PhotoDto {
  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  Path?: string;

  @IsOptional()
  @IsString()
  originalName?: string;
}

export class CreateOneToOneMeetingDto {
  // 🔹 Who did you meet?
  @IsEnum(["MY_CHAPTER", "OTHER_CHAPTER"])
  chapterType: "MY_CHAPTER" | "OTHER_CHAPTER";

  @IsMongoId()
  meetingWithMemberId: string;

  @IsEnum(["SELF", "PARTNER"])
  initiatedBy: "SELF" | "PARTNER";

  // 🔹 Logistics
  @IsDateString()
  meetingDateTime: string;

  @IsString()
  @IsNotEmpty()
  meetingLocation: string;

  // 🔹 Details
  @IsOptional()
  @IsString()
  topicDiscussed?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos?: PhotoDto[];
}
