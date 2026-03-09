import {
    IsEnum,
    IsMongoId,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length
} from "class-validator";
export enum VisitorStatus {
    YES = "YES",
    MAY_BE = "MAY_BE",
    NO = "NO"
}
export class CreateVisitorDto {
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
    visitorName: string;

    @IsString()
    @Length(10, 15)
    contactNumber: string;

    @IsString()
    businessCategory: string;

    @IsOptional()
    @IsString()
    about: string;

    @IsString()
    companyName: string;

    @IsString()
    address: string;

    @IsString()
    email: string;
}
