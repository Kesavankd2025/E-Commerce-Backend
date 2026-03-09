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
  Req
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { Zone } from "../../entity/Zone";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { AuthPayload } from "../../middlewares/AuthMiddleware";
import { CreateZoneDto, UpdateZoneDto } from "../../dto/admin/Zone.dto";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/zone")
export class ZoneController {
  private zoneRepository = AppDataSource.getMongoRepository(Zone);

  @Post("/")
  async createZone(
    @Body() body: CreateZoneDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const exists = await this.zoneRepository.findOneBy({
        name: body.name,
        isDelete: 0
      });

      if (exists) {
        return response(res, StatusCodes.CONFLICT, "Zone already exists");
      }

      const zone = new Zone();
      zone.name = body.name;
      zone.country = body.country;
      zone.state = body.state;
      zone.isActive = body.isActive ?? 1;
      zone.isDelete = 0;
      zone.createdBy = new ObjectId(req.user.userId);
      zone.updatedBy = new ObjectId(req.user.userId);

      const savedZone = await this.zoneRepository.save(zone);

      return response(
        res,
        StatusCodes.CREATED,
        "Zone created successfully",
        savedZone
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAllZones(@QueryParams() query: any, @Res() res: Response) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 0);

      const match = { isDelete: 0 };

      const operation: any[] = [];

      operation.push({ $match: match });

      if (limit > 0) {
        operation.push(
          { $skip: page * limit },
          { $limit: limit }
        );
      }

      const zones = await this.zoneRepository
        .aggregate(operation)
        .toArray();

      const totalCount =
        await this.zoneRepository.countDocuments(match);

      return pagination(totalCount, zones, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/active")
  async getActiveZones(@Res() res: Response) {
    try {
      const zones = await this.zoneRepository.find({
        isDelete: 0,
        isActive: 1
      });
      return response(res, StatusCodes.OK, "Active zones fetched successfully", zones);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/:id")
  async getZoneById(@Param("id") id: string, @Res() res: Response) {
    try {
      const zone = await this.zoneRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!zone) {
        return response(res, StatusCodes.NOT_FOUND, "Zone not found");
      }

      return response(res, StatusCodes.OK, "Zone fetched successfully", zone);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async updateZone(
    @Param("id") id: string,
    @Body() body: UpdateZoneDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const zone = await this.zoneRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!zone) {
        return response(res, StatusCodes.NOT_FOUND, "Zone not found");
      }

      if (
        body.name !== undefined ||
        body.country !== undefined ||
        body.state !== undefined
      ) {
        const zoneName = body.name ?? zone.name;
        const country = body.country ?? zone.country;
        const state = body.state ?? zone.state;

        const duplicate = await this.zoneRepository.findOne({
          where: {
            name: zoneName,
            country,
            state,
            isDelete: 0,
            _id: { $ne: new ObjectId(id) }
          }
        });

        if (duplicate) {
          return response(
            res,
            StatusCodes.CONFLICT,
            "Zone already exists in this country and state"
          );
        }
      }

      if (body.name !== undefined) zone.name = body.name;
      if (body.country !== undefined) zone.country = body.country;
      if (body.state !== undefined) zone.state = body.state;
      if (body.isActive !== undefined) zone.isActive = body.isActive;

      zone.updatedBy = new ObjectId(req.user.userId);

      const updatedZone = await this.zoneRepository.save(zone);

      return response(
        res,
        StatusCodes.OK,
        "Zone updated successfully",
        updatedZone
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Delete("/:id")
  async deleteZone(@Param("id") id: string, @Res() res: Response) {
    try {
      const zone = await this.zoneRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!zone) {
        return response(res, StatusCodes.NOT_FOUND, "Zone not found");
      }

      zone.isDelete = 1;
      await this.zoneRepository.save(zone);

      return response(res, StatusCodes.OK, "Zone deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const zone = await this.zoneRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!zone) {
        return response(res, StatusCodes.NOT_FOUND, "Zone not found");
      }

      zone.isActive = zone.isActive === 1 ? 0 : 1;
      const updatedZone = await this.zoneRepository.save(zone);

      return response(
        res,
        StatusCodes.OK,
        `Zone ${zone.isActive === 1 ? "activated" : "deactivated"} successfully`,
        updatedZone
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/by-state/:state")
  async getZonesByState(
    @Param("state") state: string,
    @Res() res: Response
  ) {
    try {
      const zones = await this.zoneRepository.aggregate([
        {
          $match: {
            state,
            isDelete: 0,
            isActive: 1
          }
        },
        {
          $project: {
            _id: 1,
            name: 1
          }
        }
      ]).toArray();

      return response(
        res,
        StatusCodes.OK,
        "Zones fetched successfully",
        zones
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

}
