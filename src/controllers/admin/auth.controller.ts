import {
    JsonController,
    Post,
    Body,
    Req,
    Res,
    HttpCode,
    Get,
    UseBefore,
    QueryParams
} from "routing-controllers";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import requestIp from "request-ip";
import { UAParser } from "ua-parser-js";
import axios from "axios";

import { AppDataSource } from "../../data-source";
import { Admin } from "../../entity/Admin";
import { AdminUser } from "../../entity/AdminUser";
import { LoginHistory } from "../../entity/LoginHistory";
import response from "../../utils/response";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { ObjectId } from "mongodb";
import { pagination } from "../../utils";
import { UserToken } from "../../entity/UserToken";
import { OTP } from "../../entity/OTP";
// import { sendOTPSMS } from "../../utils/sms";
import { ForgotPinDto, VerifyOtpDto, ResetPinDto } from "../../dto/admin/Auth.dto";

const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as any
};
interface RequestWithUser extends Request {
    user: AuthPayload;
}
@JsonController("/auth")
export class AuthController {

    private adminRepo = AppDataSource.getMongoRepository(Admin);
    private adminUserRepo = AppDataSource.getMongoRepository(AdminUser);
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
            const { phoneNumber, pin } = body;

            if (!phoneNumber) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "phoneNumber is required"
                );
            }
            if (!pin) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "pin is required"
                );
            }

            const admin =
                (await this.adminRepo.findOne({
                    where: { phoneNumber, isDelete: 0 }
                })) ||
                (await this.adminUserRepo.findOne({
                    where: { phoneNumber, isDelete: 0 }
                }));

            if (!admin) {
                return response(res, StatusCodes.UNAUTHORIZED, "Invalid mobile number");
            }

            if (admin.isActive !== 1) {
                return response(res, StatusCodes.FORBIDDEN, "Account is inactive. Please contact admin.");
            }

            // 2️⃣ Validate PIN
            const validPin = await bcrypt.compare(pin, admin.pin);
            if (!validPin) {
                return response(res, StatusCodes.UNAUTHORIZED, "Invalid PIN");
            }

            // 3️⃣ IP Address
            const ipAddress =
                requestIp.getClientIp(req) || "UNKNOWN";

            // 4️⃣ UA Parser (TS SAFE)
            const parser = new UAParser(req.headers["user-agent"] as string);
            const ua = parser.getResult();

            // 5️⃣ Device Name (Physical device)
            let deviceName = "Unknown Device";

            if (ua.device.vendor && ua.device.model) {
                deviceName = `${ua.device.vendor} ${ua.device.model}`; // Android
            } else if (ua.os.name === "iOS") {
                deviceName = "Apple iPhone"; // iOS privacy
            } else if (ua.os.name) {
                deviceName = ua.os.name; // Desktop
            }

            // 6️⃣ Browser / App Name
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

            // 7️⃣ Location
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

            let payload: any;

            if (admin instanceof Admin) {
                payload = {
                    id: admin.id.toString(),
                    phoneNumber: admin.phoneNumber,
                    role: admin.role,
                    userType: "ADMIN"
                };
            } else {
                payload = {
                    id: admin.id.toString(),
                    phoneNumber: admin.phoneNumber,
                    roleId: admin.roleId.toString(),
                    userType: "ADMIN_USER"
                };
            }

            await this.loginHistoryRepo.save({
                userId: admin.id,
                userType: payload.userType,
                userName: admin.name,
                phoneNumber: admin.phoneNumber,
                deviceName,
                browserName,
                currentLocation,
                ipAddress,
                loginfrom: "WEB",
                status: "SUCCESS",
                loginAt: new Date()
            });

            const token = jwt.sign(payload, JWT_SECRET, options);

            const tokenRepo = AppDataSource.getMongoRepository(UserToken);
            await tokenRepo.deleteMany({ userId: admin.id });
            await tokenRepo.save({
                userId: admin.id,
                userType: payload.userType,
                token
            });

            return response(res, StatusCodes.OK, "Login successful", {
                token,
                userType: payload.userType,
                user: {
                    id: admin.id,
                    name: admin.name,
                    phoneNumber: admin.phoneNumber
                }
            });

        } catch (error) {
            console.error(error);
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                "Login failed"
            );
        }
    }
    @Get("/profile")
    @UseBefore(AuthMiddleware)
    async getCurrentProfile(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const { userId, userType } = req.user!;

            let data: any[] = [];

            if (userType === "ADMIN") {
                data = await this.adminRepo.aggregate([
                    {
                        $match: {
                            _id: new ObjectId(userId),
                            isActive: 1,
                            isDelete: 0
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            phoneNumber: 1,
                            email: 1,
                            userType: { $literal: "ADMIN" },
                            role: { $literal: null },
                            permissions: { $literal: [] }
                        }
                    }
                ]).toArray();

            }
            else {

                data = await this.adminUserRepo.aggregate([
                    {
                        $match: {
                            _id: new ObjectId(userId),
                            isActive: 1,
                            isDelete: 0
                        }
                    },

                    {
                        $lookup: {
                            from: "roles",
                            localField: "roleId",
                            foreignField: "_id",
                            as: "role"
                        }
                    },
                    { $unwind: { path: "$role", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "modules",
                            localField: "role.permissions.moduleId",
                            foreignField: "_id",
                            as: "modules"
                        }
                    },

                    {
                        $addFields: {
                            permissions: {
                                $map: {
                                    input: "$role.permissions",
                                    as: "perm",
                                    in: {
                                        moduleId: "$$perm.moduleId",
                                        moduleName: {
                                            $let: {
                                                vars: {
                                                    module: {
                                                        $arrayElemAt: [
                                                            {
                                                                $filter: {
                                                                    input: "$modules",
                                                                    as: "m",
                                                                    cond: {
                                                                        $eq: [
                                                                            { $toString: "$$m._id" },
                                                                            { $toString: "$$perm.moduleId" }
                                                                        ]
                                                                    }
                                                                }
                                                            },
                                                            0
                                                        ]
                                                    }
                                                },
                                                in: "$$module.name"
                                            }
                                        },
                                        actions: "$$perm.actions"
                                    }
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            phoneNumber: 1,
                            email: 1,
                            userType: { $literal: "ADMIN_USER" },

                            role: {
                                id: "$role._id",
                                name: "$role.name",
                                code: "$role.code"
                            },

                            permissions: 1
                        }
                    }
                ]).toArray();

            }

            if (!data.length) {
                return response(res, StatusCodes.NOT_FOUND, "User not found");
            }

            const profile = data[0];

            return response(
                res,
                StatusCodes.OK,
                "Profile fetched successfully",
                {
                    id: profile._id,
                    name: profile.name,
                    phoneNumber: profile.phoneNumber,
                    email: profile.email,
                    userType: profile.userType,
                    role: profile.role,
                    permissions: profile.permissions || []
                }
            );

        } catch (error) {
            console.error(error);
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                "Failed to fetch profile"
            );
        }
    }
    @Get("/login-report")
    @UseBefore(AuthMiddleware)
    async getLoginReport(
        @QueryParams() query: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Number(query.page ?? 0);
            const limit = Number(query.limit ?? 10);
            const search = req.query.search?.toString();

            const match: any = {};

            if (query.loginfrom) {
                match.loginfrom = query.loginfrom;
            }

            if (query.userType) {
                match.userType = query.userType;
            }

            if (query.status) {
                match.status = query.status;
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { loginAt: -1 } },

                {
                    $project: {
                        _id: 1,
                        userName: 1,
                        phoneNumber: 1,
                        userType: 1,
                        deviceName: 1,
                        browserName: 1,
                        currentLocation: 1,
                        ipAddress: 1,
                        loginfrom: 1,
                        status: 1,
                        loginAt: 1
                    }
                },
                ...(search ? [{
                    $match: {
                        $or: [
                            { userName: { $regex: search, $options: "i" } },
                            { currentLocation: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                }] : [])
            ];

            const countPipeline = [...pipeline, { $count: "total" }];
            if (limit > 0) {
                pipeline.push(
                    { $skip: page * limit },
                    { $limit: limit }
                );
            }

            const [data, countResult] = await Promise.all([
                this.loginHistoryRepo.aggregate(pipeline).toArray(),
                this.loginHistoryRepo.aggregate(countPipeline).toArray()
            ]);

            const totalCount = countResult.length > 0 ? countResult[0].total : 0;

            return pagination(
                totalCount,
                data,
                limit,
                page,
                res
            );

        } catch (error) {
            console.error(error);
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                "Failed to fetch login report"
            );
        }
    }

    @Post("/pin/forgot/request-otp")
    async requestForgotPinOtp(
        @Body() body: ForgotPinDto,
        @Res() res: Response
    ) {
        try {
            const { phoneNumber } = body;

            const admin =
                (await this.adminRepo.findOne({
                    where: { phoneNumber, isDelete: 0 }
                })) ||
                (await this.adminUserRepo.findOne({
                    where: { phoneNumber, isDelete: 0 }
                }));

            if (!admin) {
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
            console.error(error);
            return response(res, StatusCodes.INTERNAL_SERVER_ERROR, "Failed to request OTP");
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
            console.error(error);
            return response(res, StatusCodes.INTERNAL_SERVER_ERROR, "Failed to verify OTP");
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

            const admin =
                (await this.adminRepo.findOne({
                    where: { phoneNumber, isDelete: 0 }
                })) ||
                (await this.adminUserRepo.findOne({
                    where: { phoneNumber, isDelete: 0 }
                }));

            if (!admin) {
                return response(res, StatusCodes.NOT_FOUND, "User not found");
            }

            const hashedPin = await bcrypt.hash(newPin, 10);
            admin.pin = hashedPin;

            if (admin instanceof Admin) {
                await this.adminRepo.save(admin);
            } else {
                await this.adminUserRepo.save(admin);
            }

            await otpRepo.deleteMany({ phoneNumber });

            return response(
                res,
                StatusCodes.OK,
                "PIN reset successfully"
            );

        } catch (error) {
            console.error(error);
            return response(res, StatusCodes.INTERNAL_SERVER_ERROR, "Failed to reset PIN");
        }
    }
}
