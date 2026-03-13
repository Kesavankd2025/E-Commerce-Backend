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
  Patch,
} from "routing-controllers";

import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";

import { response, handleErrorResponse, pagination } from "../../utils";
import { Banner } from "../../entity/Banner";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/banner")
export class BannerController {
  private repo = AppDataSource.getMongoRepository(Banner);

  @Post("/")
  async create(
    @Body() body: any,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const banner = new Banner();
      banner.title = body.title;
      banner.description = body.description;
      banner.link = body.link;
      banner.image = body.image;
      banner.status = body.status ?? true;
      banner.isDelete = 0;
      banner.createdBy = new ObjectId(req.user.userId);
      banner.updatedBy = new ObjectId(req.user.userId);

      const saved = await this.repo.save(banner);

      return response(
        res,
        StatusCodes.CREATED,
        "Banner added successfully",
        saved,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async update(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const banner = await this.repo.findOneBy({ _id: new ObjectId(id) });
      if (!banner) return response(res, StatusCodes.NOT_FOUND, "Banner not found");

      banner.title = body.title;
      banner.description = body.description;
      banner.link = body.link;
      banner.image = body.image;
      banner.status = body.status ?? banner.status;
      banner.updatedBy = new ObjectId(req.user.userId);

      const updated = await this.repo.save(banner);

      return response(res, StatusCodes.OK, "Banner updated successfully", updated);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async list(@QueryParams() query: any, @Res() res: Response) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 10);

      const match = { isDelete: 0 };

      const pipeline: any[] = [{ $match: match }, { $sort: { createdAt: -1 } }];

      if (limit > 0) {
        pipeline.push({ $skip: page * limit }, { $limit: limit });
      }

      const banners = await this.repo.aggregate(pipeline).toArray();
      const totalCount = await this.repo.countDocuments(match);

      return pagination(totalCount, banners, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Patch("/status/:id")
  async toggleStatus(@Param("id") id: string, @Res() res: Response) {
      try {
          const banner = await this.repo.findOneBy({ _id: new ObjectId(id) });
          if (!banner) return response(res, StatusCodes.NOT_FOUND, "Banner not found");

          banner.status = !banner.status;
          await this.repo.save(banner);

          return response(res, StatusCodes.OK, "Status updated successfully", banner);
      } catch (error) {
          return handleErrorResponse(error, res);
      }
  }

  @Delete("/:id")
  async delete(@Param("id") id: string, @Res() res: Response) {
    try {
      const banner = await this.repo.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0,
      });

      if (!banner) {
        return response(res, StatusCodes.NOT_FOUND, "Banner not found");
      }

      banner.isDelete = 1;
      await this.repo.save(banner);

      return response(res, StatusCodes.OK, "Banner deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
