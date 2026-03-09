import {
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsString,
    IsDateString,
    IsOptional,
    Min
} from "class-validator";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";

class TrainingLocationDto {
    @IsOptional()
    @IsString()
    name?: string = "";

    @IsOptional()
    @IsNumber()
    latitude?: number = 0.0;

    @IsOptional()
    @IsNumber()
    longitude?: number = 0.0;
}

class TrainingPaymentDetailDto {
    @IsOptional()
    @IsString()
    accountNumber?: string;

    @IsOptional()
    @IsString()
    accountName?: string;

    @IsOptional()
    @IsString()
    branch?: string;

    @IsOptional()
    @IsString()
    ifsc?: string;
}

export class CreateTrainingDto {
    @IsArray()
    chapterIds: string[];

    @IsArray()
    @IsOptional()
    zoneIds?: string[];

    @IsArray()
    @IsOptional()
    regionIds?: string[];

    @IsNotEmpty()
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description: string;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    trainingFee: number;

    @IsArray()
    trainerIds: string[];

    @IsDateString()
    trainingDateTime: string;

    @IsDateString()
    lastDateForApply: string;

    @Type(() => Number)
    @IsNotEmpty()
    duration?: number;

    @IsEnum(["online", "in-person"])
    mode: "online" | "in-person";

    @IsNotEmpty()
    locationOrLink: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => TrainingLocationDto)
    location?: TrainingLocationDto = new TrainingLocationDto();

    @IsNumber()
    @Type(() => Number)
    maxAllowed: number;



    @IsOptional()
    trainingImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    } = {
            fileName: "",
            path: "",
            originalName: ""
        };

    @IsOptional()
    paymentQrImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    } = {
            fileName: "",
            path: "",
            originalName: ""
        };

    @IsOptional()
    @ValidateNested()
    @Type(() => TrainingPaymentDetailDto)
    paymentDetail?: TrainingPaymentDetailDto;
}
export class UpdateTrainingDto {
    @IsOptional()
    chapterIds?: string[];

    @IsOptional()
    zoneIds?: string[];

    @IsOptional()
    regionIds?: string[];

    @IsOptional()
    title?: string;

    @IsOptional()
    description?: string;

    @IsOptional()
    trainerIds?: string[];

    @IsOptional()
    trainingDateTime?: string;

    @IsOptional()
    lastDateForApply?: string;

    @IsOptional()
    @Type(() => Number)
    duration?: number;

    @IsOptional()
    mode?: "online" | "in-person";

    @IsOptional()
    locationOrLink?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => TrainingLocationDto)
    location?: TrainingLocationDto = new TrainingLocationDto();

    @IsOptional()
    maxAllowed?: number;

    @IsOptional()
    @Type(() => Number)
    isActive?: number;

    @IsOptional()
    @Type(() => Number)
    isDelete?: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    trainingFee: number;

    @IsOptional()
    trainingImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    } = {
            fileName: "",
            path: "",
            originalName: ""
        };

    @IsOptional()
    @ValidateNested()
    @Type(() => TrainingPaymentDetailDto)
    paymentDetail?: TrainingPaymentDetailDto;

    @IsOptional()
    paymentQrImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    } = {
            fileName: "",
            path: "",
            originalName: ""
        };

}