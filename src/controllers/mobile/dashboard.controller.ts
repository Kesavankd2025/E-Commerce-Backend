import {
    JsonController,
    UseBefore,
    Get,
    Req,
    Res,
    QueryParams
} from "routing-controllers";
import { Request } from "express";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { Member } from "../../entity/Member";
import { Meeting } from "../../entity/Meeting";
import response from "../../utils/response";
import { handleErrorResponse, pagination } from "../../utils";
import { StatusCodes } from "http-status-codes";
import { Referral } from "../../entity/Referral";
import { ThankYouSlip } from "../../entity/ThankyouSlip";
import { OneToOneMeeting } from "../../entity/121's";
import { Visitor } from "../../entity/Visitor";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/dashboard-apis")
export class DashBoardController {
    private memberRepo = AppDataSource.getMongoRepository(Member);
    private meetingRepo = AppDataSource.getMongoRepository(Meeting);
    private refRepo = AppDataSource.getMongoRepository(Referral);
    private thankYouRepo = AppDataSource.getMongoRepository(ThankYouSlip);
    private onetooneRepo = AppDataSource.getMongoRepository(OneToOneMeeting);
    private visitorRepo = AppDataSource.getMongoRepository(Visitor);
    @Get("/chapter-members-contribution-counts")
    async getChapterMembersCounts(@Req() req: RequestWithUser) {
        try {
            const userId = new ObjectId(req.user.userId);

            const currentMember = await this.memberRepo.findOne({
                where: {
                    _id: userId,
                    isActive: 1,
                    isDelete: 0
                },
                select: ["chapter"]
            });

            if (!currentMember?.chapter) {
                return {
                    success: false,
                    message: "Member or chapter not found"
                };
            }

            const chapterId: ObjectId = currentMember.chapter;

            /* ------------------------------------------------------------------
             *  DETERMINE MEETING CYCLE DATE RANGE
             * ------------------------------------------------------------------ */
            const now = new Date();
            let startDate: Date | null = null;
            let endDate: Date | null = null;

            // 1. Find the UPCOMING meeting (Next meeting)
            const upcomingMeeting = await this.meetingRepo.findOne({
                where: {
                    chapters: { $in: [chapterId] },
                    endDateTime: { $gte: now },
                    isDelete: 0,
                    isActive: 1
                },
                order: { startDateTime: "ASC" }
            });

            if (upcomingMeeting) {
                endDate = upcomingMeeting.endDateTime;
                const previousMeeting = await this.meetingRepo.findOne({
                    where: {
                        chapters: { $in: [chapterId] },
                        endDateTime: { $lt: upcomingMeeting.endDateTime },
                        isDelete: 0,
                        isActive: 1
                    },
                    order: { endDateTime: "DESC" }
                });

                if (previousMeeting) {
                    startDate = previousMeeting.endDateTime;
                }
            } else {
                const lastMeeting = await this.meetingRepo.findOne({
                    where: {
                        chapters: { $in: [chapterId] },
                        endDateTime: { $lt: now },
                        isDelete: 0,
                        isActive: 1
                    },
                    order: { endDateTime: "DESC" }
                });

                if (lastMeeting) {
                    startDate = lastMeeting.endDateTime;
                }
                endDate = now;
            }
            const dateMatch: any = {};
            if (startDate) {
                dateMatch.$gt = startDate;
            }
            if (endDate) {
                dateMatch.$lte = endDate;
            }
            const matchQuery = Object.keys(dateMatch).length > 0 ? { createdAt: dateMatch } : {};

            /* ------------------------------------------------------------------
             *  AGGREGATION
             * ------------------------------------------------------------------ */
            const aggResult = await this.memberRepo.aggregate([
                {
                    $match: {
                        chapter: chapterId,
                        isActive: 1,
                        isDelete: 0
                    }
                },

                {
                    $facet: {
                        // ✔ Count members (Total active members in chapter, static)
                        totalMembers: [{ $count: "count" }],

                        // ✔ Visitors count
                        visitors: [
                            {
                                $lookup: {
                                    from: "visitors",
                                    let: { memberId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: { $eq: ["$createdBy", "$$memberId"] },
                                                isActive: 1,
                                                isDelete: 0,
                                                ...matchQuery
                                            }
                                        }
                                    ],
                                    as: "d"
                                }
                            },
                            { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                        ],

                        thankYouSlips: [
                            {
                                $lookup: {
                                    from: "thank_you_slips",
                                    let: { memberId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: { $eq: ["$thankTo", "$$memberId"] },
                                                isActive: 1,
                                                isDelete: 0,
                                                ...matchQuery
                                            }
                                        },
                                        { $project: { amount: 1 } } // Extract amount field
                                    ],
                                    as: "d"
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: { $size: "$d" } },
                                    totalAmount: { $sum: { $sum: "$d.amount" } }
                                }
                            }
                        ],

                        // ✔ Referrals count
                        referrals: [
                            {
                                $lookup: {
                                    from: "referrals",
                                    let: { memberId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $or: [
                                                        // { $eq: ["$toMemberId", "$$memberId"] },
                                                        { $eq: ["$fromMemberId", "$$memberId"] }
                                                    ]
                                                },
                                                isDelete: 0,
                                                ...matchQuery
                                            }
                                        }
                                    ],
                                    as: "d"
                                }
                            },
                            { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                        ],

