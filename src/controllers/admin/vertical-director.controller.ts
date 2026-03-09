import {
    JsonController,
    Post,
    Put,
    Get,
    Delete,
    Param,
    Body,
    Req,
    Res,
    UseBefore,
    Patch,
    QueryParams
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { VerticalDirectorRole } from "../../entity/VerticalDirectorRole";
import { VerticalDirectorAssignment } from "../../entity/VerticalDirectorAssignment";
import { VerticalDirectorHistory } from "../../entity/VerticalDirectorHistory";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import { AssignVerticalDirectorDto } from "../../dto/admin/VerticalDirectorRole.dto";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/vertical-directors")
export class VerticalDirectorController {

    private roleRepo = AppDataSource.getMongoRepository(VerticalDirectorRole);
    private assignmentRepo = AppDataSource.getMongoRepository(VerticalDirectorAssignment);
    private historyRepo = AppDataSource.getMongoRepository(VerticalDirectorHistory);

    @Get("/roles")
    async getRoles(@Res() res: Response) {
        try {
            const roles = await this.roleRepo.find({
                where: { isDelete: 0 },
                order: { name: "ASC" }
            });
            return response(res, 200, "Success", roles);
        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch roles");
        }
    }

    @Get("/list")
    async listAssignments(@Res() res: Response) {
        try {
            const data = await this.assignmentRepo.aggregate([
                {
                    $match: { isDelete: 0 }
                },
                {
                    $lookup: {
                        from: "vertical_director_roles",
                        localField: "roleId",
                        foreignField: "_id",
                        as: "role"
                    }
                },
                { $unwind: "$role" },
                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$memberId" },
                        pipeline: [
                            {
                                $match: { $expr: { $eq: ["$_id", "$$memberId"] } }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    profileImage: 1,
                                    fullName: 1,
                                    phoneNumber: 1,
                                    email: 1,
                                    companyName: 1
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: "$member" },
                {
                    $project: {
                        _id: 1,
                        roleName: "$role.name",
                        roleCode: "$role.code",
                        member: {
                            id: "$member._id",
                            profileImage: "$member.profileImage",
                            fullName: "$member.fullName",
                            phoneNumber: "$member.phoneNumber",
                            email: "$member.email",
                            companyName: "$member.companyName"
                        }
                    }
                }
            ]).toArray();

            return response(res, 200, "Success", data);

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch assignments");
        }
    }

    @Post("/")
    async create(
        @Body() body: AssignVerticalDirectorDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const exists = await this.assignmentRepo.findOneBy({
                roleId: new ObjectId(body.roleId),
                isDelete: 0
            });

            if (exists) {
                return response(
                    res,
                    StatusCodes.CONFLICT,
                    "Vertical Director role is already assigned. Please reassign instead."
                );
            }

            await this.assignmentRepo.save({
                roleId: new ObjectId(body.roleId),
                memberId: new ObjectId(body.memberId),
                createdBy: new ObjectId(req.user.userId),
                updatedBy: new ObjectId(req.user.userId),
                isActive: 1,
                isDelete: 0
            });

            await this.historyRepo.save({
                roleId: new ObjectId(body.roleId),
                memberId: new ObjectId(body.memberId),
                startDate: new Date(),
                endDate: null,
                createdBy: new ObjectId(req.user.userId),
                updatedBy: new ObjectId(req.user.userId),
                isActive: 1,
                isDelete: 0
            });

            return response(res, StatusCodes.CREATED, "Role assigned successfully");

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to assign role");
        }
    }

    @Patch("/:id")
    async update(
        @Param("id") id: string,
        @Body() body: { memberId: string },
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id) || !ObjectId.isValid(body.memberId)) {
                return response(res, 400, "Invalid ObjectId");
            }

            const record = await this.assignmentRepo.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!record) {
                return response(res, StatusCodes.NOT_FOUND, "Assignment not found");
            }

            const prevHistory = await this.historyRepo.findOne({
                where: {
                    roleId: record.roleId,
                    memberId: record.memberId,
                    endDate: null,
                    isDelete: 0
                }
            });

            if (prevHistory) {
                prevHistory.endDate = new Date();
                prevHistory.updatedBy = new ObjectId(req.user.userId);
                await this.historyRepo.save(prevHistory);
            }

            record.memberId = new ObjectId(body.memberId);
            record.updatedBy = new ObjectId(req.user.userId);

            await this.assignmentRepo.save(record);

            await this.historyRepo.save({
                roleId: record.roleId,
                memberId: new ObjectId(body.memberId),
                startDate: new Date(),
                endDate: null,
                createdBy: new ObjectId(req.user.userId),
                updatedBy: new ObjectId(req.user.userId),
                isActive: 1,
                isDelete: 0
            });

            return response(res, StatusCodes.OK, "Role reassigned successfully");

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to update role");
        }
    }

    @Delete("/:id")
    async remove(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, 400, "Invalid id");
            }

            const record = await this.assignmentRepo.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (record) {
                const prevHistory = await this.historyRepo.findOne({
                    where: {
                        roleId: record.roleId,
                        memberId: record.memberId,
                        endDate: null,
                        isDelete: 0
                    }
                });

                if (prevHistory) {
                    prevHistory.endDate = new Date();
                    prevHistory.updatedBy = new ObjectId(req.user.userId);
                    await this.historyRepo.save(prevHistory);
                }

                record.isDelete = 1;
                record.updatedBy = new ObjectId(req.user.userId);
                await this.assignmentRepo.save(record);
            }

            return response(res, StatusCodes.OK, "Removed successfully");

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to remove");
        }
    }

    @Get("/history")
    async getHistory(
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };

            if (query.roleId && ObjectId.isValid(query.roleId)) {
                match.roleId = new ObjectId(query.roleId);
            }

            if (query.startDate || query.endDate) {
                match.startDate = {};
                if (query.startDate) {
                    match.startDate.$gte = new Date(query.startDate);
                }
                if (query.endDate) {
                    match.startDate.$lte = new Date(query.endDate);
                }
            }

            const data = await this.historyRepo.aggregate([
                { $match: match },
                {
                    $lookup: {
                        from: "vertical_director_roles",
                        localField: "roleId",
                        foreignField: "_id",
                        as: "role"
                    }
                },
                { $unwind: { path: "$role", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$memberId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
                            {
                                $project: {
                                    _id: 1,
                                    profileImage: 1,
                                    fullName: 1,
                                    phoneNumber: 1,
                                    email: 1,
                                    companyName: 1
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },
                { $sort: { startDate: -1 } },
                {
                    $project: {
                        _id: 1,
                        startDate: 1,
                        endDate: 1,
                        isActive: 1,
                        member: 1,
                        roleName: "$role.name",
                        roleCode: "$role.code"
                    }
                }
            ]).toArray();

            return response(res, 200, "Success", data);
        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch history");
        }
    }
}
