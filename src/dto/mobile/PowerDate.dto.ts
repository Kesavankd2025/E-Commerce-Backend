import {
    IsArray,
    IsMongoId,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsEmail
} from "class-validator";

export class CreatePowerDateDto {
    @IsArray()
    @IsMongoId({ each: true })
    @IsNotEmpty()
    members: string[];

    @IsOptional()
    image?: {
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
    meetingStatus: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @IsOptional()
    @IsString()
    email: string;

    @IsString()
    @IsNotEmpty()
    address: string;

    @IsNumber()
    rating: number;

    @IsString()
    @IsOptional()
    comments?: string;

    @IsString()
    @IsOptional()
    companyName?: string;

    @IsString()
    @IsOptional()
    businessCategory?: string;
}