                        // ✔ One to one meetings
                        oneToOneMeetings: [
                            {
                                $lookup: {
                                    from: "one_to_one_meetings",
                                    let: { memberId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $or: [
                                                        { $eq: ["$createdBy", "$$memberId"] },
                                                        { $eq: ["$meetingWithMemberId", "$$memberId"] }
                                                    ]
                                                },
                                                isActive: 1,
                                                isDelete: 0,
                                                ...matchQuery
                                            }
                                        },
                                        { $project: { _id: 1 } }
                                    ],
                                    as: "d"
                                }
                            },
                            { $unwind: "$d" },
                            { $group: { _id: "$d._id" } },
                            { $count: "count" }
                        ],


                        // ✔ Mobile Chief Guest
                        mobileChiefGuest: [
                            {
                                $lookup: {
                                    from: "mobile_chief_guest",
                                    let: { memberId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: { $eq: ["$createdBy", "$$memberId"] },
                                                isActive: 1,
                                                isDelete: 0,
                                                ...matchQuery
                                            }
                                        }
                                    ],
                                    as: "d"
                                }
                            },
                            { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                        ],

                        // ✔ Power Date
                        powerDate: [
                            {
                                $lookup: {
                                    from: "power_date",
                                    let: { memberId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $or: [
                                                        { $eq: ["$createdBy", "$$memberId"] },
                                                        { $in: ["$$memberId", "$members"] } // ✅ correct order
                                                    ]
                                                },
                                                isActive: 1,
                                                isDelete: 0,
                                                ...matchQuery
                                            }
                                        }
                                    ],
                                    as: "d"
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: { $size: "$d" } }
                                }
                            }
                        ]

                    }
                }
            ]).toArray();

            const r = aggResult[0] || {};

            const counts = {
                visitors: r.visitors?.[0]?.count || 0,

                thankYouSlips: r.thankYouSlips?.[0]?.count || 0,
                thankYouTotalAmount: r.thankYouSlips?.[0]?.totalAmount || 0,

                referrals: r.referrals?.[0]?.count || 0,
                oneToOneMeetings: r.oneToOneMeetings?.[0]?.count || 0,
                mobileChiefGuest: r.mobileChiefGuest?.[0]?.count || 0,
                powerDate: r.powerDate?.[0]?.count || 0
            };

            return {
                success: true,
                data: {
                    chapterId: chapterId,
                    totalMembers: r.totalMembers?.[0]?.count || 0,
                    counts: {
                        ...counts,
                        total: Object.values(counts).reduce((a, b) => a + b, 0)
                    }
                }
            };

        } catch (error) {
            console.error("Dashboard aggregation error:", error);
            return {
                success: false,
                message: "Failed to fetch chapter contribution counts"
            };
        }
    }


    @Get("/login-member-contribution-counts")
    async getLoginMemberContributionCounts(
        @Req() req: RequestWithUser,
        @QueryParams() query: any
    ) {
        try {
            const memberId = new ObjectId(req.user.userId);

            const period = query.filter || "overall";

            const now = new Date();
            const currentYear = now.getFullYear();
            let startDate: Date | null = null;
            let endDate: Date = new Date();

            if (period && period !== "overall") {
                if (period === "current_month" || period === "1_month") {
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                } else if (period === "tenure_1") {
                    startDate = new Date(currentYear, 0, 1);
                    endDate = new Date(currentYear, 5, 30, 23, 59, 59, 999);
                } else if (period === "tenure_2") {
                    startDate = new Date(currentYear, 6, 1);
                    endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
                } else if (period === "one_year" || period === "1_year") {
                    startDate = new Date(currentYear, 0, 1);
                    endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
                } else if (period === "week") {
                    const today = new Date();
                    const day = today.getDay();
                    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                    startDate = new Date(today.getFullYear(), today.getMonth(), diff);
                } else if (period === "3_month") {
                    startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                }
            }

            const dateMatch = startDate
                ? { createdAt: { $gte: startDate, $lte: endDate } }
                : {};

            const aggResult = await this.memberRepo
                .aggregate([
                    {
                        $match: {
                            _id: memberId,
                            isActive: 1,
                            isDelete: 0
                        }
                    },
                    {
                        $facet: {
                            visitors: [
                                {
                                    $lookup: {
                                        from: "visitors",
                                        let: { memberId: "$_id" },
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$createdBy", "$$memberId"] },
                                                            { $eq: ["$isActive", 1] },
                                                            { $eq: ["$isDelete", 0] }
                                                        ]
                                                    },
                                                    ...dateMatch
                                                }
                                            }
                                        ],
                                        as: "d"
                                    }
                                },
                                { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                            ],

                            thankYouSlips: [
                                {
                                    $lookup: {
                                        from: "thank_you_slips",
                                        let: { memberId: "$_id" },
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$isActive", 1] },
                                                            { $eq: ["$isDelete", 0] },
                                                            {
                                                                $or: [
                                                                    { $eq: ["$createdBy", "$$memberId"] },
                                                                    { $eq: ["$thankTo", "$$memberId"] }
                                                                ]
                                                            }
                                                        ]
                                                    },
                                                    ...dateMatch
                                                }
                                            },
                                            {
                                                $group: {
                                                    _id: null,
                                                    sentCount: {
                                                        $sum: {
                                                            $cond: [{ $eq: ["$createdBy", "$$memberId"] }, 1, 0]
                                                        }
                                                    },
                                                    receivedCount: {
                                                        $sum: {
                                                            $cond: [{ $eq: ["$thankTo", "$$memberId"] }, 1, 0]
                                                        }
                                                    },
                                                    businessGiven: {
                                                        $sum: {
                                                            $cond: [{ $eq: ["$thankTo", "$$memberId"] }, "$amount", 0]
                                                        }
                                                    },
                                                    businessReceived: {
                                                        $sum: {
                                                            $cond: [{ $eq: ["$createdBy", "$$memberId"] }, "$amount", 0]
                                                        }
                                                    }
                                                }
                                            }
                                        ],
                                        as: "d"
                                    }
                                },
                                {
                                    $group: {
                                        _id: null,
                                        sentCount: { $sum: { $ifNull: [{ $arrayElemAt: ["$d.sentCount", 0] }, 0] } },
                                        receivedCount: { $sum: { $ifNull: [{ $arrayElemAt: ["$d.receivedCount", 0] }, 0] } },
                                        businessGiven: { $sum: { $ifNull: [{ $arrayElemAt: ["$d.businessGiven", 0] }, 0] } },
                                        businessReceived: { $sum: { $ifNull: [{ $arrayElemAt: ["$d.businessReceived", 0] }, 0] } }
                                    }
                                }
                            ],

                            referrals: [
                                {
                                    $lookup: {
                                        from: "referrals",
                                        let: { memberId: "$_id" },
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$fromMemberId", "$$memberId"] },
                                                            { $eq: ["$isDelete", 0] }
                                                        ]
                                                    },
                                                    ...dateMatch
                                                }
                                            }
                                        ],
                                        as: "d"
                                    }
                                },
                                { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                            ],

                            oneToOneMeetings: [
                                {
                                    $lookup: {
                                        from: "one_to_one_meetings",
                                        let: { memberId: "$_id" },
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            {
                                                                $or: [
                                                                    { $eq: ["$createdBy", "$$memberId"] },
                                                                    { $eq: ["$meetingWithMemberId", "$$memberId"] }
                                                                ]
                                                            },
                                                            { $eq: ["$isActive", 1] },
                                                            { $eq: ["$isDelete", 0] }
                                                        ]
                                                    },
                                                    ...dateMatch
                                                }
                                            }
                                        ],
                                        as: "d"
                                    }
                                },
                                { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                            ],

                            mobileChiefGuest: [
                                {
                                    $lookup: {
                                        from: "mobile_chief_guest",
                                        let: { memberId: "$_id" },
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$createdBy", "$$memberId"] },
                                                            { $eq: ["$isActive", 1] },
                                                            { $eq: ["$isDelete", 0] }
                                                        ]
                                                    },
                                                    ...dateMatch
                                                }
                                            }
                                        ],
                                        as: "d"
                                    }
                                },
                                { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                            ],

                            powerDate: [
                                {
                                    $lookup: {
                                        from: "power_date",
                                        let: { memberId: "$_id" },
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$createdBy", "$$memberId"] },
                                                            { $eq: ["$isActive", 1] },
                                                            { $eq: ["$isDelete", 0] }
                                                        ]
                                                    },
                                                    ...dateMatch
                                                }
                                            }
                                        ],
                                        as: "d"
                                    }
                                },
                                { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                            ],

                            training: [
                                {
                                    $lookup: {
                                        from: "attendance",
                                        let: { memberId: "$_id" },
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $and: [
                                                            { $eq: ["$memberId", "$$memberId"] },
                                                            { $eq: ["$sourceType", "TRAINING"] },
                                                            { $eq: ["$status", "present"] },
                                                            { $eq: ["$isActive", 1] },
                                                            { $eq: ["$isDelete", 0] }
                                                        ]
                                                    },
                                                    ...dateMatch
                                                }
                                            },
                                            {
                                                $lookup: {
                                                    from: "training_participants",
                                                    let: {
                                                        trainingId: "$sourceId",
                                                        memberId: "$memberId"
                                                    },
                                                    pipeline: [
                                                        {
                                                            $match: {
                                                                $expr: {
                                                                    $and: [
                                                                        { $eq: ["$trainingId", "$$trainingId"] },
                                                                        { $eq: ["$memberId", "$$memberId"] },
                                                                        { $eq: ["$status", "Approved"] },
                                                                        { $eq: ["$paymentStatus", "Paid"] },
                                                                        { $eq: ["$isActive", 1] },
                                                                        { $eq: ["$isDelete", 0] }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    ],
                                                    as: "participant"
                                                }
                                            },
                                            {
                                                $match: {
                                                    $expr: { $gt: [{ $size: "$participant" }, 0] }
                                                }
                                            }
                                        ],
                                        as: "d"
                                    }
                                },
                                { $group: { _id: null, count: { $sum: { $size: "$d" } } } }
                            ]

                        }
                    }
                ])
                .toArray();

            const r = aggResult[0] || {};
            const TY = r.thankYouSlips?.[0] || {};

            return {
                success: true,
                data: {
                    memberId: memberId,
                    counts: {
                        visitors: r.visitors?.[0]?.count || 0,
                        thankYouSlipsSent: TY.sentCount || 0,
                        businessGivenAmount: TY.businessGiven || 0,
                        thankYouSlipsReceived: TY.receivedCount || 0,
                        businessReceivedAmount: TY.businessReceived || 0,
                        referrals: r.referrals?.[0]?.count || 0,
                        oneToOneMeetings: r.oneToOneMeetings?.[0]?.count || 0,
                        mobileChiefGuest: r.mobileChiefGuest?.[0]?.count || 0,
                        powerDate: r.powerDate?.[0]?.count || 0,
                        training: r.training?.[0]?.count || 0
                    }
                }
            };

        } catch (error) {
            console.error("Login contribution aggregation error:", error);
            return {
                success: false,
                message: "Failed to fetch login member contribution counts"
            };
        }
    }


    @Get("/upcoming/meeting")
    async upcomingMeetingForMyChapter(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const currentUserId = new ObjectId(req.user.userId);

            const currentMember = await this.memberRepo.findOne({
                where: {
                    _id: currentUserId,
                    isActive: 1,
                    isDelete: 0
                },
                select: ["chapter"]
            });

            if (!currentMember?.chapter) {
                return {
                    success: false,
                    message: "Member or chapter not found"
                };
            }

            const chapterId = new ObjectId(
                currentMember.chapter
            );

            const pipeline = [
                {
                    $match: {
                        isDelete: 0,
                        isActive: 1,
                        chapters: { $in: [chapterId] },
                        endDateTime: { $gte: new Date() }
                    }
                },
                {
                    $sort: { startDateTime: 1 }
                },
                {
                    $limit: 1
                },
                {
                    $lookup: {
                        from: "chapters",
                        localField: "chapters",
                        foreignField: "_id",
                        as: "chapters"
                    }
                },
                {
                    $lookup: {
                        from: "meeting_chief_guest",
                        let: { meetingId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$meetingId", "$$meetingId"] },
                                            { $eq: ["$status", "assigned"] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "assignedGuests"
                    }
                },
                {
                    $lookup: {
                        from: "mobile_chief_guest",
                        let: { guestIds: "$assignedGuests.chiefGuestId" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$guestIds"] } } },
                            { $project: { chiefGuestName: 1 } }
                        ],
                        as: "mobileGuests"
                    }
                },
                {
                    $lookup: {
                        from: "chief_guests",
                        let: { guestIds: "$assignedGuests.chiefGuestId" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$guestIds"] } } },
                            { $project: { chiefGuestName: 1 } }
                        ],
                        as: "adminGuests"
                    }
                },
                {
                    $addFields: {
                        chiefGuestNames: {
                            $concatArrays: [
                                { $map: { input: "$mobileGuests", as: "g", in: "$$g.chiefGuestName" } },
                                { $map: { input: "$adminGuests", as: "g", in: "$$g.chiefGuestName" } }
                            ]
                        }
                    }
                },
                {
                    $addFields: {
                        chiefGuestName: { $arrayElemAt: ["$chiefGuestNames", 0] }
                    }
                },
                {
                    $project: {
                        assignedGuests: 0,
                        mobileGuests: 0,
                        adminGuests: 0,
                        chiefGuestNames: 0
                    }
                }
            ];

            const result = await this.meetingRepo
                .aggregate(pipeline)
                .toArray();

            return response(
                res,
                StatusCodes.OK,
                "Upcoming meeting fetched successfully",
                result[0] || null
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Get('/module-count')
    async getReferralGivenReceivedCount(
        @Req() req: RequestWithUser,
        @QueryParams() query: any
    ) {
        try {
            const memberId = new ObjectId(req.user.userId);

            /* -----------------------------------------
             * DATE FILTER (CALENDAR BASED)
             * ----------------------------------------- */
            const filter = query.filter || "overall";
            const now = new Date();
            const endDate = new Date();
            let startDate: Date | null = null;

            switch (filter) {
                case "week": {
                    const today = new Date();
                    const day = today.getDay();
                    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                    startDate = new Date(today.getFullYear(), today.getMonth(), diff);
                    break;
                }
                case "1_month":
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;

                case "3_month":
                    startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    break;

                case "6_month":
                    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                    break;

                case "1_year":
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;

                default:
                    startDate = null;
            }

            const dateMatch = startDate
                ? {
                    createdAt: {
                        $gte: startDate,
                        $lte: endDate
                    }
                }
                : {};

            /* -----------------------------------------
             * REFERRALS (GIVEN / RECEIVED)
             * ----------------------------------------- */
            const referralAgg = await this.refRepo.aggregate([
                {
                    $match: {
                        isDelete: 0,
                        ...dateMatch,
                        $or: [
                            { fromMemberId: memberId },
                            { toMemberId: memberId }
                        ]
                    }
                },
                {
                    $group: {
                        _id: null,
                        given: {
                            $sum: {
                                $cond: [{ $eq: ["$fromMemberId", memberId] }, 1, 0]
                            }
                        },
                        received: {
                            $sum: {
                                $cond: [{ $eq: ["$toMemberId", memberId] }, 1, 0]
                            }
                        }
                    }
                }
            ]).toArray();

            const referralSlip = referralAgg[0] || { given: 0, received: 0 };

            /* -----------------------------------------
             * THANK YOU SLIPS
             * ----------------------------------------- */
            const thankYouAgg = await this.thankYouRepo.aggregate([
                {
                    $match: {
                        isActive: 1,
                        isDelete: 0,
                        ...dateMatch,
                        $or: [
                            { createdBy: memberId },
                            { thankTo: memberId }
                        ]
                    }
                },
                {
                    $group: {
                        _id: null,
                        given: {
                            $sum: {
                                $cond: [{ $eq: ["$createdBy", memberId] }, 1, 0]
                            }
                        },
                        received: {
                            $sum: {
                                $cond: [{ $eq: ["$thankTo", memberId] }, 1, 0]
                            }
                        },
                        givenAmount: {
                            $sum: {
                                $cond: [{ $eq: ["$thankTo", memberId] }, "$amount", 0]
                            }
                        },
                        receivedAmount: {
                            $sum: {
                                $cond: [{ $eq: ["$createdBy", memberId] }, "$amount", 0]
                            }
                        }
                    }
                }
            ]).toArray();

            const thankYouSlip = thankYouAgg[0] || {
                given: 0,
                received: 0,
                givenAmount: 0,
                receivedAmount: 0
            };

            /* -----------------------------------------
             * ONE-TO-ONE MEETINGS
             * ----------------------------------------- */
            const oneToOneAgg = await this.onetooneRepo.aggregate([
                {
                    $match: {
                        isActive: 1,
                        isDelete: 0,
                        ...dateMatch,
                        $or: [
                            { initiatedById: memberId },
                            { meetingWithMemberId: memberId },
                            { createdBy: memberId }
                        ]
                    }
                },
                {
                    $group: {
                        _id: null,

                        // SAME AS initiatedBy === SELF
                        initiatedByMe: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$initiatedById", memberId] },
                                    1,
                                    0
                                ]
                            }
                        },

                        // SAME AS initiatedBy === PARTNER
                        initiatedByOthers: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ["$initiatedById", memberId] },
                                            {
                                                $or: [
                                                    { $eq: ["$meetingWithMemberId", memberId] },
                                                    { $eq: ["$createdBy", memberId] }
                                                ]
                                            }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]).toArray();

            const oneToOne = oneToOneAgg[0] || {
                initiatedByMe: 0,
                initiatedByOthers: 0
            };


            /* -----------------------------------------
             * FINAL RESPONSE
             * ----------------------------------------- */
            return {
                success: true,
                data: {
                    thankYouSlip,
                    referralSlip,
                    oneToOne
                }
            };

        } catch (error) {
            console.error("Insights aggregation error:", error);
            return {
                success: false,
                message: "Failed to fetch insights data"
            };
        }
    }


    @Get("/visitor-list-meeting-cycle")
    async getVisitorListByMeetingCycle(
        @QueryParams() query: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);
            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Math.max(Number(query.limit) || 10, 1);

            const currentMember = await this.memberRepo.findOne({
                where: {
                    _id: userId,
                    isActive: 1,
                    isDelete: 0
                },
                select: ["chapter"]
            });

            if (!currentMember?.chapter) {
                return {
                    success: false,
                    message: "Member or chapter not found"
                };
            }

            const chapterId: ObjectId = currentMember.chapter;


            const now = new Date();
            let startDate: Date | null = null;
            let endDate: Date | null = null;

            const upcomingMeeting = await this.meetingRepo.findOne({
                where: {
                    chapters: { $in: [chapterId] },
                    endDateTime: { $gte: now },
                    isDelete: 0,
                    isActive: 1
                },
                order: { startDateTime: "ASC" }
            });

            if (upcomingMeeting) {
                endDate = upcomingMeeting.endDateTime;

                const previousMeeting = await this.meetingRepo.findOne({
                    where: {
                        chapters: { $in: [chapterId] },
                        endDateTime: { $lt: upcomingMeeting.endDateTime },
                        isDelete: 0,
                        isActive: 1
                    },
                    order: { endDateTime: "DESC" }
                });

                if (previousMeeting) {
                    startDate = previousMeeting.endDateTime;
                }
            } else {
                const lastMeeting = await this.meetingRepo.findOne({
                    where: {
                        chapters: { $in: [chapterId] },
                        endDateTime: { $lt: now },
                        isDelete: 0,
                        isActive: 1
                    },
                    order: { endDateTime: "DESC" }
                });

                if (lastMeeting) {
                    startDate = lastMeeting.endDateTime;
                }
                endDate = now;
            }

            // Construct Date Match Query
            const dateMatch: any = {};
            if (startDate) {
                dateMatch.$gt = startDate;
            }
            if (endDate) {
                dateMatch.$lte = endDate;
            }

            const matchQuery = Object.keys(dateMatch).length > 0 ? { createdAt: dateMatch } : {};

            const match: any = {
                isDelete: 0,
                chapterId: chapterId,
                ...matchQuery
            };
            const pipeline = [
                { $match: match },
                {
                    $lookup: {
                        from: "member",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "member"
                    }
                },
                {
                    $unwind: {
                        path: "$member",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "chapters",
                        localField: "chapterId",
                        foreignField: "_id",
                        as: "chapters"
                    }
                },
                {
                    $unwind: {
                        path: "$chapters",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        visitorName: 1,
                        contactNumber: 1,
                        sourceOfEvent: 1,
                        status: 1,
                        businessCategory: 1,
                        companyName: 1,
                        email: 1,
                        address: 1,
                        createdAt: 1,
                        profileImage: {
                            path: { $ifNull: ["$profileImage.path", ""] },
                            fileName: { $ifNull: ["$profileImage.fileName", ""] },
                            originalName: { $ifNull: ["$profileImage.originalName", ""] }
                        },
                        invitedBy: {
                            _id: "$member._id",
                            name: "$member.fullName",
                            profilePhoto: {
                                path: { $ifNull: ["$member.profileImage.path", ""] },
                                fileName: { $ifNull: ["$member.profileImage.fileName", ""] },
                                originalName: { $ifNull: ["$member.profileImage.originalName", ""] }
                            }
                        },
                        chapterName: "$chapters.chapterName",
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

            const [result] = await this.visitorRepo.aggregate(pipeline).toArray();

            const data = result?.data || [];
            const total = result?.meta?.[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            console.error("Visitor list cycle error:", error);
            return {
                success: false,
                message: "Failed to fetch visitor list"
            };
        }
    }
}
