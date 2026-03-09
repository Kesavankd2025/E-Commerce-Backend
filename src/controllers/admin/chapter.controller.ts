import {
  JsonController,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  QueryParams,
  Res,
  Req,
  UseBefore,
  Patch
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { Chapter } from "../../entity/Chapter";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import pagination from "../../utils/pagination";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { CreateChapterDto, UpdateChapterDto } from "../../dto/admin/Chapter.dto";
import { ThankYouSlip } from "../../entity/ThankyouSlip";
import { Member } from "../../entity/Member";
import { OneToOneMeeting } from "../../entity/121's";
import { PowerDate } from "../../entity/PowerDate";
import { Visitor } from "../../entity/Visitor";
import { Referral } from "../../entity/Referral";
import { updateChapterBadge } from "../../utils/chapter.badge";

@UseBefore(AuthMiddleware)
@JsonController("/chapters")
export class ChapterController {
  private chapterRepository = AppDataSource.getMongoRepository(Chapter);
  private thankyouRepo = AppDataSource.getMongoRepository(ThankYouSlip);
  private memberRepo = AppDataSource.getMongoRepository(Member)
  private oneToOneRepo = AppDataSource.getMongoRepository(OneToOneMeeting)
  private powerDateRepo = AppDataSource.getMongoRepository(PowerDate)
  private visitorRepo = AppDataSource.getMongoRepository(Visitor)
  private referralRepo = AppDataSource.getMongoRepository(Referral)

  @Post("/")
  async createChapter(
    @Body() body: CreateChapterDto,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const chapter = this.chapterRepository.create({
        chapterName: body.chapterName,
        zoneId: new ObjectId(body.zoneId),
        regionId: new ObjectId(body.regionId),
        edId: new ObjectId(body.edId),
        rdId: new ObjectId(body.rdId),
        createdDate: new Date(body.createdDate),
        location: body.location,
        weekday: body.weekday,
        meetingType: body.meetingType,
        absentLimit: body.absentLimit,
        proxyLimit: body.proxyLimit,
        isActive: body.isActive ?? 1,
        isDelete: 0,
        createdBy: new ObjectId(req.user.userId),
        updatedBy: new ObjectId(req.user.userId)
      });

      await this.chapterRepository.save(chapter);

      await updateChapterBadge(chapter.id);

      return response(
        res,
        StatusCodes.CREATED,
        "Chapter created successfully",
        chapter
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAllChapters(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 0);
      const search = query.search?.trim();

      const match: any = { isDelete: 0 };

      if (query.isActive !== undefined) {
        match.isActive = Number(query.isActive);
      }

      if (query.zoneId) {
        match.zoneId = new ObjectId(query.zoneId);
      }

      if (query.regionId) {
        match.regionId = new ObjectId(query.regionId);
      }

      if (query.regionIds) {
        const regionIdsArray = Array.isArray(query.regionIds) ? query.regionIds : [query.regionIds];
        match.regionId = {
          $in: regionIdsArray.map((id: string) => new ObjectId(id))
        };
      }

      if (query.edId) {
        match.edId = new ObjectId(query.edId);
      }

      if (query.rdId) {
        match.rdId = new ObjectId(query.rdId);
      }

      const pipeline: any[] = [
        { $match: match },

        {
          $lookup: {
            from: "zones",
            let: { zoneId: "$zoneId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$zoneId"] } } },
              { $project: { _id: 0, name: 1, country: 1, state: 1 } }
            ],
            as: "zone"
          }
        },
        { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "regions",
            let: { regionId: "$regionId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$regionId"] } } },
              { $project: { _id: 0, region: 1 } }
            ],
            as: "region"
          }
        },
        { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { edId: "$edId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$edId"] } } },
              { $project: { _id: 0, name: "$fullName" } }
            ],
            as: "ed"
          }
        },
        { $unwind: { path: "$ed", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { rdId: "$rdId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$rdId"] } } },
              { $project: { _id: 0, name: "$fullName" } }
            ],
            as: "rd"
          }
        },
        { $unwind: { path: "$rd", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "adminusers",
            let: { createdBy: "$createdBy" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$createdBy"] } } },
              { $project: { _id: 0, name: 1 } }
            ],
            as: "createdByUser"
          }
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "adminusers",
            let: { updatedBy: "$updatedBy" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$updatedBy"] } } },
              { $project: { _id: 0, name: 1 } }
            ],
            as: "updatedByUser"
          }
        },
        { $unwind: { path: "$updatedByUser", preserveNullAndEmptyArrays: true } },

        {
          $addFields: {
            zoneName: "$zone.name",
            country: "$zone.country",
            state: "$zone.state",
            regionName: "$region.region",
            edName: "$ed.name",
            rdName: "$rd.name",
            createdByName: "$createdByUser.name",
            updatedByName: "$updatedByUser.name"
          }
        }
      ];

      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { chapterName: { $regex: search, $options: "i" } },
              { zoneName: { $regex: search, $options: "i" } },
              { regionName: { $regex: search, $options: "i" } },
              { edName: { $regex: search, $options: "i" } },
              { rdName: { $regex: search, $options: "i" } },
              { createdByName: { $regex: search, $options: "i" } },
              { updatedByName: { $regex: search, $options: "i" } },
              { location: { $regex: search, $options: "i" } }
            ]
          }
        });
      }

      pipeline.push(
        {
          $sort: {
            isActive: -1,
            createdAt: -1
          }
        }
      );

      pipeline.push({
        $facet: {
          data: [
            ...(limit > 0
              ? [{ $skip: page * limit }, { $limit: limit }]
              : []),
            {
              $project: {
                chapterName: 1,
                createdDate: 1,
                location: 1,
                weekday: 1,
                meetingType: 1,
                absentLimit: 1,
                proxyLimit: 1,
                isActive: 1,
                zoneId: 1,
                zoneName: 1,
                country: 1,
                state: 1,
                regionId: 1,
                regionName: 1,
                edId: 1,
                edName: 1,
                rdId: 1,
                rdName: 1,
                createdByName: 1,
                updatedByName: 1,
                createdAt: 1
              }
            }
          ],
          meta: [
            { $count: "total" }
          ]
        }
      });

      const result = await this.chapterRepository
        .aggregate(pipeline)
        .toArray();

      const data = result[0]?.data ?? [];
      const totalCount = result[0]?.meta[0]?.total ?? 0;

      return pagination(totalCount, data, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Get("/:id")
  async getChapterById(
    @Param("id") id: string,
    @Res() res: Response
  ) {
    try {

      if (!ObjectId.isValid(id)) {
        return response(res, StatusCodes.BAD_REQUEST, "Invalid chapter id");
      }

      const pipeline: any[] = [

        {
          $match: {
            _id: new ObjectId(id),
            isDelete: 0
          }
        },

        {
          $lookup: {
            from: "zones",
            let: { zoneId: "$zoneId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$zoneId"] } } },
              { $project: { _id: 0, name: 1, country: 1, state: 1 } }
            ],
            as: "zone"
          }
        },
        { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "regions",
            let: { regionId: "$regionId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$regionId"] } } },
              { $project: { _id: 0, region: 1 } }
            ],
            as: "region"
          }
        },
        { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { edId: "$edId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$edId"] } } },
              { $project: { _id: 0, name: "$fullName" } }
            ],
            as: "ed"
          }
        },
        { $unwind: { path: "$ed", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { rdId: "$rdId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$rdId"] } } },
              { $project: { _id: 0, name: "$fullName" } }
            ],
            as: "rd"
          }
        },
        { $unwind: { path: "$rd", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "adminusers",
            let: { createdBy: "$createdBy" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$createdBy"] } } },
              { $project: { _id: 0, name: 1 } }
            ],
            as: "createdByUser"
          }
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "adminusers",
            let: { updatedBy: "$updatedBy" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$updatedBy"] } } },
              { $project: { _id: 0, name: 1 } }
            ],
            as: "updatedByUser"
          }
        },
        { $unwind: { path: "$updatedByUser", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "member",
            let: { chapterId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$chapter", "$$chapterId"] },
                      { $eq: ["$isActive", 1] },
                      { $eq: ["$isDelete", 0] }
                    ]
                  }
                }
              },
              { $count: "total" }
            ],
            as: "memberStats"
          }
        },
        {
          $addFields: {
            totalMembers: {
              $ifNull: [{ $arrayElemAt: ["$memberStats.total", 0] }, 0]
            }
          }
        },
        {
          $lookup: {
            from: "badges",
            let: { badgeIds: { $ifNull: ["$badgeIds", []] } },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$badgeIds"] }
                }
              },
              {
                $project: {
                  _id: 0,
                  badgeName: "$name",
                  badgeImage: 1
                }
              }
            ],
            as: "badges"
          }
        },
        {
          $project: {
            chapterName: 1,
            createdDate: 1,
            location: 1,
            weekday: 1,
            meetingType: 1,
            absentLimit: 1,
            proxyLimit: 1,
            isActive: 1,

            zoneId: 1,
            zoneName: "$zone.name",
            country: "$zone.country",
            state: "$zone.state",

            regionId: 1,
            regionName: "$region.region",

            edId: 1,
            edName: "$ed.name",

            rdId: 1,
            rdName: "$rd.name",

            createdByName: "$createdByUser.name",
            updatedByName: "$updatedByUser.name",

            totalMembers: 1,
            badges: 1
          }
        }
      ];

      const result = await this.chapterRepository
        .aggregate(pipeline)
        .toArray();

      if (!result.length) {
        return response(res, StatusCodes.NOT_FOUND, "Chapter not found");
      }

      return response(
        res,
        StatusCodes.OK,
        "Chapter fetched successfully",
        result[0]
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }



  @Put("/:id")
  async updateChapter(
    @Param("id") id: string,
    @Body() body: UpdateChapterDto,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const chapterId = new ObjectId(id);

      const chapter = await this.chapterRepository.findOneBy({
        _id: chapterId,
        isDelete: 0
      });

      if (!chapter) {
        return response(res, StatusCodes.NOT_FOUND, "Chapter not found");
      }

      const updateData: any = {
        updatedBy: new ObjectId(req.user.userId)
      };

      if (body.chapterName) updateData.chapterName = body.chapterName;
      if (body.zoneId) updateData.zoneId = new ObjectId(body.zoneId);
      if (body.regionId) updateData.regionId = new ObjectId(body.regionId);
      if (body.edId) updateData.edId = new ObjectId(body.edId);
      if (body.rdId) updateData.rdId = new ObjectId(body.rdId);
      if (body.createdDate) updateData.createdDate = new Date(body.createdDate);
      if (body.location) updateData.location = body.location;
      if (body.weekday) updateData.weekday = body.weekday;
      if (body.meetingType) updateData.meetingType = body.meetingType;
      if (body.absentLimit !== undefined) updateData.absentLimit = body.absentLimit;
      if (body.proxyLimit !== undefined) updateData.proxyLimit = body.proxyLimit;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;

      await this.chapterRepository.updateOne(
        { _id: chapterId },
        { $set: updateData }
      );

      await updateChapterBadge(chapterId);

      const updatedChapter = await this.chapterRepository.findOneBy({
        _id: chapterId
      });

      return response(
        res,
        StatusCodes.OK,
        "Chapter updated successfully",
        updatedChapter
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Delete("/:id")
  async deleteChapter(
    @Param("id") id: string,
    @Res() res: Response
  ) {
    try {
      const chapter = await this.chapterRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!chapter) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "Chapter not found"
        );
      }

      chapter.isDelete = 1;
      await this.chapterRepository.save(chapter);

      await updateChapterBadge(id);

      return response(
        res,
        StatusCodes.OK,
        "Chapter deleted successfully"
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Get("/chapter-revenue/list")
  async getChapterRevenue(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const chapterId = query.chapterId;

      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(res, 400, "Valid chapterId required");
      }

      const pipeline: any[] = [

        { $match: { isDelete: 0, isActive: 1 } },

        {
          $lookup: {
            from: "member",
            localField: "thankTo",
            foreignField: "_id",
            as: "member"
          }
        },
        { $unwind: "$member" },

        {
          $match: {
            "member.chapter": new ObjectId(chapterId)
          }
        },

        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            amount: { $sum: "$amount" }
          }
        },

        { $sort: { "_id.year": 1, "_id.month": 1 } },

        {
          $project: {
            _id: 0,
            year: "$_id.year",
            month: "$_id.month",
            amount: 1
          }
        }
      ];

      const monthly =
        await this.thankyouRepo.aggregate(pipeline).toArray();

      const totalRevenue =
        monthly.reduce((s, m) => s + m.amount, 0);

      return response(res, 200, "Chapter revenue fetched", {
        totalRevenue,
        monthly
      });

    } catch (err) {
      console.error(err);
      return response(res, 500, "Failed to fetch revenue");
    }
  }
  @Get("/chapterbased/ed-rd-members")
  async getChapterEdRdMembers(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const { chapterId } = query;

      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(res, 400, "Valid chapterId is required");
      }

      const pipeline: any[] = [
        {
          $match: {
            _id: new ObjectId(chapterId),
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

      const result =
        await this.chapterRepository.aggregate(pipeline).toArray();

      return response(
        res,
        200,
        "Chapter ED & RD members fetched",
        result[0]?.members || []
      );

    } catch (error) {
      console.error(error);
      return response(res, 500, "Failed to fetch chapter ED/RD members");
    }
  }

  @Get("/chapter-stats/details")
  async getChapterStats(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const { chapterId } = query;

      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(res, 400, "Valid chapterId required");
      }

      const chapterObjectId = new ObjectId(chapterId);

      const members = await this.memberRepo.find({
        where: {
          chapter: chapterObjectId,
          isDelete: 0,
          isActive: 1
        },
        select: ["_id"]
      });

      const memberIds = members.map(m => m.id);

      if (!memberIds.length) {
        return response(res, StatusCodes.OK, "Success", {
          powerDates: 0,
          referrals: 0,
          visitors: 0,
          oneToOnes: 0,
          thankYouSlips: 0,
          businessGiven: 0
        });
      }


      const [
        powerDates,
        referrals,
        visitors,
        oneToOnes,
        thankYouSlips
      ] = await Promise.all([

        // Power Date
        this.powerDateRepo.countDocuments({
          members: { $in: memberIds },
          isDelete: 0,
          isActive: 1
        }),

        // Referrals
        this.referralRepo.countDocuments({
          fromMemberId: { $in: memberIds },
          isDelete: 0
        }),

        // Visitors
        this.visitorRepo.countDocuments({
          chapterId: chapterObjectId,
          isDelete: 0
        }),

        // 1-2-1
        this.oneToOneRepo.countDocuments({
          initiatedById: { $in: memberIds },
          isDelete: 0,
          isActive: 1
        }),

        // Thank You Slips
        this.thankyouRepo.countDocuments({
          thankTo: { $in: memberIds },
          isDelete: 0,
          isActive: 1
        })

      ]);

      const businessAgg = await this.thankyouRepo.aggregate([
        {
          $match: {
            createdBy: { $in: memberIds },
            isDelete: 0,
            isActive: 1
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" }
          }
        }
      ]).toArray();

      const businessGiven = businessAgg[0]?.total || 0;

      return response(res, StatusCodes.OK, "Success", {
        powerDates,
        referrals,
        visitors,
        oneToOnes,
        thankYouSlips,
        businessGiven
      });

    } catch (err) {
      console.error(err);
      return response(res, 500, "Failed to fetch dashboard");
    }
  }
  @Get("/top/1to1-members")
  async top1To1Members(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const chapterId = query.chapterId;

      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(res, 400, "Valid chapterId required");
      }

      const pipeline: any[] = [

        // only active meetings
        {
          $match: {
            isDelete: 0,
            isActive: 1
          }
        },

        // join member
        {
          $lookup: {
            from: "member",
            localField: "initiatedById",
            foreignField: "_id",
            as: "member"
          }
        },
        { $unwind: "$member" },

        // chapter filter
        {
          $match: {
            "member.chapter": new ObjectId(chapterId)
          }
        },

        // group by member
        {
          $group: {
            _id: "$initiatedById",
            count: { $sum: 1 },
            fullName: { $first: "$member.fullName" },
            profileImage: { $first: "$member.profileImage" }
          }
        },

        // use facet for top3 + total
        {
          $facet: {

            topMembers: [
              { $sort: { count: -1 } },
              { $limit: 3 },
              {
                $project: {
                  _id: 0,
                  memberId: "$_id",
                  fullName: 1,
                  profileImage: 1,
                  count: 1
                }
              }
            ],

            totalCount: [
              {
                $group: {
                  _id: null,
                  total: { $sum: "$count" }
                }
              }
            ]

          }
        }
      ];

      const result =
        await this.oneToOneRepo.aggregate(pipeline).toArray();

      const topMembers = result[0]?.topMembers || [];
      const total =
        result[0]?.totalCount[0]?.total || 0;

      return response(res, 200, "Top 1-2-1 members fetched", {
        total,
        topMembers
      });

    } catch (err) {
      console.error(err);
      return response(res, 500, "Failed to fetch top members");
    }
  }
  @Get("/top/referral-members")
  async topReferralMembers(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const chapterId = query.chapterId;

      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(res, 400, "Valid chapterId required");
      }

      const pipeline: any[] = [

        {
          $match: {
            isDelete: 0
          }
        },

        {
          $lookup: {
            from: "member",
            let: { fromId: "$fromMemberId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$fromId"] }
                }
              },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
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
          $match: {
            "member.chapter": new ObjectId(chapterId)
          }
        },

        {
          $group: {
            _id: "$fromMemberId",
            count: { $sum: 1 },
            fullName: { $first: "$member.fullName" },
            profileImage: { $first: "$member.profileImage" }
          }
        },

        {
          $facet: {

            topMembers: [
              { $sort: { count: -1 } },
              { $limit: 3 },
              {
                $project: {
                  _id: 0,
                  memberId: "$_id",
                  fullName: 1,
                  profileImage: 1,
                  count: 1
                }
              }
            ],

            totalCount: [
              {
                $group: {
                  _id: null,
                  total: { $sum: "$count" }
                }
              }
            ]

          }
        }
      ];

      const result =
        await this.referralRepo.aggregate(pipeline).toArray();

      const topMembers = result[0]?.topMembers || [];
      const total =
        result[0]?.totalCount[0]?.total || 0;

      return response(res, 200, "Top referral members fetched", {
        total,
        topMembers
      });

    } catch (err) {
      console.error(err);
      return response(res, 500, "Failed to fetch top referral members");
    }
  }
  @Get("/top/thankyou-members")
  async topThankYouMembers(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const chapterId = query.chapterId;

      if (!chapterId || !ObjectId.isValid(chapterId)) {
        return response(res, 400, "Valid chapterId required");
      }

      const pipeline: any[] = [
        {
          $match: {
            isDelete: 0,
            isActive: 1
          }
        },
        {
          $lookup: {
            from: "member",
            let: { memberId: "$thankTo" },
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
          $match: {
            "member.chapter": new ObjectId(chapterId)
          }
        },

        {
          $group: {
            _id: "$thankTo",
            count: { $sum: 1 },
            fullName: { $first: "$member.fullName" },
            profileImage: { $first: "$member.profileImage" }
          }
        },

        {
          $facet: {

            topMembers: [
              { $sort: { count: -1 } },
              { $limit: 3 },
              {
                $project: {
                  _id: 0,
                  memberId: "$_id",
                  fullName: 1,
                  profileImage: 1,
                  count: 1
                }
              }
            ],

            totalCount: [
              {
                $group: {
                  _id: null,
                  total: { $sum: "$count" }
                }
              }
            ]

          }
        }

      ];

      const result =
        await this.thankyouRepo.aggregate(pipeline).toArray();

      const topMembers = result[0]?.topMembers || [];
      const total =
        result[0]?.totalCount[0]?.total || 0;

      return response(res, 200, "Top thank you members fetched", {
        total,
        topMembers
      });

    } catch (err) {
      console.error(err);
      return response(res, 500, "Failed to fetch top thank you members");
    }
  }
  @Patch("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const chapter = await this.chapterRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!chapter) {
        return response(res, StatusCodes.NOT_FOUND, "Chapter not found");
      }

      chapter.isActive = chapter.isActive === 1 ? 0 : 1;
      const result = await this.chapterRepository.save(chapter);

      await updateChapterBadge(result.id);

      return response(
        res,
        StatusCodes.OK,
        `Chapter ${chapter.isActive === 1 ? "enabled" : "disabled"} successfully`,
        result
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
