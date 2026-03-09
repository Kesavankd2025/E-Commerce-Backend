import {
    IsOptional,
    IsString
} from "class-validator";

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    about?: string;

    @IsString()
    @IsOptional()
    websiteUrl?: string;

    @IsString()
    @IsOptional()
    instagramUrl?: string;

    @IsString()
    @IsOptional()
    linkedinUrl?: string;

    @IsString()
    @IsOptional()
    facebookUrl?: string;


    @IsString()
    @IsOptional()
    twitterUrl?: string;

    @IsString()
    @IsOptional()
    gstNumber?: string;

    @IsString()
    @IsOptional()
    panCard?: string;

    @IsString()
    @IsOptional()
    bloodGroup?: string;

    @IsString()
    @IsOptional()
    country?: string;

    @IsOptional()
    profileImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };
    @IsOptional()
    officeAddress?: {
        doorNo?: string;
        oldNo?: string;
        street?: string;
        area?: string;
        city?: string;
        state?: string;
        pincode?: string;
    };
}
