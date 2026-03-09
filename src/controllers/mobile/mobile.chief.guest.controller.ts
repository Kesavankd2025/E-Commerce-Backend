import {
  JsonController,
  Post,
  Get,
  Param,
  Body,
  Req,
  Res,
  QueryParams,
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
import { MobileChiefGuest } from "../../entity/MobileChiefGuest";
import {
  CreateMobileChiefGuestDto,
  VisitorStatus,
} from "../../dto/mobile/MobileChiefGuest";
import { ChiefGuest } from "../../entity/ChiefGuest";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { Member } from "../../entity/Member";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/chief-guest")
export class ChiefGuestController {
  private visitorRepo = AppDataSource.getMongoRepository(MobileChiefGuest);
  private pointsRepo = AppDataSource.getMongoRepository(Points);
  private userPointsRepo = AppDataSource.getMongoRepository(UserPoints);
  private historyRepo = AppDataSource.getMongoRepository(UserPointHistory);
  private memberRepo = AppDataSource.getMongoRepository(Member);

  @Post("/")
  async createChief(
    @Body() body: CreateMobileChiefGuestDto,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      const chiefGuest = new MobileChiefGuest();

      chiefGuest.chiefGuestName = body.chiefGuestName;
      chiefGuest.contactNumber = body.contactNumber;
      chiefGuest.businessCategory = body.businessCategory;
      chiefGuest.businessName = body.businessName;
      chiefGuest.email = body.email;
      chiefGuest.email = body.email;
      chiefGuest.about = body.about;
      chiefGuest.profileImage = body.profileImage;


      if (body.status === VisitorStatus.YES) {
        chiefGuest.status = VisitorStatus.APPROVE;
      } else if (body.status === VisitorStatus.NO) {
        chiefGuest.status = VisitorStatus.REJECT;
      } else {
        chiefGuest.status =
          (body.status as "Approved" | "Rejected" | "Pending" | "MAY_BE") ||
          VisitorStatus.PENDING;
      }

      chiefGuest.businessName = body.businessName || "";
      chiefGuest.sourceType = "MEETING"

      chiefGuest.isActive = 1;
      chiefGuest.isDelete = 0;
      chiefGuest.createdBy = new ObjectId(req.user.userId);
      chiefGuest.updatedBy = new ObjectId(req.user.userId);

      const saved = await this.visitorRepo.save(chiefGuest);

      // --- Points Allocation ---
      const pointConfig = await this.pointsRepo.findOne({
        where: { key: "chief_guests", isActive: 1, isDelete: 0 }
      });

      if (pointConfig) {
        const userId = new ObjectId(req.user.userId);

        await this.userPointsRepo.updateOne(
          { userId, pointKey: "chief_guests" },
          { $inc: { value: pointConfig.value } },
          { upsert: true }
        );

        await this.historyRepo.save({
          userId,
          pointKey: "chief_guests",
          change: pointConfig.value,
          source: "CHIEF_GUEST",
          sourceId: saved._id,
          remarks: "Chief Guest logged",
          createdAt: new Date()
        });
      }

      return response(
        res,
        StatusCodes.CREATED,
        "Chief Guest created successfully",
        saved,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Patch("/:id")
  async updateChief(
    @Param("id") id: string,
    @Body() body: CreateMobileChiefGuestDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      if (!ObjectId.isValid(id)) {
        return response(res, StatusCodes.BAD_REQUEST, "Invalid Chief Guest ID");
      }

      const chiefGuest = await this.visitorRepo.findOne({
        where: {
          _id: new ObjectId(id),
          isDelete: 0
        }
      });

      if (!chiefGuest) {
        return response(res, StatusCodes.NOT_FOUND, "Chief Guest not found");
      }

      // 🔹 Update fields only if provided
      if (body.chiefGuestName !== undefined)
        chiefGuest.chiefGuestName = body.chiefGuestName;

      if (body.contactNumber !== undefined)
        chiefGuest.contactNumber = body.contactNumber;

      if (body.businessCategory !== undefined)
        chiefGuest.businessCategory = body.businessCategory;

      if (body.businessName !== undefined)
        chiefGuest.businessName = body.businessName;

      if (body.email !== undefined)
        chiefGuest.email = body.email;

      if (body.about !== undefined)
        chiefGuest.about = body.about;

      if (body.profileImage !== undefined)
        chiefGuest.profileImage = body.profileImage;

      // 🔹 Status mapping (same logic as create)
      if (body.status) {
        if (body.status === VisitorStatus.YES) {
          chiefGuest.status = VisitorStatus.APPROVE;
        } else if (body.status === VisitorStatus.NO) {
          chiefGuest.status = VisitorStatus.REJECT;
        } else {
          chiefGuest.status =
            (body.status as "Approved" | "Rejected" | "Pending" | "MAY_BE") ||
            VisitorStatus.PENDING;
        }
      }

      chiefGuest.updatedBy = new ObjectId(req.user.userId);

      const updated = await this.visitorRepo.save(chiefGuest);

      return response(
        res,
        StatusCodes.OK,
        "Chief Guest updated successfully",
        updated
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/list")
  async listChiefGuest(
    @QueryParams() query: any,
    @Res() res: Response,
    @Req() req: RequestWithUser
  ) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString();

      const match: any = {
        isDelete: 0,
        createdBy: new ObjectId(req.user.userId)
      };

      if (search) {
        match.$or = [
          { chiefGuestName: { $regex: search, $options: "i" } },
          { contactNumber: { $regex: search, $options: "i" } }
        ];
      }

      const pipeline = [
        { $match: match },

        {
          $lookup: {
            from: "member",
            localField: "createdBy",
            foreignField: "_id",
            as: "member"
          }
        },
        {
          $unwind: {
            path: "$member",
            preserveNullAndEmptyArrays: true
          }
        },

        {
          $project: {
            chiefGuestName: 1,
            contactNumber: 1,
            sourceOfEvent: 1,
            status: 1,
            businessCategory: 1,
            businessName: 1,
            createdAt: 1,
            email: 1,
            profileImage: 1,
            about: 1,
            address: 1,
            invitedBy: {
              _id: "$member._id",
              name: "$member.fullName"
            }
          }
        },

        { $sort: { createdAt: -1 } },

        {
          $facet: {
            data: [
              { $skip: page * limit },
              { $limit: limit }
            ],
            meta: [{ $count: "total" }]
          }
        }
      ];

      const [result] = await this.visitorRepo.aggregate(pipeline).toArray();

      const data = result?.data || [];
      const total = result?.meta?.[0]?.total || 0;

      return pagination(total, data, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Post("/update-status/:id")
  async updateStatus(
    @Param("id") id: string,
    @Body() body: { status: VisitorStatus },
    @Res() res: Response,
  ) {
    try {
      const { status } = body;

      if (
        ![
          VisitorStatus.YES,
          VisitorStatus.NO,
          VisitorStatus.MAY_BE,
          VisitorStatus.APPROVE,
          VisitorStatus.REJECT,
          VisitorStatus.PENDING,
        ].includes(status)
      ) {
        return response(res, StatusCodes.BAD_REQUEST, "Invalid status.", null);
      }

      const guest = await this.visitorRepo.findOneBy({
        _id: new ObjectId(id),
      });

      if (!guest) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "Chief Guest not found",
          null,
        );
      }

      // @ts-ignore
      guest.status = status;
      await this.visitorRepo.save(guest);

      return response(
        res,
        StatusCodes.OK,
        "Status updated successfully",
        guest,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  private adminChiefGuestRepo = AppDataSource.getMongoRepository(ChiefGuest);

  @Get("/overall")
  async getAllChiefGuest(
    @QueryParams() query: any,
    @Res() res: Response,
    @Req() req: RequestWithUser
  ) {
    try {
      const page = Number(query.page) || 0;
      const limit = Number(query.limit) || 10;
      const skip = page * limit;
      const user = await this.memberRepo.findOne({
        where: { _id: new ObjectId(req.user.userId) },
      });

      if (!user) {
        return response(res, StatusCodes.NOT_FOUND, "User not found", []);
      }

      const chapterId = user.chapter?.toString();
      const { createdBy } = query;

      // ================= MOBILE PIPELINE =================
      const mobilePipeline: any[] = [
        {
          $match: { isDelete: 0, isActive: 1 },
        },
        {
          $lookup: {
            from: "member",
            localField: "createdBy",
            foreignField: "_id",
            as: "creator",
          },
        },
        { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $expr: {
              $eq: [{ $toString: "$creator.chapter" }, chapterId],
            },
          },
        },
        {
          $lookup: {
            from: "businesscategories",
            localField: "creator.businessCategory",
            foreignField: "_id",
            as: "creatorCategory",
          },
        },
        { $unwind: { path: "$creatorCategory", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            chiefGuestName: 1,
            contactNumber: 1,
            businessName: 1,
            businessCategory: 1,
            profileImage: 1,
            about: 1,
            sourceOfEvent: 1,
            status: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$status", "MAY_BE"] },
                    { $not: ["$status"] },
                  ],
                },
                then: "Pending",
                else: "$status",
              },
            },
            email: 1,
            address: 1,
            isActive: 1,
            createdAt: 1,
            _id: 1,
            creatorName: "$creator.fullName",
            creatorCompany: "$creator.companyName",
            creatorProfileImage: "$creator.profileImage",
            creatorCategory: "$creatorCategory.name",
            source: { $literal: "mobile" },
            type: { $literal: "Mobile" },
          },
        },
      ];

      const adminPipeline: any[] = [
        {
          $match: { isDelete: 0, isActive: 1 },
        },
        {
          $lookup: {
            from: "member",
            localField: "referredBy",
            foreignField: "_id",
            as: "creator",
          },
        },
        { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "businesscategories",
            localField: "creator.businessCategory",
            foreignField: "_id",
            as: "creatorCategory",
          },
        },
        { $unwind: { path: "$creatorCategory", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "businesscategories",
            localField: "businessCategory",
            foreignField: "_id",
            as: "guestBusinessCategory",
          },
        },
        {
          $unwind: {
            path: "$guestBusinessCategory",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            chiefGuestName: 1,
            contactNumber: 1,
            businessName: 1,
            businessCategory: "$guestBusinessCategory.name",
            location: 1,
            referredBy: 1,
            address: 1,
            isActive: 1,
            createdAt: 1,
            email: "$emailId",
            profileImage: 1,
            about: 1,
            _id: 1,
            creatorName: "$creator.fullName",
            creatorCompany: "$creator.companyName",
            creatorProfileImage: "$creator.profileImage",
            creatorCategory: "$creatorCategory.name",
            source: { $literal: "admin" },
            type: { $literal: "Admin" },
          },
        },
      ];

      if (createdBy === "member") {
        const pipeline = [
          ...mobilePipeline,
          { $sort: { createdAt: -1 } },
          {
            $facet: {
              data: [{ $skip: skip }, { $limit: limit }],
              totalCount: [{ $count: "count" }],
            },
          },
        ];

        const result = await this.visitorRepo.aggregate(pipeline).toArray();
        const totalCount = result[0]?.totalCount?.[0]?.count || 0;

        return pagination(totalCount, result[0].data, limit, page, res);
      }

      if (createdBy === "admin") {
        const pipeline = [
          ...adminPipeline,
          { $sort: { createdAt: -1 } },
          {
            $facet: {
              data: [{ $skip: skip }, { $limit: limit }],
              totalCount: [{ $count: "count" }],
            },
          },
        ];

        const result = await this.adminChiefGuestRepo
          .aggregate(pipeline)
          .toArray();

        const totalCount = result[0]?.totalCount?.[0]?.count || 0;

        return pagination(totalCount, result[0].data, limit, page, res);
      }

      const combinedPipeline = [
        ...mobilePipeline,
        {
          $unionWith: {
            coll: this.adminChiefGuestRepo,
            pipeline: adminPipeline,
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            totalCount: [{ $count: "count" }],
          },
        },
      ];

      const result = await this.visitorRepo
        .aggregate(combinedPipeline)
        .toArray();

      const totalCount = result[0]?.totalCount?.[0]?.count || 0;

      return pagination(totalCount, result[0].data, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
