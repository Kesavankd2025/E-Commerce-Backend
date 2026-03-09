import { Get, JsonController, Param, QueryParams, Res, UseBefore } from "routing-controllers";
import { Response } from "express";
import { AppDataSource } from "../../data-source";
import { Member } from "../../entity/Member";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { handleErrorResponse, pagination, response } from "../../utils";

@UseBefore(AuthMiddleware)
@JsonController("/member")
export class WebsiteMemberController {
    private memberRepository = AppDataSource.getMongoRepository(Member);

    @Get("/role/code/:roleCode")
    async getAdminUsersByRoleCode(
        @Param("roleCode") roleCode: string,
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Number(query.page ?? 0);
            let limit = Number(query.limit ?? 0);

            const matchStage: any = {
                isDelete: 0
            };

            const pipeline: any[] = [
                { $match: matchStage },
                {
                    $sort: {
                        isActive: -1,
                        createdAt: -1
                    }
                },
                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$roleId"] },
                                            { $eq: ["$code", roleCode] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    name: 1,
                                    code: 1
                                }
                            }
                        ],
                        as: "role"
                    }
                },

                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: false
                    }
                },
                {
                    $lookup: {
                        from: "regions",
                        let: { memberId: "$_id", memberRegion: "$region" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$isDelete", 0] },
                                            {
                                                $or: [
                                                    { $eq: ["$edId", "$$memberId"] },
                                                    { $in: ["$$memberId", { $ifNull: ["$rdIds", []] }] },
                                                    { $eq: ["$_id", "$$memberRegion"] }
                                                ]
                                            }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "managedRegions"
                    }
                },
                {
                    $addFields: {
                        regionNamesList: {
                            $reduce: {
                                input: "$managedRegions",
                                initialValue: "",
                                in: {
                                    $cond: [
                                        { $eq: ["$$value", ""] },
                                        "$$this.region",
                                        { $concat: ["$$value", ", ", "$$this.region"] }
                                    ]
                                }
                            }
                        }
                    }
                }
            ];

            if (limit > 0) {
                pipeline.push(
                    { $skip: page * limit },
                    { $limit: limit }
                );
            }

            pipeline.push({
                $project: {
                    name: "$fullName",
                    email: 1,
                    companyName: 1,
                    phoneNumber: 1,
                    profileImage: 1,
                    isActive: 1,
                    roleId: 1,
                    roleName: "$role.name",
                    roleCode: "$role.code",
                    regionName: "$regionNamesList",
                    createdAt: 1,
                }
            });

            const result = await this.memberRepository
                .aggregate(pipeline)
                .toArray();

            const totalPipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$roleId"] },
                                            { $eq: ["$code", roleCode] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "role"
                    }
                },
                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: false
                    }
                },
                { $count: "total" }
            ];

            const totalResult = await this.memberRepository
                .aggregate(totalPipeline)
                .toArray();

            const total = totalResult[0]?.total || 0;

            if (limit === 0) {
                limit = total;
            }

            return pagination(total, result, limit, page, res);

        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
