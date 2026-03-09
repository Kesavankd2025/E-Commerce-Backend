import {
    JsonController,
    Post,
    Body,
    Req,
    Res,
    UseBefore,
    Get,
    QueryParams,
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
import { OneToOneMeeting } from "../../entity/121's";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { CreateOneToOneMeetingDto } from "../../dto/mobile/121.dto";
import { pagination } from "../../utils";
import { NotificationService } from "../../services/notification.service";
import { Member } from "../../entity/Member";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/one-to-one")
export class OneToOneMeetingController {
    private oneToOneRepo = AppDataSource.getMongoRepository(OneToOneMeeting);
    private pointsRepo = AppDataSource.getMongoRepository(Points);
    private userPointsRepo = AppDataSource.getMongoRepository(UserPoints);
    private historyRepo = AppDataSource.getMongoRepository(UserPointHistory);
    private memberRepo = AppDataSource.getMongoRepository(Member);
    private readonly notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService(); // ✅ FIXED
    }
    // ✅ CREATE 121 MEETING
    @Post("/")
    async createOneToOneMeeting(
        @Body() body: CreateOneToOneMeetingDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            // 🔹 Optional: Prevent duplicate 121 on same day with same member
            const existing = await this.oneToOneRepo.findOne({
                where: {
                    meetingWithMemberId: new ObjectId(body.meetingWithMemberId),
                    createdBy: new ObjectId(req.user.userId),
                    meetingDateTime: new Date(body.meetingDateTime),
                    isDelete: 0
                }
            });

            if (existing) {
                return response(
                    res,
                    StatusCodes.CONFLICT,
                    "121 meeting already logged with this member for the selected date & time"
                );
            }

            // 🔹 Create meeting
            const meeting = new OneToOneMeeting();

            meeting.chapterType = body.chapterType;
            meeting.meetingWithMemberId = new ObjectId(body.meetingWithMemberId);
            meeting.initiatedBy = body.initiatedBy;
            meeting.initiatedById = body.initiatedBy === 'SELF' ? new ObjectId(req.user.userId) : new ObjectId(body.meetingWithMemberId),

                meeting.meetingDateTime = new Date(body.meetingDateTime);
            meeting.meetingLocation = body.meetingLocation;

            meeting.topicDiscussed = body.topicDiscussed || null;
            meeting.photos = body.photos || [];

            meeting.status = "COMPLETED";
            meeting.isActive = 1;
            meeting.isDelete = 0;

            meeting.createdBy = new ObjectId(req.user.userId);
            meeting.updatedBy = new ObjectId(req.user.userId);

            const savedMeeting = await this.oneToOneRepo.save(meeting);
            if (savedMeeting) {
                const creatorMember = await this.memberRepo.findOne({ where: { _id: new ObjectId(req.user.userId) } });
                await this.notificationService.createNotification({
                    moduleName: "121",
                    moduleId: savedMeeting._id,
                    createdBy: req.user.userId,
                    subject: "New 121 Meeting Logged",
                    content: `A new 121 meeting has been logged by ${creatorMember?.fullName || 'a member'}.`,
                    model: "Member",
                    memberId: body.meetingWithMemberId
                });

                // --- Points Allocation ---
                const pointConfig = await this.pointsRepo.findOne({
                    where: { key: "one_to_one", isActive: 1, isDelete: 0 }
                });

                if (pointConfig) {
                    const creatorId = new ObjectId(req.user.userId);
                    const memberId = new ObjectId(body.meetingWithMemberId);

                    await this.userPointsRepo.updateOne(
                        { userId: creatorId, pointKey: "one_to_one" },
                        { $inc: { value: pointConfig.value } },
                        { upsert: true }
                    );

                    await this.historyRepo.save({
                        userId: creatorId,
                        pointKey: "one_to_one",
                        change: pointConfig.value,
                        source: "ONE_TO_ONE",
                        sourceId: savedMeeting._id,
                        remarks: "121 Meeting logged",
                        createdAt: new Date()
                    });

                    await this.userPointsRepo.updateOne(
                        { userId: memberId, pointKey: "one_to_one" },
                        { $inc: { value: pointConfig.value } },
                        { upsert: true }
                    );

                    await this.historyRepo.save({
                        userId: memberId,
                        pointKey: "one_to_one",
                        change: pointConfig.value,
                        source: "ONE_TO_ONE",
                        sourceId: savedMeeting._id,
                        remarks: "121 Meeting logged",
                        createdAt: new Date()
                    });
                }
            }
            return response(
                res,
                StatusCodes.CREATED,
                "121 meeting logged successfully",
                savedMeeting
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Get("/list")
    async listOneToOneMeetings(
        @QueryParams() query: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Math.max(Number(query.limit) || 10, 1);
            const skip = page * limit;

            const userObjectId = new ObjectId(req.user.userId);

            const match: any = { isDelete: 0 };

            // 🔹 Filter: chapter type
            if (query.chapterType) {
                match.chapterType = query.chapterType;
            }

            if (query.initiatedBy === "SELF") {
                match.initiatedById = userObjectId;
            }
            else if (query.initiatedBy === "PARTNER") {
                match.$and = [
                    {
                        $or: [
                            { meetingWithMemberId: userObjectId },
                            { createdBy: userObjectId }
                        ]
                    },
                    {
                        initiatedById: { $ne: userObjectId }
                    }
                ];
            }

            // 🔹 Filter: date range
            if (query.fromDate || query.toDate) {
                match.meetingDateTime = {};
                if (query.fromDate) {
                    match.meetingDateTime.$gte = new Date(query.fromDate);
                }
                if (query.toDate) {
                    match.meetingDateTime.$lte = new Date(query.toDate);
                }
            }

            const pipeline: any[] = [
                { $match: match },

                {
                    $lookup: {
                        from: "member",
                        localField: "meetingWithMemberId",
                        foreignField: "_id",
                        as: "member"
                    }
                },
                { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdByDetails"
                    }
                },
                { $unwind: { path: "$createdByDetails", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member",
                        localField: "initiatedById",
                        foreignField: "_id",
                        as: "initiatedByDetailsData"
                    }
                },
                { $unwind: { path: "$initiatedByDetailsData", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "member.businessCategory",
                        foreignField: "_id",
                        as: "memberCategory"
                    }
                },
                { $unwind: { path: "$memberCategory", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "createdByDetails.businessCategory",
                        foreignField: "_id",
                        as: "createdByCategory"
                    }
                },
                { $unwind: { path: "$createdByCategory", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "initiatedByDetailsData.businessCategory",
                        foreignField: "_id",
                        as: "initiatedByCategory"
                    }
                },
                { $unwind: { path: "$initiatedByCategory", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "member.chapter",
                        foreignField: "_id",
                        as: "memberChapter"
                    }
                },
                { $unwind: { path: "$memberChapter", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "createdByDetails.chapter",
                        foreignField: "_id",
                        as: "createdByChapter"
                    }
                },
                { $unwind: { path: "$createdByChapter", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "initiatedByDetailsData.chapter",
                        foreignField: "_id",
                        as: "initiatedByChapter"
                    }
                },
                { $unwind: { path: "$initiatedByChapter", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        isCreatedByCurrentUser: {
                            $cond: {
                                if: { $eq: ["$createdBy", userObjectId] },
                                then: true,
                                else: false
                            }
                        }
                    }
                },

                {
                    $project: {
                        chapterType: 1,
                        initiatedBy: 1,
                        initiatedById: 1,
                        meetingDateTime: 1,
                        meetingLocation: 1,
                        topicDiscussed: 1,
                        status: 1,
                        photos: 1,
                        createdAt: 1,
                        isCreatedByCurrentUser: 1,

                        meetingWith: {
                            $cond: {
                                if: { $eq: ["$initiatedBy", "PARTNER"] },
                                then: {
                                    _id: "$createdByDetails._id",
                                    name: "$createdByDetails.fullName",
                                    mobile: "$createdByDetails.phoneNumber",
                                    email: "$createdByDetails.email",
                                    profileImage: "$createdByDetails.profileImage",
                                    companyName: "$createdByDetails.companyName",
                                    businessCategoryName: "$createdByCategory.name",
                                    categoryId: "$createdByDetails.businessCategory",
                                    chapterName: "$createdByChapter.chapterName"
                                },
                                else: {
                                    _id: "$member._id",
                                    name: "$member.fullName",
                                    mobile: "$member.phoneNumber",
                                    email: "$member.email",
                                    profileImage: "$member.profileImage",
                                    companyName: "$member.companyName",
                                    businessCategoryName: "$memberCategory.name",
                                    categoryId: "$member.businessCategory",
                                    chapterName: "$memberChapter.chapterName"
                                }
                            }
                        },

                        intiatedByDetails: {
                            _id: "$initiatedByDetailsData._id",
                            name: "$initiatedByDetailsData.fullName",
                            mobile: "$initiatedByDetailsData.phoneNumber",
                            email: "$initiatedByDetailsData.email",
                            profileImage: "$initiatedByDetailsData.profileImage",
                            companyName: "$initiatedByDetailsData.companyName",
                            businessCategoryName: "$initiatedByCategory.name",
                            categoryId: "$initiatedByDetailsData.businessCategory",
                            chapterName: "$initiatedByChapter.chapterName"
                        },

                        createdByName: "$createdByDetails.fullName",
                        createdById: "$createdByDetails._id"
                    }
                },

                { $sort: { createdAt: -1 } },

                {
                    $facet: {
                        data: [
                            { $skip: skip },
                            { $limit: limit }
                        ],
                        meta: [
                            { $count: "total" }
                        ]
                    }
                }
            ];

            const [result] = await this.oneToOneRepo.aggregate(pipeline).toArray();

            const data = result?.data || [];
            const total = result?.meta?.[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


    @Get("/details/:id")
    async details(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            const match: any = {
                _id: new ObjectId(id),
                isDelete: 0,
            };

            const pipeline = [
                { $match: match },

                {
                    $lookup: {
                        from: "member",
                        localField: "meetingWithMemberId",
                        foreignField: "_id",
                        as: "member"
                    }
                },
                { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdByDetails"
                    }
                },
                { $unwind: { path: "$createdByDetails", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member",
                        localField: "initiatedById",
                        foreignField: "_id",
                        as: "initiatedByDetailsData"
                    }
                },
                { $unwind: { path: "$initiatedByDetailsData", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "member.businessCategory",
                        foreignField: "_id",
                        as: "memberCategory"
                    }
                },
                { $unwind: { path: "$memberCategory", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "createdByDetails.businessCategory",
                        foreignField: "_id",
                        as: "createdByCategory"
                    }
                },
                { $unwind: { path: "$createdByCategory", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "initiatedByDetailsData.businessCategory",
                        foreignField: "_id",
                        as: "initiatedByCategory"
                    }
                },
                { $unwind: { path: "$initiatedByCategory", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "member.chapter",
                        foreignField: "_id",
                        as: "memberChapter"
                    }
                },
                { $unwind: { path: "$memberChapter", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "createdByDetails.chapter",
                        foreignField: "_id",
                        as: "createdByChapter"
                    }
                },
                { $unwind: { path: "$createdByChapter", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "initiatedByDetailsData.chapter",
                        foreignField: "_id",
                        as: "initiatedByChapter"
                    }
                },
                { $unwind: { path: "$initiatedByChapter", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        chapterType: 1,
                        initiatedBy: 1,
                        initiatedById: 1,
                        meetingDateTime: 1,
                        meetingLocation: 1,
                        topicDiscussed: 1,
                        status: 1,
                        photos: 1,
                        createdAt: 1,
                        meetingWith: {
                            $cond: {
                                if: { $eq: ["$initiatedBy", "PARTNER"] },
                                then: {
                                    _id: "$createdByDetails._id",
                                    name: "$createdByDetails.fullName",
                                    mobile: "$createdByDetails.phoneNumber",
                                    email: "$createdByDetails.email",
                                    profileImage: "$createdByDetails.profileImage",
                                    companyName: "$createdByDetails.companyName",
                                    businessCategoryName: "$createdByCategory.name",
                                    categoryId: "$createdByDetails.businessCategory",
                                    chapterName: "$createdByChapter.chapterName"
                                },
                                else: {
                                    _id: "$member._id",
                                    name: "$member.fullName",
                                    mobile: "$member.phoneNumber",
                                    email: "$member.email",
                                    profileImage: "$member.profileImage",
                                    companyName: "$member.companyName",
                                    businessCategoryName: "$memberCategory.name",
                                    categoryId: "$member.businessCategory",
                                    chapterName: "$memberChapter.chapterName"
                                }
                            }
                        },

                        intiatedByDetails: {
                            _id: "$initiatedByDetailsData._id",
                            name: "$initiatedByDetailsData.fullName",
                            mobile: "$initiatedByDetailsData.phoneNumber",
                            email: "$initiatedByDetailsData.email",
                            profileImage: "$initiatedByDetailsData.profileImage",
                            companyName: "$initiatedByDetailsData.companyName",
                            businessCategoryName: "$initiatedByCategory.name",
                            categoryId: "$initiatedByDetailsData.businessCategory",
                            chapterName: "$initiatedByChapter.chapterName"
                        },

                        createdByName: "$createdByDetails.fullName",
                        createdById: "$createdByDetails._id"
                    }
                },

                { $sort: { createdAt: -1 } },
            ];

            const [result] = await this.oneToOneRepo.aggregate(pipeline).toArray();

            return response(res, StatusCodes.OK, "Details got successfully", result);


            return res;
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Patch("/:id")
    async updateOneToOneMeeting(
        @Param('id') id: string,
        @Body() body: CreateOneToOneMeetingDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const meetingId = new ObjectId(id);

            const existingMeeting = await this.oneToOneRepo.findOne({
                where: {
                    _id: meetingId,
                    isDelete: 0
                }
            });

            if (!existingMeeting) {
                return response(res, StatusCodes.NOT_FOUND, "121 meeting not found");
            }

            const duplicate = await this.oneToOneRepo.findOne({
                where: {
                    meetingWithMemberId: new ObjectId(body.meetingWithMemberId),
                    createdBy: new ObjectId(req.user.userId),
                    meetingDateTime: new Date(body.meetingDateTime),
                    isDelete: 0,
                    _id: { $ne: meetingId }
                }
            });

            if (duplicate) {
                return response(
                    res,
                    StatusCodes.CONFLICT,
                    "121 meeting already logged with this member for the selected date & time"
                );
            }

            const updateData: any = {
                chapterType: body.chapterType,
                meetingWithMemberId: new ObjectId(body.meetingWithMemberId),
                initiatedBy: body.initiatedBy,
                meetingDateTime: new Date(body.meetingDateTime),
                meetingLocation: body.meetingLocation,
                topicDiscussed: body.topicDiscussed || null,
                photos: body.photos || [],
                updatedBy: new ObjectId(req.user.userId),
                updatedAt: new Date()
            };

            const result = await this.oneToOneRepo.updateOne(
                { _id: meetingId },
                { $set: updateData }
            );

            return response(
                res,
                StatusCodes.OK,
                "121 meeting updated successfully",
                result
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

}
