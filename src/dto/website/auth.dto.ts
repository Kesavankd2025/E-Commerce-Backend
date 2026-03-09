import { IsNotEmpty, IsString, IsEmail, IsOptional, Length, Matches } from "class-validator";

export class CustomerRegisterDto {
    @IsNotEmpty()
    @IsString()
    fullName: string;

    @IsNotEmpty()
    @IsString()
    @Matches(/^[0-9]{10}$/, { message: "phoneNumber must be a 10 digit number" })
    phoneNumber: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsNotEmpty()
    @IsString()
    @Length(6, 20, { message: "Password must be 6 to 20 characters" })
    password: string;
}

export class CustomerLoginDto {
    @IsNotEmpty()
    @IsString()
    phoneNumber: string;

    @IsNotEmpty()
    @IsString()
    password: string;
}

export class ChangePasswordDto {
    @IsNotEmpty()
    @IsString()
    oldPassword: string;

    @IsNotEmpty()
    @IsString()
    @Length(6, 20, { message: "Password must be 6 to 20 characters" })
    newPassword: string;
}

export class ForgotPasswordRequestDto {
    @IsNotEmpty()
    @IsString()
    phoneNumber: string;
}

export class VerifyForgotOtpDto {
    @IsNotEmpty()
    @IsString()
    phoneNumber: string;

    @IsNotEmpty()
    @IsString()
    otp: string;
}

export class ResetPasswordDto {
    @IsNotEmpty()
    @IsString()
    phoneNumber: string;

    @IsNotEmpty()
    @IsString()
    otp: string;

    @IsNotEmpty()
    @IsString()
    @Length(6, 20)
    newPassword: string;
}
