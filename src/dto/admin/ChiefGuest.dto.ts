import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsMobilePhone,
  IsMongoId,
  IsOptional
} from "class-validator";

export class CreateChiefGuestDto {

  @IsOptional()
  profileImage?: {
    fileName?: string;
    path?: string;
    originalName?: string;
  } = {
      fileName: "",
      path: "",
      originalName: ""
    };

  @IsNotEmpty()
  @IsString()
  chiefGuestName: string;

  @IsString()
  @IsOptional()
  about?: string;

  @IsNotEmpty()
  contactNumber: string;

  @IsNotEmpty()
  @IsEmail()
  emailId: string;

  @IsNotEmpty()
  @IsString()
  businessName: string;

  @IsNotEmpty()
  @IsMongoId()
  businessCategory: string;

  @IsNotEmpty()
  @IsMongoId()
  referredBy: string;

  @IsOptional()
  isActive?: number;
}
