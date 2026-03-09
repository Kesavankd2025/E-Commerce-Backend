import {
    JsonController,
    Post,
    Get,
    Put,
    Param,
    Body,
    Req,
    Res,
    UseBefore,
    QueryParams
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";

import { AppDataSource } from "../../data-source";
import { MemberSuggestion } from "../../entity/MemberSuggestion";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import { UpdateSuggestionStatusDto } from "../../dto/admin/MemberSuggestion.dto";
import { pagination } from "../../utils";

@UseBefore(AuthMiddleware)
@JsonController("/member-suggestions")
export class MemberSuggestionController {

    private repo =
        AppDataSource.getMongoRepository(MemberSuggestion);

    @Get("/list")
    async list(
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(query.page) || 0, 0);
        const limit = Math.max(Number(query.limit) || 10, 1);
        const search = query.search?.trim();

        const pipeline: any[] = [
            {
                $match: { isDelete: 0 }
            },

            {
                $lookup: {
                    from: "member",
                    let: { memberId: "$createdBy" },
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
                                phoneNumber: 1,
                                profileImage: 1,
                                chapter: 1
                            }
                        }
                    ],
                    as: "member"
                }
            },
            { $unwind: "$member" },
            {
                $lookup: {
                    from: "chapters",
                    let: { chapterId: "$member.chapter" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$_id", "$$chapterId"] }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                chapterName: 1
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

            // Add search filter here, after all lookups
            ...(search
                ? [{
                    $match: {
                        $or: [
                            { "member.fullName": { $regex: search, $options: "i" } },
                            { "member.phoneNumber": { $regex: search, $options: "i" } },
                            { "chapter.chapterName": { $regex: search, $options: "i" } },
                            { subject: { $regex: search, $options: "i" } },
                            { message: { $regex: search, $options: "i" } }
                        ]
                    }
                }]
                : []),

            {
                $project: {
                    _id: 1,
                    fullName: "$member.fullName",
                    profileImage: "$member.profileImage",
                    mobileNumber: "$member.phoneNumber",
                    chapterName: "$chapter.chapterName",
                    subject: 1,
                    message: 1,
                    status: 1,
                    createdAt: 1
                }
            },

            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: page * limit },
                        { $limit: limit }
                    ],
                    meta: [
                        { $count: "total" }
                    ]
                }
            }
        ];

        const result = await this.repo.aggregate(pipeline).toArray();

        const data = result[0]?.data || [];
        const total = result[0]?.meta[0]?.total || 0;

        return pagination(total, data, limit, page, res);

    } catch (error) {
        console.error(error);
        return response(res, 500, "Failed to fetch suggestions");
    }
}   

    @Put("/:id/status")
    async updateStatus(
        @Param("id") id: string,
        @Body() body: UpdateSuggestionStatusDto,
        @Req() req: any,
        @Res() res: Response
    ) {

        if (!ObjectId.isValid(id))
            return response(res, 400, "Invalid id");

        await this.repo.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: body.status,
                    updatedBy: new ObjectId(req.user.userId),
                    updatedAt: new Date()
                }
            }
        );

        return response(res, 200, "Status updated");
    }
}
