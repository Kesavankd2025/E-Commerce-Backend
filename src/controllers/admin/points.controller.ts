import {
  JsonController,
  Get,
  Patch,
  Param,
  Body,
  Res,
  UseBefore
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { Points } from "../../entity/Points";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { IsNumber } from "class-validator";

class UpdatePointValueDto {
  @IsNumber()
  value: number;
}

@UseBefore(AuthMiddleware)
@JsonController("/points")
export class PointsController {
  private pointsRepository = AppDataSource.getMongoRepository(Points);

  @Get("/")
  async getAllPoints(@Res() res: Response) {
    try {
      const points = await this.pointsRepository.find({
        where: {
          isDelete: 0,
          isActive: 1
        },
        order: {
          order: "ASC"
        }
      });

      return response(
        res,
        StatusCodes.OK,
        "Points fetched successfully",
        points
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Patch("/:id")
  async updatePointValue(
    @Param("id") id: string,
    @Body() body: UpdatePointValueDto,
    @Res() res: Response
  ) {
    try {
      const point = await this.pointsRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!point) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "Point not found"
        );
      }

      point.value = body.value;

      await this.pointsRepository.save(point);

      return response(
        res,
        StatusCodes.OK,
        "Point value updated successfully",
        point
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
