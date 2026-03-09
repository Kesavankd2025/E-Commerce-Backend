import {
    JsonController,
    Post,
    Body,
    Req,
    Res,
    UseBefore,
    Put,
    Get,
    Param,
    Delete,
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import * as QRCode from "qrcode";
import * as fs from "fs";
import * as path from "path";

import { AppDataSource } from "../../data-source";
import { Meeting } from "../../entity/Meeting";
import { Member } from "../../entity/Member";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { CreateMobileMeetingDto } from "../../dto/mobile/Meeting.dto";
import { CreateMeetingDto } from "../../dto/admin/Meeting.dto";
import { handleErrorResponse, pagination, response } from "../../utils";
import { AssignChiefGuestDto } from "../../dto/mobile/MeetingChiefGuest.dto";
import { MobileChiefGuest } from "../../entity/MobileChiefGuest";
import { ChiefGuest } from "../../entity/ChiefGuest";
import { MeetingChiefGuest } from "../../entity/MeetingChiefGuest";
import { Chapter } from "../../entity/Chapter";
// import { sendChiefGuestAssignmentSMS } from "../../utils/sms";
import { MeetingStatus } from "../../enum/MeetingStatus";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

const generateMeetingQR = async (meetingId: string) => {
    const uploadDir = path.join(process.cwd(), "public", "meeting", "qr");

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `meeting-${meetingId}.png`;
    const filePath = path.join(uploadDir, fileName);

    const qrData = `meetingId=${meetingId}`;

    await QRCode.toFile(filePath, qrData, {
        width: 300,
        margin: 2,
    });

    return {
        fileName,
        path: `/meeting/qr/${fileName}`,
        originalName: fileName,
    };
};

@UseBefore(AuthMiddleware)
@JsonController("/meeting")
export class MeetingController {
    private meetingRepository = AppDataSource.getMongoRepository(Meeting);
    private memberRepository = AppDataSource.getMongoRepository(Member);
    private meetingRepo = AppDataSource.getMongoRepository(Meeting);
    private mobileGuestRepo = AppDataSource.getMongoRepository(MobileChiefGuest);
    private adminGuestRepo = AppDataSource.getMongoRepository(ChiefGuest);
    private assignRepo = AppDataSource.getMongoRepository(MeetingChiefGuest);
    @Post("/create")
    async createMeeting(
        @Req() req: RequestWithUser,
        @Body() body: CreateMobileMeetingDto,
        @Res() res: Response,
    ) {
        try {
            const memberRepo = AppDataSource.getMongoRepository(Member);
            const member = await memberRepo.findOne({
                where: { _id: new ObjectId(req.user.userId) },
                select: ["chapter"],
            });

            if (!member || !member.chapter) {
                return response(
                    res,
                    StatusCodes.FORBIDDEN,
                    "Member not assigned to any chapter",
                );
            }

            const userChapterId = new ObjectId(member.chapter);

            const meeting = this.meetingRepository.create({
                meetingTopic: body.meetingTopic,
                meetingFee: body.meetingFee,
                visitorFee: body.visitorFee,
                hotelName: body.hotelName,

                chapters: [userChapterId],

                startDateTime: new Date(body.startDateTime),
                endDateTime: new Date(body.endDateTime),
                latePunchTime: new Date(body.latePunchTime),

                location: body.location,

                isActive: 1,
                isDelete: 0,

                createdBy: new ObjectId(req.user.userId),
                createdAt: new Date(),
            });

            const savedMeeting = await this.meetingRepository.save(meeting);

            const qrImage = await generateMeetingQR(savedMeeting._id.toString());

            await this.meetingRepository.update(savedMeeting._id, { qrImage });

            savedMeeting.qrImage = qrImage;

            return response(
                res,
                StatusCodes.CREATED,
                "Meeting created successfully",
                savedMeeting,
            );
        } catch (error: any) {
            console.error(error);

            return handleErrorResponse(error, res);
        }
    }

    @Put("/edit/:id")
    async editMeeting(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Body() body: CreateMeetingDto,
        @Res() res: Response,
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid meeting id");
            }

            const meeting = await this.meetingRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0,
            });

            if (!meeting) {
                return response(res, StatusCodes.NOT_FOUND, "Meeting not found");
            }

            if (body.meetingTopic) meeting.meetingTopic = body.meetingTopic;

            if (body.meetingFee !== undefined) meeting.meetingFee = body.meetingFee;

            if (body.visitorFee !== undefined) meeting.visitorFee = body.visitorFee;

            if (body.hotelName) meeting.hotelName = body.hotelName;

            if (body.startDateTime)
                meeting.startDateTime = new Date(body.startDateTime);

            if (body.endDateTime) meeting.endDateTime = new Date(body.endDateTime);

            if (body.latePunchTime)
                meeting.latePunchTime = new Date(body.latePunchTime);

            if (body.location) meeting.location = body.location;

            meeting.updatedBy = new ObjectId(req.user.userId);

            meeting.updatedAt = new Date();

            await this.meetingRepository.save(meeting);

            return response(
                res,
                StatusCodes.OK,
                "Meeting updated successfully",
                meeting,
            );
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async listMeetings(@Req() req: RequestWithUser, @Res() res: Response) {
        try {
            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Math.max(Number(req.query.limit) || 10, 1);
            const search = req.query.search?.toString();

            const memberRepo = AppDataSource.getMongoRepository(Member);
            const member = await memberRepo.findOne({
                where: { _id: new ObjectId(req.user.userId) },
                select: ["chapter"],
            });

            if (!member || !member.chapter) {
                return response(
                    res,
                    StatusCodes.FORBIDDEN,
                    "Member not assigned to any chapter",
                );
            }

            const userChapterId = new ObjectId(member.chapter);
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const match: any = {
                isDelete: 0,
                chapters: { $in: [userChapterId] },
                startDateTime: { $gte: startOfToday }
            };

            if (search) {
                match.$or = [
                    { meetingTopic: { $regex: search, $options: "i" } },
                    { hotelName: { $regex: search, $options: "i" } },
                    { "location.name": { $regex: search, $options: "i" } },
                ];
            }

            const now = new Date();

            const pipeline = [
                { $match: match },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "chapters",
                        foreignField: "_id",
                        as: "chapters",
                    },
                },
                { $sort: { isActive: -1, createdAt: -1 } },

                {
                    $addFields: {
                        meetingStatus: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ["$isActive", 0] }, then: MeetingStatus.CANCELLED },
                                    { case: { $lt: ["$endDateTime", now] }, then: MeetingStatus.COMPLETED },
                                    {
                                        case: {
                                            $and: [
                                                { $lte: ["$startDateTime", now] },
                                                { $gte: ["$endDateTime", now] }
                                            ]
                                        },
                                        then: MeetingStatus.LIVE
                                    }
                                ],
                                default: MeetingStatus.UPCOMING
                            }
                        }
                    }
                },

                {
                    $facet: {
                        data: [{ $skip: page * limit }, { $limit: limit }],
                        meta: [{ $count: "total" }],
                    },
                },
            ];

            const result = await this.meetingRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/delete/:id")
    async deleteMeeting(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response,
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid meeting id");
            }

            const meeting = await this.meetingRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0,
            });

            if (!meeting) {
                return response(res, StatusCodes.NOT_FOUND, "Meeting not found");
            }

            meeting.isDelete = 1;
            meeting.updatedAt = new Date();
            meeting.updatedBy = new ObjectId(req.user.userId);

            await this.meetingRepository.save(meeting);

            return response(res, StatusCodes.OK, "Meeting deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/upcoming-list")
    async upcomingMeetings(@Req() req: RequestWithUser, @Res() res: Response) {
        try {
            const memberRepo = AppDataSource.getMongoRepository(Member);
            const member = await memberRepo.findOne({
                where: { _id: new ObjectId(req.user.userId) },
                select: ["chapter"],
            });

            if (!member || !member.chapter) {
                return response(
                    res,
                    StatusCodes.FORBIDDEN,
                    "Member not assigned to any chapter",
                );
            }

            const userChapterId = new ObjectId(member.chapter);
            const now = new Date();
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const upcomingList = await this.meetingRepository.find({
                where: {
                    isDelete: 0,
                    isActive: 1,
                    chapters: { $in: [userChapterId] },
                    startDateTime: { $gte: startOfToday }
                },
                order: {
                    startDateTime: "ASC"
                },
                select: {
                    meetingTopic: true,
                    startDateTime: true
                }
            });

            return response(
                res,
                StatusCodes.OK,
                "Upcoming meetings fetched successfully",
                upcomingList
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Post("/assign-chief-guest")
    async assignChiefGuest(
        @Req() req: RequestWithUser,
        @Body() body: AssignChiefGuestDto,
        @Res() res: Response
    ) {
        try {


            if (!ObjectId.isValid(body.meetingId)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid meeting ID");
            }
            const meeting = await this.meetingRepo.findOneBy({ _id: new ObjectId(body.meetingId), isDelete: 0 });
            if (!meeting) {
                return response(res, StatusCodes.NOT_FOUND, "Meeting not found");
            }

            if (!ObjectId.isValid(body.chiefGuestId)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid chief guest ID");
            }

            const guestId = new ObjectId(body.chiefGuestId);
            const mobileGuest = await this.mobileGuestRepo.findOneBy({ _id: guestId, isDelete: 0 });
            const adminGuest = await this.adminGuestRepo.findOneBy({ _id: guestId, isDelete: 0 });

            if (!mobileGuest && !adminGuest) {
                return response(res, StatusCodes.NOT_FOUND, "Chief Guest not found in either list");
            }

            const existingAssignment = await this.assignRepo.findOneBy({
                meetingId: new ObjectId(body.meetingId),
                chiefGuestId: guestId,
                isDelete: 0
            });

            if (existingAssignment) {
                return response(res, StatusCodes.CONFLICT, "Chief Guest already assigned to this meeting");
            }

            const assignment = this.assignRepo.create({
                meetingId: new ObjectId(body.meetingId),
                chiefGuestId: guestId,
                status: body.status,
                isActive: 1,
                isDelete: 0,
                createdBy: new ObjectId(req.user.userId),
                createdAt: new Date(),
                updatedBy: new ObjectId(req.user.userId),
                updatedAt: new Date()
            });

            const saved = await this.assignRepo.save(assignment);
            try {
                const guestPhone = (mobileGuest || adminGuest)?.contactNumber;
                const guestName = mobileGuest ? mobileGuest.chiefGuestName : adminGuest?.chiefGuestName;

                const invitingMember = await this.memberRepository.findOne({
                    where: { _id: new ObjectId(req.user.userId) },
                    select: ["fullName", "chapter"]
                });

                let chapterName = "";
                if (invitingMember?.chapter) {
                    const chapterRepo = AppDataSource.getMongoRepository(Chapter);
                    const chapter = await chapterRepo.findOneBy({ _id: new ObjectId(invitingMember.chapter) });
                    chapterName = chapter?.chapterName || "";
                }

                // if (guestPhone && guestName && invitingMember?.fullName) {
                //     await sendChiefGuestAssignmentSMS(
                //         guestName,
                //         guestPhone,
                //         invitingMember.fullName,
                //         chapterName
                //     );
                // }
            } catch (smsError) {
            }

            return response(res, StatusCodes.CREATED, "Chief Guest assigned successfully", saved);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/update-assigned-chief-guest/:id")
    async updateAssignedChiefGuest(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Body() body: { status: string },
        @Res() res: Response
    ) {
        try {
            const assignRepo = AppDataSource.getMongoRepository(MeetingChiefGuest);

            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid assignment ID");
            }

            const assignment = await assignRepo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!assignment) {
                return response(res, StatusCodes.NOT_FOUND, "Assignment not found");
            }

            if (body.status) {
                assignment.status = body.status;
            }

            assignment.updatedBy = new ObjectId(req.user.userId);
            assignment.updatedAt = new Date();

            const updated = await assignRepo.save(assignment);

            return response(res, StatusCodes.OK, "Assignment updated successfully", updated);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get('/meeting-team/:id')
    async getMeetingTeam(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);

            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid meeting ID");
            }

            const member = await this.memberRepository.findOneBy({ _id: userId });
            if (!member) {
                return response(res, StatusCodes.NOT_FOUND, "Member not found");
            }

            const meeting = await this.meetingRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });
            if (!meeting) {
                return response(res, StatusCodes.NOT_FOUND, "Meeting not found");
            }

            // Fetch meeting → chief guest mapping
            const meetingChiefGuest = await this.assignRepo.findOneBy({
                meetingId: new ObjectId(id),
                isDelete: 0,
                isActive: 1
            });

            // Fetch chief guest detail (if exists)
            let adminChiefGuest: any = null;
            if (meetingChiefGuest?.chiefGuestId) {
                const fetched = await this.adminGuestRepo.findOneBy({
                    _id: meetingChiefGuest.chiefGuestId,
                    isDelete: 0
                });

                if (fetched) {
                    adminChiefGuest = {
                        _id: fetched._id,
                        fullName: fetched.chiefGuestName,
                        profileImage: {
                            "originalName": "",
                            "fileName": "",
                            "path": ""
                        }, // Admin chief guests don't have profile images
                        businessCategory: 'Chief Guest', // Admin chief guests don't have business categories
                        chiefGuest: true // ADD THIS FLAG
                    };
                }
            }

            // Get members based on chapter
            const memberList = await this.memberRepository.aggregate([
                {
                    $match: {
                        chapter: member.chapter,
                        isDelete: 0,
                        isActive: 1,
                        _id: { $ne: userId } // Exclude logged-in member
                    }
                },
                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "businessCategory",
                        foreignField: "_id",
                        as: "businesscategories"
                    }
                },
                {
                    $project: {
                        _id: 1,
                        fullName: 1,
                        profileImage: 1,
                        businessCategory: { $arrayElemAt: ["$businesscategories.name", 0] },
                        chiefGuest: { $literal: false }  // members are not chief guest
                    }
                }
            ]).toArray();

            // Add adminChiefGuest to result list
            const result = adminChiefGuest
                ? [...memberList, adminChiefGuest]
                : [...memberList];

            return response(
                res,
                StatusCodes.OK,
                "Meeting team fetched successfully",
                result
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


}
