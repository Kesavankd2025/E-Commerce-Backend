import {
    JsonController,
    Post,
    Put,
    Delete,
    Get,
    Param,
    Body,
    Req,
    Res,
    QueryParams,
    UseBefore,
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
import { ThankYouSlip } from "../../entity/ThankyouSlip";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { CreateThankYouSlipDto, UpdateThankYouSlipRatingDto } from "../../dto/mobile/ThankYouSlip.dto";
import { NotificationService } from "../../services/notification.service";
import { Member } from "../../entity/Member";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/thank-you-slip")
export class ThankyouSlipController {
    private thankyouRepo = AppDataSource.getMongoRepository(ThankYouSlip);
    private pointsRepo = AppDataSource.getMongoRepository(Points);
    private userPointsRepo = AppDataSource.getMongoRepository(UserPoints);
    private historyRepo = AppDataSource.getMongoRepository(UserPointHistory);
    private memberRepository = AppDataSource.getMongoRepository(Member);
    private readonly notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService(); // ✅ FIXED
    }
    @Post("/")
    async createThankyouSlip(
        @Body() body: CreateThankYouSlipDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const slip = new ThankYouSlip();
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
            // slip.comments = body.comments;
            slip.thankTo = new ObjectId(body.thankTo);
            slip.businessType = body.businessType;
            slip.referralType = body.referralType;
            slip.amount = body.amount;
            slip.isActive = 1;
            slip.isDelete = 0;
            slip.createdBy = new ObjectId(req.user.userId);
            slip.updatedBy = new ObjectId(req.user.userId);

            const saved = await this.thankyouRepo.save(slip);

            // --- Points Allocation ---
            const pointConfig = await this.pointsRepo.findOne({
                where: { key: "thank_you_notes", isActive: 1, isDelete: 0 }
            });

            if (pointConfig) {
                const userId = new ObjectId(req.user.userId);

                await this.userPointsRepo.updateOne(
                    { userId, pointKey: "thank_you_notes" },
                    { $inc: { value: pointConfig.value } },
                    { upsert: true }
                );

                await this.historyRepo.save({
                    userId,
                    pointKey: "thank_you_notes",
                    change: pointConfig.value,
                    source: "THANK_YOU_NOTE",
                    sourceId: saved._id,
                    remarks: "Thank You Slip logged",
                    createdAt: new Date()
                });
            }
            await this.notificationService.createNotification({
                moduleName: "THANKYOU_SLIP",
                moduleId: saved._id,
                createdBy: req.user.userId,
                subject: "New Thank You Slip Received",
                content: ` You have received a new thank you slip from ${member.fullName}.`,
                model: "Member",
                memberId: body.thankTo,
                actionType: "APPROVE"
            });
            return response(
                res,
                StatusCodes.CREATED,
                "Thank You Slip created successfully",
                saved
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async listBusiness(
        @QueryParams() query: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        const page = Math.max(Number(query.page) || 0, 0);
        const limit = Math.max(Number(query.limit) || 10, 1);
        const search = query.search?.toString();
        const filterBy = query.filterBy?.toString();
        const userId = new ObjectId(req.user.userId);

        const match: any = { isDelete: 0 };

        if (search) {
            match.$or = [
                { comments: { $regex: search, $options: "i" } }
            ];
        }

        if (filterBy === "given") {
            match.createdBy = userId;
        }

        if (filterBy === "received") {
            match.thankTo = userId;
        }

        const pipeline = [
            { $match: match },
            {
                $lookup: {
                    from: "member",
                    let: { memberId: "$createdBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
                        {
                            $lookup: {
                                from: "businesscategories",
                                localField: "businessCategory",
                                foreignField: "_id",
                                as: "category"
                            }
                        },
                        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "chapters",
                                localField: "chapter",
                                foreignField: "_id",
                                as: "chapterDetails"
                            }
                        },
                        { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 0,
                                fullName: 1,
                                profileImage: 1,
                                businessCategory: "$category.name",
                                companyName: 1,
                                chapterName: "$chapterDetails.chapterName"
                            }
                        }
                    ],
                    as: "member"
                }
            },
            { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "member",
                    let: { thankToId: "$thankTo" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$thankToId"] } } },
                        {
                            $lookup: {
                                from: "businesscategories",
                                localField: "businessCategory",
                                foreignField: "_id",
                                as: "category"
                            }
                        },
                        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: "chapters",
                                localField: "chapter",
                                foreignField: "_id",
                                as: "chapterDetails"
                            }
                        },
                        { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 0,
                                fullName: 1,
                                profileImage: 1,
                                businessCategory: "$category.name",
                                companyName: 1,
                                chapterName: "$chapterDetails.chapterName"
                            }
                        }
                    ],
                    as: "thankToMember"
                }
            },
            { $unwind: { path: "$thankToMember", preserveNullAndEmptyArrays: true } },

            {
                $addFields: {
                    hasFeedback: {
                        $gt: [{ $ifNull: ["$ratings", 0] }, 0]
                    }
                }
            },

            {
                $project: {
                    businessType: 1,
                    referralType: 1,
                    comments: 1,
                    amount: 1,
                    ratings: 1,
                    hasFeedback: 1,
                    createdAt: 1,
                    thankedBy: "$member",
                    thankYouTo: "$thankToMember"
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

        const [result] = await this.thankyouRepo.aggregate(pipeline).toArray();

        const data = result?.data || [];
        const total = result?.meta?.[0]?.total || 0;

        return pagination(total, data, limit, page, res);
    }

    @Get("/details/:id")
    async getBusinessDetails(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ID"
                });
            }

            const _id = new ObjectId(id);

            const pipeline = [
                {
                    $match: {
                        _id,
                        isDelete: 0
                    }
                },
                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$createdBy" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
                            {
                                $lookup: {
                                    from: "businesscategories",
                                    localField: "businessCategory",
                                    foreignField: "_id",
                                    as: "category"
                                }
                            },
                            { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "chapters",
                                    localField: "chapter",
                                    foreignField: "_id",
                                    as: "chapterDetails"
                                }
                            },
                            { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 0,
                                    fullName: 1,
                                    profileImage: 1,
                                    businessCategory: "$category.name",
                                    companyName: 1,
                                    chapterName: "$chapterDetails.chapterName"
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "member",
                        let: { thankToId: "$thankTo" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$thankToId"] } } },
                            {
                                $lookup: {
                                    from: "businesscategories",
                                    localField: "businessCategory",
                                    foreignField: "_id",
                                    as: "category"
                                }
                            },
                            { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: "chapters",
                                    localField: "chapter",
                                    foreignField: "_id",
                                    as: "chapterDetails"
                                }
                            },
                            { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
                            {
                                $project: {
                                    _id: 0,
                                    fullName: 1,
                                    profileImage: 1,
                                    businessCategory: "$category.name",
                                    companyName: 1,
                                    chapterName: "$chapterDetails.chapterName"
                                }
                            }
                        ],
                        as: "thankToMember"
                    }
                },
                { $unwind: { path: "$thankToMember", preserveNullAndEmptyArrays: true } },

                {
                    $project: {
                        businessType: 1,
                        referralType: 1,
                        comments: 1,
                        amount: 1,
                        ratings: 1,
                        createdAt: 1,
                        thankedBy: "$member",
                        thankYouTo: "$thankToMember"
                    }
                }
            ];

            const result = await this.thankyouRepo.aggregate(pipeline).toArray();

            if (!result.length) {
                return res.status(404).json({
                    success: false,
                    message: "Details not found"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Details fetched successfully",
                data: result[0]
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    @Patch("/ratings/:id")
    async updateThankyouSlipRating(
        @Req() req: any,
        @Param("id") id: string,
        @Body() body: UpdateThankYouSlipRatingDto,
        @Res() res: Response
    ) {
        try {
            const thankyouId = new ObjectId(id);
            const userId = new ObjectId(req.user.userId);

            const thankyou = await this.thankyouRepo.findOne({
                where: {
                    _id: thankyouId,
                    isDelete: 0
                }
            });

            if (!thankyou) {
                return response(
                    res,
                    StatusCodes.NOT_FOUND,
                    "Thank you slip not found"
                );
            }

            if (
                !thankyou.thankTo.equals(userId) &&
                !thankyou.createdBy.equals(userId)
            ) {
                return response(
                    res,
                    StatusCodes.FORBIDDEN,
                    "You are not allowed to update this thank you slip"
                );
            }

            await this.thankyouRepo.updateOne(
                { _id: thankyouId },
                {
                    $set: {
                        ratings: body.ratings,
                        comments: body.comments,
                        updatedAt: new Date()
                    }
                }
            );
            await this.notificationService.createNotification({
                moduleName: "TESTIMONIAL",
                moduleId: thankyouId,
                createdBy: req.user.userId,
                subject: "Thank You Slip Rated",
                content: `Your thank you slip has been rated with ${body.ratings} stars. Comments: ${body.comments || '-'}`,
                model: "Member",
                memberId: thankyou.createdBy,
                actionType: "APPROVE"
            });
            return response(
                res,
                StatusCodes.OK,
                "Thank you slip rating updated successfully"
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Patch("/:id")
    async updateThankYouSlip(
        @Param("id") id: string,
        @Body() body: Partial<ThankYouSlip>,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const slipId = new ObjectId(id);

            const existingSlip = await this.thankyouRepo.findOne({
                where: { _id: slipId, isDelete: 0 }
            });

            if (!existingSlip) {
                return response(res, StatusCodes.NOT_FOUND, "Thank You Slip not found");
            }

            const updateData: any = {};

            const allowedFields = [
                "thankTo",
                "businessType",
                "referralType",
                "amount",
                "ratings",
                "comments"
            ];

            for (const key of allowedFields) {
                if (body[key] !== undefined && body[key] !== null) {
                    updateData[key] = body[key];
                }
            }

            if (updateData.thankTo) {
                updateData.thankTo = new ObjectId(updateData.thankTo);
            }
            updateData.updatedBy = new ObjectId(req.user.userId);
            updateData.updatedAt = new Date();

            const result = await this.thankyouRepo.updateOne(
                { _id: slipId },
                { $set: updateData }
            );

            return response(
                res,
                StatusCodes.OK,
                "Thank You Slip updated successfully",
                result
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

}
