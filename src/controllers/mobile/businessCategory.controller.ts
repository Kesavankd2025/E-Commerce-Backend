import {
    JsonController,
    Get,
    QueryParams,
    Res,
    UseBefore,
    Req
} from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { BusinessCategory } from "../../entity/BusinessCategory";
import response from "../../utils/response";
import { Member } from "../../entity/Member";

@UseBefore(AuthMiddleware)
@JsonController("/business-category")
export class MobileBusinessCategoryController {
    private businessCategoryRepository = AppDataSource.getMongoRepository(BusinessCategory);
    private memberRepository = AppDataSource.getMongoRepository(Member);

    // =========================
    // ✅ LIST BUSINESS CATEGORIES
    // =========================
    @Get("/")
    async getAllBusinessCategories(
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Number(query.page ?? 0);
            const limit = Number(query.limit ?? 0);

            // For mobile, we might often only want active ones, but sticking to exact copy as requested, 
            // but usually mobile apps shouldn't see soft-deleted items implies isDelete: 0 is correct.
            // Admin lists often show all, but here match is just { isDelete: 0 } which is good.
            const match: any = { isDelete: 0 };

            // Optional: Mobile often needs only active categories
            if (query.active === 'true') {
                match.isActive = 1;
            }

            const operation: any[] = [];

            operation.push({ $match: match }, { $sort: { createdAt: -1 } });

            if (limit > 0) {
                operation.push(
                    { $skip: page * limit },
                    { $limit: limit }
                );
            }

            const businessCategories = await this.businessCategoryRepository
                .aggregate(operation)
                .toArray();

            const totalCount = await this.businessCategoryRepository.countDocuments(match);

            return pagination(
                totalCount,
                businessCategories,
                limit,
                page,
                res
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // =========================
    // ✅ SEARCH MEMBERS BY CATEGORY & LOCATION
    // =========================
    @Get("/member-search")
    async getMembersByBusinessCategory(
        @QueryParams() query: any,
        @Res() res: Response,
        @Req() req: any
    ) {
        try {
            const userId = new ObjectId(req.user.userId);
            const categoryId = query.categoryId;
            const location = query.location; // Optional: Partial match on chapter location

            const page = Number(query.page ?? 0);
            const limit = Number(query.limit ?? 10);


            const memberData = await this.memberRepository.findOne({ where: { _id: userId } })
            const pipeline: any[] = [];

            // 1. Initial Match: Active Members with Business Category
            const matchStage: any = {
                isDelete: 0,
                isActive: 1,
                chapter: { $ne: memberData.chapter }
            };
            if (categoryId) {
                matchStage.businessCategory = new ObjectId(categoryId);
            }
            pipeline.push({ $match: matchStage });

            // 2. Lookup Business Category Name
            pipeline.push({
                $lookup: {
                    from: "businesscategories",
                    localField: "businessCategory",
                    foreignField: "_id",
                    as: "businessCategoryDetails"
                }
            },
                {
                    $lookup: {
                        from: "connection_request",
                        let: {
                            memberId: "$_id",
                            loggedInUser: userId
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$isActive", 1] },
                                            { $eq: ["$isDelete", 0] },
                                            { $ne: ["$status", "Declined"] },
                                            {
                                                $or: [
                                                    // Case 1: loggedInUser sent the request
                                                    {
                                                        $and: [
                                                            { $eq: ["$createdBy", "$$loggedInUser"] },
                                                            { $eq: ["$memberId", "$$memberId"] }
                                                        ]
                                                    },
                                                    // Case 2: other member sent the request
                                                    {
                                                        $and: [
                                                            { $eq: ["$createdBy", "$$memberId"] },
                                                            { $eq: ["$memberId", "$$loggedInUser"] }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                }
                            },
                            { $sort: { updatedAt: -1 } }
                        ],
                        as: "connection_request"
                    }
                },
                {
                    $addFields: {
                        isConnected: {
                            $cond: {
                                if: { $gt: [{ $size: "$connection_request" }, 0] },
                                then: {
                                    $switch: {
                                        branches: [
                                            { case: { $eq: [{ $arrayElemAt: ["$connection_request.status", 0] }, "Pending"] }, then: "Requested" },
                                            { case: { $eq: [{ $arrayElemAt: ["$connection_request.status", 0] }, "Approved"] }, then: "Approved" }
                                        ],
                                        default: "Not Requested"
                                    }
                                },
                                else: "Not Requested"
                            }
                        }
                    }
                }

            );
            pipeline.push({ $unwind: "$businessCategoryDetails" });

            // 3. Lookup Chapter (To filter by location if needed)
            pipeline.push({
                $lookup: {
                    from: "chapters",
                    localField: "chapter",
                    foreignField: "_id",
                    as: "chapterDetails"
                }
            });
            pipeline.push({ $unwind: "$chapterDetails" });

            // 4. Apply Location Filter (if provided)
            if (location) {
                // Case-insensitive regex match on chapter location
                pipeline.push({
                    $match: {
                        "chapterDetails.location": { $regex: location, $options: "i" }
                    }
                });
            }

            // 5. Lookup Badges
            pipeline.push({
                $lookup: {
                    from: "badges",
                    localField: "badgeIds",
                    foreignField: "_id",
                    as: "badgeDetails"
                }
            });

            // 6. Total Count (before pagination but after filter)
            // We need a separate count query or use $facet. Facet is efficient here.
            // However, to keep standard pagination structure, let's use facet.

            const facetStage = {
                $facet: {
                    data: [
                        { $sort: { createdAt: -1 } },
                        { $skip: page * limit },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                membershipId: 1,
                                fullName: 1,
                                companyName: 1,
                                profileImage: 1,

                                badgeIds: 1,
                                badgeNames: {
                                    $map: {
                                        input: "$badgeDetails",
                                        as: "b",
                                        in: "$$b.name"
                                    }
                                },
                                businessCategoryName: "$businessCategoryDetails.name",
                                isConnected: 1
                            }
                        }
                    ],
                    totalCount: [
                        { $count: "count" }
                    ]
                }
            };
            pipeline.push(facetStage);

            const result = await this.memberRepository.aggregate(pipeline).toArray();

            const data = result[0].data;
            const total = result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

            return pagination(
                total,
                data,
                limit,
                page,
                res
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
