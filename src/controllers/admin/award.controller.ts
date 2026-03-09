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
import { Award } from "../../entity/Award";
import { CreateAwardDto, UpdateAwardDto } from "../../dto/admin/Award.dto";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/award")
export class AwardController {
  private awardRepository = AppDataSource.getMongoRepository(Award);

  @Post("/")
  async createAward(
    @Body() body: CreateAwardDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const exists = await this.awardRepository.findOneBy({
        name: body.name,
        isDelete: 0
      });

      if (exists) {
        return response(res, StatusCodes.CONFLICT, "Award already exists");
      }

      const award = new Award();
      award.name = body.name;
      award.isActive = body.isActive ?? 1;
      award.isDelete = 0;
      award.createdBy = new ObjectId(req.user.userId);
      award.updatedBy = new ObjectId(req.user.userId);

      const savedAward = await this.awardRepository.save(award);

      return response(
        res,
        StatusCodes.CREATED,
        "Award created successfully",
        savedAward
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAllAwards(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 0);
      const search = query.search?.trim();

      const match: any = {
        isDelete: 0
      };

      if (search) {
        match.name = { $regex: search, $options: "i" };
      }

      const operation: any[] = [
        { $match: match },
        {
          $sort: {
            isActive: -1,
            createdAt: -1
          }
        }
      ];

      if (limit > 0) {
        operation.push(
          { $skip: page * limit },
          { $limit: limit }
        );
      }

      const awards = await this.awardRepository
        .aggregate(operation)
        .toArray();

      const totalCount =
        await this.awardRepository.countDocuments(match);

      if (limit === 0) {
        return response(
          res,
          StatusCodes.OK,
          "Awards fetched successfully",
          awards
        );
      }

      return pagination(
        totalCount,
        awards,
        limit,
        page,
        res
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Get("/active")
  async getActiveAwards(@Res() res: Response) {
    try {
      const awards = await this.awardRepository.find({
        isDelete: 0,
        isActive: 1
      });
      return response(res, StatusCodes.OK, "Active awards fetched successfully", awards);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/:id")
  async getAwardById(@Param("id") id: string, @Res() res: Response) {
    try {
      const award = await this.awardRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!award) {
        return response(res, StatusCodes.NOT_FOUND, "Award not found");
      }

      return response(res, StatusCodes.OK, "Award fetched successfully", award);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async updateAward(
    @Param("id") id: string,
    @Body() body: UpdateAwardDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const award = await this.awardRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!award) {
        return response(res, StatusCodes.NOT_FOUND, "Award not found");
      }

      if (body.name) {
        const nameExists = await this.awardRepository.findOne({
          where: {
            name: body.name,
            isDelete: 0,
            _id: { $ne: new ObjectId(id) }
          }
        });

        if (nameExists) {
          return response(
            res,
            StatusCodes.CONFLICT,
            "Award name already exists"
          );
        }

        award.name = body.name;
      }

      if (body.isActive !== undefined) {
        award.isActive = body.isActive;
      }

      award.updatedBy = new ObjectId(req.user.userId);

      const updatedAward = await this.awardRepository.save(award);

      return response(
        res,
        StatusCodes.OK,
        "Award updated successfully",
        updatedAward
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Delete("/:id")
  async deleteAward(@Param("id") id: string, @Res() res: Response) {
    try {
      const award = await this.awardRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!award) {
        return response(res, StatusCodes.NOT_FOUND, "Award not found");
      }

      award.isDelete = 1;
      await this.awardRepository.save(award);

      return response(res, StatusCodes.OK, "Award deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Patch("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const award = await this.awardRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!award) {
        return response(res, StatusCodes.NOT_FOUND, "Award not found");
      }

      award.isActive = award.isActive === 1 ? 0 : 1;
      const updatedAward = await this.awardRepository.save(award);

      return response(
        res,
        StatusCodes.OK,
        `Award ${award.isActive === 1 ? "enabled" : "disabled"} successfully`,
        updatedAward
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
