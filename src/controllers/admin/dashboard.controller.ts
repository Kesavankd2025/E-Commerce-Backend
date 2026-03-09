import {
    JsonController,
    UseBefore,
    Get,
    Req,
    Res,
    QueryParams
} from "routing-controllers";
import { Request } from "express";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { Member } from "../../entity/Member";
import { Meeting } from "../../entity/Meeting";
import response from "../../utils/response";
import { handleErrorResponse } from "../../utils";
import { StatusCodes } from "http-status-codes";
import { Referral } from "../../entity/Referral";
import { ThankYouSlip } from "../../entity/ThankyouSlip";
import { OneToOneMeeting } from "../../entity/121's";
import { Zone } from "../../entity/Zone";
import { Region } from "../../entity/Region";
import { Chapter } from "../../entity/Chapter";
import { Visitor } from "../../entity/Visitor";
import { Role } from "../../entity/Role.Permission";
import { PowerDate } from "../../entity/PowerDate";
import { StarUpdate } from "../../entity/StarUpdate";
import { ChiefGuest } from "../../entity/ChiefGuest";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/dashboard-apis")
export class DashBoardController {
    private memberRepo = AppDataSource.getMongoRepository(Member);
    private meetingRepo = AppDataSource.getMongoRepository(Meeting);
    private referralRepo = AppDataSource.getMongoRepository(Referral);
    private thankYouRepo = AppDataSource.getMongoRepository(ThankYouSlip);
    private onetooneRepo = AppDataSource.getMongoRepository(OneToOneMeeting);
    private zoneRepo = AppDataSource.getMongoRepository(Zone);
    private regionRepo = AppDataSource.getMongoRepository(Region);
    private chapterRepo = AppDataSource.getMongoRepository(Chapter);
    private visitorRepo = AppDataSource.getMongoRepository(Visitor);
    private roleRepo = AppDataSource.getMongoRepository(Role);
    private powerDateRepo = AppDataSource.getMongoRepository(PowerDate);
    private trainingRepo = AppDataSource.getMongoRepository(StarUpdate);
    private starupdateRepo = AppDataSource.getMongoRepository(StarUpdate);
    private chiefGuestRepo = AppDataSource.getMongoRepository(ChiefGuest);


