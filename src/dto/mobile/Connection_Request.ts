import { IsMongoId, IsOptional, IsString, } from "class-validator";
import { ObjectId } from "mongodb";


export class CreateConnectionReqDto {
    @IsMongoId()
    memberId: ObjectId;
    @IsString()
    @IsOptional()
    status: string;
}
