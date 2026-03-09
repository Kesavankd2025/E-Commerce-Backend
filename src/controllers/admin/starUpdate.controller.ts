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
  Req,
  UseBefore,
  Patch,
} from "routing-controllers";

import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";

import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { Community } from "../../entity/Community";
import { Member } from "../../entity/Member";
import { Chapter } from "../../entity/Chapter";
import { Region } from "../../entity/Region";
import { Zone } from "../../entity/Zone";
import { BusinessCategory } from "../../entity/BusinessCategory";
import { StarUpdate } from "../../entity/StarUpdate";
import { NotificationService } from "../../services/notification.service";
import { CreateStarUpdateDto, UpdateStarUpdateDto } from "../../dto/admin/StarUpdate.dto";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/star-update")
export class StarUpdateController {
  private repo = AppDataSource.getMongoRepository(StarUpdate);
  private memberRepository = AppDataSource.getMongoRepository(Member);
  private chapterRepository = AppDataSource.getMongoRepository(Chapter);
  private regionRepository = AppDataSource.getMongoRepository(Region);
  private zoneRepository = AppDataSource.getMongoRepository(Zone);
  private categoryRepository =
    AppDataSource.getMongoRepository(BusinessCategory);

  // ➕ CREATE
  @Post("/")
  async create(
    @Body() body: CreateStarUpdateDto,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const data = new StarUpdate();

      data.chapterIds = body.chapterIds.map((id: string) => new ObjectId(id));
      data.categoryIds = body.categoryIds.map((id: string) => new ObjectId(id));
      if (body.image !== undefined) data.image = body.image;

      data.title = body.title;
      data.lastDate = new Date(body.lastDate);
      data.details = body.details;
      data.location = body.location;
      data.contactName = body.contactName;
      data.contactPhoneNumber = body.contactPhoneNumber;
      data.immediateRequirement = body.immediateRequirement;

      if (body.zoneIds && Array.isArray(body.zoneIds)) {
        data.zoneIds = body.zoneIds.map((id: string) => new ObjectId(id));
      }
      if (body.regionIds && Array.isArray(body.regionIds)) {
        data.regionIds = body.regionIds.map((id: string) => new ObjectId(id));
      }


      data.isActive = 1;
      data.isDelete = 0;
      data.createdBy = new ObjectId(req.user.userId);
      data.updatedBy = new ObjectId(req.user.userId);

      const saved = await this.repo.save(data);
      try {
        const notificationService = new NotificationService();
        await notificationService.createNotificationStarUpdate({
          moduleName: "StarUpdate",
          moduleId: saved._id,
          createdBy: req.user.userId,
          subject: "New CNI Project",
          content: data.title,
          chapterIds: data.chapterIds,
          categoryIds: data.categoryIds,
          zoneIds: data.zoneIds,
          regionIds: data.regionIds,
        });
      } catch (notificationError) {
      }

      return response(res, StatusCodes.CREATED, "CNI Project created successfully", saved);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAll(@QueryParams() query: any, @Res() res: Response) {
    try {
      const page = Math.max(Number(query.page ?? 0), 0);
      const limit = Math.max(Number(query.limit ?? 10), 1);
      const search = query.search?.toString()?.trim();

      const match: any = { isDelete: 0 };

      if (search) {
        match.$or = [
          { title: { $regex: search, $options: "i" } },
          { location: { $regex: search, $options: "i" } },
        ];
      }
      const pipeline: any[] = [
        { $match: match },
        {
          $sort: {
            isActive: -1,
            createdAt: -1,
          },
        },
      ];

      if (limit > 0) {
        pipeline.push(
          { $skip: page * limit },
          { $limit: limit }
        );
      }

      const list = await this.repo.aggregate(pipeline).toArray();
      const total = await this.repo.countDocuments(match);

      return pagination(total, list, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Get("/:id")
  async getOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const starId = new ObjectId(id);

      const starUpdate = await this.repo.findOne({
        where: { _id: starId, isDelete: 0 },
      });

      if (!starUpdate) {
        return response(res, StatusCodes.NOT_FOUND, "CNI Project not found");
      }
      const chapters = await this.chapterRepository.find({
        where: {
          _id: { $in: starUpdate.chapterIds || [] },
          isDelete: 0,
        },
      });

      const chapterNames = chapters.map((c) => c.chapterName);
      const categories = await this.categoryRepository.find({
        where: {
          _id: { $in: starUpdate.categoryIds || [] },
          isDelete: 0,
        },
      });
      const categoryNames = categories.map((c) => c.name);

      const zones = await this.zoneRepository.find({
        where: {
          _id: { $in: starUpdate.zoneIds || [] },
          isDelete: 0,
        },
      });
      const zoneNames = zones.map((z) => z.name);

      const regions = await this.regionRepository.find({
        where: {
          _id: { $in: starUpdate.regionIds || [] },
          isDelete: 0,
        },
      });
      const regionNames = regions.map((r) => r.region);

      let responseUsers: any[] = [];

      if (starUpdate.responses?.length) {
        const userIds = starUpdate.responses.map((r) => r.userId);

        const members = await this.memberRepository.find({
          where: {
            _id: { $in: userIds },
            isDelete: 0,
          },
        });

        const memberMap = new Map(members.map((m) => [m.id.toString(), m]));

        responseUsers = starUpdate.responses.map((r) => {
          const member = memberMap.get(r.userId.toString());

          return {
            userId: r.userId,
            fullName: member?.fullName || "",
            profileImage: member?.profileImage?.path || "",
            email: member?.email || "",
            companyName: member?.companyName || "",
            respondedAt: r.respondedAt,
          };
        });
      }


      const result = {
        ...starUpdate,
        zones: zoneNames,
        regions: regionNames,
        chapters: chapterNames,
        categories: categoryNames,
        responses: responseUsers,
      };

      return response(res, StatusCodes.OK, "All CNI projects fetched successfully", result);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateStarUpdateDto,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const data = await this.repo.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0,
      });

      if (!data) return response(res, StatusCodes.NOT_FOUND, "Not found");

      if (body.chapterIds)
        data.chapterIds = body.chapterIds.map((id: string) => new ObjectId(id));

      if (body.categoryIds)
        data.categoryIds = body.categoryIds.map(
          (id: string) => new ObjectId(id),
        );

      if (body.title !== undefined) data.title = body.title;

      if (body.image !== undefined) data.image = body.image;

      if (body.lastDate !== undefined) data.lastDate = new Date(body.lastDate);

      if (body.details !== undefined) data.details = body.details;

      if (body.location !== undefined) data.location = body.location;

      if (body.contactName !== undefined) data.contactName = body.contactName;

      if (body.contactPhoneNumber !== undefined) data.contactPhoneNumber = body.contactPhoneNumber;
      if (body.immediateRequirement !== undefined) data.immediateRequirement = body.immediateRequirement;

      if (body.zoneIds && Array.isArray(body.zoneIds)) {
        data.zoneIds = body.zoneIds.map((id: string) => new ObjectId(id));
      }

      if (body.regionIds && Array.isArray(body.regionIds)) {
        data.regionIds = body.regionIds.map((id: string) => new ObjectId(id));
      }

      data.updatedBy = new ObjectId(req.user.userId);

      const updated = await this.repo.save(data);

      try {
        const notificationService = new NotificationService();
        await notificationService.createNotificationStarUpdate({
          moduleName: "StarUpdate",
          moduleId: updated._id,
          createdBy: req.user.userId,
          subject: "Project Modified",
          content: data.title,
          chapterIds: data.chapterIds,
          categoryIds: data.categoryIds,
          zoneIds: data.zoneIds,
          regionIds: data.regionIds,
        });
      } catch (notificationError) {
      }

      return response(res, StatusCodes.OK, "CNI Project updated successfully", updated);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Delete("/:id")
  async delete(@Param("id") id: string, @Res() res: Response) {
    try {
      const data = await this.repo.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0,
      });

      if (!data) return response(res, StatusCodes.NOT_FOUND, "Not found");

      data.isDelete = 1;
      await this.repo.save(data);

      return response(res, StatusCodes.OK, "CNI Project deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/responses/full-details/:id")
  async getStarResponsesFull(@Param("id") id: string, @Res() res: Response) {
    try {
      const startId = new ObjectId(id);

      const community = await this.repo.findOne({
        where: { _id: startId, isDelete: 0 },
      });

      if (!community || !community.responses?.length) {
        return response(res, StatusCodes.OK, "No responses", []);
      }

      const userIds = community.responses.map((r) => r.userId);
      const members = await this.memberRepository.find({
        where: { _id: { $in: userIds }, isDelete: 0 },
      });

      if (!members.length) {
        return response(res, StatusCodes.OK, "No members found", []);
      }
      const chapterIds = members.map((m) => m.chapter).filter(Boolean);
      const categoryIds = members
        .map((m) => m.businessCategory)
        .filter(Boolean);
      const chapters = await this.chapterRepository.find({
        where: { _id: { $in: chapterIds }, isDelete: 0 },
      });

      const regionIds = chapters.map((c) => c.regionId).filter(Boolean);

      const regions = await this.regionRepository.find({
        where: { _id: { $in: regionIds }, isDelete: 0 },
      });

      const categories = await this.categoryRepository.find({
        where: { _id: { $in: categoryIds }, isDelete: 0 },
      });

      const chapterMap = new Map(
        chapters.map((c) => [c.id.toString(), c.chapterName]),
      );

      const regionMap = new Map(
        regions.map((r) => [r.id.toString(), r.region]),
      );

      const categoryMap = new Map(
        categories.map((c) => [c.id.toString(), c.name]),
      );
      const memberMap = new Map(members.map((m) => [m.id.toString(), m]));
      const result = community.responses.map((r) => {
        const member = memberMap.get(r.userId.toString());
        const chapterId = member?.chapter?.toString();
        const chapter = chapterMap.get(chapterId || "");
        const regionId = chapters.find(
          (c) => c.id.toString() === chapterId,
        )?.regionId;

        const region = regionMap.get(regionId?.toString() || "");

        return {
          userId: r.userId,
          fullName: member?.fullName || "",
          profileImage: member?.profileImage?.path || "",
          chapter: chapter || "",
          region: region || "",
          businessCategory:
            categoryMap.get(member?.businessCategory?.toString() || "") || "",
          respondedAt: r.respondedAt,
        };
      });

      return response(res, StatusCodes.OK, "All responses fetched successfully", result);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Patch("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const star = await this.repo.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!star) {
        return response(res, StatusCodes.NOT_FOUND, "CNI Project not found");
      }

      star.isActive = star.isActive === 1 ? 0 : 1;
      const updatedStar = await this.repo.save(star);
      return response(
        res,
        StatusCodes.OK,
        `CNI Project ${updatedStar.isActive === 1 ? "enabled" : "disabled"} successfully`,
        updatedStar
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}