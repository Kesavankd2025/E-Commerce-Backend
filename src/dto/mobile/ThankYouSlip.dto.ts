import { Type } from "class-transformer";
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";

export class CreateThankYouSlipDto {
  @IsMongoId()
  @IsNotEmpty()
  thankTo: string;

  @IsEnum(["New", "Repeat"])
  businessType: "New" | "Repeat";

  @IsEnum(["Outside", "Self"])
  referralType: "Outside" | "Self";

  @IsNumber()
  @Min(0)
  amount: number;
  @IsString()
  @IsOptional()
  comments?: string;
}

export class UpdateThankYouSlipRatingDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  ratings: number;

  @IsString()
  @IsOptional()
  comments?: string;
}

