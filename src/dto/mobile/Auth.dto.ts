import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
    @IsString()
    @IsNotEmpty()
    oldPassword: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(4, { message: "Password must be at least 4 characters long" })
    newPassword: string;

    @IsString()
    @IsNotEmpty()
    confirmPassword: string;
}

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
