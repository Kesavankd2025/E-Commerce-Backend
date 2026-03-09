import {
  JsonController,
  Get,
  Param,
  QueryParams,
  Res,
  UseBefore
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
import { Member } from "../../entity/Member";
import { ChapterRoleAssignment } from "../../entity/ChapterRoleAssignment";

// @UseBefore(AuthMiddleware)
@JsonController("/chapters")
export class ChapterController {
  private chapterRepository = AppDataSource.getMongoRepository(Chapter);
  private chapterRoleAssignmentRepo = AppDataSource.getMongoRepository(ChapterRoleAssignment);

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

  @Get("/chapter/roles-and-ed-rd/:id")
  async getChapterRolesAndEdRd(
    @Param("id") id: string,
    @Res() res: Response
  ) {
    try {

      const edRdPipeline: any[] = [
        {
          $match: {
            _id: new ObjectId(id),
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

      const edRdResult = await this.chapterRepository.aggregate(edRdPipeline).toArray();
      const edRdMembers = edRdResult[0]?.members || [];

      const rolesPipeline: any[] = [
        {
          $match: {
            chapterId: new ObjectId(id),
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