    @Get("/stats")
    async getStats(@Res() res: Response) {
        try {
            const [
                zoneCount,
                regionCount,
                chapterCount,
                visitorCount,
                memberCount,
                goldClubCount,
                diamondClubCount,
                platinumClubCount,
                edRole,
                rdRole
            ] = await Promise.all([
                this.zoneRepo.countDocuments({ isDelete: 0 }),
                this.regionRepo.countDocuments({ isDelete: 0 }),
                this.chapterRepo.countDocuments({ isDelete: 0 }),
                this.visitorRepo.countDocuments({ isDelete: 0 }),
                this.memberRepo.countDocuments({ isDelete: 0 }),
                this.memberRepo.countDocuments({ clubMemberType: "Gold", isDelete: 0 }),
                this.memberRepo.countDocuments({ clubMemberType: "Diamond", isDelete: 0 }),
                this.memberRepo.countDocuments({ clubMemberType: "Platinum", isDelete: 0 }),
                this.roleRepo.findOne({ where: { code: "ed", isDelete: 0 } }),
                this.roleRepo.findOne({ where: { code: "rd", isDelete: 0 } })
            ]);

            let edCount = 0;
            let rdCount = 0;

            if (edRole) {
                edCount = await this.memberRepo.countDocuments({ roleId: edRole._id, isDelete: 0 });
            }
            if (rdRole) {
                rdCount = await this.memberRepo.countDocuments({ roleId: rdRole._id, isDelete: 0 });
            }

            // Placeholder for Prime/Elite chapters (not defined in entity)
            const primeChapterCount = 0;
            const eliteChapterCount = 0;

            const data = {
                zoneCount,
                regionCount,
                chapterCount,
                visitorCount,
                edCount,
                rdCount,
                memberCount,
                goldClubCount,
                diamondClubCount,
                platinumClubCount,
                primeChapterCount,
                eliteChapterCount
            };

            return response(res, StatusCodes.OK, "Stats fetched successfully", data);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/activities")
    async getActivities(@Res() res: Response) {
        try {

            const [
                oneToOneCount,
                referralCount,
                thankYouSlipCount,
                powerDateCount,
                testimonialCount
            ] = await Promise.all([

                this.onetooneRepo.countDocuments({ isDelete: 0 }),

                this.referralRepo.countDocuments({ isDelete: 0 }),

                this.thankYouRepo.countDocuments({ isDelete: 0 }),

                this.powerDateRepo.countDocuments({ isDelete: 0 }),
                this.thankYouRepo.countDocuments({
                    isDelete: 0,
                    ratings: {
                        $exists: true,
                        $ne: null,
                        $gt: 0
                    }
                })

            ]);

            const data = {
                oneToOneCount,
                referralCount,
                thankYouSlipCount,
                powerDateCount,
                testimonialCount
            };

            return response(
                res,
                StatusCodes.OK,
                "Activities fetched successfully",
                data
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Get("/overall-revenue/list")
    async getChapterRevenue(
        @Res() res: Response
    ) {
        try {

            const pipeline: any[] = [

                { $match: { isDelete: 0, isActive: 1 } },

                {
                    $lookup: {
                        from: "member",
                        localField: "thankTo",
                        foreignField: "_id",
                        as: "member"
                    }
                },
                { $unwind: "$member" },
                {
                    $group: {
                        _id: {
                            year: { $year: "$createdAt" },
                            month: { $month: "$createdAt" }
                        },
                        amount: { $sum: "$amount" }
                    }
                },

                { $sort: { "_id.year": 1, "_id.month": 1 } },

                {
                    $project: {
                        _id: 0,
                        year: "$_id.year",
                        month: "$_id.month",
                        amount: 1
                    }
                }
            ];

            const monthly =
                await this.thankYouRepo.aggregate(pipeline).toArray();

            const totalRevenue =
                monthly.reduce((s, m) => s + m.amount, 0);

            return response(res, 200, "Chapter revenue fetched", {
                totalRevenue,
                monthly
            });

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch revenue");
        }
    }
    @Get("/recently-joined")
    async recentlyJoinedMembers(
        @Res() res: Response
    ) {
        try {

            const pipeline: any[] = [
                {
                    $match: {
                        isDelete: 0,
                        isActive: 1
                    }
                },

                { $sort: { createdAt: -1 } },

                { $limit: 6 },
                {
                    $lookup: {
                        from: "businesscategories",
                        let: { categoryId: "$businessCategory" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$categoryId"] }
                                }
                            },
                            {
                                $project: { _id: 0, name: 1 }
                            }
                        ],
                        as: "category"
                    }
                },
                { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

                /* Region */
                {
                    $lookup: {
                        from: "regions",
                        let: { regionId: "$region" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$regionId"] }
                                }
                            },
                            {
                                $project: { _id: 0, region: 1 }
                            }
                        ],
                        as: "region"
                    }
                },
                { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

                /* Chapter */
                {
                    $lookup: {
                        from: "chapters",
                        let: { chapterId: "$chapter" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$chapterId"] }
                                }
                            },
                            {
                                $project: { _id: 0, chapterName: 1 }
                            }
                        ],
                        as: "chapter"
                    }
                },
                { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        name: "$fullName",
                        category: "$category.name",
                        company: "$companyName",
                        location: "$officeAddress.city",
                        region: "$region.region",
                        chapter: "$chapter.chapterName",
                        profileImage: 1,
                        createdAt: 1
                    }
                }
            ];

            const members =
                await this.memberRepo.aggregate(pipeline).toArray();

            return response(
                res,
                200,
                "Recently joined members fetched",
                members
            );

        } catch (error) {
            console.error(error);
            return response(res, 500, "Failed to fetch members");
        }
    }
    @Get("/top/referral-members")
    async topReferralMembers(
        @Res() res: Response
    ) {
        try {
            const pipeline: any[] = [

                {
                    $match: {
                        isDelete: 0
                    }
                },
                {
                    $group: {
                        _id: "$fromMemberId",
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },

                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$memberId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    fullName: 1,
                                    profileImage: 1,
                                    businessCategory: 1
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: "$member" },
                {
                    $lookup: {
                        from: "businesscategories",
                        let: { categoryId: "$member.businessCategory" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$categoryId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    name: 1
                                }
                            }
                        ],
                        as: "category"
                    }
                },
                { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

                {
                    $facet: {

                        topMembers: [
                            { $limit: 6 },
                            {
                                $project: {
                                    _id: 0,
                                    memberId: "$_id",
                                    fullName: "$member.fullName",
                                    profileImage: "$member.profileImage",
                                    businessCategoryName: "$category.name",
                                    count: 1
                                }
                            }
                        ],

                        totalCount: [
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: "$count" }
                                }
                            }
                        ]

                    }
                }

            ];

            const result =
                await this.referralRepo.aggregate(pipeline).toArray();

            return response(res, 200, "Top referral members fetched", {
                total: result[0]?.totalCount[0]?.total || 0,
                topMembers: result[0]?.topMembers || []
            });

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch top referral members");
        }
    }

    @Get("/top/thankyou-members")
    async topThankYouMembers(
        @Res() res: Response
    ) {
        try {
            const pipeline: any[] = [
                {
                    $match: {
                        isDelete: 0,
                        isActive: 1
                    }
                },
                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$thankTo" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$memberId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    fullName: 1,
                                    profileImage: 1,
                                    businessCategory: 1
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: "$member" },
                {
                    $lookup: {
                        from: "businesscategories",
                        let: { categoryId: "$member.businessCategory" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$categoryId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                }
                            }
                        ],
                        as: "businesscategories"
                    }
                },
                { $unwind: "$businesscategories" },
                {
                    $group: {
                        _id: "$thankTo",
                        count: { $sum: 1 },
                        fullName: { $first: "$member.fullName" },
                        profileImage: { $first: "$member.profileImage" },
                        businessCategoryName: { $first: "$businesscategories.name" }
                    }
                },

                {
                    $facet: {

                        topMembers: [
                            { $sort: { count: -1 } },
                            { $limit: 6 },
                            {
                                $project: {
                                    _id: 0,
                                    memberId: "$_id",
                                    fullName: 1,
                                    profileImage: 1,
                                    businessCategoryName: 1,
                                    count: 1
                                }
                            }
                        ],

                        totalCount: [
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: "$count" }
                                }
                            }
                        ]

                    }
                }

            ];

            const result =
                await this.thankYouRepo.aggregate(pipeline).toArray();

            const topMembers = result[0]?.topMembers || [];
            const total =
                result[0]?.totalCount[0]?.total || 0;

            return response(res, 200, "Top thank you members fetched", {
                total,
                topMembers
            });

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch top thank you members");
        }
    }
    @Get("/top/1to1-members")
    async top1To1Members(
        @Res() res: Response
    ) {
        try {

            const pipeline: any[] = [

                {
                    $match: {
                        isDelete: 0,
                        isActive: 1
                    }
                },

                {
                    $project: {
                        participants: ["$createdBy", "$meetingWithMemberId"]
                    }
                },
                { $unwind: "$participants" },
                {
                    $group: {
                        _id: "$participants",
                        count: { $sum: 1 }
                    }
                },

                { $sort: { count: -1 } },

                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$memberId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    fullName: 1,
                                    profileImage: 1,
                                    businessCategory: 1
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: "$member" },
                {
                    $lookup: {
                        from: "businesscategories",
                        let: { categoryId: "$member.businessCategory" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$categoryId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    name: 1
                                }
                            }
                        ],
                        as: "category"
                    }
                },
                { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                {
                    $facet: {

                        topMembers: [
                            { $limit: 6 },
                            {
                                $project: {
                                    _id: 0,
                                    memberId: "$_id",
                                    fullName: "$member.fullName",
                                    profileImage: "$member.profileImage",
                                    businessCategoryName: "$category.name",
                                    count: 1
                                }
                            }
                        ],

                        totalCount: [
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: "$count" }
                                }
                            }
                        ]

                    }
                }

            ];

            const result =
                await this.onetooneRepo.aggregate(pipeline).toArray();

            return response(res, 200, "Top 1-2-1 members fetched", {
                total: result[0]?.totalCount[0]?.total || 0,
                topMembers: result[0]?.topMembers || []
            });

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch top members");
        }
    }
    @Get("/star-achievements")
    async starAchievements(@Res() res: Response) {
        try {

            const today = new Date();
            const next30Days = new Date();
            next30Days.setDate(today.getDate() + 30);

            const [
                chiefGuestCount,
                trainingCount,
                starUpdateCount,
                nextRenewalCount
            ] = await Promise.all([

                // ✅ Chief Guest
                AppDataSource.getMongoRepository("chief_guests")
                    .countDocuments({
                        isDelete: 0,
                        isActive: 1
                    }),

                // ✅ Trainings
                AppDataSource.getMongoRepository("training")
                    .countDocuments({
                        isDelete: 0,
                        isActive: 1
                    }),

                // ✅ Projects
                AppDataSource.getMongoRepository("star_updates")
                    .countDocuments({
                        isDelete: 0,
                        isActive: 1
                    }),

                AppDataSource.getMongoRepository(Member)
                    .countDocuments({
                        isDelete: 0,
                        renewalDate: {
                            $lte: next30Days
                        }
                    })
            ]);

            return response(res, StatusCodes.OK, "CNI achievements fetched", {
                chiefGuestCount,
                trainingCount,
                starUpdateCount,
                nextRenewalCount
            });

        } catch (error) {
            console.error(error);
            return response(res, StatusCodes.INTERNAL_SERVER_ERROR, "Failed to fetch CNI achievements");
        }
    }

}
