import {
  JsonController,
  Post,
  Get,
  Param,
  Body,
  Res,
  QueryParams,
  Req,
  UseBefore,
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { StarUpdate } from "../../entity/StarUpdate";
import { Member } from "../../entity/Member";
import { Chapter } from "../../entity/Chapter";
interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/star-update")
export class StarUpdateController {
  private repo = AppDataSource.getMongoRepository(StarUpdate);
  private memberRepository = AppDataSource.getMongoRepository(Member);
  private chapterRepository = AppDataSource.getMongoRepository(Chapter);
  @Get("/")
  async getAll(
    @QueryParams() query: any,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);

      const userId = new ObjectId(req.user.userId);
      const member = await this.memberRepository.findOne({
        where: {
          _id: userId,
          isDelete: 0,
        },
      });

      if (!member) {
        return response(res, StatusCodes.NOT_FOUND, "Member not found");
      }

      const chapter = await this.chapterRepository.findOne({
        where: {
          _id: member.chapter,
          isDelete: 0,
        },
      });

      const zoneId = chapter?.zoneId;

      const pipeline: any[] = [
        {
          $match: {
            isDelete: 0,
            chapterIds: { $in: [member.chapter] },
            categoryIds: { $in: [member.businessCategory] },
            regionIds: { $in: [member.region] },
            ...(zoneId && { zoneIds: { $in: [zoneId] } }),
          }
        },
        {
          $addFields: {
            isResponded: {
              $in: [
                userId,
                {
                  $map: {
                    input: { $ifNull: ["$responses", []] },
                    as: "r",
                    in: "$$r.userId"
                  }
                }
              ]
            }
          }
        },
        {
          $addFields: {
            canApply: { $not: ["$isResponded"] }
          }
        },
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
              {
                $project: {
                  _id: 0,
                  chapterName: 1
                }
              }
            ],
            as: "chapters"
          }
        },
        {
          $lookup: {
            from: "businesscategories",
            let: { categoryIds: "$categoryIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$categoryIds"] }
                }
              },
              {
                $project: {
                  _id: 0,
                  name: 1
                }
              }
            ],
            as: "categories"
          }
        },
        {
          $lookup: {
            from: "regions",
            let: { regionIds: "$regionIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$regionIds"] }
                }
              },
              {
                $project: {
                  _id: 0,
                  region: 1
                }
              }
            ],
            as: "regions"
          }
        },
        {
          $lookup: {
            from: "zones",
            let: { zoneIds: "$zoneIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$_id", "$$zoneIds"] }
                }
              },
              {
                $project: {
                  _id: 0,
                  name: 1
                }
              }
            ],
            as: "zones"
          }
        },
        {
          $addFields: {
            chapters: {
              $map: {
                input: "$chapters",
                as: "ch",
                in: "$$ch.chapterName"
              }
            },
            categories: {
              $map: {
                input: "$categories",
                as: "cat",
                in: "$$cat.name"
              }
            },
            regions: {
              $map: {
                input: "$regions",
                as: "rg",
                in: "$$rg.region"
              }
            },
            zones: {
              $map: {
                input: "$zones",
                as: "zn",
                in: "$$zn.name"
              }
            }
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

      const result = await this.repo.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta?.[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/:id")
  async getOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.repo.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0,
      });

      if (!data) return response(res, StatusCodes.NOT_FOUND, "Not found");

      return response(res, StatusCodes.OK, "Fetched", data);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Post("/respond")
  async respondStarupdate(
    @Body() body: { starId: string; type: string },
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const userId = new ObjectId(req.user.userId);
      const starId = new ObjectId(body.starId);

      const starUpdate = await this.repo.findOne({
        where: { _id: starId, isDelete: 0 },
      });

      if (!starUpdate) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "CNI Project not found",
          [],
        );
      }

      if (!starUpdate.responses) {
        starUpdate.responses = [];
      }

      const alreadyResponded = starUpdate.responses.some(
        (r) => r.userId.toString() === userId.toString(),
      );

      if (alreadyResponded) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Already responded to this CNI Project",
          [],
        );
      }

      starUpdate.responses.push({
        userId,
        respondedAt: new Date(),
      });

      starUpdate.updatedAt = new Date();

      await this.repo.save(starUpdate);

      return response(
        res,
        StatusCodes.OK,
        "Response saved successfully",
        starUpdate.responses,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
