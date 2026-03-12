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
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { CreateRoleDto, UpdateRoleDto } from "../../dto/admin/Role.dto";
import { Role } from "../../entity/Role.Permission";
import { Admin } from "../../entity/Admin";
import { pagination } from "../../utils";
import { RoleType } from "../../enum/role";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/role")
export class RoleController {
  private roleRepository = AppDataSource.getMongoRepository(Role);
  private adminRepository = AppDataSource.getMongoRepository(Admin);

  // ✅ CREATE ROLE
  @Post("/")
  async createRole(
    @Body() body: CreateRoleDto,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {

      const baseCode = body.name.trim().toLowerCase().replace(/\s+/g, "");

      const exactMatch = await this.roleRepository.findOne({
        where: {
          name: { $regex: `^${body.name.trim()}$`, $options: "i" },
          isDelete: 0,
        },
      });

      if (exactMatch) {
        return response(res, StatusCodes.BAD_REQUEST, "Role name already exists");
      }

      const existingRoles = await this.roleRepository.find({
        where: {
          code: { $regex: `^${baseCode}`, $options: "i" },
          isDelete: 0,
        },
      });

      let finalCode = baseCode;

      if (existingRoles.length > 0) {
        const numbers = existingRoles.map(role => {
          const match = role.code.match(/\d+$/);
          return match ? parseInt(match[0]) : 0;
        });

        const nextNumber = Math.max(...numbers) + 1;

        finalCode = `${baseCode}${nextNumber.toString().padStart(3, "0")}`;
      }

      const role = new Role();
      role.name = body.name;
      role.code = finalCode;
      role.permissions = body.permissions.map((p) => ({
        moduleId: new ObjectId(p.moduleId),
        actions: p.actions,
      }));
      role.isActive = 1;
      role.isDelete = 0;
      role.createdBy = new ObjectId(req.user.userId);
      role.updatedBy = new ObjectId(req.user.userId);

      const savedRole = await this.roleRepository.save(role);

      return response(
        res,
        StatusCodes.CREATED,
        "Role created successfully",
        savedRole,
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async updateRole(
    @Param("id") id: string,
    @Body() body: UpdateRoleDto,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const roleId = new ObjectId(id);
      const role = await this.roleRepository.findOne({
        where: { _id: roleId, isDelete: 0 },
      });
      if (!role) {
        return response(res, StatusCodes.NOT_FOUND, "Role not found");
      }
      // const isCreatorAdmin = await this.adminRepository.findOneBy({
      //   _id: role.createdBy,
      //   isDelete: 0,
      // });

      // if (isCreatorAdmin && req.user.userType !== "ADMIN") {
      //   return response(
      //     res,
      //     StatusCodes.FORBIDDEN,
      //     "This role was created by an Admin and can only be edited by an Admin",
      //   );
      // }

      const moduleIds = body.permissions.map((p) => p.moduleId);
      const uniqueModuleIds = new Set(moduleIds);
      if (uniqueModuleIds.size !== moduleIds.length) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Duplicate module permissions are not allowed",
        );
      }

      const duplicateMatch = await this.roleRepository.findOne({
        where: {
          name: { $regex: `^${body.name.trim()}$`, $options: "i" },
          isDelete: 0,
          _id: { $ne: new ObjectId(id) }
        },
      });

      if (duplicateMatch) {
        return response(res, StatusCodes.BAD_REQUEST, "Role name already exists");
      }

      role.name = body.name;
      role.permissions = body.permissions.map((p) => ({
        moduleId: new ObjectId(p.moduleId),
        actions: p.actions,
      }));

      role.updatedBy = new ObjectId(req.user.userId);

      const updatedRole = await this.roleRepository.save(role);

      return response(
        res,
        StatusCodes.OK,
        "Role updated successfully",
        updatedRole,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Get("/list")
  async listRoles(
    @QueryParams() query: any,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString();

      const match: any = {
        isDelete: 0,
      };

      if (search) {
        match.$or = [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
        ];
      }

      if (query.roleType) {
        match.roleType = query.roleType;
      }
      if (query.isActive !== undefined) {
        match.isActive =
          query.isActive === "true" || query.isActive === "1" ? 1 : 0;
      }

      const pipeline: any[] = [
        { $match: match },
        {
          $lookup: {
            from: "modules",
            localField: "permissions.moduleId",
            foreignField: "_id",
            as: "modules",
          },
        },
        {
          $lookup: {
            from: "admins",
            localField: "createdBy",
            foreignField: "_id",
            as: "adminCreator",
          },
        },
        {
          $project: {
            modules: 1,
            name: 1,
            code: 1,
            isActive: 1,
            createdAt: 1,
            mobileAdminAccess: 1,
            isEditable: {
              $cond: {
                if: {
                  $and: [
                    { $gt: [{ $size: "$adminCreator" }, 0] },
                    { $ne: [req.user.userType, "ADMIN"] },
                  ],
                },
                then: false,
                else: true,
              },
            },
            permissions: {
              $map: {
                input: "$permissions",
                as: "perm",
                in: {
                  moduleId: "$$perm.moduleId",
                  moduleName: {
                    $let: {
                      vars: {
                        module: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$modules",
                                as: "mod",
                                cond: {
                                  $eq: [
                                    "$$mod._id",
                                    "$$perm.moduleId",
                                  ],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: "$$module.name",
                    },
                  },
                  actions: "$$perm.actions",
                },
              },
            },
          },
        },

        {
          $sort: {
            isActive: -1,
            createdAt: -1,
          },
        },

        {
          $facet: {
            data: [{ $skip: page * limit }, { $limit: limit }],
            meta: [{ $count: "total" }],
          },
        },
      ];

      const [result] = await Promise.all([
        this.roleRepository.aggregate(pipeline).toArray(),
      ]);
      const data = result[0]?.data || [];
      const total = result[0]?.meta[0]?.total || 0;

      return pagination(total, data, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  // ✅ ROLE DETAILS (AGGREGATION)
  @Get("/:id")
  async getRoleDetails(
    @Param("id") id: string,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const roleId = new ObjectId(id);

      const pipeline: any[] = [
        // 1️⃣ Match role
        {
          $match: {
            _id: roleId,
            isDelete: 0,
          },
        },

        // 2️⃣ Lookup modules
        {
          $lookup: {
            from: "modules",
            localField: "permissions.moduleId",
            foreignField: "_id",
            as: "modules",
          },
        },
        {
          $lookup: {
            from: "admins",
            localField: "createdBy",
            foreignField: "_id",
            as: "adminCreator",
          },
        },
        {
          $project: {
            name: 1,
            code: 1,
            isActive: 1,
            createdAt: 1,
            roleType: 1,
            mobileAdminAccess: 1,
            isEditable: {
              $cond: {
                if: {
                  $and: [
                    { $gt: [{ $size: "$adminCreator" }, 0] },
                    { $ne: [req.user.userType, "ADMIN"] },
                  ],
                },
                then: false,
                else: true,
              },
            },
            permissions: {
              $map: {
                input: "$permissions",
                as: "perm",
                in: {
                  moduleId: "$$perm.moduleId",
                  actions: "$$perm.actions",
                  module: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$modules",
                          as: "mod",
                          cond: {
                            $and: [
                              { $eq: ["$$mod._id", "$$perm.moduleId"] },
                              { $eq: ["$$mod.isDelete", 0] },
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
              },
            },
          },
        },
      ];

      const result = await this.roleRepository.aggregate(pipeline).toArray();

      if (!result.length) {
        return response(res, StatusCodes.NOT_FOUND, "Role not found");
      }

      return response(
        res,
        StatusCodes.OK,
        "Role details fetched successfully",
        result[0],
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Delete("/:id")
  async deleteRole(
    @Param("id") id: string,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const roleId = new ObjectId(id);

      // 🔹 Find role
      const role = await this.roleRepository.findOne({
        where: {
          _id: roleId,
          isDelete: 0,
        },
      });

      if (!role) {
        return response(res, StatusCodes.NOT_FOUND, "Role not found");
      }
      const isCreatorAdmin = await this.adminRepository.findOneBy({
        _id: role.createdBy,
        isDelete: 0,
      });

      if (isCreatorAdmin && req.user.userType !== "ADMIN") {
        return response(
          res,
          StatusCodes.FORBIDDEN,
          "This role was created by an Admin and can only be deleted by an Admin",
        );
      }

      if (role.code === "SUPER_ADMIN") {
        return response(
          res,
          StatusCodes.FORBIDDEN,
          "Super Admin role cannot be deleted",
        );
      }

      role.isDelete = 1;
      role.isActive = 0;
      role.updatedBy = new ObjectId(req.user.userId);

      await this.roleRepository.save(role);

      return response(res, StatusCodes.OK, "Role deleted successfully");
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Patch("/:id/toggle-active")
  async toggleActiveStatus(
    @Param("id") id: string,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const role = await this.roleRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0,
      });

      if (!role) {
        return response(res, StatusCodes.NOT_FOUND, "Role not found");
      }

      const isCreatorAdmin = await this.adminRepository.findOneBy({
        _id: role.createdBy,
        isDelete: 0,
      });

      if (isCreatorAdmin && req.user.userType !== "ADMIN") {
        return response(
          res,
          StatusCodes.FORBIDDEN,
          "This role was created by an Admin and its status can only be toggled by an Admin",
        );
      }

      role.isActive = role.isActive === 1 ? 0 : 1;
      const updatedRole =
        await this.roleRepository.save(role);

      return response(
        res,
        StatusCodes.OK,
        `Role ${role.isActive === 1 ? "enabled" : "disabled"
        } successfully`,
        updatedRole
      );
    } catch (error: any) {
      return handleErrorResponse(error, res);
    }
  }
}
