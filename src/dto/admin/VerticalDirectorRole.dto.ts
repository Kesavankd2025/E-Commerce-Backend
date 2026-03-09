import {
    IsMongoId,
} from "class-validator";

export class AssignVerticalDirectorDto {
    @IsMongoId()
    roleId: string;

    @IsMongoId()
    memberId: string;
}
