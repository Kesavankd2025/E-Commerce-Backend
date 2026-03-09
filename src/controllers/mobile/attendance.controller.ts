import {
    JsonController,
    Post,
    Put,
    Get,
    Param,
    Body,
    Req,
    Res,
    UseBefore,
    QueryParams
} from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { Meeting } from "../../entity/Meeting";
import { Training } from "../../entity/Training";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { pagination, response } from "../../utils";
import { Attendance } from "../../entity/Attendance";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { AttendanceStatusEnum, BulkAttendanceDto, CreateAttendanceDto, SourceTypeEnum, UpdateAttendanceDto } from "../../dto/mobile/Attendance.dto";
import { MeetingChiefGuest } from "../../entity/MeetingChiefGuest";
import { Member } from "../../entity/Member";
import { Chapter } from "../../entity/Chapter";
import { SuspensionHistory } from "../../entity/SuspensionHistory";
import { updateChapterBadge } from "../../utils/chapter.badge";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/attendance")
export class AttendanceController {

    private attendanceRepo =
        AppDataSource.getMongoRepository(Attendance);

    private meetingRepo =
        AppDataSource.getMongoRepository(Meeting);

    private trainingRepo =
        AppDataSource.getMongoRepository(Training);

    private pointsRepo = AppDataSource.getMongoRepository(Points);
    private userPointsRepo = AppDataSource.getMongoRepository(UserPoints);
    private historyRepo = AppDataSource.getMongoRepository(UserPointHistory);
    private meetingChiefGuestRepo =
        AppDataSource.getMongoRepository(MeetingChiefGuest);
    private memberRepo = AppDataSource.getMongoRepository(Member);
    private chapterRepo = AppDataSource.getMongoRepository(Chapter);
    private suspensionRepo = AppDataSource.getMongoRepository(SuspensionHistory);

    @Post("/mark")
    async markAttendance(
        @Req() req: RequestWithUser,
        @Body() body: CreateAttendanceDto,
        @Res() res: Response
    ) {
        try {

            const memberId = new ObjectId(req.user.userId);
            const sourceId = new ObjectId(body.sourceId);
            const userId = new ObjectId(req.user.userId);

            let status = body.status as AttendanceStatusEnum;

            if (body.sourceType?.toUpperCase().trim() === SourceTypeEnum.MEETING) {

                const meeting = await this.meetingRepo.findOneBy({
                    _id: sourceId,
                    isDelete: 0
                });

                if (!meeting)
                    return response(res, 404, "Meeting not found");

                const now = new Date();
                const startTime = new Date(meeting.startDateTime);
                const lateTime = new Date(meeting.latePunchTime);

                if (now < startTime) {
                    return response(
                        res,
                        400,
                        "Attendance can be marked only after the meeting starts"
                    );
                }
                if (now > lateTime) {
                    status = AttendanceStatusEnum.LATE;
                } else {
                    status = AttendanceStatusEnum.PRESENT;
                }
                if (meeting.location && meeting.location.latitude && meeting.location.longitude) {
                    if (!body.userLocation || !body.userLocation.latitude || !body.userLocation.longitude) {
                        return response(res, 400, "User location is required for marking attendance");
                    }

                    const distance = this.calculateDistance(
                        body.userLocation.latitude,
                        body.userLocation.longitude,
                        meeting.location.latitude,
                        meeting.location.longitude
                    );

                    if (distance > 500) {
                        return response(res, 400, `You are outside the 500-meter radius. Distance: ${Math.round(distance)}m`);
                    }
                }
            }

            if (body.sourceType?.toUpperCase().trim() === SourceTypeEnum.TRAINING) {

                const training = await this.trainingRepo.findOneBy({
                    _id: sourceId,
                    isDelete: 0
                });

                if (!training)
                    return response(res, 404, "Training not found");
                const now = new Date();
                const startTime = new Date(training.trainingDateTime);
                const durationHours = training.duration || 0;
                const lateTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

                if (now < startTime) {
                    return response(
                        res,
                        400,
                        "Attendance can be marked only after the training starts"
                    );
                }
                if (now > lateTime) {
                    status = AttendanceStatusEnum.LATE;
                } else {
                    status = AttendanceStatusEnum.PRESENT;
                }
                if (training.mode === "in-person") {
                    if (training.location && training.location.latitude && training.location.longitude) {
                        if (!body.userLocation || !body.userLocation.latitude || !body.userLocation.longitude) {
                            return response(res, 400, "User location is required for in-person training attendance");
                        }

                        const distance = this.calculateDistance(
                            body.userLocation.latitude,
                            body.userLocation.longitude,
                            training.location.latitude,
                            training.location.longitude
                        );

                        if (distance > 500) {
                            return response(res, 400, `You are outside the 500-meter radius. Distance: ${Math.round(distance)}m`);
                        }
                    }
                }
            }

            const existing = await this.attendanceRepo.findOne({
                where: {
                    memberId: memberId,
                    sourceId: sourceId,
                    sourceType: body.sourceType,
                }
            });
            if (existing) {
                return response(
                    res,
                    400,
                    "Attendance already marked"
                );
            }

            const attendance = new Attendance();

            attendance.memberId = memberId;
            attendance.sourceId = sourceId;
            attendance.sourceType = body.sourceType;
            attendance.status = status;
            attendance.userLocation = body.userLocation;
            attendance.createdBy = userId;
            attendance.isActive = 1;
            attendance.isDelete = 0;
            attendance.createdAt = new Date();

            const savedAttendance = await this.attendanceRepo.save(attendance);

            if (status === AttendanceStatusEnum.PRESENT) {
                let pointKey = "";
                if (body.sourceType?.toUpperCase().trim() === SourceTypeEnum.MEETING) {
                    pointKey = "weekly_meetings";
                }
                else if (body.sourceType?.toUpperCase().trim() === SourceTypeEnum.TRAINING) {
                    pointKey = "trainings";
                }

                if (pointKey) {
                    const pointConfig = await this.pointsRepo.findOne({
                        where: { key: pointKey, isActive: 1, isDelete: 0 }
                    });

                    if (pointConfig) {
                        await this.userPointsRepo.updateOne(
                            { userId, pointKey },
                            { $inc: { value: pointConfig.value } },
                            { upsert: true }
                        );

                        await this.historyRepo.save({
                            userId,
                            pointKey,
                            change: pointConfig.value,
                            source: body.sourceType,
                            sourceId: savedAttendance._id,
                            remarks: `${body.sourceType} Attendance Marked`,
                            createdAt: new Date()
                        });
                    }
                }
            }

            return response(
                res,
                StatusCodes.CREATED,
                "Attendance marked successfully",
                attendance
            );

        } catch (error: any) {
            return response(res, 500, error.message);
        }
    }


