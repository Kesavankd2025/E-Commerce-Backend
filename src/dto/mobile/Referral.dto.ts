import {
  IsEnum,
  IsMongoId,
  IsBoolean,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max
} from "class-validator";
import { ReferralFor, ReferralStatus, ReferralType } from "../../enum/referrals";

export class CreateReferralDto {
  // Step 1
  @IsEnum(ReferralFor)
  referralFor: ReferralFor;

  @IsOptional()
  @IsMongoId()
  chapterId?: string;

  @IsMongoId()
  toMemberId: string;

  // Step 2
  @IsEnum(ReferralType)
  referralType: ReferralType;

  @IsBoolean()
  toldWouldCall: boolean;

  @IsBoolean()
  givenCard: boolean;

  @IsString()
  referralName: string;

  @IsString()
  telephone: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Step 3
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comments?: string;

  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;
}
export class UpdateReferralStatusDto {
  @IsEnum(ReferralStatus)
  status: ReferralStatus;
}