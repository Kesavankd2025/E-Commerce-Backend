import {
    IsNotEmpty,
    IsString,
    IsNumber,
    IsDateString,
    Min,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// --------------------
// LOCATION OBJECT DTO
// --------------------
class MeetingLocationDto {

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsNumber()
    latitude: number;

    @IsNotEmpty()
    @IsNumber()
    longitude: number;
}

export class CreateMobileMeetingDto {

    // --------------------
    // BASIC INFO
    // --------------------
    @IsNotEmpty()
    @IsString()
    meetingTopic: string;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    meetingFee: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(0)
    visitorFee: number;

    @IsNotEmpty()
    @IsString()
    hotelName: string;

    // --------------------
    // DATE & TIME
    // --------------------
    @IsNotEmpty()
    @IsDateString()
    startDateTime: string;

    @IsNotEmpty()
    @IsDateString()
    endDateTime: string;

    @IsNotEmpty()
    @IsDateString()
    latePunchTime: string;

    // --------------------
    // LOCATION (OBJECT)
    // --------------------
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => MeetingLocationDto)
    location: MeetingLocationDto;
}
