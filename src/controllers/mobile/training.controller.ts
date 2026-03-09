import {
    JsonController,
    Get,
    Req,
    Res,
    QueryParams,
    UseBefore,
    Post,
    Body,
    Param
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { Training } from "../../entity/Training";
import { Member } from "../../entity/Member";
import { TrainingParticipants } from "../../entity/TrainingParticipants";
import { CreateTrainingMember } from "../../dto/mobile/TrainingParticipants";
import { Attendance } from "../../entity/Attendance";
import { TrainingStatus } from "../../enum/TrainingStatus";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/training")
export class MobileTrainingController {
    private trainingRepository = AppDataSource.getMongoRepository(Training);
    private memberRepository = AppDataSource.getMongoRepository(Member);
    private particantRepository = AppDataSource.getMongoRepository(TrainingParticipants);
    private attendanceRepo = AppDataSource.getMongoRepository(Attendance);

    @Get("/list")
    async listTrainings(
        @QueryParams() query: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Math.max(Number(query.limit) || 10, 1);
            const search = query.search?.toString();
            const userId = new ObjectId(req.user.userId);
            const member = await this.memberRepository.findOneBy({ _id: userId });

            if (!member) {
                return response(res, StatusCodes.NOT_FOUND, "Member not found");
            }

            const memberChapterId = member.chapter;
            const now = new Date();

            const match: any = {
                isDelete: 0,
                chapterIds: { $in: [memberChapterId] }
            };

            if (search) {
                match.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { description: { $regex: search, $options: "i" } }
                ];
            }

            const pipeline: any = [
                { $match: match },
                { $sort: { isActive: -1, trainingDateTime: -1 } },
                {
                    $lookup: {
                        from: "chapters",
                        let: { chapterIds: "$chapterIds" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ["$_id", "$$chapterIds"] }
                                }
                            },
                            { $project: { _id: 1, chapterName: 1 } }
                        ],
                        as: "chapters"
                    }
                },
                {
                    $lookup: {
                        from: "adminusers",
                        let: { trainerIds: "$trainerIds" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ["$_id", "$$trainerIds"] }
                                }
                            },
                            { $project: { _id: 1, name: 1, profileImage: 1 } }
                        ],
                        as: "trainers"
                    }
                },
                {
                    $lookup: {
                        from: "training_participants",
                        let: {
                            trainingId: "$_id",
                            memberId: userId
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$trainingId", "$$trainingId"] },
                                            { $eq: ["$memberId", "$$memberId"] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1, status: 1, paymentStatus: 1 } },
                            { $limit: 1 }
                        ],
                        as: "training_participants"
                    }
                },
                {
                    $lookup: {
                        from: "training_participants",
                        let: { trainingId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$trainingId", "$$trainingId"] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        as: "total_participants"
                    }
                },
                {
                    $addFields: {
                        isAlreadyApplied: {
                            $gt: [{ $size: "$training_participants" }, 0]
                        },

                        totalCount: {
                            $ifNull: [
                                { $arrayElemAt: ["$total_participants.count", 0] },
                                0
                            ]
                        },
                        trainingStatus: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ["$isActive", 0] },
                                        then: TrainingStatus.CANCELLED
                                    },
                                    {
                                        case: {
                                            $lt: [
                                                { $add: ["$trainingDateTime", { $multiply: ["$duration", 3600000] }] },
                                                now
                                            ]
                                        },
                                        then: TrainingStatus.COMPLETED
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $lte: ["$trainingDateTime", now] },
                                                {
                                                    $gte: [
                                                        { $add: ["$trainingDateTime", { $multiply: ["$duration", 3600000] }] },
                                                        now
                                                    ]
                                                }
                                            ]
                                        },
                                        then: TrainingStatus.LIVE
                                    }
                                ],
                                default: TrainingStatus.UPCOMING
                            }
                        }

                    }
                },
                {
                    $addFields: {
                        canApply: {
                            $cond: {
                                if: {
                                    $or: [
                                        "$isAlreadyApplied",
                                        { $gte: ["$totalCount", "$maxAllowed"] },
                                        {
                                            $and: [
                                                { $ifNull: ["$lastDateForApply", false] },
                                                { $lt: ["$lastDateForApply", now] }
                                            ]
                                        },
                                        { $in: ["$trainingStatus", [TrainingStatus.COMPLETED, TrainingStatus.CANCELLED]] }
                                    ]
                                },
                                then: false,
                                else: true
                            }
                        },

                        participantInfo: {
                            $cond: {
                                if: "$isAlreadyApplied",
                                then: { $arrayElemAt: ["$training_participants", 0] },
                                else: {
                                    _id: "",
                                    status: "",
                                    paymentStatus: ""
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        chapterIds: 0,
                        trainerIds: 0,
                        training_participants: 0,
                        total_participants: 0,
                        totalCount: 0
                    }
                },

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
            const [result] = await this.trainingRepository
                .aggregate(pipeline)
                .toArray();

            const data = result?.data || [];
            const total = result?.meta?.[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async getTrainingDetails(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid training ID");
            }

            const trainingId = new ObjectId(id);
            const userId = new ObjectId(req.user.userId);
            const now = new Date();

            const match: any = {
                _id: trainingId,
                isDelete: 0
            };

            const pipeline: any = [
                { $match: match },
                {
                    $lookup: {
                        from: "chapters",
                        let: { chapterIds: "$chapterIds" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ["$_id", "$$chapterIds"] }
                                }
                            },
                            { $project: { _id: 1, chapterName: 1 } }
                        ],
                        as: "chapters"
                    }
                },
                {
                    $lookup: {
                        from: "adminusers",
                        let: { trainerIds: "$trainerIds" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ["$_id", "$$trainerIds"] }
                                }
                            },
                            { $project: { _id: 1, name: 1, profileImage: 1 } }
                        ],
                        as: "trainers"
                    }
                },
                {
                    $lookup: {
                        from: "training_participants",
                        let: {
                            trainingId: "$_id",
                            memberId: userId
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$trainingId", "$$trainingId"] },
                                            { $eq: ["$memberId", "$$memberId"] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            { $project: { _id: 1, status: 1, paymentStatus: 1 } },
                            { $limit: 1 }
                        ],
                        as: "training_participants"
                    }
                },
                {
                    $lookup: {
                        from: "training_participants",
                        let: { trainingId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$trainingId", "$$trainingId"] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        as: "total_participants"
                    }
                },
                {
                    $addFields: {
                        isAlreadyApplied: {
                            $gt: [{ $size: "$training_participants" }, 0]
                        },
                        totalCount: {
                            $ifNull: [
                                { $arrayElemAt: ["$total_participants.count", 0] },
                                0
                            ]
                        },
                        trainingStatus: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ["$isActive", 0] },
                                        then: TrainingStatus.CANCELLED
                                    },
                                    {
                                        case: {
                                            $lt: [
                                                { $add: ["$trainingDateTime", { $multiply: ["$duration", 3600000] }] },
                                                now
                                            ]
                                        },
                                        then: TrainingStatus.COMPLETED
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $lte: ["$trainingDateTime", now] },
                                                {
                                                    $gte: [
                                                        { $add: ["$trainingDateTime", { $multiply: ["$duration", 3600000] }] },
                                                        now
                                                    ]
                                                }
                                            ]
                                        },
                                        then: TrainingStatus.LIVE
                                    }
                                ],
                                default: TrainingStatus.UPCOMING
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        canApply: {
                            $cond: {
                                if: {
                                    $or: [
                                        "$isAlreadyApplied",
                                        { $gte: ["$totalCount", "$maxAllowed"] },
                                        {
                                            $and: [
                                                { $ifNull: ["$lastDateForApply", false] },
                                                { $lt: ["$lastDateForApply", now] }
                                            ]
                                        },
                                        { $in: ["$trainingStatus", [TrainingStatus.COMPLETED, TrainingStatus.CANCELLED]] }
                                    ]
                                },
                                then: false,
                                else: true
                            }
                        },
                        participantInfo: {
                            $cond: {
                                if: "$isAlreadyApplied",
                                then: { $arrayElemAt: ["$training_participants", 0] },
                                else: {
                                    _id: "",
                                    status: "",
                                    paymentStatus: ""
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        chapterIds: 0,
                        trainerIds: 0,
                        training_participants: 0,
                        total_participants: 0,
                        totalCount: 0
                    }
                },
                { $limit: 1 }
            ];

            const [result] = await this.trainingRepository
                .aggregate(pipeline)
                .toArray();

            if (!result) {
                return response(res, StatusCodes.NOT_FOUND, "Training not found");
            }

            return response(res, StatusCodes.OK, "Training details fetched successfully", result);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/status")
    async interested(
        @Body() body: CreateTrainingMember,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const memberId = new ObjectId(req.user.userId);
            const trainingObjectId = new ObjectId(body.trainingId);
            const now = new Date();

            const training = await this.trainingRepository.findOneBy({
                _id: trainingObjectId,
                isDelete: 0,
                isActive: 1
            });

            if (!training) {
                return response(res, StatusCodes.NOT_FOUND, "Training not found");
            }

            if (training.lastDateForApply && now > training.lastDateForApply) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "Last date for apply has expired"
                );
            }

            const insertResult = await this.particantRepository.aggregate([
                {
                    $match: {
                        trainingId: trainingObjectId,
                        isDelete: 0
                    }
                },
                {
                    $count: "total"
                }
            ]).toArray();

            const currentCount = insertResult[0]?.total || 0;

            if (currentCount >= training.maxAllowed) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "Maximum participants limit reached"
                );
            }


            const alreadyApplied = await this.particantRepository.findOne({
                where: {
                    trainingId: trainingObjectId,
                    memberId: memberId,
                    isDelete: 0
                }
            });

            if (alreadyApplied) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "You have already applied for this training"
                );
            }

            const trainingParticipant = new TrainingParticipants();

            trainingParticipant.memberId = memberId;
            trainingParticipant.trainingId = trainingObjectId;
            trainingParticipant.status = body.status;
            trainingParticipant.paymentStatus = 'pending';

            if (body.paymentProofImage !== undefined)
                trainingParticipant.paymentProofImage = body.paymentProofImage;

            trainingParticipant.isActive = 1;
            trainingParticipant.isDelete = 0;
            trainingParticipant.createdBy = memberId;
            trainingParticipant.updatedBy = memberId;

            const saved = await this.particantRepository.save(trainingParticipant);

            return response(
                res,
                StatusCodes.CREATED,
                "Applied successfully",
                saved
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/attended")
    async listMyAttendedTrainings(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const memberId = new ObjectId(req.user.userId);

            const page = Math.max(Number(req.query.page) || 0, 0);
            let limit = Number(req.query.limit || 0);

            const basePipeline: any[] = [

                {
                    $match: {
                        memberId,
                        sourceType: "TRAINING",
                        status: "present",
                        isDelete: 0
                    }
                },

                {
                    $lookup: {
                        from: "training",
                        localField: "sourceId",
                        foreignField: "_id",
                        as: "training"
                    }
                },
                { $unwind: "$training" },

                {
                    $lookup: {
                        from: "training_participants",
                        let: {
                            trainingId: "$training._id",
                            memberId
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
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            { $project: { status: 1, paymentStatus: 1 } }
                        ],
                        as: "participant"
                    }
                },

                { $match: { participant: { $ne: [] } } },
                { $unwind: "$participant" },
                {
                    $addFields: {
                        "training.trainingStatus": {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ["$training.isActive", 0] },
                                        then: TrainingStatus.CANCELLED
                                    },
                                    {
                                        case: {
                                            $lt: [
                                                { $add: ["$training.trainingDateTime", { $multiply: ["$training.duration", 3600000] }] },
                                                new Date()
                                            ]
                                        },
                                        then: TrainingStatus.COMPLETED
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $lte: ["$training.trainingDateTime", new Date()] },
                                                { $gte: [{ $add: ["$training.trainingDateTime", { $multiply: ["$training.duration", 3600000] }] }, new Date()] }
                                            ]
                                        },
                                        then: TrainingStatus.LIVE
                                    }
                                ],
                                default: TrainingStatus.UPCOMING
                            }
                        }
                    }
                },

                {
                    $project: {
                        _id: "$training._id",
                        trainingId: "$training.trainingId",
                        title: "$training.title",
                        description: "$training.description",
                        trainingDateTime: "$training.trainingDateTime",
                        lastDateForApply: "$training.lastDateForApply",
                        duration: "$training.duration",
                        mode: "$training.mode",
                        locationOrLink: "$training.locationOrLink",
                        maxAllowed: "$training.maxAllowed",
                        status: "$training.trainingStatus",
                        trainingFee: "$training.trainingFee",
                        attendanceStatus: "present",
                        participantStatus: "$participant.status",
                        paymentStatus: "$participant.paymentStatus"
                    }
                },

                { $sort: { trainingDateTime: -1 } }
            ];

            if (limit > 0) {
                basePipeline.push(
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
                );

                const [result] = await this.attendanceRepo
                    .aggregate(basePipeline)
                    .toArray();

                const data = result?.data || [];
                const total = result?.meta?.[0]?.total || 0;

                return pagination(total, data, limit, page, res);
            }

            const data = await this.attendanceRepo
                .aggregate(basePipeline)
                .toArray();

            return response(
                res,
                StatusCodes.OK,
                "Attended trainings fetched successfully",
                data
            );

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }

}