    @Put("/update/:id")
    async updateAttendance(
        @Param("id") id: string,
        @Body() body: UpdateAttendanceDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            if (!ObjectId.isValid(id)) {
                return response(res, 400, "Invalid attendance id");
            }

            const attendance = await this.attendanceRepo.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!attendance) {
                return response(res, 404, "Attendance not found");
            }

            if (body.status)
                attendance.status = body.status;

            if (body.userLocation)
                attendance.userLocation = body.userLocation;

            attendance.updatedBy = new ObjectId(req.user.userId);
            attendance.updatedAt = new Date();

            await this.attendanceRepo.save(attendance);

            if (body.status === AttendanceStatusEnum.ABSENT || body.status === AttendanceStatusEnum.PROXY) {
                await this.checkAndSuspendMember(attendance.memberId);
            }

            return response(
                res,
                200,
                "Attendance updated successfully",
                attendance
            );

        } catch (error: any) {
            return response(res, 500, error.message);
        }
    }

    @Get("/source/:sourceType/:sourceId")
    async getBySource(
        @Param("sourceType") sourceType: "MEETING" | "TRAINING",
        @Param("sourceId") sourceId: string,
        @Res() res: Response
    ) {
        try {

            const list = await this.attendanceRepo.find({
                where: {
                    sourceType,
                    sourceId: new ObjectId(sourceId),
                    isDelete: 0
                }
            });

            return response(
                res,
                200,
                "Attendance fetched successfully",
                list
            );

        } catch (error: any) {
            return response(res, 500, error.message);
        }
    }

    @Get("/member/:memberId")
    async getMemberAttendance(
        @Param("memberId") memberId: string,
        @Res() res: Response
    ) {
        try {

            const list = await this.attendanceRepo.find({
                where: {
                    memberId: new ObjectId(memberId),
                    isDelete: 0
                }
            });

            return response(
                res,
                200,
                "Member attendance fetched successfully",
                list
            );

        } catch (error: any) {
            return response(res, 500, error.message);
        }
    }
    @Post("/admin/bulk-mark")
    async adminBulkAttendance(
        @Req() req: RequestWithUser,
        @Body() body: BulkAttendanceDto,
        @Res() res: Response
    ) {
        try {

            const adminId = new ObjectId(req.user.userId);
            const sourceId = new ObjectId(body.sourceId);
            const status = body.status || AttendanceStatusEnum.PRESENT;

            // Validate source
            if (body.sourceType === "MEETING") {
                const meeting = await this.meetingRepo.findOneBy({
                    _id: sourceId,
                    isDelete: 0
                });
                if (!meeting) return response(res, 404, "Meeting not found");

                if (meeting.location && meeting.location.latitude && meeting.location.longitude) {
                    if (!body.userLocation || !body.userLocation.latitude || !body.userLocation.longitude) {
                        return response(res, 400, "User location is required for marking attendance");
                    }

                    const distance = this.calculateDistance(
                        body.userLocation.latitude,
                        body.userLocation.longitude,
                        meeting.location.latitude,
                        meeting.location.longitude
                    );

                    if (distance > 500) {
                        return response(res, 400, `You are outside the 500-meter radius. Distance: ${Math.round(distance)}m`);
                    }
                }
            }

            if (body.sourceType === "TRAINING") {
                const training = await this.trainingRepo.findOneBy({
                    _id: sourceId,
                    isDelete: 0
                });
                if (!training) return response(res, 404, "Training not found");

                if (training.mode === "in-person") {
                    if (training.location && training.location.latitude && training.location.longitude) {
                        if (!body.userLocation || !body.userLocation.latitude || !body.userLocation.longitude) {
                            return response(res, 400, "User location is required for in-person training attendance");
                        }

                        const distance = this.calculateDistance(
                            body.userLocation.latitude,
                            body.userLocation.longitude,
                            training.location.latitude,
                            training.location.longitude
                        );

                        if (distance > 500) {
                            return response(res, 400, `You are outside the 500-meter radius. Distance: ${Math.round(distance)}m`);
                        }
                    }
                }
            }

            const bulkOps = body.members.map(memberId => ({
                updateOne: {
                    filter: {
                        memberId: new ObjectId(memberId),
                        sourceId,
                        sourceType: body.sourceType
                    },
                    update: {
                        $set: {
                            status: status,
                            updatedBy: adminId,
                            updatedAt: new Date(),
                            isDelete: 0
                        },
                        $setOnInsert: {
                            memberId: new ObjectId(memberId),
                            sourceId,
                            sourceType: body.sourceType,
                            createdBy: adminId,
                            isActive: 1,
                            createdAt: new Date()
                        }
                    },
                    upsert: true
                }
            }));

            await this.attendanceRepo.bulkWrite(bulkOps);

            // Check suspension for each affected member
            if (body.sourceType === "MEETING" && (status === AttendanceStatusEnum.ABSENT || status === AttendanceStatusEnum.PROXY)) {
                for (const memberId of body.members) {
                    await this.checkAndSuspendMember(new ObjectId(memberId));
                }
            }

            return response(
                res,
                200,
                `Bulk attendance marked as ${status}`
            );

        } catch (error: any) {
            console.error(error);
            return response(res, 500, error.message);
        }
    }

    @Get("/chief-guest/history/:chiefGuestId")
    async chiefGuestHistory(
        @Param("chiefGuestId") chiefGuestId: string,
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(chiefGuestId)) {
                return response(res, 400, "Invalid chiefGuestId");
            }

            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Number(query.limit ?? 0);
            const search = query.search?.trim();

            const dataPipeline: any[] = [];

            if (limit > 0) {
                dataPipeline.push(
                    { $skip: page * limit },
                    { $limit: limit }
                );
            }

            dataPipeline.push({
                $project: {
                    _id: 0,
                    chapterName: "$chapter.chapterName",
                    invitedBy: "$invitedBy.fullName",
                    meetingDate: "$meeting.startDateTime",
                    meetingStatus: 1
                }
            });

            const pipeline: any[] = [
                {
                    $match: {
                        chiefGuestId: new ObjectId(chiefGuestId),
                        isActive: 1,
                        isDelete: 0
                    }
                },

                {
                    $lookup: {
                        from: "meetings",
                        let: { meetingId: "$meetingId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$meetingId"] } } },
                            { $project: { chapters: 1, startDateTime: 1 } }
                        ],
                        as: "meeting"
                    }
                },
                { $unwind: "$meeting" },

                {
                    $lookup: {
                        from: "chapters",
                        let: { chapterIds: "$meeting.chapters" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$_id", "$$chapterIds"] } } },
                            { $project: { chapterName: 1 } }
                        ],
                        as: "chapter"
                    }
                },
                { $unwind: "$chapter" },

                {
                    $lookup: {
                        from: "member",
                        let: { invitedById: "$createdBy" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$_id", "$$invitedById"] } } },
                            { $project: { fullName: 1 } }
                        ],
                        as: "invitedBy"
                    }
                },
                { $unwind: "$invitedBy" },

                {
                    $lookup: {
                        from: "attendance",
                        let: { meetingId: "$meetingId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$sourceId", "$$meetingId"] },
                                            { $eq: ["$sourceType", "MEETING"] },
                                            { $eq: ["$isActive", 1] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            { $project: { status: 1 } }
                        ],
                        as: "attendance"
                    }
                },

                {
                    $addFields: {
                        meetingStatus: {
                            $cond: [
                                { $gt: [{ $size: "$attendance" }, 0] },
                                {
                                    $cond: [
                                        {
                                            $gt: [
                                                {
                                                    $size: {
                                                        $filter: {
                                                            input: "$attendance",
                                                            as: "a",
                                                            cond: {
                                                                $in: ["$$a.status", ["present", "late", "proxy"]]
                                                            }
                                                        }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        "Attended",
                                        "Rejected"
                                    ]
                                },
                                "Pending"
                            ]
                        }
                    }
                },

                ...(search ? [{
                    $match: {
                        $or: [
                            { "chapter.chapterName": { $regex: search, $options: "i" } },
                            { "invitedBy.fullName": { $regex: search, $options: "i" } },
                            { meetingStatus: { $regex: search, $options: "i" } }
                        ]
                    }
                }] : []),

                { $sort: { "meeting.startDateTime": -1 } },

                {
                    $facet: {
                        data: dataPipeline,
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.meetingChiefGuestRepo.aggregate(pipeline).toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            console.error(error);
            return response(res, 500, "Failed to fetch chief guest history");
        }
    }

    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    private async checkAndSuspendMember(memberId: ObjectId): Promise<void> {
        try {
            const member = await this.memberRepo.findOneBy({ _id: memberId, isDelete: 0, isActive: 1 });
            if (!member || !member.chapter) return;

            const chapter = await this.chapterRepo.findOneBy({ _id: new ObjectId(member.chapter) });
            if (!chapter) return;

            const absentLimit = chapter.absentLimit ?? null;
            const proxyLimit = chapter.proxyLimit ?? null;

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth(); // 0-11

            let tenureStart: Date;
            let tenureEnd: Date;

            if (currentMonth <= 5) {
                // Jan - Jun
                tenureStart = new Date(currentYear, 0, 1, 0, 0, 0, 0);
                tenureEnd = new Date(currentYear, 5, 30, 23, 59, 59, 999);
            } else {
                // Jul - Dec
                tenureStart = new Date(currentYear, 6, 1, 0, 0, 0, 0);
                tenureEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);
            }

            if (absentLimit !== null) {
                const absentCount = await this.attendanceRepo.countDocuments({
                    memberId: memberId,
                    status: AttendanceStatusEnum.ABSENT,
                    isDelete: 0,
                    createdAt: {
                        $gte: tenureStart,
                        $lte: tenureEnd
                    }
                });

                if (absentCount >= absentLimit) {
                    await this.memberRepo.update(new ObjectId(String(memberId)), { isActive: 0 });
                    await updateChapterBadge(member.chapter);

                    await this.suspensionRepo.save({
                        memberId: new ObjectId(String(memberId)),
                        reason: "Absent Limit Crossed",
                        action: "Suspended",
                        actionBy: "System",
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });

                    console.log(`🚫 Member ${memberId} suspended — absent: ${absentCount}/${absentLimit}`);
                    return;
                }
            }

            if (proxyLimit !== null) {
                const proxyCount = await this.attendanceRepo.countDocuments({
                    memberId: memberId,
                    status: AttendanceStatusEnum.PROXY,
                    isDelete: 0,
                    createdAt: {
                        $gte: tenureStart,
                        $lte: tenureEnd
                    }
                });

                if (proxyCount >= proxyLimit) {
                    await this.memberRepo.update(new ObjectId(String(memberId)), { isActive: 0 });
                    await updateChapterBadge(member.chapter);

                    await this.suspensionRepo.save({
                        memberId: new ObjectId(String(memberId)),
                        reason: "Proxy Limit Crossed",
                        action: "Suspended",
                        actionBy: "System",
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });

                    console.log(`🚫 Member ${memberId} suspended — proxy: ${proxyCount}/${proxyLimit}`);
                }
            }
        } catch (err) {
            console.error("Suspension check failed:", err);
        }
    }

}
