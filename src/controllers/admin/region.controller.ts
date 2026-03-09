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
import { Region } from "../../entity/Region";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { CreateRegionDto, UpdateRegionDto } from "../../dto/admin/Region.dto";
import { AuthPayload } from "../../middlewares/AuthMiddleware";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/region")
export class RegionController {
  private regionRepository = AppDataSource.getMongoRepository(Region);

  @Post("/")
  async createRegion(
    @Body() body: CreateRegionDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const exists = await this.regionRepository.findOneBy({
        zoneId: new ObjectId(body.zoneId),
        region: body.region,
        isDelete: 0
      });

      if (exists) {
        return response(res, StatusCodes.CONFLICT, "Region already exists in this zone");
      }

      const region = new Region();
      region.zoneId = new ObjectId(body.zoneId);
      region.region = body.region;
      region.edId = new ObjectId(body.edId);
      region.rdIds = body.rdIds.map(id => new ObjectId(id));
      region.isActive = body.isActive ?? 1;
      region.isDelete = 0;
      region.createdBy = new ObjectId(req.user.userId);
      region.updatedBy = new ObjectId(req.user.userId);

      const savedRegion = await this.regionRepository.save(region);

      return response(
        res,
        StatusCodes.CREATED,
        "Region created successfully",
        savedRegion
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAllRegions(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit =
        query.limit !== undefined
          ? Math.max(Number(query.limit), 1)
          : 0;

      const search = query.search?.trim();
      const match: any = { isDelete: 0 };

      if (query.isActive !== undefined) {
        match.isActive = Number(query.isActive);
      }

      if (query.zoneId) {
        match.zoneId = new ObjectId(query.zoneId);
      }

      if (query.zoneIds) {
        const zoneIdsArray = Array.isArray(query.zoneIds) ? query.zoneIds : [query.zoneIds];
        match.zoneId = {
          $in: zoneIdsArray.map((id: string) => new ObjectId(id))
        };
      }

      if (query.edId) {
        match.edId = new ObjectId(query.edId);
      }

      if (query.rdId) {
        match.rdIds = { $in: [new ObjectId(query.rdId)] };
      }

      const pipeline: any[] = [
        { $match: match },
        {
          $lookup: {
            from: "zones",
            let: { zoneId: "$zoneId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$zoneId"] } } },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  country: 1,
                  state: 1
                }
              }
            ],
            as: "zone"
          }
        },
        { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },

        ...(query.zoneName
          ? [{
            $match: {
              "zone.name": { $regex: query.zoneName, $options: "i" }
            }
          }]
          : []),

        {
          $lookup: {
            from: "member",
            let: { edId: "$edId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$edId"] } } },
              {
                $project: {
                  _id: 1,
                  name: "$fullName"
                }
              }
            ],
            as: "ed"
          }
        },
        { $unwind: { path: "$ed", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            let: { rdIds: "$rdIds" },
            pipeline: [
              { $match: { $expr: { $in: ["$_id", "$$rdIds"] } } },
              {
                $project: {
                  _id: 1,
                  name: "$fullName"
                }
              }
            ],
            as: "rds"
          }
        },
        {
          $lookup: {
            from: "adminusers",
            let: { createdBy: "$createdBy" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$createdBy"] } } },
              {
                $project: {
                  _id: 1,
                  name: 1
                }
              }
            ],
            as: "createdByUser"
          }
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true } },
        ...(search
          ? [{
            $match: {
              $or: [
                { region: { $regex: search, $options: "i" } },
                { "zone.name": { $regex: search, $options: "i" } },
                { "zone.country": { $regex: search, $options: "i" } },
                { "zone.state": { $regex: search, $options: "i" } },
                { "ed.name": { $regex: search, $options: "i" } }
              ]
            }
          }]
          : []),
        {
          $sort: {
            isActive: -1,
            createdAt: -1
          }
        },
        {
          $facet: {
            data: [
              ...(limit > 0
                ? [{ $skip: page * limit }, { $limit: limit }]
                : []),
              {
                $project: {
                  _id: 1,
                  region: 1,

                  zoneId: "$zone._id",
                  zoneName: "$zone.name",
                  country: "$zone.country",
                  state: "$zone.state",

                  edId: "$ed._id",
                  edName: "$ed.name",

                  rdIds: "$rds._id",
                  rdNames: "$rds.name",

                  createdBy: "$createdByUser._id",
                  createdByName: "$createdByUser.name",

                  isActive: 1,
                  createdAt: 1
                }
              }
            ],
            meta: [{ $count: "total" }]
          }
        }
      ];

      const result = await this.regionRepository
        .aggregate(pipeline)
        .toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }




  @Get("/:id")
  async getRegionById(@Param("id") id: string, @Res() res: Response) {
    try {
      const pipeline: any[] = [
        {
          $match: {
            _id: new ObjectId(id),
            isDelete: 0
          },

        },

        {
          $lookup: {
            from: "zones",
            let: { zoneId: "$zoneId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$zoneId"] } } },
              { $project: { _id: 1, name: 1, country: 1, state: 1 } }
            ],
            as: "zone"
          }
        },
        { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            let: { edId: "$edId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$edId"] } } },
              { $project: { _id: 1, name: "$fullName" } }
            ],
            as: "ed"
          }
        },
        { $unwind: { path: "$ed", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            let: { rdIds: "$rdIds" },
            pipeline: [
              { $match: { $expr: { $in: ["$_id", "$$rdIds"] } } },
              { $project: { _id: 1, name: "$fullName" } }
            ],
            as: "rds"
          }
        },
        {
          $lookup: {
            from: "adminusers",
            let: { createdBy: "$createdBy" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$createdBy"] } } },
              { $project: { _id: 1, name: 1 } }
            ],
            as: "createdByUser"
          }
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            region: 1,

            zoneId: "$zone._id",
            zoneName: "$zone.name",
            country: "$zone.country",
            state: "$zone.state",

            edId: "$ed._id",
            edName: "$ed.name",

            rdIds: "$rds._id",
            rdNames: "$rds.name",

            createdById: "$createdByUser._id",
            createdByName: "$createdByUser.name",

            isActive: 1,
            createdAt: 1,
            updatedAt: 1
          },

        }
      ];
      const result = await this.regionRepository
        .aggregate(pipeline)
        .toArray();

      if (!result.length) {
        return response(res, StatusCodes.NOT_FOUND, "Region not found");
      }

      return response(
        res,
        StatusCodes.OK,
        "Region fetched successfully",
        result[0]
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async updateRegion(
    @Param("id") id: string,
    @Body() body: UpdateRegionDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const region = await this.regionRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!region) {
        return response(res, StatusCodes.NOT_FOUND, "Region not found");
      }

      if (body.region !== undefined || body.zoneId !== undefined) {
        const regionName = body.region ?? region.region;
        const zoneId = body.zoneId ?? region.zoneId;

        const duplicate = await this.regionRepository.findOne({
          where: {
            region: regionName,
            zoneId: new ObjectId(zoneId),
            isDelete: 0,
            _id: { $ne: new ObjectId(id) }
          }
        });

        if (duplicate) {
          return response(
            res,
            StatusCodes.CONFLICT,
            "Region already exists in this zone"
          );
        }
      }

      if (body.zoneId !== undefined) {
        region.zoneId = new ObjectId(body.zoneId);
      }

      if (body.region !== undefined) {
        region.region = body.region;
      }

      if (body.edId !== undefined) {
        region.edId = new ObjectId(body.edId);
      }

      if (body.rdIds !== undefined) {
        region.rdIds = body.rdIds.map(id => new ObjectId(id));
      }

      if (body.isActive !== undefined) {
        region.isActive = body.isActive;
      }

      region.updatedBy = new ObjectId(req.user.userId);

      const updatedRegion = await this.regionRepository.save(region);

      return response(
        res,
        StatusCodes.OK,
        "Region updated successfully",
        updatedRegion
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Delete("/:id")
  async deleteRegion(@Param("id") id: string, @Res() res: Response) {
    try {
      const region = await this.regionRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!region) {
        return response(res, StatusCodes.NOT_FOUND, "Region not found");
      }

      region.isDelete = 1;
      await this.regionRepository.save(region);

      return response(res, StatusCodes.OK, "Region deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const region = await this.regionRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!region) {
        return response(res, StatusCodes.NOT_FOUND, "Region not found");
      }

      region.isActive = region.isActive === 1 ? 0 : 1;
      const updatedRegion = await this.regionRepository.save(region);

      return response(
        res,
        StatusCodes.OK,
        `Region ${region.isActive === 1 ? "activated" : "deactivated"
        } successfully`,
        updatedRegion
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
