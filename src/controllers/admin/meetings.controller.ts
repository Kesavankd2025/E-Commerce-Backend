import {
  Post,
  Body,
  Req,
  Res,
  UseBefore,
  JsonController,
  Put,
  Param,
  Get,
  Delete,
  Patch,
} from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import * as QRCode from "qrcode";
import * as fs from "fs";
import * as path from "path";

import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { Meeting } from "../../entity/Meeting";
import { handleErrorResponse, pagination, response } from "../../utils";
import { CreateMeetingDto } from "../../dto/admin/Meeting.dto";
import { Request, Response } from "express";
import { Chapter } from "../../entity/Chapter";
import { Attendance } from "../../entity/Attendance";
import { MeetingStatus } from "../../enum/MeetingStatus";

interface RequestWithUser extends Request {
  query: any;
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
@JsonController("/meetings")
export class MeetingController {
  private meetingRepository = AppDataSource.getMongoRepository(Meeting);

  @Post("/create")
  async createMeeting(
    @Req() req: RequestWithUser,
    @Body() body: CreateMeetingDto,
    @Res() res: Response,
  ) {
    try {
      const meeting = this.meetingRepository.create({
        meetingTopic: body.meetingTopic,
        meetingFee: body.meetingFee,
        visitorFee: body.visitorFee,
        hotelName: body.hotelName,

        chapters: body.chapters.map((id: string) => new ObjectId(id)),

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

      return response(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || "Something went wrong",
      );
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

      if (body.chapters?.length) {
        meeting.chapters = body.chapters.map((id) => new ObjectId(id));
      }

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
      return response(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || "Something went wrong",
      );
    }
  }

  @Get("/list")
  async listMeetings(@Req() req: RequestWithUser, @Res() res: Response) {
    try {
      const page = Math.max(Number(req.query.page) || 0, 0);
      const limit = Math.max(Number(req.query.limit) || 10, 1);

      const search = req.query.search?.toString();
      const chapter = req.query.chapter?.toString();
      const isActive = req.query.isActive?.toString();

      const match: any = { isDelete: 0 };

      if (chapter) {
        match.chapters = { $in: [new ObjectId(chapter)] };
      }

      if (isActive !== undefined) {
        match.isActive = Number(isActive);
      }

      const pipeline: any[] = [
        { $match: { isDelete: 0 } },

        {
          $lookup: {
            from: "chapters",
            localField: "chapters",
            foreignField: "_id",
            as: "chapters",
          },
        },

        {
          $match: {
            ...(search && {
              $or: [
                { meetingTopic: { $regex: search, $options: "i" } },
                { hotelName: { $regex: search, $options: "i" } },
                { "location.name": { $regex: search, $options: "i" } },
                { "chapters.chapterName": { $regex: search, $options: "i" } }, // ✅ chapter name search
              ],
            }),

            ...(chapter && {
              "chapters._id": new ObjectId(chapter),
            }),

            ...(isActive !== undefined && {
              isActive: Number(isActive),
            }),
          },
        },

        {
          $sort: {
            isActive: -1,
            createdAt: -1,
          },
        },

        {
          $addFields: {
            meetingStatus: {
              $switch: {
                branches: [
                  { case: { $eq: ["$isActive", 0] }, then: MeetingStatus.CANCELLED },
                  { case: { $lt: ["$endDateTime", new Date()] }, then: MeetingStatus.COMPLETED },
                  {
                    case: {
                      $and: [
                        { $lte: ["$startDateTime", new Date()] },
                        { $gte: ["$endDateTime", new Date()] }
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

  @Get("/details/:id")
  async meetingDetails(
    @Param("id") id: string,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      if (!ObjectId.isValid(id)) {
        return response(res, StatusCodes.BAD_REQUEST, "Invalid meeting id");
      }

      const pipeline = [
        {
          $match: {
            _id: new ObjectId(id),
            isDelete: 0,
          },
        },
        {
          $lookup: {
            from: "chapters",
            localField: "chapters",
            foreignField: "_id",
            as: "chapters",
          },
        },
        {
          $addFields: {
            meetingStatus: {
              $switch: {
                branches: [
                  { case: { $eq: ["$isActive", 0] }, then: MeetingStatus.CANCELLED },
                  { case: { $lt: ["$endDateTime", new Date()] }, then: MeetingStatus.COMPLETED },
                  {
                    case: {
                      $and: [
                        { $lte: ["$startDateTime", new Date()] },
                        { $gte: ["$endDateTime", new Date()] }
                      ]
                    },
                    then: MeetingStatus.LIVE
                  }
                ],
                default: MeetingStatus.UPCOMING
              }
            }
          }
        }
      ];

      const result = await this.meetingRepository.aggregate(pipeline).toArray();

      if (!result.length) {
        return response(res, StatusCodes.NOT_FOUND, "Meeting not found");
      }

      return response(
        res,
        StatusCodes.OK,
        "Meeting details fetched successfully",
        result[0],
      );
    } catch (error: any) {
      return response(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || "Something went wrong",
      );
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
      return response(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        error.message || "Something went wrong",
      );
    }
  }
  @Get("/attendance-list")
  async listAttendance(@Req() req: RequestWithUser, @Res() res: Response) {
    try {
      const page = Math.max(Number(req.query.page) || 0, 0);
      const limit = Math.max(Number(req.query.limit) || 10, 1);
      const search = req.query.search?.toString();

      const zoneId = req.query.zoneId?.toString();
      const regionId = req.query.regionId?.toString();
      const chapterId = req.query.chapterId?.toString();

      const dateFilterType = req.query.dateRangeFilter?.toString();
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      const fromDate = req.query.fromDate?.toString();
      const toDate = req.query.toDate?.toString();

      const match: any = { isDelete: 0 };

      if (search) {
        match.$or = [
          { meetingTopic: { $regex: search, $options: "i" } },
          { hotelName: { $regex: search, $options: "i" } },
        ];
      }

      const now = new Date();
      const currentYear = now.getFullYear();

      if (dateFilterType === "month") {
        if (month && !year) {
          const start = new Date(currentYear, month - 1, 1, 0, 0, 0, 0);
          const end = new Date(currentYear, month, 0, 23, 59, 59, 999);
          match.startDateTime = { $gte: start, $lte: end };
        }

        if (month && year) {
          const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
          const end = new Date(year, month, 0, 23, 59, 59, 999);
          match.startDateTime = { $gte: start, $lte: end };
        }
        if (!month && year) {
          const start = new Date(year, 0, 1, 0, 0, 0, 0);
          const end = new Date(year, 11, 31, 23, 59, 59, 999);
          match.startDateTime = { $gte: start, $lte: end };
        }
      }

      if (dateFilterType === "custom" && fromDate && toDate) {
        match.startDateTime = {
          $gte: new Date(fromDate),
          $lte: new Date(toDate),
        };
      }


      const pipeline: any[] = [
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "chapters",
            localField: "chapters",
            foreignField: "_id",
            as: "chapterDetails",
          },
        },

        {
          $match: {
            ...(chapterId && {
              chapters: new ObjectId(chapterId),
            }),
            ...(zoneId && {
              "chapterDetails.zoneId": new ObjectId(zoneId),
            }),
            ...(regionId && {
              "chapterDetails.regionId": new ObjectId(regionId),
            }),
          },
        },

        {
          $lookup: {
            from: "zones",
            localField: "chapterDetails.zoneId",
            foreignField: "_id",
            as: "zoneDetails",
          },
        },

        {
          $lookup: {
            from: "regions",
            localField: "chapterDetails.regionId",
            foreignField: "_id",
            as: "regionDetails",
          },
        },

        {
          $lookup: {
            from: "member",
            let: { chapterIds: "$chapters" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $in: [
                          { $toString: "$chapter" },
                          {
                            $map: {
                              input: "$$chapterIds",
                              as: "cid",
                              in: { $toString: "$$cid" },
                            },
                          },
                        ],
                      },
                      { $in: ["$isActive", [1, "1", true]] },
                      { $in: ["$isDelete", [0, "0", false, null]] },
                    ],
                  },
                },
              },
              { $count: "count" },
            ],
            as: "memberStats",
          },
        },

        {
          $lookup: {
            from: "attendance",
            let: { meetingId: "$_id", meetingChapters: "$chapters" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$sourceId", "$$meetingId"] },
                      { $eq: ["$sourceType", "MEETING"] },
                      { $eq: ["$isActive", 1] },
                      { $eq: ["$isDelete", 0] },
                    ],
                  },
                },
              },
              {
                $lookup: {
                  from: "member",
                  localField: "memberId",
                  foreignField: "_id",
                  as: "member",
                },
              },
              { $unwind: "$member" },
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ["$member.chapter", "$$meetingChapters"] },
                      { $eq: ["$member.isActive", 1] },
                      { $eq: ["$member.isDelete", 0] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  present: {
                    $sum: {
                      $cond: [{ $eq: ["$status", "present"] }, 1, 0],
                    },
                  },
                  absent: {
                    $sum: {
                      $cond: [{ $eq: ["$status", "absent"] }, 1, 0],
                    },
                  },
                  totalAttendance: { $sum: 1 },
                },
              },
            ],
            as: "attendanceStats",
          },
        },

        {
          $addFields: {
            meetingStatus: {
              $switch: {
                branches: [
                  { case: { $eq: ["$isActive", 0] }, then: MeetingStatus.CANCELLED },
                  { case: { $lt: ["$endDateTime", new Date()] }, then: MeetingStatus.COMPLETED },
                  {
                    case: {
                      $and: [
                        { $lte: ["$startDateTime", new Date()] },
                        { $gte: ["$endDateTime", new Date()] }
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
            data: [
              { $skip: page * limit },
              { $limit: limit },
              {
                $project: {
                  meetingTopic: 1,
                  meetingDate: "$startDateTime",
                  startDateTime: 1,
                  endDateTime: 1,
                  meetingStatus: 1,
                  chapterNames: "$chapterDetails.chapterName",
                  zoneNames: "$zoneDetails.name",
                  regionNames: "$regionDetails.region",
                  totalMembers: {
                    $ifNull: [{ $arrayElemAt: ["$memberStats.count", 0] }, 0],
                  },
                  presentCount: {
                    $ifNull: [
                      { $arrayElemAt: ["$attendanceStats.present", 0] },
                      0,
                    ],
                  },
                  absentCount: {
                    $ifNull: [
                      { $arrayElemAt: ["$attendanceStats.absent", 0] },
                      0,
                    ],
                  },
                  createdAt: 1,
                },
              },
            ],
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

  @Get("/attendance-history-by-member")
  async getAttendanceHistoryByMember(
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const memberId = req.query.memberId as string;
      const page = Math.max(Number(req.query.page) || 0, 0);
      const limit = Math.max(Number(req.query.limit) || 10, 1);

      if (!memberId || !ObjectId.isValid(memberId)) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Invalid or missing memberId"
        );
      }

      // 1. Fetch Member Basic Details (for the header)
      const memberRepository = AppDataSource.getMongoRepository("Member");
      const member = await memberRepository.findOne({
        where: { _id: new ObjectId(memberId) },
        select: ["fullName", "_id"],
      });

      if (!member) {
        return response(res, StatusCodes.NOT_FOUND, "Member not found");
      }

      // 2. Aggregate Attendance History
      const attendanceRepository = AppDataSource.getMongoRepository(Attendance);
      const match = {
        memberId: new ObjectId(memberId),
        isDelete: 0,
        isActive: 1,
      };

      const pipeline: any[] = [
        { $match: match },
        { $sort: { createdAt: -1 } }, // Temporary sort, will refine by eventDate later

        // Lookup Meeting
        {
          $lookup: {
            from: "meetings",
            localField: "sourceId",
            foreignField: "_id",
            as: "meetingDetails",
          },
        },
        // Lookup Training
        {
          $lookup: {
            from: "training", // Assuming collection name is 'training'
            localField: "sourceId",
            foreignField: "_id",
            as: "trainingDetails",
          },
        },

        // Determine Source Data
        {
          $addFields: {
            sourceData: {
              $cond: {
                if: { $eq: ["$sourceType", "MEETING"] },
                then: { $arrayElemAt: ["$meetingDetails", 0] },
                else: { $arrayElemAt: ["$trainingDetails", 0] },
              },
            },
          },
        },

        // Extract Common Fields
        {
          $addFields: {
            eventChapterIds: {
              $cond: {
                if: { $eq: ["$sourceType", "MEETING"] },
                then: "$sourceData.chapters",
                else: "$sourceData.chapterIds",
              },
            },
            eventDate: {
              $cond: {
                if: { $eq: ["$sourceType", "MEETING"] },
                then: "$sourceData.startDateTime",
                else: "$sourceData.trainingDateTime",
              },
            },
          },
        },

        // Lookup Chapters
        {
          $lookup: {
            from: "chapters",
            localField: "eventChapterIds",
            foreignField: "_id",
            as: "chapters",
          },
        },

        // Final Paging & Stats
        {
          $facet: {
            stats: [
              {
                $group: {
                  _id: null,
                  totalMeetings: { $sum: 1 },
                  totalPresent: {
                    $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
                  },
                  totalAbsent: {
                    $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
                  },
                },
              },
            ],
            history: [
              { $sort: { eventDate: -1 } },
              { $skip: page * limit },
              { $limit: limit },
              {
                $project: {
                  _id: 1,
                  date: "$eventDate",
                  chapterName: { $arrayElemAt: ["$chapters.chapterName", 0] },
                  meetingType: {
                    $cond: {
                      if: { $eq: ["$sourceType", "MEETING"] },
                      then: "Weekly Meeting",
                      else: "Training",
                    },
                  },
                  status: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$status", "present"] }, then: "Present" },
                        { case: { $eq: ["$status", "absent"] }, then: "Absent" },
                        { case: { $eq: ["$status", "late"] }, then: "Late" },
                        { case: { $eq: ["$status", "medical"] }, then: "Medical" },
                        { case: { $eq: ["$status", "substitute"] }, then: "Substitute" },
                      ],
                      default: "$status",
                    },
                  },
                },
              },
            ],
          },
        },
      ];

      const result = await attendanceRepository.aggregate(pipeline).toArray();

      const stats = result[0]?.stats[0] || {
        totalMeetings: 0,
        totalPresent: 0,
        totalAbsent: 0,
      };
      const history = result[0]?.history || [];

      return response(res, StatusCodes.OK, "Attendance history fetched", {
        member: {
          id: member.id,
          name: member.fullName,
        },
        stats,
        history,
      });
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Get("/attendance-list-by-source")
  async getAttendanceListBySource(
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const sourceId = req.query.sourceId as string;
      const sourceType = req.query.sourceType as string;
      const search = req.query.search?.toString();

      if (!sourceId || !ObjectId.isValid(sourceId)) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Invalid or missing sourceId"
        );
      }
      if (!sourceType) {
        return response(res, StatusCodes.BAD_REQUEST, "Missing sourceType");
      }

      const page = Math.max(Number(req.query.page) || 0, 0);
      const limit = Math.max(Number(req.query.limit) || 10, 1);

      const attendanceRepository = AppDataSource.getMongoRepository(Attendance);

      const match: any = {
        sourceId: new ObjectId(sourceId),
        sourceType: sourceType,
        isDelete: 0,
        isActive: 1,
      };

      const pipeline: any[] = [
        { $match: match },
        {
          $lookup: {
            from: "member",
            localField: "memberId",
            foreignField: "_id",
            as: "member",
          },
        },
        { $unwind: "$member" },
        {
          $lookup: {
            from: "businesscategories",
            localField: "member.businessCategory",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true,
          },
        },
        // Search filter
        ...(search
          ? [
            {
              $match: {
                $or: [
                  { "member.fullName": { $regex: search, $options: "i" } },
                  { "member.phoneNumber": { $regex: search, $options: "i" } },
                  { "member.companyName": { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
          : []),
        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit },
              {
                $project: {
                  _id: 1,
                  status: 1,
                  memberName: "$member.fullName",
                  memberMobile: "$member.phoneNumber",
                  companyName: "$member.companyName",
                  categoryName: "$category.name",
                  memberId: "$member._id",
                },
              },
            ],
            meta: [{ $count: "total" }],
          },
        },
      ];

      const result = await attendanceRepository.aggregate(pipeline).toArray();
      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);
      return pagination(total, data, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/absent-proxy-report")
  async getAbsentAndProxyReport(
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const page = Math.max(Number(req.query.page) || 0, 0);
      const limit = Math.max(Number(req.query.limit) || 10, 1);
      const skip = page * limit;
      const search = req.query.search?.toString();

      const chapterId = req.query.chapterId?.toString();
      const zoneId = req.query.zoneId?.toString();
      const regionId = req.query.regionId?.toString();
      const edId = req.query.edId?.toString();
      const rdId = req.query.rdId?.toString();
      const period = req.query.period?.toString();

      const attendanceRepository =
        AppDataSource.getMongoRepository(Attendance);

      const match: any = {
        isDelete: 0,
        isActive: 1,
      };

      if (period && period !== "overall") {
        const now = new Date();
        const currentYear = now.getFullYear();
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (period === "current_month") {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
          );
        } else if (period === "tenure_1") {
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 5, 30, 23, 59, 59, 999);
        } else if (period === "tenure_2") {
          startDate = new Date(currentYear, 6, 1);
          endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        } else if (period === "one_year") {
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        }

        if (startDate && endDate) {
          match.createdAt = {
            $gte: startDate,
            $lte: endDate,
          };
        }
      }

      const pipeline: any[] = [
        { $match: match },

        {
          $group: {
            _id: "$memberId",
            totalAbsent: {
              $sum: {
                $cond: [{ $eq: ["$status", "absent"] }, 1, 0],
              },
            },
            totalProxy: {
              $sum: {
                $cond: [{ $eq: ["$status", "proxy"] }, 1, 0],
              },
            },
          },
        },

        {
          $lookup: {
            from: "member",
            let: { memberId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$memberId"] },
                },
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  phoneNumber: 1,
                  businessCategory: 1,
                  chapter: 1,
                },
              },
            ],
            as: "member",
          },
        },
        {
          $unwind: {
            path: "$member",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$member.chapter" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$chapterId"] },
                },
              },
              {
                $project: {
                  _id: 1,
                  chapterName: 1,
                  absentLimit: 1,
                  proxyLimit: 1,
                  zoneId: 1,
                  regionId: 1,
                  edId: 1,
                  rdId: 1,
                },
              },
            ],
            as: "chapterDetails",
          },
        },
        {
          $unwind: {
            path: "$chapterDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $match: {
            $expr: {
              $or: [
                {
                  $gt: [
                    "$totalAbsent",
                    { $ifNull: ["$chapterDetails.absentLimit", 3] },
                  ],
                },
                {
                  $gt: [
                    "$totalProxy",
                    { $ifNull: ["$chapterDetails.proxyLimit", 3] },
                  ],
                },
              ],
            },
          },
        },

