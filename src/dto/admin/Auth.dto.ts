import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ForgotPinDto {
    @IsString()
    @IsNotEmpty()
    phoneNumber: string;
}

export class VerifyOtpDto {
    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @IsString()
    @IsNotEmpty()
    otp: string;
}

export class ResetPinDto {
    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @IsString()
    @IsNotEmpty()
    otp: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(4, { message: "PIN must be at least 4 characters long" })
    newPin: string;
}
