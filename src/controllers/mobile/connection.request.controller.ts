import { StatusCodes } from "http-status-codes";
import { handleErrorResponse, response } from "../../utils";
import { ObjectId } from "mongodb";
import { Body, Get, JsonController, Param, Patch, Post, Req, Res, UseBefore } from "routing-controllers";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { ConnectionRequests } from "../../entity/ConnectionRequest";
import { CreateConnectionReqDto } from "../../dto/mobile/Connection_Request";
import { NotificationService } from "../../services/notification.service";
import { Member } from "../../entity/Member";
import { Notifications } from "../../entity/Notification";

interface RequestWithUser extends Request {
    user: AuthPayload;
}
@UseBefore(AuthMiddleware)
@JsonController("/connection-request")
export class ConnectionRequestController {
    private repo = AppDataSource.getMongoRepository(ConnectionRequests);
    private memRepo = AppDataSource.getMongoRepository(Member);
    private NotificationRepo = AppDataSource.getMongoRepository(Notifications);
    private readonly notificationService: NotificationService;
    constructor() {
        this.notificationService = new NotificationService(); // ✅ FIXED
    }
    // ✅ CREATE
    @Post("/")
    async create(
        @Body() body: CreateConnectionReqDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);
            const receiverId = new ObjectId(body.memberId);

            const existing = await this.repo.findOne({
                where: {
                    isDelete: 0,
                    status: { $in: ["Pending", "Approved"] },
                    $or: [
                        { memberId: receiverId, createdBy: userId },
                        { memberId: userId, createdBy: receiverId }
                    ]
                }
            });

            if (existing) {
                return response(
                    res,
                    StatusCodes.CONFLICT,
                    "Request already sent"
                );
            }

            const request = new ConnectionRequests();
            request.memberId = receiverId;
            request.createdBy = userId;
            request.status = "Pending";
            request.isActive = 1;
            request.isDelete = 0;

            const saved = await this.repo.save(request);

            if (saved) {
                const sender = await this.memRepo.findOne({
                    where: { _id: userId }
                });

                if (sender) {
                    await this.notificationService.createNotification({
                        moduleName: "CONNECTION_REQ",
                        moduleId: saved._id,
                        createdBy: req.user.userId,
                        subject: "New Connection Request",
                        content: `You have received a new connection request from ${sender.fullName}`,
                        model: "Member",
                        memberId: receiverId,
                        actionType: "REQUEST"
                    });
                }
            }

            return response(
                res,
                StatusCodes.CREATED,
                "Connection request sent",
                saved
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // ✅ LIST (sent + received)
    @Get("/list")
    async list(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);

            const data = await this.repo.aggregate([
                {
                    $match: {
                        isDelete: 0,
                        $or: [
                            { createdBy: userId },
                            { memberId: userId }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "member",
                        localField: "memberId",
                        foreignField: "_id",
                        as: "requestedByDetails"
                    }
                },
                { $unwind: { path: "$requestedByDetails", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "member",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdByDetails"
                    }
                },
                { $unwind: { path: "$createdByDetails", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        status: 1,
                        createdAt: 1,
                        requestedBy: {
                            _id: "$requestedByDetails._id",
                            name: "$requestedByDetails.fullName",
                            profileImage: "$requestedByDetails.profileImage"
                        },
                        createdByDetails: {
                            _id: "$createdByDetails._id",
                            name: "$createdByDetails.fullName",
                            profileImage: "$createdByDetails.profileImage"
                        }
                    }
                },
                { $sort: { createdAt: -1 } }
            ]).toArray();

            return response(res, StatusCodes.OK, "List fetched", data);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    // ✅ DETAILS
    @Get("/:id")
    async details(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            const result = await this.repo.findOne({
                where: {
                    _id: new ObjectId(id),
                    isDelete: 0
                }
            });

            if (!result) {
                return response(res, StatusCodes.NOT_FOUND, "Request not found");
            }

            return response(res, StatusCodes.OK, "Details fetched", result);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Patch("/:id")
    async update(
        @Param("id") id: string,
        @Body() body: CreateConnectionReqDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);
            const status = body.status as "Approved" | "Declined";

            if (!["Approved", "Declined"].includes(status)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid status");
            }

            const request = await this.repo.findOne({
                where: {
                    _id: new ObjectId(id),
                    isDelete: 0
                }
            });

            if (!request) {
                return response(res, StatusCodes.NOT_FOUND, "Request not found");
            }

            if (!request.memberId.equals(userId)) {
                return response(res, StatusCodes.FORBIDDEN, "Not authorized");
            }
            request.status = status;
            request.updatedAt = new Date();

            const updated = await this.repo.save(request);
            await this.NotificationRepo.update(
                {
                    moduleName: "CONNECTION_REQ",
                    moduleId: new ObjectId(id),
                    isDelete: 0
                },
                {
                    actionType: status === "Approved" ? "APPROVE" : "DECLINE",
                    updatedAt: new Date()
                }
            );

            const receiver = await this.memRepo.findOne({
                where: { _id: userId }
            });

            const subject =
                status === "Approved"
                    ? "Connection Request Approved"
                    : "Connection Request Declined";

            const content =
                status === "Approved"
                    ? `${receiver.fullName} accepted your connection request`
                    : `${receiver.fullName} declined your connection request`;

            await this.notificationService.createNotification({
                moduleName: "CONNECTION_REQ",
                moduleId: updated._id,
                createdBy: req.user.userId,
                subject,
                content,
                model: "Member",
                memberId: request.createdBy,
                actionType: status === "Approved" ? "APPROVE" : "DECLINE"
            });

            return response(
                res,
                StatusCodes.OK,
                `Request ${status.toLowerCase()}`,
                updated
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


    // ✅ DELETE (Soft delete)
    @Patch("/delete/:id")
    async delete(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const result = await this.repo.updateOne(
                {
                    _id: new ObjectId(id),
                    requestedBy: new ObjectId(req.user.userId)
                },
                {
                    $set: { isDelete: 1, updatedAt: new Date() }
                }
            );

            return response(res, StatusCodes.OK, "Request deleted", result);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
