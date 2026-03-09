import {
    JsonController,
    Post,
    Get,
    Body,
    Req,
    Res,
    QueryParams,
    UseBefore,
    Param,
    Patch
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { PowerDate } from "../../entity/PowerDate";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { CreatePowerDateDto } from "../../dto/mobile/PowerDate.dto";
import { Member } from "../../entity/Member";
import { NotificationService } from "../../services/notification.service";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/power-date")
export class PowerDateController {
    private powerDateRepo = AppDataSource.getMongoRepository(PowerDate);
    private pointsRepo = AppDataSource.getMongoRepository(Points);
    private userPointsRepo = AppDataSource.getMongoRepository(UserPoints);
    private historyRepo = AppDataSource.getMongoRepository(UserPointHistory);
    private memberRepository = AppDataSource.getMongoRepository(Member);
    private readonly notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService(); // ✅ FIXED
    }
    // =========================
    // ✅ CREATE Power Date
    // =========================
    @Post("/")
    async createPowerDate(
        @Body() body: CreatePowerDateDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);
            const member = await this.memberRepository.findOne({
                where: {
                    _id: userId,
                    isDelete: 0
                }
            });
            if (!member) {
                return response(
                    res,
                    StatusCodes.NOT_FOUND,
                    "Member not found"
                );
            }
            const powerDate = new PowerDate();

            powerDate.members = body.members.map(id => new ObjectId(id));
            powerDate.meetingStatus = body.meetingStatus;
            powerDate.name = body.name;
            powerDate.phoneNumber = body.phoneNumber;
            powerDate.email = body.email;
            powerDate.address = body.address;
            powerDate.rating = body.rating;
            powerDate.comments = body.comments;
            powerDate.image = body.image;
            powerDate.companyName = body.companyName;
            powerDate.businessCategory = body.businessCategory;

            powerDate.isActive = 1;
            powerDate.isDelete = 0;
            powerDate.createdBy = new ObjectId(req.user.userId);
            powerDate.updatedBy = new ObjectId(req.user.userId);

            const saved = await this.powerDateRepo.save(powerDate);

            // --- Points Allocation ---
            const pointConfig = await this.pointsRepo.findOne({
                where: { key: "power_dates", isActive: 1, isDelete: 0 }
            });

            if (pointConfig) {
                const userId = new ObjectId(req.user.userId);

                await this.userPointsRepo.updateOne(
                    { userId, pointKey: "power_dates" },
                    { $inc: { value: pointConfig.value } },
                    { upsert: true }
                );

                await this.historyRepo.save({
                    userId,
                    pointKey: "power_dates",
                    change: pointConfig.value,
                    source: "POWER_MEET",
                    sourceId: saved._id,
                    remarks: "Power Meet logged",
                    createdAt: new Date()
                });
            }
            await this.notificationService.createNotification({
                moduleName: "POWER_MEET",
                moduleId: saved._id,
                createdBy: req.user.userId,
                subject: "New Power Meet Created",
                content: `A new power meet has been created with member Name: ${member.fullName}`,
                model: "Member",
                memberId: body.members.map(id => new ObjectId(id)),
                actionType: "APPROVE"
            });
            return response(
                res,
                StatusCodes.CREATED,
                "Created successfully",
                saved
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Patch("/:id")
    async updatePowerDate(
        @Param("id") id: string,
        @Body() body: CreatePowerDateDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid PowerDate ID");
            }

            const powerDate = await this.powerDateRepo.findOne({
                where: {
                    _id: new ObjectId(id),
                    isDelete: 0
                }
            });

            if (!powerDate) {
                return response(res, StatusCodes.NOT_FOUND, "PowerDate not found");
            }

            // 🔹 Update fields only if provided
            if (body.members?.length) {
                powerDate.members = body.members.map(id => new ObjectId(id));
            }

            if (body.meetingStatus !== undefined)
                powerDate.meetingStatus = body.meetingStatus;

            if (body.name !== undefined)
                powerDate.name = body.name;

            if (body.phoneNumber !== undefined)
                powerDate.phoneNumber = body.phoneNumber;

            if (body.image !== undefined)
                powerDate.image = body.image;

            if (body.email !== undefined)
                powerDate.email = body.email;

            if (body.address !== undefined)
                powerDate.address = body.address;

            if (body.rating !== undefined)
                powerDate.rating = body.rating;

            if (body.comments !== undefined)
                powerDate.comments = body.comments;

            if (body.companyName !== undefined)
                powerDate.companyName = body.companyName;

            if (body.businessCategory !== undefined)
                powerDate.businessCategory = body.businessCategory;

            powerDate.updatedBy = new ObjectId(req.user.userId);

            const updated = await this.powerDateRepo.save(powerDate);

            return response(
                res,
                StatusCodes.OK,
                "Updated successfully",
                updated
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // =========================
    // ✅ LIST Power Date
    // =========================
    @Get("/list")
    async listPowerDate(
        @QueryParams() query: any,
        @Res() res: Response,
        @Req() req: RequestWithUser
    ) {
        const page = Math.max(Number(query.page) || 0, 0);
        const limit = Math.max(Number(query.limit) || 10, 1);
        const search = query.search?.toString();
        const memberId = new ObjectId(req.user.userId);
        const match: any = {
            $or: [
                { createdBy: memberId },
                { members: { $in: [memberId] } }
            ],
            isDelete: 0
        };

        if (search) {
            match.$or = [
                { name: { $regex: search, $options: "i" } },
                { comments: { $regex: search, $options: "i" } },
                { companyName: { $regex: search, $options: "i" } },
                { businessCategory: { $regex: search, $options: "i" } }
            ];
        }

        const pipeline = [
            { $match: match },

            // 🔹 Created By Member
            {
                $lookup: {
                    from: "member",
                    let: { memberId: "$createdBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
                        {
                            $project: {
                                _id: 1,
                                fullName: 1,
                                profileImage: 1
                            }
                        }
                    ],
                    as: "createdByMember"
                }
            },
            { $unwind: { path: "$createdByMember", preserveNullAndEmptyArrays: true } },

            // 🔹 Members Lookup (Array)
            {
                $lookup: {
                    from: "member",
                    let: { memberIds: "$members" },
                    pipeline: [
                        { $match: { $expr: { $in: ["$_id", "$$memberIds"] } } },
                        {
                            $project: {
                                fullName: 1,
                                profileImage: 1
                            }
                        }
                    ],
                    as: "memberDetails"
                }
            },

            { $sort: { createdAt: -1 } },

            {
                $facet: {
                    data: [
                        { $skip: page * limit },
                        { $limit: limit }
                    ],
                    meta: [{ $count: "total" }]
                }
            }
        ];

        const [result] = await this.powerDateRepo
            .aggregate(pipeline)
            .toArray();

        const data = result?.data || [];
        const total = result?.meta?.[0]?.total || 0;

        return pagination(total, data, limit, page, res);
    }
    @Get("/details/:id")
    async getPowerDateDetail(
        @Param("id") id: string,
        @Res() res: Response,
        @Req() req: RequestWithUser
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, 400, "Invalid power date id");
            }

            const memberId = new ObjectId(req.user.userId);
            const powerDateId = new ObjectId(id);

            const pipeline: any[] = [
                {
                    $match: {
                        _id: powerDateId,
                        isDelete: 0,
                        $or: [
                            { createdBy: memberId },
                            { members: { $in: [memberId] } }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$createdBy" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
                            {
                                $project: {
                                    _id: 1,
                                    fullName: 1,
                                    profileImage: 1,
                                    companyName: 1
                                }
                            }
                        ],
                        as: "createdByMember"
                    }
                },
                { $unwind: { path: "$createdByMember", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "member",
                        let: { memberIds: "$members" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$memberIds"] } } },
                            {
                                $project: {
                                    _id: 1,
                                    fullName: 1,
                                    profileImage: 1,
                                    companyName: 1
                                }
                            }
                        ],
                        as: "memberDetails"
                    }
                },
                {
                    $project: {
                        name: 1,
                        meetingStatus: 1,
                        companyName: 1,
                        businessCategory: 1,
                        phoneNumber: 1,
                        email: 1,
                        address: 1,
                        rating: 1,
                        comments: 1,
                        meetingDate: 1,
                        meetingTime: 1,
                        location: 1,
                        createdAt: 1,
                        createdByMember: 1,
                        memberDetails: 1,
                        image: 1
                    }
                }
            ];

            const [data] = await this.powerDateRepo.aggregate(pipeline).toArray();

            if (!data) {
                return response(res, 404, "Power date not found");
            }

            return response(res, 200, "Power date detail fetched", data);
        } catch (error) {
            console.error(error);
            return response(res, 500, "Failed to fetch power date detail");
        }
    }

}
