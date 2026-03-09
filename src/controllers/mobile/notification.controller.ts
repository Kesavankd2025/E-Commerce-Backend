import {
    JsonController,
    Post,
    Body,
    Req,
    Res,
    UseBefore,
    Get,
    QueryParams,
    Patch,
    Param
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { pagination } from "../../utils";
import { Notifications } from "../../entity/Notification";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/notification")
export class NotificationController {
    private notificationRepo = AppDataSource.getMongoRepository(Notifications);

    @Get('/list')
    async listNotification(
        @QueryParams() query: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        const page = Math.max(Number(query.page) || 0, 0);
        const limit = Math.max(Number(query.limit) || 10, 1);
        const userId = new ObjectId(req.user.userId);

        const match: any = {
            isDelete: 0,
            receiverId: userId
        };

        if (query.search) {
            const s = query.search.toString();
            match.$or = [
                { subject: { $regex: s, $options: "i" } },
                { content: { $regex: s, $options: "i" } }
            ];
        }

        if (query.moduleType) {
            const type = query.moduleType.toString();

            if (type === "general") {
                match.moduleName = { $in: ["121", "THANKYOU_SLIP", "REFERRAL", "CHIEF_GUEST", "CONNECTION_REQ", 'POWER_MEET', 'TESTIMONIAL', 'BADGE', 'TRAINING'] };
            } else {
                match.moduleName = type;
            }
        }
        const pipeline: any = [
            {
                $match: match
            },
            {
                $lookup: {
                    from: "member",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "senderDetails"
                }
            },
            { $unwind: { path: "$senderDetails", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "chiefguests",
                    localField: "moduleId",
                    foreignField: "_id",
                    as: "chiefGuestData"
                }
            },
            { $unwind: { path: "$chiefGuestData", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "referrals",
                    localField: "moduleId",
                    foreignField: "_id",
                    as: "referrals"
                }
            },
            { $unwind: { path: "$referrals", preserveNullAndEmptyArrays: true } },

            // -----------------------------------------------------------
            // 🔹 THANK YOU LOOKUP (FILTER BY LOGGED USER)
            // -----------------------------------------------------------
            {
                $lookup: {
                    from: "thank_you_slips",
                    let: { moduleId: "$moduleId", loggedInUser: userId },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$moduleId"] },
                                        { $eq: ["$thankTo", "$$loggedInUser"] } // correct for single ID
                                    ]
                                }
                            }
                        }
                    ],
                    as: "thankYouData"
                }
            },

            {
                $unwind: {
                    path: "$thankYouData",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "power_date",
                    let: { moduleId: "$moduleId", loggedInUser: userId },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$moduleId"] },
                                        { $in: ["$$loggedInUser", "$members"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "powerDates"
                }
            },
            {
                $unwind: {
                    path: "$powerDates",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "thank_you_slips",
                    let: { moduleId: "$moduleId", loggedInUser: userId },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$moduleId"] },
                                        { $eq: ["$createdBy", "$$loggedInUser"] }  // ✔ Correct variable usage
                                    ]
                                }
                            }
                        }
                    ],
                    as: "testimonials"
                }
            },
            {
                $unwind: {
                    path: "$testimonials",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "one_to_one_meetings",
                    localField: "moduleId",
                    foreignField: "_id",
                    as: "oneTwoOneData"
                }
            },
            { $unwind: { path: "$oneTwoOneData", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "star_updates",
                    localField: "moduleId",
                    foreignField: "_id",
                    as: "starUpdateData"
                }
            },
            { $unwind: { path: "$starUpdateData", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "training",
                    localField: "moduleId",
                    foreignField: "_id",
                    as: "trainingData"
                }
            },
            { $unwind: { path: "$trainingData", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "badges",
                    localField: "moduleId",
                    foreignField: "_id",
                    as: "badgeData"
                }
            },
            { $unwind: { path: "$badgeData", preserveNullAndEmptyArrays: true } },

            // -----------------------------------------------------------
            // 🔹 CONNECTION REQUEST LOOKUP
            // -----------------------------------------------------------
            {
                $lookup: {
                    from: "connection_request",
                    let: { moduleId: "$moduleId", loggedInUser: userId },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$_id", "$$moduleId"] },
                                        {
                                            $or: [
                                                { $eq: ["$createdBy", "$$loggedInUser"] },
                                                { $eq: ["$memberId", "$$loggedInUser"] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "connectionReqs"
                }
            },
            {
                $unwind: {
                    path: "$connectionReqs",
                    preserveNullAndEmptyArrays: true
                }
            },

            // -----------------------------------------------------------
            // 🔹 MERGE MODULE DETAILS
            // -----------------------------------------------------------
            {
                $addFields: {
                    moduleDetails: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$moduleName", "CHIEF_GUEST"] }, then: "$chiefGuestData" },
                                { case: { $eq: ["$moduleName", "THANKYOU_SLIP"] }, then: "$thankYouData" },
                                { case: { $eq: ["$moduleName", "121"] }, then: "$oneTwoOneData" },
                                { case: { $eq: ["$moduleName", "CONNECTION_REQ"] }, then: "$connectionReqs" },
                                { case: { $eq: ["$moduleName", "REFERRAL"] }, then: "$referrals" },
                                { case: { $eq: ["$moduleName", "POWER_MEET"] }, then: "$powerDates" },
                                { case: { $eq: ["$moduleName", "TESTIMONIAL"] }, then: "$testimonials" },
                                { case: { $eq: ["$moduleName", "STAR_UPDATE"] }, then: "$starUpdateData" },
                                { case: { $eq: ["$moduleName", "TRAINING"] }, then: "$trainingData" },
                                { case: { $eq: ["$moduleName", "BADGE"] }, then: "$badgeData" }
                            ],
                            default: null
                        }
                    },
                    profilePhoto: {
                        $cond: {
                            if: { $eq: ["$moduleName", "BADGE"] },
                            then: "$badgeData.badgeImage",
                            else: {
                                $cond: {
                                    if: { $eq: ["$moduleName", "TRAINING"] },
                                    then: "$trainingData.trainingImage",
                                    else: "$senderDetails.profileImage"
                                }
                            }
                        }
                    }
                }
            },
            {
                $match: {
                    $or: [
                        { moduleName: { $ne: "THANKYOU_SLIP" } },   // allow all other notifications
                        { thankYouData: { $ne: null } }             // allow THANKYOU only if matched to user
                    ]
                }
            },
            {
                $match: {
                    $or: [
                        { moduleName: { $ne: "POWER_MEET" } },
                        { powerDates: { $ne: null } }
                    ]
                }
            },
            {
                $match: {
                    $or: [
                        { moduleName: { $ne: "TESTIMONIAL" } },
                        { testimonials: { $ne: null } }
                    ]
                }
            },

            // -----------------------------------------------------------
            // 🔹 CLEANUP
            // -----------------------------------------------------------
            {
                $project: {
                    chiefGuestData: 0,
                    thankYouData: 0,
                    oneTwoOneData: 0,
                    connectionReqs: 0,
                    referrals: 0,
                    powerDates: 0,
                    testimonials: 0,
                    starUpdateData: 0,
                    trainingData: 0,
                    badgeData: 0,
                    senderDetails: 0
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


        const [result] = await this.notificationRepo.aggregate(pipeline).toArray();

        const data = result?.data || [];
        const total = result?.meta?.[0]?.total || 0;

        return pagination(total, data, limit, page, res);
    }

    @Patch("/read/:id")
    async markAsRead(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const notificationId = new ObjectId(id);
            const userId = new ObjectId(req.user.userId);

            const notification = await this.notificationRepo.findOne({
                where: {
                    _id: notificationId,
                    receiverId: userId,
                    isDelete: 0
                }
            });

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: "Notification not found"
                });
            }

            notification.isRead = true;
            notification.updatedBy = userId;

            await this.notificationRepo.save(notification);

            return res.status(200).json({
                success: true,
                message: "Notification marked as read"
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Something went wrong",
                error: error.message
            });
        }
    }
}