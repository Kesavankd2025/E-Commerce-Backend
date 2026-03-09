import { IsNotEmpty, IsMongoId, IsString } from "class-validator";

export class AssignChiefGuestDto {
    @IsNotEmpty()
    @IsMongoId()
    meetingId: string;

    @IsNotEmpty()
    @IsMongoId()
    chiefGuestId: string;

    @IsNotEmpty()
    @IsString()
    status: string;
}
