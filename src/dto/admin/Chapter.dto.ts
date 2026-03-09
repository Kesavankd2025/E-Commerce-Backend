import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsMongoId,
  IsDateString,
  IsNumber
} from "class-validator";
import { MeetingType, Weekday } from "../../enum/chapter";

export class CreateChapterDto {

  @IsNotEmpty()
  @IsString()
  chapterName: string;

  @IsNotEmpty()
  @IsMongoId()
  zoneId: string;

  @IsNotEmpty()
  @IsMongoId()
  regionId: string;

  @IsNotEmpty()
  @IsMongoId()
  edId: string;

  @IsNotEmpty()
  @IsMongoId()
  rdId: string;

  @IsNotEmpty()
  @IsDateString()
  createdDate: string;

  @IsNotEmpty()
  @IsString()
  location: string;

  @IsNotEmpty()
  @IsEnum(Weekday, {
    message: "weekday must be a valid weekday"
  })
  weekday: Weekday;

  @IsNotEmpty()
  @IsEnum(MeetingType, {
    message: "meetingType must be in-person | online | hybrid"
  })
  meetingType: MeetingType;

  @IsOptional()
  @IsNumber()
  absentLimit?: number;

  @IsOptional()
  @IsNumber()
  proxyLimit?: number;

  @IsOptional()
  isActive?: number;
}
export class UpdateChapterDto {

  @IsOptional()
  @IsString()
  chapterName?: string;

  @IsOptional()
  @IsMongoId()
  zoneId?: string;

  @IsOptional()
  @IsMongoId()
  regionId?: string;

  @IsOptional()
  @IsMongoId()
  edId?: string;

  @IsOptional()
  @IsMongoId()
  rdId?: string;

  @IsOptional()
  @IsDateString()
  createdDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(Weekday)
  weekday?: Weekday;

  @IsOptional()
  @IsEnum(MeetingType)
  meetingType?: MeetingType;

  @IsOptional()
  @IsNumber()
  absentLimit?: number;

  @IsOptional()
  @IsNumber()
  proxyLimit?: number;

  @IsOptional()
  isActive?: number;
}