        ...(chapterId
          ? [{ $match: { "chapterDetails._id": new ObjectId(chapterId) } }]
          : []),

        ...(zoneId
          ? [{ $match: { "chapterDetails.zoneId": new ObjectId(zoneId) } }]
          : []),

        ...(regionId
          ? [{ $match: { "chapterDetails.regionId": new ObjectId(regionId) } }]
          : []),

        ...(edId
          ? [{ $match: { "chapterDetails.edId": new ObjectId(edId) } }]
          : []),

        ...(rdId
          ? [{ $match: { "chapterDetails.rdId": new ObjectId(rdId) } }]
          : []),

        {
          $lookup: {
            from: "businesscategories",
            let: { catId: "$member.businessCategory" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$catId"] },
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                },
              },
            ],
            as: "categoryDetails",
          },
        },
        {
          $unwind: {
            path: "$categoryDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        ...(search
          ? [
            {
              $match: {
                $or: [
                  { "member.fullName": { $regex: search, $options: "i" } },
                  { "member.phoneNumber": { $regex: search, $options: "i" } },
                  {
                    "chapterDetails.chapterName": {
                      $regex: search,
                      $options: "i",
                    },
                  },
                ],
              },
            },
          ]
          : []),

        {
          $facet: {
            data: [
              { $sort: { totalAbsent: -1 } },
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  _id: 1,
                  name: "$member.fullName",
                  mobileNumber: "$member.phoneNumber",
                  chapterName: "$chapterDetails.chapterName",
                  categoryName: "$categoryDetails.name",
                  totalAbsent: 1,
                  totalProxy: 1,
                  absentLimit: {
                    $ifNull: ["$chapterDetails.absentLimit", 3],
                  },
                  proxyLimit: {
                    $ifNull: ["$chapterDetails.proxyLimit", 3],
                  },
                },
              },
            ],
            meta: [{ $count: "total" }],
          },
        },
      ];

      const result = await attendanceRepository.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta?.[0]?.total || 0;

      return pagination(total, data, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/absent-proxy-history/:memberId")
  async getAbsentProxyHistory(
    @Param("memberId") memberId: string,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {

      if (!ObjectId.isValid(memberId)) {
        return response(res, StatusCodes.BAD_REQUEST, "Invalid memberId");
      }

      const page = Math.max(Number(req.query.page) || 0, 0);
      const limit = Math.max(Number(req.query.limit) || 10, 1);

      const attendanceRepository = AppDataSource.getMongoRepository(Attendance);

      const match: any = {
        memberId: new ObjectId(memberId),
        status: { $in: ["absent", "substitute"] },
        isDelete: 0,
        isActive: 1
      };

      const pipeline: any[] = [

        { $match: match },
        { $sort: { createdAt: -1 } },

        {
          $lookup: {
            from: "meetings",
            let: { sourceId: "$sourceId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$sourceId"] } } },
              {
                $project: {
                  _id: 0,
                  startDateTime: 1,
                  meetingTopic: 1,
                  "location.name": 1
                }
              }
            ],
            as: "meetingDetails"
          }
        },
        {
          $lookup: {
            from: "training",
            let: { sourceId: "$sourceId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$sourceId"] } } },
              {
                $project: {
                  _id: 0,
                  trainingDateTime: 1,
                  title: 1,
                  locationOrLink: 1
                }
              }
            ],
            as: "trainingDetails"
          }
        },

        {
          $addFields: {
            sourceData: {
              $cond: {
                if: { $eq: ["$sourceType", "MEETING"] },
                then: { $arrayElemAt: ["$meetingDetails", 0] },
                else: { $arrayElemAt: ["$trainingDetails", 0] }
              }
            }
          }
        },

        {
          $lookup: {
            from: "member",
            let: { memberId: "$memberId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
              {
                $project: {
                  fullName: 1,
                  profileImage: 1,
                  phoneNumber: 1,
                  businessCategory: 1,
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
            from: "businesscategories",
            let: { categoryId: "$member.businessCategory" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$categoryId"] } } },
              { $project: { name: 1 } }
            ],
            as: "category"
          }
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "chapters",
            let: { chapterId: "$member.chapter" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$chapterId"] } } },
              { $project: { chapterName: 1, zoneId: 1 } }
            ],
            as: "chapterDetails"
          }
        },
        { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "zones",
            let: { zoneId: "$chapterDetails.zoneId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$zoneId"] } } },
              { $project: { name: 1 } }
            ],
            as: "zoneDetails"
          }
        },
        { $unwind: { path: "$zoneDetails", preserveNullAndEmptyArrays: true } },

        {
          $project: {

            meetingDate: {
              $cond: {
                if: { $eq: ["$sourceType", "MEETING"] },
                then: "$sourceData.startDateTime",
                else: "$sourceData.trainingDateTime"
              }
            },

            meetingTopic: {
              $cond: {
                if: { $eq: ["$sourceType", "MEETING"] },
                then: "$sourceData.meetingTopic",
                else: "$sourceData.title"
              }
            },

            location: {
              $cond: {
                if: { $eq: ["$sourceType", "MEETING"] },
                then: "$sourceData.location.name",
                else: "$sourceData.locationOrLink"
              }
            },

            zoneName: "$zoneDetails.name",
            chapterName: "$chapterDetails.chapterName",
            categoryName: "$category.name",

            status: {
              $cond: {
                if: { $eq: ["$status", "substitute"] },
                then: "Proxy",
                else: "Absent"
              }
            },

            meetingType: "$sourceType",
            memberName: "$member.fullName",
            memberImage: "$member.profileImage",
            memberNumber: "$member.phoneNumber"
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

      const result = await attendanceRepository.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Patch("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const meeting = await this.meetingRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!meeting) {
        return response(res, StatusCodes.NOT_FOUND, "Meeting not found");
      }

      meeting.isActive = meeting.isActive === 1 ? 0 : 1;
      const updatedMeeting = await this.meetingRepository.save(meeting);
      return response(
        res,
        StatusCodes.OK,
        `Meeting ${meeting.isActive === 1 ? "enabled" : "disabled"} successfully`,
        updatedMeeting
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
