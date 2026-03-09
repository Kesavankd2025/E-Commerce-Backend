import {
    JsonController,
    Get,
    Req,
    Res,
    UseBefore,
    Param
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { Member } from "../../entity/Member";
import { pagination } from "../../utils";
import { Community } from "../../entity/Community";
import { TrainingParticipants } from "../../entity/TrainingParticipants";
import { ThankYouSlip } from "../../entity/ThankyouSlip";

interface RequestWithUser extends Request {
    user: AuthPayload;
}


@UseBefore(AuthMiddleware)
@JsonController("/profile")
export class MobileProfileController {
    private memberRepo = AppDataSource.getMongoRepository(Member);
    private communityRepo = AppDataSource.getMongoRepository(Community);
    private participantRepo = AppDataSource.getMongoRepository(TrainingParticipants);
    private thankYouRepo = AppDataSource.getMongoRepository(ThankYouSlip);
    @Get("/myprofile/:id")
    async getMemberProfile(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {

            if (!ObjectId.isValid(id)) {
                return response(res, 400, "Invalid member id");
            }

            const memberId = new ObjectId(id);

            const pipeline: any[] = [
                {
                    $match: {
                        _id: memberId,
                        isDelete: 0
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
                                $project: { _id: 0, name: 1, code: 1 }
                            }
                        ],
                        as: "role"
                    }
                },
                { $unwind: { path: "$role", preserveNullAndEmptyArrays: true } },


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

                {
                    $lookup: {
                        from: "businesscategories",
                        let: { catId: "$businessCategory" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$catId"] }
                                }
                            },
                            {
                                $project: { _id: 0, name: 1 }
                            }
                        ],
                        as: "businessCategory"
                    }
                },
                { $unwind: { path: "$businessCategory", preserveNullAndEmptyArrays: true } },


                {
                    $lookup: {
                        from: "badges",
                        let: {
                            badgeIds: { $ifNull: ["$badgeIds", []] }
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $in: ["$_id", "$$badgeIds"]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    badgeImage: 1
                                }
                            }
                        ],
                        as: "badges"
                    }
                },
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
                    $lookup: {
                        from: "connection_request",
                        let: { myId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$status", "Approved"] },
                                            { $eq: ["$isActive", 1] },
                                            { $eq: ["$isDelete", 0] },
                                            {
                                                $or: [
                                                    { $eq: ["$memberId", "$$myId"] },
                                                    { $eq: ["$createdBy", "$$myId"] }
                                                ]
                                            }
                                        ]
                                    }
                                }
                            },

                            {
                                $addFields: {
                                    otherMemberId: {
                                        $cond: [
                                            { $eq: ["$memberId", "$$myId"] },
                                            "$createdBy",
                                            "$memberId"
                                        ]
                                    }
                                }
                            },

                            {
                                $lookup: {
                                    from: "member",
                                    localField: "otherMemberId",
                                    foreignField: "_id",
                                    as: "user"
                                }
                            },
                            { $unwind: "$user" },

                            { $sort: { createdAt: -1 } },

                            {
                                $project: {
                                    _id: 0,
                                    fullName: "$user.fullName",
                                    profileImage: "$user.profileImage"
                                }
                            }
                        ],
                        as: "connections"
                    }
                },
                {
                    $addFields: {
                        totalConnections: { $size: "$connections" },
                        lastConnections: { $slice: ["$connections", 5] }
                    }
                },

                {
                    $project: {
                        profileImage: 1,
                        fullName: 1,
                        companyName: 1,
                        chapterName: "$chapter.chapterName",
                        membershipId: 1,

                        roleName: "$role.name",
                        lastConnections: 1,
                        totalConnections: 1,
                        phoneNumber: 1,
                        email: 1,
                        regionName: "$region.region",
                        businessCategoryName: "$businessCategory.name",
                        clubMemberType: 1,
                        websiteUrl: 1,
                        instagramUrl: 1,
                        linkedinUrl: 1,
                        twitterUrl: 1,
                        badges: 1,

                        createdAt: 1,
                        address: {
                            street: "$officeAddress.street",
                            area: "$officeAddress.area",
                            city: "$officeAddress.city",
                            state: "$officeAddress.state",
                            pincode: "$officeAddress.pincode",
                            country: "$country"
                        },
                        about: 1,
                        isActive: 1

                    }
                }
            ];

            const result =
                await this.memberRepo.aggregate(pipeline).toArray();

            if (!result.length) {
                return response(res, 404, "Member not found");
            }

            return response(
                res,
                StatusCodes.OK,
                "Member profile fetched",
                result[0]
            );

        } catch (error) {
            console.error(error);
            return response(res, 500, "Failed to fetch profile");
        }
    }
    @Get("/list/bymember")
    async listCommunitybymember(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Math.max(Number(req.query.limit) || 10, 1);

            const type = req.query.type?.toString();
            const memberId = req.query.memberId?.toString();

            const match: any = { isDelete: 0 };

            if (type) {
                match.type = type;
            }

            if (memberId && ObjectId.isValid(memberId)) {
                match.createdBy = new ObjectId(memberId);
            }

            const pipeline: any[] = [

                { $match: match },

                { $sort: { createdAt: -1 } },

                {
                    $facet: {

                        data: [
                            { $skip: page * limit },
                            { $limit: limit },

                            {
                                $project: {
                                    _id: 0,
                                    title: 1,
                                    details: 1,
                                    type: 1
                                }
                            }
                        ],

                        meta: [
                            { $count: "total" }
                        ]
                    }
                }
            ];

            const result =
                await this.communityRepo.aggregate(pipeline).toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Get("/training-history/:memberId")
    async getTrainingHistory(
        @Param("memberId") memberId: string,
        @Res() res: Response
    ) {
        try {

            if (!ObjectId.isValid(memberId)) {
                return response(res, 400, "Invalid memberId");
            }

            const pipeline: any[] = [

                {
                    $match: {
                        memberId: new ObjectId(memberId),
                        status: "Approved",
                        isActive: 1,
                        isDelete: 0
                    }
                },
                {
                    $lookup: {
                        from: "training",
                        let: { trainingId: "$trainingId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$trainingId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    title: 1,
                                    trainingDateTime: 1
                                }
                            }
                        ],
                        as: "training"
                    }
                },

                { $unwind: "$training" },

                { $sort: { "training.trainingDateTime": -1 } },
                {
                    $project: {
                        _id: 0,
                        title: "$training.title",
                        date: "$training.trainingDateTime"
                    }
                }

            ];

            const history =
                await this.participantRepo.aggregate(pipeline).toArray();

            return response(
                res,
                StatusCodes.OK,
                "Training history fetched",
                history
            );

        } catch (error) {
            console.error(error);
            return response(res, 500, "Failed to fetch training history");
        }
    }

    @Get("/testimonials/:memberId")
    async getTestimonials(
        @Req() req: any,
        @Param("memberId") memberId: string,
        @Res() res: Response
    ) {
        try {

            if (!ObjectId.isValid(memberId)) {
                return response(res, 400, "Invalid memberId");
            }
            const pipeline: any[] = [

                /* Only active thank you slips */
                {
                    $match: {
                        isDelete: 0,
                        isActive: 1,
                        thankTo: new ObjectId(memberId)
                    }
                },
                {
                    $lookup: {
                        from: "member",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "fromMember"
                    }
                },
                { $unwind: "$fromMember" },

                {
                    $project: {
                        _id: 1,
                        comment: "$comments",
                        rating: "$ratings",
                        createdAt: 1,

                        fromMember: {
                            _id: "$fromMember._id",
                            fullName: "$fromMember.fullName",
                            profileImage: "$fromMember.profileImage",
                            companyName: "$fromMember.companyName"
                        }
                    }
                },

                { $sort: { createdAt: -1 } }

            ];

            const testimonials =
                await this.thankYouRepo.aggregate(pipeline).toArray();

            return response(
                res,
                200,
                "Testimonials fetched successfully",
                testimonials
            );

        } catch (error) {
            console.error(error);
            return response(res, 500, "Failed to fetch testimonials");
        }
    }

}
