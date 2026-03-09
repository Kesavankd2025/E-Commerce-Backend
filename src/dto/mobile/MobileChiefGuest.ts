import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
export enum VisitorStatus {
  YES = "YES",
  MAY_BE = "MAY_BE",
  NO = "NO",
  APPROVE = "Approved",
  REJECT = "Rejected",
  PENDING = "Pending",
}
export class CreateMobileChiefGuestDto {

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

  @IsString()
  @IsNotEmpty()
  chiefGuestName: string;

  @IsString()
  @IsOptional()
  about?: string;

  @IsString()
  @Length(10, 15)
  contactNumber: string;

  @IsString()
  @IsOptional()
  businessCategory: string;

  @IsString()
  @IsOptional()
  businessName: string;

  @IsString()
  @IsOptional()
  email: string;

  @IsEnum(VisitorStatus)
  @IsOptional()
  status?: VisitorStatus;
}
