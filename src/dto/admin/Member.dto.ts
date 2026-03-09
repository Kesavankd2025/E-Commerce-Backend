import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEmail,
    IsMongoId,
    IsBoolean,
    IsArray,
    ValidateNested,
    IsDate,
    IsNumber,
    IsIn,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ObjectId } from "mongodb";


export class OfficeAddressDto {
    @IsOptional()
    @IsString()
    doorNo?: string;

    @IsOptional()
    @IsString()
    oldNo?: string;

    @IsOptional()
    @IsString()
    street?: string;

    @IsOptional()
    @IsString()
    area?: string;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    state?: string;

    @IsOptional()
    pincode?: string;
}


export class TrainingDto {
    @IsString()
    year: string;

    @IsString()
    type: string;
}

export class AwardDto {
    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    tenure: Date;

    @IsString()
    award: ObjectId;
}

export class CreateMemberDto {

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
    fullName: string;

    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @IsString()
    @IsNotEmpty()
    whatsappNumber: string;

    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    companyName: string;

    @IsString()
    membershipId: string;

    @IsOptional()
    @IsMongoId({ message: "region must be valid ObjectId" })
    region?: string;

    @IsOptional()
    @IsMongoId({ message: "chapter must be valid ObjectId" })
    chapter?: string;

    @IsString()
    position: string;

    @IsOptional()
    @IsMongoId()
    businessCategory?: string;

    @IsOptional()
    @IsMongoId()
    referredBy?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    dateOfBirth?: Date;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    anniversary?: Date;

    @IsOptional()
    @ValidateNested()
    @Type(() => OfficeAddressDto)
    officeAddress?: OfficeAddressDto;

    @IsOptional()
    @IsBoolean()
    isWantSmsEmailUpdates?: boolean;

    @IsNumber()
    @Type(() => Number)
    annualFee: number;

    @IsString()
    paymentMode: string;

    @IsString()
    transactionId: string;

    @Type(() => Date)
    @IsDate()
    paymentDate: Date;

    @Type(() => Date)
    @IsDate()
    joiningDate: Date;

    @Type(() => Date)
    @IsDate()
    renewalDate: Date;

    @IsOptional()
    @IsString()
    gstNumber?: string;

    @IsOptional()
    @IsBoolean()
    sendWelcomeSms?: boolean;

    @IsString()
    trainingYear: string;

    @IsArray()
    @IsIn(["MRP", "MTP", "ATP"], { each: true })
    trainingTypes: string[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => TrainingDto)
    trainings?: TrainingDto[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => AwardDto)
    awards?: AwardDto[];

    @IsString()
    roleId: ObjectId

    @IsOptional()
    @IsString()
    @IsIn(["Gold", "Diamond", "Platinum", ""])
    clubMemberType?: string;
}

export class UpdateMemberDto {

    @IsOptional()
    profileImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsString()
    roleId: ObjectId

    @IsOptional()
    @IsString()
    fullName?: string;

    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    whatsappNumber?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    companyName?: string;

    @IsOptional()
    @IsString()
    membershipId?: string;

    @IsOptional()
    @IsMongoId()
    region?: string;

    @IsOptional()
    @IsMongoId()
    chapter?: string;

    @IsOptional()
    @IsString()
    position?: string;

    @IsOptional()
    @IsMongoId()
    businessCategory?: string;

    @IsOptional()
    @IsMongoId()
    referredBy?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    dateOfBirth?: Date;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    anniversary?: Date;

    @IsOptional()
    @ValidateNested()
    @Type(() => OfficeAddressDto)
    officeAddress?: OfficeAddressDto;

    @IsOptional()
    @IsBoolean()
    isWantSmsEmailUpdates?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    annualFee?: number;

    @IsOptional()
    @IsString()
    paymentMode?: string;

    @IsOptional()
    @IsString()
    transactionId?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    paymentDate?: Date;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    joiningDate?: Date;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === "" || value === null || value === "null" || value === undefined) return undefined;
        return new Date(value);
    })
    @IsDate()
    renewalDate?: Date;

    @IsOptional()
    @IsString()
    gstNumber?: string;

    @IsOptional()
    @IsBoolean()
    sendWelcomeSms?: boolean;

    @IsOptional()
    @IsString()
    trainingYear?: string;

    @IsOptional()
    @IsArray()
    @IsIn(["MRP", "MTP", "ATP"], { each: true })
    trainingTypes?: string[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => TrainingDto)
    trainings?: TrainingDto[];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => AwardDto)
    awards?: AwardDto[];

    @IsOptional()
    @IsString()
    @IsIn(["Gold", "Diamond", "Platinum", ""])
    clubMemberType?: string;

    @IsOptional()
    @IsMongoId()
    updatedBy?: string;
}
