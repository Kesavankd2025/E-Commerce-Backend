import {
    IsArray,
    IsMongoId,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsEmail
} from "class-validator";

export class CreateTrainingMember {

    @IsString()
    @IsNotEmpty()
    status: string;

    @IsMongoId()
    trainingId: string;

    @IsOptional()
    paymentProofImage?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    } = {
            fileName: "",
            path: "",
            originalName: ""
        };
}
