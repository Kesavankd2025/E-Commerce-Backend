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
} from "routing-controllers";

import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";

import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";

import { Gallery } from "../../entity/Banner";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/banner")
export class GalleryController {
  private galleryRepository = AppDataSource.getMongoRepository(Gallery);
  @Post("/")
  async createGallery(
    @Body() body: any,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const gallery = new Gallery();
      gallery.bannerImage = body.galleryImage;
      gallery.isActive = body.isActive ?? 1;
      gallery.isDelete = 0;
      gallery.createdBy = new ObjectId(req.user.userId);
      gallery.updatedBy = new ObjectId(req.user.userId);

      const saved = await this.galleryRepository.save(gallery);

      return response(
        res,
        StatusCodes.CREATED,
        "Gallery image added successfully",
        saved,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAllGallery(@QueryParams() query: any, @Res() res: Response) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 10);

      const match = { isDelete: 0 };

      const pipeline: any[] = [{ $match: match }, { $sort: { createdAt: -1 } }];

      if (limit > 0) {
        pipeline.push({ $skip: page * limit }, { $limit: limit });
      }

      const gallery = await this.galleryRepository
        .aggregate(pipeline)
        .toArray();

      const totalCount = await this.galleryRepository.countDocuments(match);

      return pagination(totalCount, gallery, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Delete("/:id")
  async deleteGallery(@Param("id") id: string, @Res() res: Response) {
    try {
      const gallery = await this.galleryRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0,
      });

      if (!gallery) {
        return response(res, StatusCodes.NOT_FOUND, "Gallery not found");
      }

      gallery.isDelete = 1;

      await this.galleryRepository.save(gallery);

      return response(res, StatusCodes.OK, "Gallery deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
