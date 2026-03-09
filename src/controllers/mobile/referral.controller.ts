import {
  JsonController,
  Post,
  Get,
  Req,
  Res,
  UseBefore,
  QueryParams,
  Body,
  Patch,
  Param
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { Referral } from "../../entity/Referral";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { Notifications } from "../../entity/Notification";

import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { CreateReferralDto, UpdateReferralStatusDto } from "../../dto/mobile/Referral.dto";
import { pagination } from "../../utils";
import { ReferralStatus } from "../../enum/referrals";
import { Member } from "../../entity/Member";
import { NotificationService } from "../../services/notification.service";

@UseBefore(AuthMiddleware)
@JsonController("/referrals")
export class ReferralController {
  private referralRepo =
    AppDataSource.getMongoRepository(Referral);

  private pointsRepo =
    AppDataSource.getMongoRepository(Points);
  private memberRepository =
    AppDataSource.getMongoRepository(Member);

  private userPointsRepo =
    AppDataSource.getMongoRepository(UserPoints);

  private historyRepo =
    AppDataSource.getMongoRepository(UserPointHistory);
  private readonly notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService(); // ✅ FIXED
  }
  @Post("/")
  async createReferral(
    @Req() req: any,
    @Body() body: CreateReferralDto,
    @Res() res: Response
  ) {
    try {
      const userId = new ObjectId(req.user.userId);
      const member = await this.memberRepository.findOne({
        where: {
          _id: userId,
          isDelete: 0
        }
      });
      if (!member) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "Member not found"
        );
      }
      const referral = this.referralRepo.create({
        ...body,
        status: body.status
          ? (body.status as ReferralStatus)
          : ReferralStatus.NOT_CONTACTED,

        chapterId: body.chapterId
          ? new ObjectId(body.chapterId)
          : undefined,
        toMemberId: new ObjectId(body.toMemberId),
        fromMemberId: userId,
        rating: Number(body.rating),
        isDelete: 0
      });

      await this.referralRepo.save(referral);

      const referralPoint = await this.pointsRepo.findOne({
        where: {
          key: "referrals",
          isActive: 1,
          isDelete: 0
        }
      });
      if (!referralPoint) {
        return response(
          res,
          StatusCodes.CREATED,
          "Referral submitted (points not configured)",
          referral
        );
      }

      await this.userPointsRepo.updateOne(
        {
          userId,
          pointKey: "referrals"
        },
        {
          $inc: { value: referralPoint.value }
        },
        { upsert: true }
      );

      await this.historyRepo.insertOne({
        userId,
        pointKey: "referrals",
        change: referralPoint.value,
        source: "REFERRAL",
        sourceId: referral.id,
        remarks: "Referral submitted",
        createdAt: new Date()
      });
      await this.notificationService.createNotification({
        moduleName: "REFERRAL",
        moduleId: referral.id,
        createdBy: req.user.userId,
        subject: "New Referral Received",
        content: `You have received a new referral from ${member.fullName}.`,
        model: "Member",
        memberId: body.toMemberId,
        actionType: "APPROVE"
      });
      return response(
        res,
        StatusCodes.CREATED,
        "Referral submitted successfully",
        referral
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/given")
  async getGivenReferrals(
    @Req() req: any,
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const memberId = new ObjectId(req.user.userId);
      const page = Number(query.page) || 0;
      const limit = Number(query.limit) || 10;

      const matchStage = {
        fromMemberId: memberId,
        isDelete: 0
      };

      const pipeline: any[] = [
        { $match: matchStage },

        // ===== FROM MEMBER =====
        {
          $lookup: {
            from: "member",
            let: { memberId: "$fromMemberId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },

              {
                $lookup: {
                  from: "businesscategories",
                  localField: "businessCategory",
                  foreignField: "_id",
                  as: "businessCategory"
                }
              },
              { $unwind: { path: "$businessCategory", preserveNullAndEmptyArrays: true } },

              {
                $lookup: {
                  from: "chapters",
                  localField: "chapter",
                  foreignField: "_id",
                  as: "chapterDetails"
                }
              },
              { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },

              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  email: 1,
                  phoneNumber: 1,
                  profileImage: 1,
                  companyName: 1,
                  businessCategoryName: "$businessCategory.name",
                  chapterName: "$chapterDetails.chapterName"
                }
              }
            ],
            as: "fromMember"
          }
        },
        { $unwind: { path: "$fromMember", preserveNullAndEmptyArrays: true } },

        // ===== TO MEMBER =====
        {
          $lookup: {
            from: "member",
            let: { memberId: "$toMemberId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },

              {
                $lookup: {
                  from: "businesscategories",
                  localField: "businessCategory",
                  foreignField: "_id",
                  as: "businessCategory"
                }
              },
              { $unwind: { path: "$businessCategory", preserveNullAndEmptyArrays: true } },

              {
                $lookup: {
                  from: "chapters",
                  localField: "chapter",
                  foreignField: "_id",
                  as: "chapterDetails"
                }
              },
              { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },

              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  email: 1,
                  phoneNumber: 1,
                  profileImage: 1,
                  companyName: 1,
                  businessCategoryName: "$businessCategory.name",
                  chapterName: "$chapterDetails.chapterName"
                }
              }
            ],
            as: "toMember"
          }
        },
        { $unwind: { path: "$toMember", preserveNullAndEmptyArrays: true } },

        { $sort: { createdAt: -1 } },
        { $skip: page * limit },
        { $limit: limit },

        {
          $project: {
            referralFor: 1,
            referralType: 1,
            referralName: 1,
            telephone: 1,
            email: 1,
            toldWouldCall: 1,
            givenCard: 1,
            address: 1,
            rating: 1,
            comments: 1,
            status: 1,
            createdAt: 1,
            fromMember: 1,
            toMember: 1
          }
        }
      ];

      const referrals = await this.referralRepo.aggregate(pipeline).toArray();
      const totalCount = await this.referralRepo.countDocuments(matchStage);

      return pagination(totalCount, referrals, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Get("/received")
  async getReceivedReferrals(
    @Req() req: any,
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const memberId = new ObjectId(req.user.userId);
      const page = Number(query.page) || 0;
      const limit = Number(query.limit) || 10;

      const matchStage = {
        toMemberId: memberId,
        isDelete: 0
      };

      const pipeline: any[] = [
        { $match: matchStage },

        // ===== FROM MEMBER =====
        {
          $lookup: {
            from: "member",
            let: { memberId: "$fromMemberId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },

              {
                $lookup: {
                  from: "businesscategories",
                  localField: "businessCategory",
                  foreignField: "_id",
                  as: "businessCategory"
                }
              },
              { $unwind: { path: "$businessCategory", preserveNullAndEmptyArrays: true } },

              {
                $lookup: {
                  from: "chapters",
                  localField: "chapter",
                  foreignField: "_id",
                  as: "chapterDetails"
                }
              },
              { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },

              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  email: 1,
                  phoneNumber: 1,
                  profileImage: 1,
                  companyName: 1,
                  businessCategoryName: "$businessCategory.name",
                  chapterName: "$chapterDetails.chapterName"
                }
              }
            ],
            as: "fromMember"
          }
        },
        { $unwind: { path: "$fromMember", preserveNullAndEmptyArrays: true } },

        // ===== TO MEMBER =====
        {
          $lookup: {
            from: "member",
            let: { memberId: "$toMemberId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },

              {
                $lookup: {
                  from: "businesscategories",
                  localField: "businessCategory",
                  foreignField: "_id",
                  as: "businessCategory"
                }
              },
              { $unwind: { path: "$businessCategory", preserveNullAndEmptyArrays: true } },

              {
                $lookup: {
                  from: "chapters",
                  localField: "chapter",
                  foreignField: "_id",
                  as: "chapterDetails"
                }
              },
              { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  email: 1,
                  phoneNumber: 1,
                  profileImage: 1,
                  companyName: 1,
                  businessCategoryName: "$businessCategory.name",
                  chapterName: "$chapterDetails.chapterName"
                }
              }
            ],
            as: "toMember"
          }
        },
        { $unwind: { path: "$toMember", preserveNullAndEmptyArrays: true } },

        { $sort: { createdAt: -1 } },
        { $skip: page * limit },
        { $limit: limit },

        {
          $project: {
            referralFor: 1,
            referralType: 1,
            referralName: 1,
            telephone: 1,
            email: 1,
            address: 1,
            rating: 1,
            comments: 1,
            status: 1,
            createdAt: 1,
            fromMember: 1,
            toMember: 1
          }
        }
      ];

      const referrals = await this.referralRepo.aggregate(pipeline).toArray();
      const totalCount = await this.referralRepo.countDocuments(matchStage);

      return pagination(totalCount, referrals, limit, page, res);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/details/:id")
  async getReferralDetails(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid referral ID"
        });
      }

      const referralId = new ObjectId(id);
      const memberId = new ObjectId(req.user.userId);

      const pipeline: any[] = [
        {
          $match: {
            _id: referralId,
            isDelete: 0,
            $or: [
              { fromMemberId: memberId },
              { toMemberId: memberId }
            ]
          }
        },
        {
          $lookup: {
            from: "member",
            let: { memberId: "$fromMemberId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
              {
                $lookup: {
                  from: "businesscategories",
                  localField: "businessCategory",
                  foreignField: "_id",
                  as: "businessCategory"
                }
              },
              { $unwind: { path: "$businessCategory", preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: "chapters",
                  localField: "chapter",
                  foreignField: "_id",
                  as: "chapterDetails"
                }
              },
              { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  email: 1,
                  phoneNumber: 1,
                  profileImage: 1,
                  companyName: 1,
                  businessCategoryName: "$businessCategory.name",
                  chapterName: "$chapterDetails.chapterName"
                }
              }
            ],
            as: "fromMember"
          }
        },
        { $unwind: { path: "$fromMember", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "member",
            let: { memberId: "$toMemberId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$memberId"] } } },
              {
                $lookup: {
                  from: "businesscategories",
                  localField: "businessCategory",
                  foreignField: "_id",
                  as: "businessCategory"
                }
              },
              { $unwind: { path: "$businessCategory", preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: "chapters",
                  localField: "chapter",
                  foreignField: "_id",
                  as: "chapterDetails"
                }
              },
              { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 1,
                  fullName: 1,
                  email: 1,
                  phoneNumber: 1,
                  profileImage: 1,
                  toldWouldCall: 1,
                  givenCard: 1,
                  companyName: 1,
                  businessCategoryName: "$businessCategory.name",
                  chapterName: "$chapterDetails.chapterName"
                }
              }
            ],
            as: "toMember"
          }
        },
        { $unwind: { path: "$toMember", preserveNullAndEmptyArrays: true } },

        {
          $project: {
            referralFor: 1,
            referralType: 1,
            referralName: 1,
            telephone: 1,
            email: 1,
            address: 1,
            rating: 1,
            comments: 1,
            status: 1,
            toldWouldCall: 1,
            givenCard: 1,
            createdAt: 1,
            fromMember: 1,
            toMember: 1
          }
        }
      ];

      const result = await this.referralRepo.aggregate(pipeline).toArray();

      if (!result.length) {
        return res.status(404).json({
          success: false,
          message: "Referral not found"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Referral details fetched successfully",
        data: result[0]
      });

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Patch("/status/:id")
  async updateReferralStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: UpdateReferralStatusDto,
    @Res() res: Response
  ) {
    try {
      const referralId = new ObjectId(id);
      const userId = new ObjectId(req.user.userId);

      const referral = await this.referralRepo.findOne({
        where: {
          _id: referralId,
          isDelete: 0
        }
      });

      if (!referral) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "Referral not found"
        );
      }

      if (
        !referral.fromMemberId.equals(userId) &&
        !referral.toMemberId.equals(userId)
      ) {
        return response(
          res,
          StatusCodes.FORBIDDEN,
          "You are not allowed to update this referral"
        );
      }

      await this.referralRepo.updateOne(
        { _id: referralId },
        {
          $set: {
            status: body.status,
            updatedAt: new Date()
          }
        }
      );

      return response(
        res,
        StatusCodes.OK,
        "Referral status updated successfully"
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Get("/insideReferralProfile")
  async insideReferralProfile(
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const userId = new ObjectId(req.user.userId);

      const profile = await this.memberRepository.findOne({
        where: {
          _id: userId,
          isDelete: 0
        }
      });

      if (!profile) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "Inside Refferal not found"
        );
      }

      const officeAddress = profile.officeAddress
        ? [
          profile.officeAddress.doorNo,
          profile.officeAddress.oldNo,
          profile.officeAddress.street,
          profile.officeAddress.area,
          profile.officeAddress.city,
          profile.officeAddress.state,
          profile.officeAddress.pincode
        ]
          .filter(Boolean)
          .join(", ")
        : "";

      const result = {
        fullName: profile.fullName,
        phoneNumber: profile.phoneNumber,
        email: profile.email,
        address: officeAddress
      };

      return response(
        res,
        StatusCodes.OK,
        "inside Refferal successfully",
        result
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
  @Patch("/:id")
  async updateReferral(
    @Param("id") id: string,
    @Body() body: Partial<Referral>,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const referralId = new ObjectId(id);

      const existingReferral = await this.referralRepo.findOne({
        where: { _id: referralId, isDelete: 0 }
      });

      if (!existingReferral) {
        return response(res, StatusCodes.NOT_FOUND, "Referral not found");
      }

      const updateData: any = {};

      const allowedFields = [
        "referralFor",
        "chapterId",
        "toMemberId",
        "referralType",
        "toldWouldCall",
        "givenCard",
        "referralName",
        "telephone",
        "email",
        "address",
        "rating",
        "comments",
        "status"
      ];

      for (const key of allowedFields) {
        if (body[key] !== undefined && body[key] !== null) {
          updateData[key] = body[key];
        }
      }

      if (updateData.toMemberId) updateData.toMemberId = new ObjectId(updateData.toMemberId);
      if (updateData.chapterId) updateData.chapterId = new ObjectId(updateData.chapterId);

      updateData.updatedBy = new ObjectId(req.user.userId);
      updateData.updatedAt = new Date();

      if (updateData.toMemberId && !updateData.toMemberId.equals(existingReferral.toMemberId)) {
        await AppDataSource.getMongoRepository(Notifications).updateMany(
          {
            moduleName: "REFERRAL",
            moduleId: referralId,
            receiverId: existingReferral.toMemberId
          },
          { $set: { isDelete: 1 } }
        );

        const member = await this.memberRepository.findOne({
          where: { _id: existingReferral.fromMemberId, isDelete: 0 }
        });

        if (member) {
          await this.notificationService.createNotification({
            moduleName: "REFERRAL",
            moduleId: referralId,
            createdBy: existingReferral.fromMemberId.toString(),
            subject: "New Referral Received",
            content: `You have received a new referral from ${member.fullName}.`,
            model: "Member",
            memberId: updateData.toMemberId,
            actionType: "APPROVE"
          });
        }
      }

      const result = await this.referralRepo.updateOne(
        { _id: referralId },
        { $set: updateData }
      );

      return response(res, StatusCodes.OK, "Referral updated successfully", result);

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

}
