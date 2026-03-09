import {
    JsonController,
    UseBefore,
    Req,
    Res,
    Body,
    Get,
    Patch,
    Param
} from "routing-controllers";
import { Request } from "express";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import { handleErrorResponse, pagination } from "../../utils";
import { MemberLocation } from "../../entity/MemberLocation";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/member-location")
export class MemberLocationController {
    private memberLocationRepo = AppDataSource.getMongoRepository(MemberLocation);
    @Get("/list")
    async listMembers(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Number(req.query.limit ?? 10);
            const search = req.query.search?.toString();
            const region = req.query.region?.toString();
            const chapter = req.query.chapter?.toString();

            const pipeline: any[] = [

                {
                    $match: { isDelete: 0 }
                },
                {
                    $lookup: {
                        from: "member",
                        let: {
                            memberId: "$memberId"
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$_id", "$$memberId"]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    fullName: 1,
                                    chapter: 1,
                                    membershipId: 1,
                                    phoneNumber: 1
                                }
                            }
                        ],
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
                        let: {
                            chapterId: "$member.chapter"
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$_id", "$$chapterId"]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    chapterName: 1,
                                    regionId: 1
                                }
                            }
                        ],
                        as: "chapter"
                    }
                },
                {
                    $unwind: {
                        path: "$chapter",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "regions",
                        let: {
                            regionId: "$chapter.regionId"
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$_id", "$$regionId"]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    region: 1
                                }
                            }
                        ],
                        as: "region"
                    }
                },
                {
                    $unwind: {
                        path: "$region",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $match: {
                        ...(search && {
                            $or: [
                                { "member.fullName": { $regex: search, $options: "i" } },
                                { "member.membershipId": { $regex: search, $options: "i" } },
                                { "member.phoneNumber": { $regex: search, $options: "i" } }
                            ]
                        }),

                        ...(chapter && ObjectId.isValid(chapter) && {
                            "member.chapter": new ObjectId(chapter)
                        }),

                        ...(region && ObjectId.isValid(region) && {
                            "chapter.regionId": new ObjectId(region)
                        })
                    }
                },
                {
                    $project: {
                        location: 1,
                        fullName: "$member.fullName",
                        membershipId: "$member.membershipId",
                        phoneNumber: "$member.phoneNumber",
                        isActive: 1,
                        createdAt: 1,
                        regionName: "$region.region",
                        chapterName: "$chapter.chapterName"
                    }
                },
                {
                    $sort: {
                        isActive: -1,
                        createdAt: -1
                    }
                }
            ];
            if (limit > 0) {
                pipeline.push({
                    $facet: {
                        data: [
                            { $skip: page * limit },
                            { $limit: limit }
                        ],
                        meta: [{ $count: "total" }]
                    }
                });
            } else {
                pipeline.push({
                    $facet: {
                        data: [{ $skip: 0 }],
                        meta: [{ $count: "total" }]
                    }
                });
            }

            const [result] =
                await this.memberLocationRepo.aggregate(pipeline).toArray();

            const data = result?.data || [];
            const total = result?.meta?.[0]?.total || 0;

            return pagination(
                total,
                data,
                limit === 0 ? total : limit,
                page,
                res
            );

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }
    @Patch("/:id/toggle-active")
    async toggleActiveStatus(@Param("id") id: string, @Res() res: Response) {
        try {
            const memberLocation = await this.memberLocationRepo.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!memberLocation) {
                return response(res, StatusCodes.NOT_FOUND, "Member Location not found");
            }

            memberLocation.isActive = memberLocation.isActive === 1 ? 0 : 1;
            const updatedMemberLocation =
                await this.memberLocationRepo.save(memberLocation);

            return response(
                res,
                StatusCodes.OK,
                `Member Location ${memberLocation.isActive === 1 ? "enabled" : "disabled"
                } successfully`,
                updatedMemberLocation
            );
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
