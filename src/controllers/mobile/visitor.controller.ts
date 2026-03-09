import {
    JsonController,
    Post,
    Put,
    Delete,
    Get,
    Param,
    Body,
    Req,
    Res,
    QueryParams,
    UseBefore,
    Patch
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { Visitor } from "../../entity/Visitor";
import { Chapter } from "../../entity/Chapter";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";

import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
// import { sendVisitorSMS } from "../../utils/sms";
import { CreateVisitorDto } from "../../dto/mobile/Visitor.dto";
import { Member } from "../../entity/Member";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/visitor")
export class VisitorController {
    private visitorRepo = AppDataSource.getMongoRepository(Visitor);
    private memberRepo = AppDataSource.getMongoRepository(Member);
    private chapterRepo = AppDataSource.getMongoRepository(Chapter);
    private pointsRepo = AppDataSource.getMongoRepository(Points);
    private userPointsRepo = AppDataSource.getMongoRepository(UserPoints);
    private historyRepo = AppDataSource.getMongoRepository(UserPointHistory);

    @Post("/")
    async createVisitor(
        @Body() body: CreateVisitorDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const member = await this.memberRepo.findOne({
                where: {
                    _id: new ObjectId(req.user.userId)
                }
            })

            const visitor = new Visitor();
            visitor.visitorName = body.visitorName;
            visitor.contactNumber = body.contactNumber;
            visitor.businessCategory = body.businessCategory;
            visitor.companyName = body.companyName;
            visitor.address = body.address;
            visitor.status = "Pending";
            visitor.email = body.email;
            visitor.chapterId = member.chapter;
            visitor.sourceType = "MEETING",
                visitor.profileImage = body.profileImage;
            visitor.about = body.about;
            visitor.isActive = 1;
            visitor.isDelete = 0;
            visitor.createdBy = new ObjectId(req.user.userId);
            visitor.updatedBy = new ObjectId(req.user.userId);
            const saved = await this.visitorRepo.save(visitor);

            const chapter = await this.chapterRepo.findOne({
                where: {
                    _id: new ObjectId(member.chapter)
                }
            });

            // if (chapter) {
            //     await sendVisitorSMS(
            //         visitor.visitorName,
            //         visitor.contactNumber,
            //         member.fullName,
            //         chapter.chapterName
            //     );
            // }

            // --- Points Allocation ---
            const pointConfig = await this.pointsRepo.findOne({
                where: { key: "visitors", isActive: 1, isDelete: 0 }
            });

            if (pointConfig) {
                const userId = new ObjectId(req.user.userId);

                await this.userPointsRepo.updateOne(
                    { userId, pointKey: "visitors" },
                    { $inc: { value: pointConfig.value } },
                    { upsert: true }
                );

                await this.historyRepo.save({
                    userId,
                    pointKey: "visitors",
                    change: pointConfig.value,
                    source: "VISITOR",
                    sourceId: saved._id,
                    remarks: "Visitor logged",
                    createdAt: new Date()
                });
            }

            return response(
                res,
                StatusCodes.CREATED,
                "Visitor created successfully",
                saved
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // =========================
    // ✅ UPDATE VISITOR
    // =========================
    @Patch("/:id")
    async updateVisitor(
        @Param("id") id: string,
        @Body() body: CreateVisitorDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const visitor = await this.visitorRepo.findOne({
                where: { _id: new ObjectId(id), isDelete: 0 }
            });

            if (!visitor) {
                return response(res, StatusCodes.NOT_FOUND, "Visitor not found");
            }

            Object.assign(visitor, {
                ...body,
                businessCategory: body.businessCategory,
                updatedBy: new ObjectId(req.user.userId)
            });

            const updated = await this.visitorRepo.save(visitor);

            return response(
                res,
                StatusCodes.OK,
                "Visitor updated successfully",
                updated
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // =========================
    // ✅ DELETE VISITOR (SOFT)
    // =========================
    @Delete("/:id")
    async deleteVisitor(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const visitor = await this.visitorRepo.findOne({
                where: { _id: new ObjectId(id), isDelete: 0 }
            });

            if (!visitor) {
                return response(res, StatusCodes.NOT_FOUND, "Visitor not found");
            }

            visitor.isDelete = 1;
            visitor.isActive = 0;
            visitor.updatedBy = new ObjectId(req.user.userId);

            await this.visitorRepo.save(visitor);

            return response(
                res,
                StatusCodes.OK,
                "Visitor deleted successfully"
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // =========================
    // ✅ VISITOR DETAILS
    // =========================
    @Get("/details/:id")
    async visitorDetails(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            const visitor = await this.visitorRepo.findOne({
                where: { _id: new ObjectId(id), isDelete: 0 }
            });

            if (!visitor) {
                return response(res, StatusCodes.NOT_FOUND, "Visitor not found");
            }

            return response(
                res,
                StatusCodes.OK,
                "Visitor details fetched successfully",
                visitor
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // =========================
    // ✅ LIST VISITORS (AGGREGATION + MEMBER LOOKUP)
    // =========================
    @Get("/list")
    async listVisitors(
        @QueryParams() query: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Math.max(Number(query.limit) || 10, 1);
            const search = query.search?.toString();
            const userId = new ObjectId(req.user.userId);

            const match: any = {
                isDelete: 0,
                createdBy: userId
            };

            if (search) {
                match.$or = [
                    { visitorName: { $regex: search, $options: "i" } },
                    { contactNumber: { $regex: search, $options: "i" } }
                ];
            }

            const pipeline = [
                { $match: match },

                // 🔹 Lookup member (Invited By)
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
                        profileImage: 1,
                        about: 1,
                        email: 1,
                        address: 1,
                        createdAt: 1,
                        invitedBy: {
                            _id: "$member._id",
                            name: "$member.fullName"
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
            return handleErrorResponse(error, res);
        }
    }
}
