import {
    JsonController,
    Post,
    Get,
    Put,
    Delete,
    Param,
    Body,
    Res,
    HttpCode,
    QueryParams,
    UseBefore,
    Req,
    Patch
} from "routing-controllers";
import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AdminUser } from "../../entity/AdminUser";
import { Admin } from "../../entity/Admin";
import { Member } from "../../entity/Member";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { CreateAdminUserDto, UpdateAdminUserDto } from "../../dto/admin/AdminUser.dto";
import { AuthPayload } from "../../middlewares/AuthMiddleware";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/adminUser")
export class AdminUserController {
    private adminUserRepository = AppDataSource.getMongoRepository(AdminUser);
    private adminRepository = AppDataSource.getMongoRepository(Admin);
    private memberRepository = AppDataSource.getMongoRepository(Member);

    @Post("/")
    async createAdminUser(
        @Body() body: CreateAdminUserDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const phoneNumber = body.phoneNumber;

            const existingAdminUser = await this.adminUserRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (existingAdminUser) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin User");
            }
            const existingAdmin = await this.adminRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (existingAdmin) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin");
            }

            const existingMember = await this.memberRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (existingMember) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as a Member");
            }

            const adminUser = new AdminUser();
            adminUser.name = body.name;
            adminUser.profileImage = body.profileImage || undefined;
            adminUser.email = body.email;
            adminUser.companyName = body.companyName;
            adminUser.phoneNumber = body.phoneNumber;
            adminUser.pin = await bcrypt.hash(body.pin, 10);
            adminUser.roleId = new ObjectId(body.roleId);
            adminUser.createdBy = new ObjectId(req.user.userId);
            adminUser.updatedBy = new ObjectId(req.user.userId);
            adminUser.isActive = body.isActive ?? 1;
            adminUser.isDelete = 0;

            const savedAdminUser = await this.adminUserRepository.save(adminUser);

            return response(
                res,
                StatusCodes.CREATED,
                "Admin User created successfully",
                savedAdminUser
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/")
    async getAllAdminUsers(
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Number(query.limit ?? 0);
            const search = query.search?.trim();

            const match: any = {
                isDelete: 0
            };

            if (query.status !== undefined) {
                match.isActive = Number(query.status);
            }

            const pipeline: any[] = [
                { $match: match },

                // 🔹 Role Lookup
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
                                    name: 1
                                }
                            }
                        ],
                        as: "role"
                    }
                },
                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: true
                    }
                },
                ...(search
                    ? [{
                        $match: {
                            $or: [
                                { name: { $regex: search, $options: "i" } },
                                { email: { $regex: search, $options: "i" } },
                                { companyName: { $regex: search, $options: "i" } },
                                { "role.name": { $regex: search, $options: "i" } }
                            ]
                        }
                    }]
                    : []),
                {
                    $sort: {
                        isActive: -1,
                        createdAt: -1
                    }
                },
                {
                    $facet: {
                        data: [
                            ...(limit > 0 ? [
                                { $skip: page * limit },
                                { $limit: limit }
                            ] : []),
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    email: 1,
                                    companyName: 1,
                                    phoneNumber: 1,
                                    isActive: 1,
                                    roleId: 1,
                                    roleName: "$role.name",
                                    profileImage: 1,
                                    createdAt: 1,
                                    updatedAt: 1
                                }
                            }
                        ],
                        meta: [
                            { $count: "total" }
                        ]
                    }
                }
            ];

            const result = await this.adminUserRepository
                .aggregate(pipeline)
                .toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(
                total,
                data,
                limit === 0 ? total : limit,
                page,
                res
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }



    @Get("/active")
    async getActiveAdminUsers(@Res() res: Response) {
        try {
            const adminUsers = await this.adminUserRepository.find({
                isDelete: 0,
                isActive: 1
            });

            return response(
                res,
                StatusCodes.OK,
                "Active Admin Users fetched successfully",
                adminUsers
            );
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/:id")
    async getAdminUserById(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            const operation: any[] = [];

            operation.push({
                $match: {
                    _id: new ObjectId(id),
                    isDelete: 0
                }
            });

            // ===== ROLE LOOKUP =====
            operation.push({
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
                                name: 1
                            }
                        }
                    ],
                    as: "role"
                }
            });

            operation.push({
                $unwind: {
                    path: "$role",
                    preserveNullAndEmptyArrays: true
                }
            });

            // ===== PROJECT =====
            operation.push({
                $project: {
                    name: 1,
                    email: 1,
                    companyName: 1,
                    phoneNumber: 1,
                    isActive: 1,
                    roleId: 1,
                    roleName: "$role.name",
                    createdAt: 1,
                    updatedAt: 1,
                    profileImage: 1
                }
            });

            const result = await this.adminUserRepository
                .aggregate(operation)
                .toArray();

            if (!result.length) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            return response(
                res,
                StatusCodes.OK,
                "Admin User fetched successfully",
                result[0]
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


    @Put("/:id")
    async updateAdminUser(
        @Param("id") id: string,
        @Body() body: UpdateAdminUserDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const adminUser = await this.adminUserRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!adminUser) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            if (body.phoneNumber) {
                const phoneNumber = body.phoneNumber;
                const mobileExists = await this.adminUserRepository.findOne({
                    where: {
                        phoneNumber,
                        isDelete: 0,
                        _id: { $ne: new ObjectId(id) }
                    }
                });

                if (mobileExists) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin User");
                }
                const existingAdmin = await this.adminRepository.findOneBy({
                    phoneNumber,
                    isDelete: 0
                });

                if (existingAdmin) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin");
                }

                const existingMember = await this.memberRepository.findOneBy({
                    phoneNumber,
                    isDelete: 0
                });

                if (existingMember) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as a Member");
                }

                adminUser.phoneNumber = phoneNumber;
            }

            if (body.name) adminUser.name = body.name;
            console.log(body.profileImage, "body.profileImage")
            if (body.profileImage) adminUser.profileImage = body.profileImage;
            if (body.email) adminUser.email = body.email;
            if (body.companyName) adminUser.companyName = body.companyName;

            if (body.pin) {
                adminUser.pin = await bcrypt.hash(body.pin, 10);
            }

            if (body.roleId) adminUser.roleId = new ObjectId(body.roleId);
            if (body.isActive !== undefined) adminUser.isActive = body.isActive;

            adminUser.updatedBy = new ObjectId(req.user.userId);

            const updatedAdminUser = await this.adminUserRepository.save(adminUser);

            return response(
                res,
                StatusCodes.OK,
                "Admin User updated successfully",
                updatedAdminUser
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


    @Delete("/:id")
    async deleteAdminUser(@Param("id") id: string, @Res() res: Response) {
        try {
            const adminUser = await this.adminUserRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!adminUser) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            adminUser.isDelete = 1;
            await this.adminUserRepository.save(adminUser);

            return response(res, StatusCodes.OK, "Admin User deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Patch("/:id/toggle-active")
    async toggleActiveStatus(@Param("id") id: string, @Res() res: Response) {
        try {
            const adminUser = await this.adminUserRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!adminUser) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            adminUser.isActive = adminUser.isActive === 1 ? 0 : 1;
            const updatedAdminUser =
                await this.adminUserRepository.save(adminUser);

            return response(
                res,
                StatusCodes.OK,
                `Admin User ${adminUser.isActive === 1 ? "enabled" : "disabled"
                } successfully`,
                updatedAdminUser
            );
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/role/:roleId")
    async getAdminUsersByRole(
        @Param("roleId") roleId: string,
        @Res() res: Response
    ) {
        try {
            const adminUsers = await this.adminUserRepository.find({
                roleId: new ObjectId(roleId),
                isDelete: 0
            });

            return response(
                res,
                StatusCodes.OK,
                "Admin Users fetched successfully",
                adminUsers
            );
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
    @Get("/role/code/:roleCode")
    async getAdminUsersByRoleCode(
        @Param("roleCode") roleCode: string,
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Number(query.page ?? 0);
            let limit = Number(query.limit ?? 0);

            const matchStage: any = {
                isDelete: 0
            };

            const pipeline: any[] = [
                { $match: matchStage },

                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$roleId"] },
                                            { $eq: ["$code", roleCode] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
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
                        as: "role"
                    }
                },

                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: false
                    }
                }
            ];

            if (limit > 0) {
                pipeline.push(
                    { $skip: page * limit },
                    { $limit: limit }
                );
            }

            pipeline.push({
                $project: {
                    name: 1,
                    email: 1,
                    companyName: 1,
                    phoneNumber: 1,
                    isActive: 1,
                    roleId: 1,
                    roleName: "$role.name",
                    roleCode: "$role.code",
                    createdAt: 1,
                }
            });

            const result = await this.adminUserRepository
                .aggregate(pipeline)
                .toArray();

            const totalPipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$roleId"] },
                                            { $eq: ["$code", roleCode] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "role"
                    }
                },
                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: false
                    }
                },
                { $count: "total" }
            ];

            const totalResult = await this.adminUserRepository
                .aggregate(totalPipeline)
                .toArray();

            const total = totalResult[0]?.total || 0;

            if (limit === 0) {
                limit = total;
            }

            return pagination(total, result, limit, page, res);

        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }


}
