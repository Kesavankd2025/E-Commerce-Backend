import {
    JsonController,
    Post,
    Body,
    Req,
    Res,
    HttpCode,
    UseBefore
} from "routing-controllers";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import requestIp from "request-ip";
import { UAParser } from "ua-parser-js";
import axios from "axios";
import { AppDataSource } from "../../data-source";
import { LoginHistory } from "../../entity/LoginHistory";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { JWT_SECRET } from "../../config/jwt";
import { Member } from "../../entity/Member";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { ObjectId } from "mongodb";
import { UserToken } from "../../entity/UserToken";
import { OTP } from "../../entity/OTP";
// import { sendOTPSMS } from "../../utils/sms";
import { ChangePasswordDto, ForgotPinDto, ResetPinDto, VerifyOtpDto } from "../../dto/mobile/Auth.dto";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@JsonController("/auth")
export class AuthController {

    private memberRepo = AppDataSource.getMongoRepository(Member);
    private loginHistoryRepo =
        AppDataSource.getMongoRepository(LoginHistory);

    @Post("/login")
    @HttpCode(StatusCodes.OK)
    async login(
        @Body() body: any,
        @Req() req: Request,
        @Res() res: Response
    ) {
        try {

            const { phoneNumber, pin, deviceToken } = body;

            if (!phoneNumber) {
                return response(res, StatusCodes.BAD_REQUEST, "phoneNumber is required");
            }

            if (!pin) {
                return response(res, StatusCodes.BAD_REQUEST, "pin is required");
            }
            const pipeline: any[] = [

                {
                    $match: {
                        phoneNumber,
                        isDelete: 0
                    }
                },
                {
                    $lookup: {
                        from: "chapter_role_assignments",
                        let: { memberId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$memberId", "$$memberId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    chapterId: 1,
                                    roleId: 1
                                }
                            }
                        ],
                        as: "chapterRole"
                    }
                },

                {
                    $unwind: {
                        path: "$chapterRole",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$chapterRole.roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$roleId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    name: 1,
                                    code: 1
                                }
                            }
                        ],
                        as: "chapterRoleRole"
                    }
                },

                {
                    $unwind: {
                        path: "$chapterRoleRole",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$roleId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    name: 1,
                                    code: 1
                                }
                            }
                        ],
                        as: "memberRole"
                    }
                },

                {
                    $unwind: {
                        path: "$memberRole",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        _id: 1,
                        fullName: 1,
                        phoneNumber: 1,
                        companyName: 1,
                        pin: 1,

                        roleName: {
                            $ifNull: ["$chapterRoleRole.name", "$memberRole.name"]
                        },

                        roleCode: {
                            $ifNull: ["$chapterRoleRole.code", "$memberRole.code"]
                        },
                        isActive: 1
                    }
                }

            ];

            const users =
                await this.memberRepo.aggregate(pipeline).toArray();

            const member = users[0];

            if (!member) {
                return response(res, StatusCodes.UNAUTHORIZED, "Invalid mobile number");
            }

            if (member.isActive !== 1) {
                return response(res, StatusCodes.FORBIDDEN, "Account is inactive. Please contact admin.");
            }

            const validPin = await bcrypt.compare(pin, member.pin);

            if (!validPin) {
                return response(res, StatusCodes.UNAUTHORIZED, "Invalid PIN");
            }
            const previousLoginCount = await this.loginHistoryRepo.countDocuments({
                userId: member._id,
                userType: "MEMBER",
                status: "SUCCESS"
            });

            const isFirstLogin = previousLoginCount === 0;
            const ipAddress = requestIp.getClientIp(req) || "UNKNOWN";

            const parser = new UAParser(req.headers["user-agent"] as string);
            const ua = parser.getResult();
            let deviceName = "Unknown Device";

            if (ua.device.vendor && ua.device.model) {
                deviceName = `${ua.device.vendor} ${ua.device.model}`; // Android
            } else if (ua.os.name === "iOS") {
                deviceName = "Apple iPhone"; // iOS privacy
            } else if (ua.os.name) {
                deviceName = ua.os.name; // Desktop
            }

            const clientType = req.headers["x-client-type"];
            const platform = req.headers["x-platform"];

            let browserName = "Unknown";

            if (clientType === "MOBILE_APP") {
                browserName =
                    platform === "IOS" ? "iOS App" : "Android App";
            } else {
                browserName = ua.browser.name
                    ? `${ua.browser.name}${ua.browser.version ? " " + ua.browser.version : ""}`
                    : "Unknown Browser";
            }
            let currentLocation = "Unknown";

            if (body.location) {
                currentLocation = body.location;
            } else if (ipAddress && ipAddress !== "UNKNOWN" && ipAddress !== "::1" && ipAddress !== "127.0.0.1") {
                try {
                    const response = await axios.get(`http://ip-api.com/json/${ipAddress}`);
                    const data = response.data;
                    if (data && data.status === "success") {
                        const parts = [data.city, data.regionName, data.country].filter(Boolean);
                        currentLocation = parts.length > 0 ? parts.join(", ") : "Unknown";
                    }
                } catch (err) {
                    console.error("IP Geolocation Error:", err);
                }
            }

            const payload = {
                id: member._id.toString(),
                userType: "MEMBER",
                phoneNumber: member.phoneNumber,
                roleCode: member.roleCode
            };

            const token = jwt.sign(payload, JWT_SECRET);

            await this.loginHistoryRepo.save({
                userId: member._id,
                userType: "MEMBER",
                userName: member.fullName,
                phoneNumber: member.phoneNumber,
                deviceName,
                browserName,
                currentLocation,
                ipAddress,
                loginfrom: "MOBILE",
                status: "SUCCESS",
                loginAt: new Date()
            });

            await this.memberRepo.findOneAndUpdate({
                _id: member._id
            }, {
                $set: {
                    deviceToken
                }
            });

            const tokenRepo = AppDataSource.getMongoRepository(UserToken);
            await tokenRepo.deleteMany({ userId: member._id });
            await tokenRepo.save({
                userId: member._id,
                userType: "MEMBER",
                token
            });


            return response(res, StatusCodes.OK, "Login successful", {
                token,
                isFirstLogin,
                userType: "MEMBER",
                user: {
                    id: member._id,
                    name: member.fullName,
                    phoneNumber: member.phoneNumber,
                    companyName: member.companyName,
                    roleName: member.roleName,
                    roleCode: member.roleCode
                }
            });

        } catch (error) {
            console.error(error);
            return response(res, StatusCodes.INTERNAL_SERVER_ERROR, "Login failed");
        }
    }

    @UseBefore(AuthMiddleware)
    @Post("/change-password")
    async changePassword(
        @Body() body: ChangePasswordDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const { oldPassword, newPassword, confirmPassword } = body;
            const userId = new ObjectId(req.user.userId);

            if (newPassword !== confirmPassword) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "New password and confirm password do not match"
                );
            }

            const member = await this.memberRepo.findOneBy({
                _id: userId,
                isDelete: 0
            });

            if (!member) {
                return response(res, StatusCodes.NOT_FOUND, "User not found");
            }

            const isMatch = await bcrypt.compare(oldPassword, member.pin);
            if (!isMatch) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "Incorrect old password"
                );
            }

            const hashedPin = await bcrypt.hash(newPassword, 10);
            member.pin = hashedPin;
            member.updatedBy = userId;

            await this.memberRepo.save(member);

            return response(
                res,
                StatusCodes.OK,
                "Password changed successfully"
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/pin/forgot/request-otp")
    async requestForgotPinOtp(
        @Body() body: ForgotPinDto,
        @Res() res: Response
    ) {
        try {
            const { phoneNumber } = body;

            const member = await this.memberRepo.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (!member) {
                return response(res, StatusCodes.NOT_FOUND, "Mobile number not registered");
            }

            const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
            const expiryMinutes = 5;
            const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
            const otpRepo = AppDataSource.getMongoRepository(OTP);

            await otpRepo.deleteMany({ phoneNumber });

            await otpRepo.save({
                phoneNumber,
                otp: otpCode,
                expiresAt,
                isVerified: false
            });

            // await sendOTPSMS(phoneNumber, otpCode, expiryMinutes);

            return response(
                res,
                StatusCodes.OK,
                "OTP sent successfully"
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/pin/forgot/verify-otp")
    async verifyForgotPinOtp(
        @Body() body: VerifyOtpDto,
        @Res() res: Response
    ) {
        try {
            const { phoneNumber, otp } = body;

            const otpRepo = AppDataSource.getMongoRepository(OTP);
            const otpRecord = await otpRepo.findOne({
                where: {
                    phoneNumber,
                    otp,
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
            await otpRepo.save(otpRecord);

            return response(
                res,
                StatusCodes.OK,
                "OTP verified successfully"
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/pin/forgot/reset")
    async resetForgotPin(
        @Body() body: ResetPinDto,
        @Res() res: Response
    ) {
        try {
            const { phoneNumber, otp, newPin } = body;

            const otpRepo = AppDataSource.getMongoRepository(OTP);
            const otpRecord = await otpRepo.findOne({
                where: {
                    phoneNumber,
                    otp,
                    isVerified: true
                }
            });

            if (!otpRecord) {
                return response(res, StatusCodes.BAD_REQUEST, "Please verify OTP first");
            }

            const member = await this.memberRepo.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (!member) {
                return response(res, StatusCodes.NOT_FOUND, "User not found");
            }

            const hashedPin = await bcrypt.hash(newPin, 10);
            member.pin = hashedPin;
            await this.memberRepo.save(member);

            await otpRepo.deleteMany({ phoneNumber });

            return response(
                res,
                StatusCodes.OK,
                "PIN reset successfully"
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @UseBefore(AuthMiddleware)
    @Post("/logout")
    async logout(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);

            await this.memberRepo.updateOne(
                { _id: userId },
                { $set: { deviceToken: "" } }
            );

            const tokenRepo = AppDataSource.getMongoRepository(UserToken);
            await tokenRepo.deleteMany({ userId });

            return response(res, StatusCodes.OK, "Logged out successfully");

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
