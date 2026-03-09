import {
  JsonController,
  Post,
  Get,
  Put,
  Param,
  Body,
  Req,
  Res,
  UseBefore,
  QueryParams
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";

import { AppDataSource } from "../../data-source";
import { MemberSuggestion } from "../../entity/MemberSuggestion";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import { CreateSuggestionDto } from "../../dto/mobile/MemberSuggestion.dto";
import { handleErrorResponse, pagination } from "../../utils";
interface RequestWithUser extends Request {
  user: AuthPayload;
}
@UseBefore(AuthMiddleware)
@JsonController("/member-suggestions")
export class MemberSuggestionController {

  private repo =
    AppDataSource.getMongoRepository(MemberSuggestion);
  @Post("/")
  async create(
    @Body() body: CreateSuggestionDto,
    @Req() req: any,
    @Res() res: Response
  ) {

    const suggestion = this.repo.create({
      subject: body.subject,
      message: body.message,
      createdBy: new ObjectId(req.user.userId),
      isActive: 1,
      isDelete: 0,
      status: "PENDING",
      createdAt: new Date(),

    });

    await this.repo.save(suggestion);

    return response(res, 201, "Suggestion submitted");
  }

  @Get("/")
  async list(
    @Req() req: RequestWithUser,
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {

      const page = Math.max(Number(query.page) || 0, 0);
      const limit = query.limit ? Math.max(Number(query.limit), 1) : null;

      const userId = new ObjectId(req.user.userId);

      const pipeline: any[] = [
        { $match: { createdBy: userId } },
        {
          $lookup: {
            from: "member",
            localField: "createdBy",
            foreignField: "_id",
            as: "member"
          }
        },

        { $unwind: "$member" },
        {
          $project: {
            subject: 1,
            message: 1,
            createdAt: 1,
            updatedAt: 1,

            member: {
              _id: "$member._id",
              name: "$member.fullName"
            }
          }
        },
        { $sort: { createdAt: -1 } }
      ];

      if (limit !== null) {
        pipeline.push({
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [{ $count: "total" }]
          }
        });
      }

      const result = await this.repo.aggregate(pipeline).toArray();

      if (limit === null) {
        return response(res, 200, "My suggestions fetched", result);
      }

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

}
