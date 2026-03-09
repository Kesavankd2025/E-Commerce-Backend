import {
    JsonController,
    Get,
    Req,
    Res,
    UseBefore,
    QueryParam,
    Param,
    Patch,
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { Community } from "../../entity/Community";
import { pagination } from "../../utils";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/community")
export class AdminCommunityController {
    private communityRepository = AppDataSource.getMongoRepository(Community);

    @Get("/list")
    async listCommunity(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Math.max(Number(req.query.limit) || 10, 1);

            const type = req.query.type?.toString();
            const chapterId = req.query.chapterId?.toString();
            const memberId = req.query.memberId?.toString();
            const search = req.query.search?.toString();

            const match: any = { isDelete: 0 };

            if (type) {
                match.type = type;
            }

            if (memberId && ObjectId.isValid(memberId)) {
                match.createdBy = new ObjectId(memberId);
            }

            const pipeline: any[] = [
                { $match: match },
                {
                    $lookup: {
                        from: "member",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "creator",
                    },
                },
                { $unwind: "$creator" },
                {
                    $lookup: {
                        from: "chapters",
                        localField: "creator.chapter",
                        foreignField: "_id",
                        as: "chapterDetails",
                    },
                },
                {
                    $unwind: {
                        path: "$chapterDetails",
                        preserveNullAndEmptyArrays: true,
                    },
                },
            ];

            // Filter by Chapter
            if (chapterId && ObjectId.isValid(chapterId)) {
                pipeline.push({
                    $match: {
                        "creator.chapter": new ObjectId(chapterId),
                    },
                });
            }

            // Filter by Search (Title or Creator Name)
            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { title: { $regex: search, $options: "i" } },
                            { "creator.fullName": { $regex: search, $options: "i" } },
                        ],
                    },
                });
            }

            pipeline.push(
                {
                    $sort: {
                        isActive: -1,
                        createdAt: -1
                    }
                },
                {
                    $facet: {
                        data: [
                            { $skip: page * limit },
                            { $limit: limit },
                            {
                                $project: {
                                    _id: 1,
                                    date: "$createdAt",
                                    chapterName: "$chapterDetails.chapterName",
                                    name: "$creator.fullName",
                                    title: 1,
                                    details: 1,
                                    isActive: 1,
                                    responseCount: {
                                        $cond: {
                                            if: { $isArray: "$responses" },
                                            then: { $size: "$responses" },
                                            else: 0,
                                        },
                                    },
                                    type: 1
                                },
                            },
                        ],
                        meta: [{ $count: "total" }],
                    },
                }
            );

            const result = await this.communityRepository.aggregate(pipeline).toArray();
            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // =========================
    // ✅ GET RESPONSE DETAILS
    // =========================
    @Get("/response-details/:id")
    async getResponseDetails(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid community ID");
            }

            const communityId = new ObjectId(id);

            const pipeline = [
                {
                    $match: {
                        _id: communityId,
                        isDelete: 0,
                    },
                },

                { $unwind: "$responses" },
                {
                    $lookup: {
                        from: "member",
                        let: { userId: "$responses.userId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$userId"] },
                                },
                            },
                            {
                                $project: {
                                    _id: 1,
                                    fullName: 1,
                                    profileImage: 1,
                                    phoneNumber: 1,
                                    chapter: 1,
                                },
                            },
                        ],
                        as: "responder",
                    },
                },
                { $unwind: "$responder" },

                {
                    $lookup: {
                        from: "chapters",
                        let: { chapterId: "$responder.chapter" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$chapterId"] },
                                },
                            },
                            {
                                $project: {
                                    chapterName: 1,
                                    zoneId: 1,
                                    regionId: 1,
                                    edId: 1,
                                },
                            },
                        ],
                        as: "chapter",
                    },
                },
                { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "zones",
                        let: { zoneId: "$chapter.zoneId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$zoneId"] },
                                },
                            },
                            { $project: { name: 1 } },
                        ],
                        as: "zone",
                    },
                },
                { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "regions",
                        let: { regionId: "$chapter.regionId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$regionId"] },
                                },
                            },
                            { $project: { region: 1 } },
                        ],
                        as: "region",
                    },
                },
                { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member",
                        let: { edId: "$chapter.edId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$edId"] },
                                },
                            },
                            { $project: { fullName: 1 } },
                        ],
                        as: "ed",
                    },
                },
                { $unwind: { path: "$ed", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "member",
                        let: { creatorId: "$createdBy" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$creatorId"] },
                                },
                            },
                            { $project: { fullName: 1, profileImage: 1 } },
                        ],
                        as: "creator",
                    },
                },
                { $unwind: "$creator" },

                {
                    $project: {
                        profile: "$responder.profileImage",
                        username: "$responder.fullName",
                        chapter: "$chapter.chapterName",
                        zone: "$zone.name",
                        edName: "$ed.fullName",
                        region: "$region.region",
                        contactNumber: "$responder.phoneNumber",
                        type: "$responses.type",
                        respondedAt: "$responses.respondedAt",
                        createdBy: {
                            fullName: "$creator.fullName",
                            profileImage: "$creator.profileImage",
                        },
                    },
                },
            ];

            const result = await this.communityRepository.aggregate(pipeline).toArray();

            return response(
                res,
                StatusCodes.OK,
                "Response details fetched successfully",
                result
            );
        } catch (error) {
            return handleErrorResponse(error, res);
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

                {
                    $sort: {
                        isActive: -1,
                        createdAt: -1
                    }
                },

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
                await this.communityRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Patch("/:id/toggle-active")
    async toggleActive(@Param("id") id: string, @Res() res: Response) {
        try {
            const community = await this.communityRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!community) {
                return response(res, StatusCodes.NOT_FOUND, "Community not found");
            }

            community.isActive = community.isActive === 1 ? 0 : 1;
            const updatedCommunity = await this.communityRepository.save(community);
            return response(
                res,
                StatusCodes.OK,
                `Community ${updatedCommunity.isActive === 1 ? "enabled" : "disabled"} successfully`,
                updatedCommunity
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
