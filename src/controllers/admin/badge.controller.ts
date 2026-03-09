import {
  JsonController,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Res,
  QueryParams,
  UseBefore,
  Req,
  Patch
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { AuthPayload } from "../../middlewares/AuthMiddleware";
import { Badge } from "../../entity/Badge";
import { AssignBadgeDto, CreateBadgeDto, UpdateBadgeDto } from "../../dto/admin/badge.dto";
import { BadgeHistory } from "../../entity/BadgeHistory";
import { Member } from "../../entity/Member";
import { Chapter } from "../../entity/Chapter";
import { NotificationService } from "../../services/notification.service";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/badge")
export class BadgeController {
  private badgeRepository = AppDataSource.getMongoRepository(Badge);

  @Post("/")
  async createBadge(
    @Body() body: CreateBadgeDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const exists = await this.badgeRepository.findOneBy({
        name: body.name,
        isDelete: 0
      });

      if (exists) {
        return response(res, StatusCodes.CONFLICT, "Badge already exists");
      }

      const badge = new Badge();
      badge.name = body.name;
      badge.type = body.type;
      badge.badgeImage = body.badgeImage;
      badge.isActive = body.isActive ?? 1;
      badge.isDelete = 0;
      badge.createdBy = new ObjectId(req.user.userId);
      badge.updatedBy = new ObjectId(req.user.userId);

      const savedBadge = await this.badgeRepository.save(badge);

      return response(
        res,
        StatusCodes.CREATED,
        "Badge created successfully",
        savedBadge
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAllBadges(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 0);
      const search = query.search?.trim();

      const type =
        query.type && query.type !== "undefined"
          ? query.type.toString()
          : null;

      const match: any = { isDelete: 0 };

      if (type) {
        match.type = type;
      }

      if (search) {
        match.$or = [
          { type: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } }
        ];
      }

      const pipeline: any[] = [
        { $match: match },
        {
          $sort: {
            isActive: -1,
            createdAt: -1
          }
        }
      ];

      if (limit > 0) {
        pipeline.push(
          { $skip: page * limit },
          { $limit: limit }
        );
      }

      const badges = await this.badgeRepository
        .aggregate(pipeline)
        .toArray();

      const totalCount =
        await this.badgeRepository.countDocuments(match);

      // 🔥 No pagination
      if (limit === 0) {
        return response(
          res,
          StatusCodes.OK,
          "Badges fetched successfully",
          badges
        );
      }

      return pagination(
        totalCount,
        badges,
        limit,
        page,
        res
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Get("/active")
  async getActiveBadges(@Res() res: Response) {
    try {
      const badges = await this.badgeRepository.find({
        isDelete: 0,
        isActive: 1
      });
      return response(res, StatusCodes.OK, "Active badges fetched successfully", badges);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/:id")
  async getBadgeById(@Param("id") id: string, @Res() res: Response) {
    try {
      const badge = await this.badgeRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!badge) {
        return response(res, StatusCodes.NOT_FOUND, "Badge not found");
      }

      return response(res, StatusCodes.OK, "Badge fetched successfully", badge);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async updateBadge(
    @Param("id") id: string,
    @Body() body: UpdateBadgeDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const badgeId = new ObjectId(id);

      const badge = await this.badgeRepository.findOneBy({
        _id: badgeId,
        isDelete: 0
      });

      if (!badge) {
        return response(res, StatusCodes.NOT_FOUND, "Badge not found");
      }

      if (body.name) {
        const nameExists = await this.badgeRepository.findOne({
          where: {
            name: body.name,
            isDelete: 0,
            _id: { $ne: badgeId }
          }
        });

        if (nameExists) {
          return response(
            res,
            StatusCodes.CONFLICT,
            "Badge name already exists"
          );
        }

        badge.name = body.name;
      }

      if (body.type && body.type !== badge.type) {
        const assignedCount =
          await AppDataSource
            .getMongoRepository(BadgeHistory)
            .countDocuments({
              badgeId,
              action: "ASSIGNED"
            });

        if (assignedCount > 0) {
          return response(
            res,
            StatusCodes.BAD_REQUEST,
            "Badge type cannot be updated because the badge is already assigned"
          );
        }

        badge.type = body.type;
      }

      if (body.isActive !== undefined) {
        badge.isActive = body.isActive;
      }

      if (body.badgeImage !== undefined) {
        badge.badgeImage = body.badgeImage;
      }

      badge.updatedBy = new ObjectId(req.user.userId);

      const updatedBadge = await this.badgeRepository.save(badge);

      return response(
        res,
        StatusCodes.OK,
        "Badge updated successfully",
        updatedBadge
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Delete("/:id")
  async deleteBadge(@Param("id") id: string, @Res() res: Response) {
    try {
      const badge = await this.badgeRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!badge) {
        return response(res, StatusCodes.NOT_FOUND, "Badge not found");
      }

      badge.isDelete = 1;
      await this.badgeRepository.save(badge);

      return response(res, StatusCodes.OK, "Badge deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Patch("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const badge = await this.badgeRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!badge) {
        return response(res, StatusCodes.NOT_FOUND, "Badge not found");
      }

      badge.isActive = badge.isActive === 1 ? 0 : 1;
      const updatedBadge = await this.badgeRepository.save(badge);

      return response(
        res,
        StatusCodes.OK,
        `Badge ${badge.isActive === 1 ? "activated" : "deactivated"} successfully`,
        updatedBadge
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Post("/assign")
  async assignBadge(
    @Body() body: AssignBadgeDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const { assignTo, assignToId, badgeId } = body;

      if (!assignTo || !assignToId || !badgeId) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "assignTo, assignToId and badgeId are required"
        );
      }

      if (!ObjectId.isValid(assignToId) || !ObjectId.isValid(badgeId)) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Invalid assignToId or badgeId"
        );
      }

      const userId = new ObjectId(req.user.userId);
      const badgeObjectId = new ObjectId(badgeId);
      const assignToObjectId = new ObjectId(assignToId);

      let repository: any;

      switch (assignTo) {
        case "CHAPTER":
          repository = AppDataSource.getMongoRepository(Chapter);
          break;

        case "MEMBER":
          repository = AppDataSource.getMongoRepository(Member);
          break;

        default:
          return response(res, StatusCodes.BAD_REQUEST, "Invalid assignTo value");
      }

      const target = await repository.findOneBy({
        _id: assignToObjectId,
        isDelete: 0
      });

      if (!target) {
        return response(res, StatusCodes.NOT_FOUND, `${assignTo} not found`);
      }

      const badge = await this.badgeRepository.findOneBy({
        _id: badgeObjectId,
        isDelete: 0
      });

      if (assignTo === "MEMBER") {

        if (target.badgeIds?.some((id: ObjectId) => id.equals(badgeObjectId))) {
          return response(
            res,
            StatusCodes.CONFLICT,
            "Badge already assigned"
          );
        }

        await repository.updateOne(
          { _id: assignToObjectId },
          {
            $addToSet: { badgeIds: badgeObjectId },
            $set: { updatedBy: userId }
          }
        );

        if (badge) {
          const notificationService = new NotificationService();
          await notificationService.createNotification({
            moduleName: "BADGE",
            moduleId: badgeObjectId,
            createdBy: userId,
            subject: "Badge Awarded",
            content: `Congratulations! You have been awarded the "${badge.name}" badge.`,
            model: "Member",
            memberId: assignToObjectId,
            actionType: "APPROVE"
          });
        }
      }

      if (assignTo === "CHAPTER") {

        await repository.updateOne(
          { _id: assignToObjectId },
          {
            $set: {
              badgeIds: [badgeObjectId],
              updatedBy: userId
            }
          }
        );
      }

      const historyRepo = AppDataSource.getMongoRepository(BadgeHistory);

      await historyRepo.save({
        assignTo,
        assignToId: assignToObjectId,
        badgeId: badgeObjectId,
        action: "ASSIGNED",
        createdBy: userId
      });

      return response(
        res,
        StatusCodes.OK,
        "Badge assigned successfully"
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/badge-assign/history")
  async getBadgeHistory(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
    const limit = Number(query.limit ?? 10);
    const search = query.search?.trim();

    const pipeline: any[] = [
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "badges",
          localField: "badgeId",
          foreignField: "_id",
          as: "badge"
        }
      },
      { $unwind: { path: "$badge", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "member",
          localField: "assignToId",
          foreignField: "_id",
          as: "member"
        }
      },
      { $unwind: { path: "$member", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "chapters",
          localField: "assignToId",
          foreignField: "_id",
          as: "chapter"
        }
      },
      { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },
      ...(search ? [{
        $match: {
          $or: [
            { "badge.name": { $regex: search, $options: "i" } },
            { "member.fullName": { $regex: search, $options: "i" } },
            { "member.phoneNumber": { $regex: search, $options: "i" } },
            { "chapter.chapterName": { $regex: search, $options: "i" } },
            { assignTo: { $regex: search, $options: "i" } },
            { action: { $regex: search, $options: "i" } }
          ]
        }
      }] : []),

      {
        $project: {
          _id: 1,
          assignTo: 1,
          action: 1,
          createdAt: 1,

          badge: {
            id: "$badge._id",
            name: "$badge.name",
            type: "$badge.type",
            badgeImage: "$badge.badgeImage"
          },

          assignedTo: {
            $cond: [
              { $eq: ["$assignTo", "MEMBER"] },
              {
                id: "$member._id",
                name: "$member.fullName",
                phoneNumber: "$member.phoneNumber"
              },
              {
                id: "$chapter._id",
                name: "$chapter.chapterName"
              }
            ]
          }
        }
      }
    ];

    // Create a separate pipeline for counting with all filters applied
    const countPipeline = [...pipeline, { $count: "total" }];

    // Add pagination to the data pipeline
    if (limit > 0) {
      pipeline.push(
        { $skip: page * limit },
        { $limit: limit }
      );
    }

    const badgeHistoryRepo = AppDataSource.getMongoRepository(BadgeHistory);
    const [history, countResult] = await Promise.all([
      badgeHistoryRepo.aggregate(pipeline).toArray(),
      badgeHistoryRepo.aggregate(countPipeline).toArray()
    ]);

    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    return pagination(
      totalCount,
      history,
      limit,
      page,
      res
    );

  } catch (error) {
    console.error(error);
    return handleErrorResponse(error, res);
  }
}

}
