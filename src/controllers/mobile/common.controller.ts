import {
    JsonController,
    Get,
    Param,
    Body,
    Req,
    Res,
    QueryParams,
    UseBefore,
    Put
} from "routing-controllers";
import { Response, Request } from "express";


import { AppDataSource } from "../../data-source";

import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { Chapter } from "../../entity/Chapter";
import { ChapterRoleAssignment } from "../../entity/ChapterRoleAssignment";
import { Member } from "../../entity/Member";
import { ObjectId } from "mongodb";
import { ApiError, response } from "../../utils";
import { StatusCodes } from "http-status-codes";
import { UserPoints } from "../../entity/UserPoints";
import { Points } from "../../entity/Points";
import { ConnectionRequests } from "../../entity/ConnectionRequest";
import { sendPushNotification } from "../../services/pushNotification.Service";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/common-apis")
export class CommonController {
    private chapterRepo = AppDataSource.getMongoRepository(Chapter);
    private memberRepository = AppDataSource.getMongoRepository(Member);
    private userpointsRepository = AppDataSource.getMongoRepository(UserPoints);
    private pointsRepo = AppDataSource.getMongoRepository(Points);
    private connectionRepo = AppDataSource.getMongoRepository(ConnectionRequests);
    private chapterRoleAssignmentRepo = AppDataSource.getMongoRepository(ChapterRoleAssignment);
    // =========================
    // ✅ Chapters List (AGGREGATION + MEMBER LOOKUP)
    // =========================
    @Get("/chapter-list")
    async listChapters(
        @Req() req: RequestWithUser,
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Math.max(Number(query.limit) || 1000, 1);
            const search = query.search?.toString();

            const loginMember = await this.memberRepository.findOneBy({
                _id: new ObjectId(req.user.userId),
                isDelete: 0,
                isActive: 1
            });

            if (!loginMember) {
                return response(res, StatusCodes.NOT_FOUND, "Member not found");
            }

            const match: any = {
                isActive: 1,
                isDelete: 0,
                _id: { $ne: loginMember.chapter }
            };

            if (search) {
                match.$or = [
                    { chiefGuestName: { $regex: search, $options: "i" } },
                    { contactNumber: { $regex: search, $options: "i" } }
                ];
            }

            const pipeline = [
                { $match: match },

                {
                    $project: {
                        chapterName: 1,
                        _id: 1
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

            const [result] = await this.chapterRepo.aggregate(pipeline).toArray();

            const data = result?.data || [];
            const total = result?.meta?.[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Get("/member-list")
    async listMembers(
        @Req() req: RequestWithUser,
        @Res() res: Response,
        @QueryParams() params: any,
    ) {
        try {

            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Number(req.query.limit) || 0;

            const loginMember = await this.memberRepository.findOneBy({
                _id: new ObjectId(req.user.userId),
                isDelete: 0
            });

            if (!loginMember) {
                return res.status(404).json({ message: "Member not found" });
            }

            /* ---------------- BASE MATCH ---------------- */

            const match: any = {
                isActive: 1,
                isDelete: 0,
                _id: { $ne: new ObjectId(req.user.userId) }
            };

            /* ---------------- SAME CHAPTER (DEFAULT) ---------------- */

            if (params.otherchapter !== "true") {
                if (params.chapterId) {
                    match.chapter = new ObjectId(params.chapterId);
                } else {
                    match.chapter = loginMember.chapter;
                }
            }

            /* ---------------- PHONE SEARCH ---------------- */

            if (params.phoneNumber) {
                match.phoneNumber = {
                    $regex: params.phoneNumber,
                    $options: "i"
                };
            }

            if (params.otherchapter === "true") {

                const connectionPipeline = [
                    {
                        $match: {
                            status: "Approved",
                            isActive: 1,
                            isDelete: 0,
                            $or: [
                                { memberId: new ObjectId(req.user.userId) },
                                { createdBy: new ObjectId(req.user.userId) }
                            ]
                        }
                    },
                    {
                        $project: {
                            otherMemberId: {
                                $cond: [
                                    { $eq: ["$memberId", new ObjectId(req.user.userId)] },
                                    "$createdBy",
                                    "$memberId"
                                ]
                            }
                        }
                    }
                ];

                const connections =
                    await this.connectionRepo
                        .aggregate(connectionPipeline)
                        .toArray();

                const connectedIds = connections.map(c => c.otherMemberId);

                match._id = { $in: connectedIds };
                match.chapter = { $ne: loginMember.chapter };
            }


            const pipeline: any[] = [
                { $match: match },
                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "businessCategory",
                        foreignField: "_id",
                        as: "businesscategories"
                    }
                },
                {
                    $lookup: {
                        from: "connection_request",
                        let: { memberId: "$_id" },
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
                                                    {
                                                        $and: [
                                                            { $eq: ["$createdBy", new ObjectId(req.user.userId)] },
                                                            { $eq: ["$memberId", "$$memberId"] }
                                                        ]
                                                    },
                                                    {
                                                        $and: [
                                                            { $eq: ["$memberId", new ObjectId(req.user.userId)] },
                                                            { $eq: ["$createdBy", "$$memberId"] }
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
                        as: "connectionData"
                    }
                },
                {
                    $addFields: {
                        isConnected: {
                            $cond: {
                                if: { $gt: [{ $size: "$connectionData" }, 0] },
                                then: {
                                    $switch: {
                                        branches: [
                                            { case: { $eq: [{ $arrayElemAt: ["$connectionData.status", 0] }, "Pending"] }, then: "Requested" },
                                            { case: { $eq: [{ $arrayElemAt: ["$connectionData.status", 0] }, "Approved"] }, then: "Approved" }
                                        ],
                                        default: "Not Requested"
                                    }
                                },
                                else: "Not Requested"
                            }
                        }
                    }
                },

                { $sort: { createdAt: -1 } },
                {
                    $project: {
                        _id: 1,
                        fullName: 1,
                        profileImage: 1,
                        membershipId: 1,
                        companyName: 1,
                        businessCategoryName: {
                            $arrayElemAt: ["$businesscategories.name", 0]
                        },
                        badgeIds: 1,
                        isConnected: 1
                    }
                }
            ];

            if (limit > 0) {
                pipeline.push(
                    { $skip: page * limit },
                    { $limit: limit }
                );
            }

            const data = await this.memberRepository
                .aggregate(pipeline)
                .toArray();

            const total = await this.memberRepository.countDocuments(match);

            return pagination(
                total,
                data,
                limit > 0 ? limit : total,
                page,
                res
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


    // @Get("/member-list")
    // async listMembers(
    //     @Req() req: RequestWithUser,
    //     @Res() res: Response,
    //     @QueryParams() params: any,
    // ) {
    //     try {
    //         const page = Math.max(Number(req.query.page) || 0, 0);
    //         const limit = Number(req.query.limit) || 0;

    //         const loginMember = await this.memberRepository.findOneBy({
    //             _id: new ObjectId(req.user.userId),
    //             isDelete: 0
    //         });

    //         if (!loginMember) {
    //             return res.status(404).json({ message: "Member not found" });
    //         }

    //         const match: any = {
    //             isDelete: 0,
    //             _id: { $ne: new ObjectId(req.user.userId) }
    //         };

    //         if (params.chapterId) {
    //             match.chapter = new ObjectId(params.chapterId);
    //         } else {
    //             match.chapter = loginMember.chapter;
    //         }

    //         if (params.phoneNumber) {

    //             if (params.otherchapter === "true") {
    //                 match.chapter = { $ne: loginMember.chapter };
    //             }

    //             match.phoneNumber = {
    //                 $regex: params.phoneNumber,
    //                 $options: "i"
    //             };
    //         }

    //         const pipeline: any[] = [
    //             { $match: match },
    //             {
    //                 $lookup: {
    //                     from: 'businesscategories',
    //                     localField: 'businessCategory',
    //                     foreignField: '_id',
    //                     as: 'businesscategories'
    //                 }
    //             },
    //             { $sort: { createdAt: -1 } },
    //             {
    //                 $project: {
    //                     _id: 1,
    //                     fullName: 1,
    //                     profileImage: 1,
    //                     membershipId: 1,
    //                     companyName: 1,
    //                     businessCategoryName: {
    //                         $arrayElemAt: ["$businesscategories.name", 0]
    //                     },
    //                     badgeIds: 1
    //                 }
    //             }
    //         ];

    //         if (limit > 0) {
    //             pipeline.push(
    //                 { $skip: page * limit },
    //                 { $limit: limit }
    //             );
    //         }

    //         const data = await this.memberRepository.aggregate(pipeline).toArray();
    //         const total = await this.memberRepository.countDocuments(match);

    //         return pagination(
    //             total,
    //             data,
    //             limit > 0 ? limit : total,
    //             page,
    //             res
    //         );

    //     } catch (error) {
    //         return handleErrorResponse(error, res);
    //     }
    // }

    @Get("/member-details/:id")
    async memberDetails(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid Member Id')
            }

            const pipeline = [
                {
                    $match: {
                        _id: new ObjectId(id),
                        isDelete: 0
                    }
                },
                {
                    $lookup: {
                        from: "regions",
                        localField: "region",
                        foreignField: "_id",
                        as: "regionDetails"
                    }
                },
                { $unwind: { path: "$regionDetails", preserveNullAndEmptyArrays: true } },

                {
                    $project: {
                        isDelete: 0
                    }
                }
            ];

            const result = await this.memberRepository
                .aggregate(pipeline)
                .toArray();

            if (!result.length) {
                return response(res, StatusCodes.BAD_REQUEST, 'Member not found!!');
            }

            return response(res, StatusCodes.OK, 'Member got successfully', result[0]);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Get("/user-points")
    async userPoints(
        @Req() req: RequestWithUser,
        @Res() res: Response,
        @QueryParams() params: any,
    ) {
        try {
            const match: any = {
                // isDelete: 0,
                userId: new ObjectId(req.user.userId)
            };

            if (params.chapterId) {
                match.chapter = new ObjectId(params.chapterId);
            }
            const pipeline: any[] = [
                { $match: match },

                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$pointKey',
                        total: { $sum: '$value' }
                    }
                }
            ];

            const data = await this.userpointsRepository.aggregate(pipeline).toArray();
            const modules = await this.pointsRepo.find({ isActive: 1, isDelete: 0 })

            const result = modules.map((val) => {
                const points = data.find(e => e._id == val.key);
                return {
                    name: val.name,
                    value: points?.total ?? 0
                }
            })
            return response(res, 200, 'Points list', result)

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Put('/checktoken')
    async checkToken(
        @Body() body: any,
        @Res() res: Response
    ) {
        try {
            await sendPushNotification(
                body.token,
                'Test Notification',
                { message: 'This is a test notification to verify token validity.' }
            );
            return response(res, StatusCodes.OK, "Token is valid");
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/chapter/roles-and-ed-rd")
    async getChapterRolesAndEdRd(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = req.user.userId;

            const loginMember = await this.memberRepository.findOneBy({
                _id: new ObjectId(userId),
                isDelete: 0
            });

            if (!loginMember) {
                return response(res, StatusCodes.NOT_FOUND, "Logged in member not found");
            }

            if (!loginMember.chapter) {
                return response(res, StatusCodes.BAD_REQUEST, "Member does not belong to a chapter");
            }

            const chapterObjectId = loginMember.chapter;

            const edRdPipeline: any[] = [
                {
                    $match: {
                        _id: chapterObjectId,
                        isDelete: 0
                    }
                },
                {
                    $project: {
                        edId: 1,
                        rdId: 1
                    }
                },
                {
                    $lookup: {
                        from: "member",
                        let: {
                            edId: "$edId",
                            rdId: "$rdId"
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $in: ["$_id", ["$$edId", "$$rdId"]]
                                    }
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
                            { $unwind: "$role" },
                            {
                                $project: {
                                    _id: 1,
                                    fullName: 1,
                                    profileImage: 1,
                                    phoneNumber: 1,
                                    email: 1,
                                    roleName: "$role.name",
                                    roleCode: "$role.code"
                                }
                            }
                        ],
                        as: "members"
                    }
                },
                {
                    $project: {
                        _id: 0,
                        members: 1
                    }
                }
            ];

            const edRdResult = await this.chapterRepo.aggregate(edRdPipeline).toArray();
            const edRdMembers = edRdResult[0]?.members || [];

            const rolesPipeline: any[] = [
                {
                    $match: {
                        chapterId: chapterObjectId,
                        isDelete: 0
                    }
                },
                {
                    $lookup: {
                        from: "roles",
                        localField: "roleId",
                        foreignField: "_id",
                        as: "role"
                    }
                },
                { $unwind: "$role" },
                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$memberId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ["$_id", "$$memberId"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    profileImage: 1,
                                    fullName: 1,
                                    phoneNumber: 1,
                                    email: 1,
                                    companyName: 1
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: "$member" },
                {
                    $project: {
                        _id: 1,
                        roleName: "$role.name",
                        roleCode: "$role.code",
                        member: {
                            id: "$member._id",
                            profileImage: "$member.profileImage",
                            fullName: "$member.fullName",
                            phoneNumber: "$member.phoneNumber",
                            email: "$member.email",
                            companyName: "$member.companyName"
                        }
                    }
                }
            ];

            const chapterRoles = await this.chapterRoleAssignmentRepo.aggregate(rolesPipeline).toArray();

            return response(
                res,
                StatusCodes.OK,
                "Chapter roles and ED/RD members fetched successfully",
                {
                    edRdMembers,
                    chapterRoles
                }
            );

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }
}
