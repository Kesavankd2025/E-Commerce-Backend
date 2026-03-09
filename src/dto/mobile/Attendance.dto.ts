import {
  IsMongoId,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
  IsNumber,
  IsIn,
  IsArray
} from "class-validator";
import { Type } from "class-transformer";

export enum AttendanceStatusEnum {
  PRESENT = "present",
  LATE = "late",
  ABSENT = "absent",
  MEDICAL = "medical",
  PROXY = "proxy"
}

export enum SourceTypeEnum {
  MEETING = "MEETING",
  TRAINING = "TRAINING"
}


export class LocationDto {

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}


export class CreateAttendanceDto {

  @IsMongoId()
  sourceId: string;      // meetingId or trainingId

  @IsEnum(SourceTypeEnum)
  sourceType: SourceTypeEnum;

  @IsOptional()
  @IsEnum(AttendanceStatusEnum)
  status: AttendanceStatusEnum;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  userLocation?: LocationDto;
}

export class UpdateAttendanceDto {

  @IsOptional()
  @IsEnum(AttendanceStatusEnum)
  status?: AttendanceStatusEnum;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  userLocation?: LocationDto;
}
export class BulkAttendanceDto {

  @IsMongoId()
  sourceId: string;

  @IsIn(["MEETING", "TRAINING"])
  sourceType: "MEETING" | "TRAINING";

  @IsArray()
  members: string[];

  @IsOptional()
  @IsEnum(AttendanceStatusEnum)
  status: AttendanceStatusEnum;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  userLocation?: LocationDto;
}