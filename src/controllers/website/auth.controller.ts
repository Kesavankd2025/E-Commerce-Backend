import { JsonController, Post, Body, Req, Res, UseBefore, Put, Param } from "routing-controllers";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Customer } from "../../entity/Customer";
import { OTP } from "../../entity/OTP";
import { UserToken } from "../../entity/UserToken";
import {
    CustomerRegisterDto,
    CustomerLoginDto,
    ChangePasswordDto,
    ForgotPasswordRequestDto,
    VerifyForgotOtpDto,
    ResetPasswordDto
} from "../../dto/website/auth.dto";
import { handleErrorResponse, response } from "../../utils";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@JsonController("/auth")
export class WebsiteAuthController {
    private repo = AppDataSource.getMongoRepository(Customer);
    private otpRepo = AppDataSource.getMongoRepository(OTP);
    private tokenRepo = AppDataSource.getMongoRepository(UserToken);

    @Post("/register")
    async register(@Body() body: CustomerRegisterDto, @Res() res: Response) {
        try {
            // Check if mobile number already exists
            const existingUser = await this.repo.findOneBy({
                phoneNumber: body.phoneNumber,
                isDelete: 0
            });

            if (existingUser) {
                return response(res, StatusCodes.BAD_REQUEST, "Mobile number already registered");
            }

            const customer = new Customer();
            customer.fullName = body.fullName;
            customer.phoneNumber = body.phoneNumber;
            customer.email = body.email;
            customer.password = await bcrypt.hash(body.password, 10);
            customer.isActive = true;
            customer.isDelete = 0;

            await this.repo.save(customer);

            // Prevent password from being sent in response
            const { password, ...customerData } = customer;

            return response(res, StatusCodes.CREATED, "Registration successful", customerData);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/login")
    async login(@Body() body: CustomerLoginDto, @Res() res: Response) {
        try {
            const customer = await this.repo.findOneBy({
                phoneNumber: body.phoneNumber,
                isDelete: 0
            });

            if (!customer) {
                return response(res, StatusCodes.UNAUTHORIZED, "Invalid mobile number or password");
            }

            if (!customer.isActive) {
                return response(res, StatusCodes.FORBIDDEN, "Account is inactive");
            }

            const validPassword = await bcrypt.compare(body.password, customer.password);
            if (!validPassword) {
                return response(res, StatusCodes.UNAUTHORIZED, "Invalid mobile number or password");
            }

            const payload = {
                id: customer.id.toString(),
                phoneNumber: customer.phoneNumber,
                userType: "CUSTOMER"
            };

            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });

            // Store token for session management
            await this.tokenRepo.deleteMany({ userId: customer.id });
            await this.tokenRepo.save({
                userId: customer.id,
                userType: "CUSTOMER",
                token
            });

            customer.lastLogin = new Date();
            await this.repo.save(customer);

            return response(res, StatusCodes.OK, "Login successful", {
                token,
                user: {
                    id: customer.id,
                    fullName: customer.fullName,
                    phoneNumber: customer.phoneNumber,
                    email: customer.email
                }
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @UseBefore(AuthMiddleware)
    @Put("/change-password")
    async changePassword(@Req() req: any, @Body() body: ChangePasswordDto, @Res() res: Response) {
        try {
            const customer = await this.repo.findOneBy({
                _id: new ObjectId(req.user.userId),
                isDelete: 0
            });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "User not found");
            }

            const validPassword = await bcrypt.compare(body.oldPassword, customer.password);
            if (!validPassword) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid old password");
            }

            customer.password = await bcrypt.hash(body.newPassword, 10);
            await this.repo.save(customer);

            return response(res, StatusCodes.OK, "Password changed successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/forgot-password/request")
    async requestForgotPassword(@Body() body: ForgotPasswordRequestDto, @Res() res: Response) {
        try {
            const customer = await this.repo.findOneBy({
                phoneNumber: body.phoneNumber,
                isDelete: 0
            });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "Mobile number not registered");
            }

            // Generate 4 digit OTP
            const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

            await this.otpRepo.deleteMany({ phoneNumber: body.phoneNumber });
            await this.otpRepo.save({
                phoneNumber: body.phoneNumber,
                otp: otpCode,
                expiresAt,
                isVerified: false
            });

            // In a real app, you would send SMS here. For now returning OTP in response for testing.
            return response(res, StatusCodes.OK, "OTP sent successfully", { otp: otpCode });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/forgot-password/verify")
    async verifyForgotPasswordOtp(@Body() body: VerifyForgotOtpDto, @Res() res: Response) {
        try {
            const otpRecord = await this.otpRepo.findOne({
                where: {
                    phoneNumber: body.phoneNumber,
                    otp: body.otp,
                    isVerified: false
                }
            });

            if (!otpRecord) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid OTP");
            }

            if (new Date() > otpRecord.expiresAt) {
                return response(res, StatusCodes.BAD_REQUEST, "OTP expired");
            }

            otpRecord.isVerified = true;
            await this.otpRepo.save(otpRecord);

            return response(res, StatusCodes.OK, "OTP verified successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/forgot-password/reset")
    async resetPassword(@Body() body: ResetPasswordDto, @Res() res: Response) {
        try {
            const otpRecord = await this.otpRepo.findOneBy({
                phoneNumber: body.phoneNumber,
                otp: body.otp,
                isVerified: true
            });

            if (!otpRecord) {
                return response(res, StatusCodes.BAD_REQUEST, "Please verify OTP first");
            }

            const customer = await this.repo.findOneBy({
                phoneNumber: body.phoneNumber,
                isDelete: 0
            });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "User not found");
            }

            customer.password = await bcrypt.hash(body.newPassword, 10);
            await this.repo.save(customer);
            await this.otpRepo.deleteMany({ phoneNumber: body.phoneNumber });

            return response(res, StatusCodes.OK, "Password reset successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
