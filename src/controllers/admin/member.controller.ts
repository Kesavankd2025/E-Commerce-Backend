import { Body, Delete, Get, JsonController, Param, Patch, Post, Put, QueryParams, Req, Res, UseBefore } from "routing-controllers";
import { CreateMemberDto, UpdateMemberDto } from "../../dto/admin/Member.dto";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { Member } from "../../entity/Member";
import { Admin } from "../../entity/Admin";
import { AdminUser } from "../../entity/AdminUser";
import { StatusCodes } from "http-status-codes";
import response from "../../utils/response";
import { ObjectId } from "mongodb";
import { ApiError, handleErrorResponse, pagination } from "../../utils";
import { generateMembershipId } from "../../utils/id.generator";
import { Role } from "../../entity/Role.Permission";
import { Points } from "../../entity/Points";
import { UserPoints } from "../../entity/UserPoints";
import { UserPointHistory } from "../../entity/UserPointHistory";
import { MembershipRenewal } from "../../entity/RenewMembership";
import { calculateYearsBetween } from "../../utils/common.function";
import { ConnectionRequests } from "../../entity/ConnectionRequest";
import bcrypt from "bcryptjs";
// import { sendWelcomeSMS } from "../../utils/sms";
import { SuspensionHistory } from "../../entity/SuspensionHistory";
import { updateChapterBadge } from "../../utils/chapter.badge";
interface RequestWithUser extends Request {
    query: any;
    files(files: any): unknown;
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/member")
export class MemberController {
    private memberRepository = AppDataSource.getMongoRepository(Member);
    private roleRepository = AppDataSource.getMongoRepository(Role);
    private pointsRepo = AppDataSource.getMongoRepository(Points);
    private userPointsRepo = AppDataSource.getMongoRepository(UserPoints);
    private historyRepo = AppDataSource.getMongoRepository(UserPointHistory);
    private ConnectionRepo = AppDataSource.getMongoRepository(ConnectionRequests);
    private adminRepository = AppDataSource.getMongoRepository(Admin);
    private adminUserRepository = AppDataSource.getMongoRepository(AdminUser);

    @Post('/create')
    async createMember(
        @Body() body: CreateMemberDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const phoneNumber = body.phoneNumber;

            const exists = await this.memberRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (exists) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as a Member");
            }

            const existingAdmin = await this.adminRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (existingAdmin) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin");
            }

            const existingAdminUser = await this.adminUserRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (existingAdminUser) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin User");
            }

            const memberRole = await this.roleRepository.findOne({
                where: {
                    code: "member",
                    isDelete: 0
                },
                select: ["_id"]
            });

            if (!memberRole) {
                return response(
                    res,
                    StatusCodes.INTERNAL_SERVER_ERROR,
                    "Default Member role not configured"
                );
            }

            if (body.businessCategory && body.chapter) {
                const categoryExists = await this.memberRepository.findOne({
                    where: {
                        chapter: new ObjectId(body.chapter),
                        businessCategory: new ObjectId(body.businessCategory),
                        isDelete: 0
                    }
                });

                if (categoryExists) {
                    return response(
                        res,
                        StatusCodes.CONFLICT,
                        "This business category is already assigned to another member in this chapter"
                    );
                }
            }

            const memberData = new Member();

            memberData.membershipId = await generateMembershipId();
            memberData.profileImage = body.profileImage || undefined;
            memberData.fullName = body.fullName;
            memberData.phoneNumber = body.phoneNumber;
            memberData.email = body.email;
            memberData.companyName = body.companyName;
            memberData.whatsappNumber = body.whatsappNumber;

            memberData.region = body.region
                ? new ObjectId(body.region)
                : null;

            memberData.chapter = body.chapter
                ? new ObjectId(body.chapter)
                : null;

            memberData.businessCategory = body.businessCategory
                ? new ObjectId(body.businessCategory)
                : null;

            memberData.referredBy = body.referredBy
                ? new ObjectId(body.referredBy)
                : null;

            memberData.position = body.position;
            memberData.dateOfBirth = body.dateOfBirth;
            memberData.anniversary = body.anniversary;

            memberData.isActive = 1;
            memberData.isDelete = 0;

            memberData.officeAddress = {
                doorNo: body.officeAddress.doorNo,
                oldNo: body.officeAddress.oldNo,
                street: body.officeAddress.street,
                area: body.officeAddress.area,
                city: body.officeAddress.city,
                state: body.officeAddress.state,
                pincode: body.officeAddress.pincode,
            };

            memberData.isWantSmsEmailUpdates =
                body.isWantSmsEmailUpdates ?? false;

            memberData.annualFee = body.annualFee;
            memberData.paymentMode = body.paymentMode;
            memberData.transactionId =
                body.paymentMode === "Cash"
                    ? null
                    : body.transactionId;

            memberData.paymentDate =
                body.paymentDate || new Date();

            memberData.joiningDate =
                body.joiningDate || new Date();

            memberData.renewalDate = body.renewalDate;

            memberData.gstNumber = body.gstNumber ?? "";
            memberData.sendWelcomeSms =
                body.sendWelcomeSms ?? false;

            memberData.trainingYear = body.trainingYear;
            memberData.trainingTypes = body.trainingTypes;
            memberData.trainings = body.trainings;
            memberData.awards = body.awards;
            memberData.clubMemberType = body.clubMemberType || "";

            memberData.createdBy = new ObjectId(req.user.userId);
            memberData.updatedBy = new ObjectId(req.user.userId);

            memberData.roleId = new ObjectId(body.roleId) || null;
            memberData.pin = await bcrypt.hash("2026", 10);
            const result =
                await this.memberRepository.save(memberData);

            if (memberData.chapter) {

                const chapterMembers = await this.memberRepository.find({
                    where: {
                        chapter: memberData.chapter,
                        isActive: 1,
                        isDelete: 0,
                        _id: { $ne: new ObjectId(result.id) }

                    },
                    select: ["id"]
                });

                if (chapterMembers.length > 0) {

                    const connections = chapterMembers.map((m: any) => ({
                        memberId: m.id,
                        createdBy: result.id,
                        status: "Approved",
                        isActive: 1,
                        isDelete: 0,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }));

                    await this.ConnectionRepo.insertMany(connections);
                }
            }
            const renewalRepo =
                AppDataSource.getMongoRepository(MembershipRenewal);

            if (memberData.annualFee && memberData.paymentMode) {

                const history = renewalRepo.create({
                    memberId: result.id,
                    amount: Number(memberData.annualFee),
                    years: calculateYearsBetween(
                        memberData.joiningDate,
                        memberData.renewalDate
                    ),
                    paymentMode: memberData.paymentMode,
                    transactionId:
                        memberData.paymentMode === "Cash"
                            ? null
                            : memberData.transactionId,

                    previousHistoryId: null,

                    paymentDate: memberData.paymentDate,
                    previousRenewalDate: null,
                    newRenewalDate: memberData.renewalDate,
                    createdBy: new ObjectId(req.user.userId)
                });

                await renewalRepo.save(history);
            }

            /* ---------------- REFERRAL POINTS ---------------- */

            if (memberData.referredBy) {

                const pointConfig =
                    await this.pointsRepo.findOne({
                        where: {
                            key: "inductions",
                            isActive: 1,
                            isDelete: 0
                        }
                    });

                if (pointConfig) {

                    const referrerId = memberData.referredBy;

                    await this.userPointsRepo.updateOne(
                        { userId: referrerId, pointKey: "inductions" },
                        { $inc: { value: pointConfig.value } },
                        { upsert: true }
                    );

                    await this.historyRepo.save({
                        userId: referrerId,
                        pointKey: "inductions",
                        change: pointConfig.value,
                        source: "INDUCTION",
                        sourceId: result.id,
                        remarks: `Induction points for new member: ${result.fullName}`,
                        createdAt: new Date()
                    });
                }
            }

            // sendWelcomeSMS(memberData.fullName, memberData.phoneNumber, "2026");

            if (result.chapter) {
                await updateChapterBadge(result.chapter);
            }

            return response(
                res,
                StatusCodes.CREATED,
                "Member created successfully",
                result
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


    @Patch('/update/:id')
    async updateMember(
        @Param('id') id: string,
        @Body() body: UpdateMemberDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const member = await this.memberRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            const initialChapterId = member?.chapter;

            if (!member) {
                return response(
                    res,
                    StatusCodes.NOT_FOUND,
                    "Member not found"
                );
            }

            if (body.phoneNumber) {
                const phoneNumber = body.phoneNumber;
                const exists = await this.memberRepository.findOneBy({
                    phoneNumber,
                    isDelete: 0,
                    _id: { $ne: new ObjectId(id) }
                });

                if (exists) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as a Member");
                }
                const existingAdmin = await this.adminRepository.findOneBy({
                    phoneNumber,
                    isDelete: 0
                });

                if (existingAdmin) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin");
                }
                const existingAdminUser = await this.adminUserRepository.findOneBy({
                    phoneNumber,
                    isDelete: 0
                });

                if (existingAdminUser) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin User");
                }
            }

            if (body.email) {
                const emailExists = await this.memberRepository.findOneBy({
                    email: body.email,
                    isDelete: 0,
                    _id: { $ne: new ObjectId(id) }
                });

                if (emailExists) {
                    return response(
                        res,
                        StatusCodes.CONFLICT,
                        "Email already exists"
                    );
                }
            }

            if (body.businessCategory && (body.chapter || member.chapter)) {
                const chapterToCheck = body.chapter ? new ObjectId(body.chapter) : member.chapter;
                const categoryExists = await this.memberRepository.findOne({
                    where: {
                        chapter: chapterToCheck,
                        businessCategory: new ObjectId(body.businessCategory),
                        isDelete: 0,
                        _id: { $ne: new ObjectId(id) }
                    }
                });

                if (categoryExists) {
                    return response(
                        res,
                        StatusCodes.CONFLICT,
                        "This business category is already assigned to another member in this chapter"
                    );
                }
            }

            const updatableFields = [
                "profileImage",
                "fullName",
                "phoneNumber",
                "whatsappNumber",
                "email",
                "companyName",
                "membershipId",
                "position",
                "dateOfBirth",
                "anniversary",
                "annualFee",
                "paymentMode",
                "transactionId",
                "paymentDate",
                "joiningDate",
                "renewalDate",
                "gstNumber",
                "sendWelcomeSms",
                "trainingYear",
                "trainingTypes",
                "trainings",
                "tenure",
                "awardSelected",
                "awards",
                "clubMemberType",
                "isWantSmsEmailUpdates"
            ];

            updatableFields.forEach(field => {
                if (body[field] !== undefined) {
                    member[field] = body[field];
                }
            });

            if (body.region) member.region = new ObjectId(body.region);
            if (body.chapter) member.chapter = new ObjectId(body.chapter);
            if (body.businessCategory)
                member.businessCategory = new ObjectId(body.businessCategory);
            if (body.referredBy)
                member.referredBy = new ObjectId(body.referredBy);
            if (body.roleId)
                member.roleId = new ObjectId(body.roleId);

            if (body.officeAddress) {
                member.officeAddress = {
                    ...member.officeAddress,
                    ...body.officeAddress
                };
            }

            member.updatedBy = new ObjectId(req.user.userId);

            const result = await this.memberRepository.save(member);
            if (result.chapter) {
                await updateChapterBadge(result.chapter);
            }
            if (initialChapterId && (!result.chapter || !initialChapterId.equals(result.chapter))) {
                await updateChapterBadge(initialChapterId);
            }

            if (body.chapter) {

                const connectionRepo =
                    AppDataSource.getMongoRepository("connection_request");

                const chapterMembers = await this.memberRepository.find({
                    where: {
                        chapter: member.chapter,
                        isActive: 1,
                        isDelete: 0,
                        _id: { $ne: new ObjectId(id) }
                    },
                    select: ["id"]
                });

                for (const m of chapterMembers) {
                    const existing = await connectionRepo.findOne({
                        where: {
                            $or: [
                                { memberId: m.id, createdBy: new ObjectId(id) },
                                { memberId: new ObjectId(id), createdBy: m.id }
                            ]
                        }
                    });

                    if (existing) {
                        await connectionRepo.updateOne(
                            { _id: existing._id },
                            {
                                $set: {
                                    status: "Approved",
                                    isActive: 1,
                                    isDelete: 0,
                                    updatedAt: new Date()
                                }
                            }
                        );

                    } else {
                        await connectionRepo.insertOne({
                            memberId: m.id,
                            createdBy: new ObjectId(id),
                            status: "Approved",
                            isActive: 1,
                            isDelete: 0,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                }
            }

            return response(
                res,
                StatusCodes.OK,
                "Member updated successfully",
                result
            );

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }


    @Get("/list")
    async listMembers(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const page = Number(req.query.page ?? 0);
            const limit = Number(req.query.limit ?? 0);
            const search = req.query.search?.toString();

            const regionId = req.query.region?.toString();
            const chapterId = req.query.chapterId?.toString();
            const zoneId = req.query.zoneId?.toString();
            const edId = req.query.edId?.toString();
            const rdId = req.query.rdId?.toString();
            const memberType = req.query.memberType?.toString();

            const match: any = { isDelete: 0 };

            if (regionId && ObjectId.isValid(regionId)) {
                match.region = new ObjectId(regionId);
            }

            if (chapterId && ObjectId.isValid(chapterId)) {
                match.chapter = new ObjectId(chapterId);
            }

            if (memberType) {
                match.clubMemberType = memberType;
            }

            const pipeline: any[] = [

                { $match: match },

                { $sort: { isActive: -1, createdAt: -1 } },

                {
                    $lookup: {
                        from: "regions",
                        localField: "region",
                        foreignField: "_id",
                        as: "regionDetails"
                    }
                },
                { $unwind: { path: "$regionDetails", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        let: { chapterId: "$chapter" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$chapterId"] },

                                            ...(zoneId && ObjectId.isValid(zoneId)
                                                ? [{ $eq: ["$zoneId", new ObjectId(zoneId)] }]
                                                : []),

                                            ...(edId && ObjectId.isValid(edId)
                                                ? [{ $eq: ["$edId", new ObjectId(edId)] }]
                                                : []),

                                            ...(rdId && ObjectId.isValid(rdId)
                                                ? [{ $eq: ["$rdId", new ObjectId(rdId)] }]
                                                : [])
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    chapterName: 1,
                                    zoneId: 1,
                                    edId: 1,
                                    rdId: 1
                                }
                            }
                        ],
                        as: "chapterDetails"
                    }
                },

                { $unwind: { path: "$chapterDetails", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "businessCategory",
                        foreignField: "_id",
                        as: "businessCategoryDetails"
                    }
                },
                { $unwind: { path: "$businessCategoryDetails", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member",
                        localField: "referredBy",
                        foreignField: "_id",
                        as: "referredByDetails"
                    }
                },
                { $unwind: { path: "$referredByDetails", preserveNullAndEmptyArrays: true } },

                {
                    $addFields: {
                        regionName: "$regionDetails.region",
                        chapterName: "$chapterDetails.chapterName",
                        businessCategoryName: "$businessCategoryDetails.name",
                        referredByName: "$referredByDetails.fullName"
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { membershipId: { $regex: search, $options: "i" } },
                            { fullName: { $regex: search, $options: "i" } },
                            { chapterName: { $regex: search, $options: "i" } },
                            { businessCategoryName: { $regex: search, $options: "i" } },
                            { regionName: { $regex: search, $options: "i" } },
                            { companyName: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push(
                {
                    $project: {
                        regionDetails: 0,
                        chapterDetails: 0,
                        businessCategoryDetails: 0,
                        referredByDetails: 0
                    }
                },
                {
                    $facet: {
                        data: [
                            ...(limit > 0
                                ? [{ $skip: page * limit }, { $limit: limit }]
                                : [])
                        ],
                        meta: [{ $count: "total" }]
                    }
                }
            );

            const result = await this.memberRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data ?? [];
            const total = result[0]?.meta[0]?.total ?? 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async memberDetails(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid Member Id')
            }

            const pipeline = [
                {
                    $match: {
                        _id: new ObjectId(id),
                        isDelete: 0
                    }
                },
                {
                    $lookup: {
                        from: "regions",
                        localField: "region",
                        foreignField: "_id",
                        as: "regionDetails"
                    }
                },
                { $unwind: { path: "$regionDetails", preserveNullAndEmptyArrays: true } },

                {
                    $project: {
                        isDelete: 0
                    }
                }
            ];

            const result = await this.memberRepository
                .aggregate(pipeline)
                .toArray();

            if (!result.length) {
                return response(res, StatusCodes.BAD_REQUEST, 'Member not found!!');
            }

            return response(res, StatusCodes.OK, 'Member got successfully', result[0]);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Delete("/delete/:id")
    async deleteMember(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid Member Id')

            }

            const result = await this.memberRepository.findOne({
                where: {
                    _id: new ObjectId(id),
                    isDelete: 0
                }
            });

            if (!result) {
                return response(res, StatusCodes.OK, 'Member got successfully', result[0]);
            }

            await this.memberRepository.update(
                { id: new ObjectId(id) },
                {
                    isDelete: 1,
                    updatedAt: new Date(),
                    updatedBy: req.user?.userId
                }
            );

            if (result.chapter) {
                await updateChapterBadge(result.chapter);
            }

            return response(res, StatusCodes.OK, 'Member deleted successfully');

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Post("/generate/id")
    async getMembershipId(@Req() req: RequestWithUser,
        @Res() res: Response) {
        const id = await generateMembershipId();
        return response(res, StatusCodes.OK, 'Member Id Created successfully', id);
    }
    @Get("/role/code/:roleCode")
    async getAdminUsersByRoleCode(
        @Param("roleCode") roleCode: string,
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Number(query.page ?? 0);
            let limit = Number(query.limit ?? 0);

            const matchStage: any = {
                isDelete: 0
            };

            const pipeline: any[] = [
                { $match: matchStage },
                {
                    $sort: {
                        isActive: -1,
                        createdAt: -1
                    }
                },
                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$roleId"] },
                                            { $eq: ["$code", roleCode] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    name: 1,
                                    code: 1
                                }
                            }
                        ],
                        as: "role"
                    }
                },

                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: false
                    }
                }
            ];

            if (limit > 0) {
                pipeline.push(
                    { $skip: page * limit },
                    { $limit: limit }
                );
            }

            pipeline.push({
                $project: {
                    name: "$fullName",
                    email: 1,
                    companyName: 1,
                    phoneNumber: 1,
                    isActive: 1,
                    roleId: 1,
                    roleName: "$role.name",
                    roleCode: "$role.code",
                    createdAt: 1,
                }
            });

            const result = await this.memberRepository
                .aggregate(pipeline)
                .toArray();

            const totalPipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$roleId"] },
                                            { $eq: ["$code", roleCode] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "role"
                    }
                },
                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: false
                    }
                },
                { $count: "total" }
            ];

            const totalResult = await this.memberRepository
                .aggregate(totalPipeline)
                .toArray();

            const total = totalResult[0]?.total || 0;

            if (limit === 0) {
                limit = total;
            }

            return pagination(total, result, limit, page, res);

        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
    @Get("/by-chapter-role")
    async listMembersByChapterExcludeRole(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Math.max(Number(req.query.limit) || 10, 1);
            const search = req.query.search?.toString();
            const chapterId = req.query.chapterId?.toString();
            const excludeRoleCode = req.query.excludeRoleCode?.toString();

            if (!chapterId || !ObjectId.isValid(chapterId)) {
                return response(res, 400, "Valid chapterId is required");
            }

            if (!excludeRoleCode) {
                return response(res, 400, "excludeRoleCode is required");
            }

            const pipeline: any[] = [

                {
                    $match: {
                        isDelete: 0,
                        chapter: new ObjectId(chapterId),
                        ...(search && {
                            $or: [
                                { fullName: { $regex: search, $options: "i" } },
                                { email: { $regex: search, $options: "i" } },
                                { phoneNumber: { $regex: search, $options: "i" } }
                            ]
                        })
                    }
                },

                {
                    $lookup: {
                        from: "roles",
                        let: { roleId: "$roleId" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$roleId"] },
                                            { $ne: ["$code", excludeRoleCode] },
                                            { $eq: ["$isDelete", 0] }
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    name: 1,
                                    code: 1
                                }
                            }
                        ],
                        as: "role"
                    }
                },
                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: false
                    }
                },

                {
                    $project: {
                        _id: 1,
                        fullName: 1,
                        profileImage: 1,
                        phoneNumber: 1,
                        email: 1,
                        roleName: "$role.name",
                        roleCode: "$role.code",
                        createdAt: 1
                    }
                },

                {
                    $facet: {
                        data: [
                            { $skip: page * limit },
                            { $limit: limit }
                        ],
                        meta: [
                            { $count: "total" }
                        ]
                    }
                }
            ];

            const result =
                await this.memberRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }
    @Patch("/:id/toggle-active")
    async toggleActiveStatus(@Param("id") id: string, @Req() req: RequestWithUser, @Res() res: Response) {
        try {
            const member = await this.memberRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!member) {
                return response(res, StatusCodes.NOT_FOUND, "Member not found");
            }

            member.isActive = member.isActive === 1 ? 0 : 1;
            await this.memberRepository.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        isActive: member.isActive,
                        updatedAt: new Date(),
                        updatedBy: new ObjectId(req.user.userId)
                    }
                }
            );

            const updatedMember = await this.memberRepository.findOneBy({
                _id: new ObjectId(id)
            });

            const suspensionRepo = AppDataSource.getMongoRepository(SuspensionHistory);
            await suspensionRepo.save({
                memberId: member.id,
                reason: "Admin Toggle",
                action: member.isActive === 1 ? "Activated" : "Suspended",
                actionBy: new ObjectId(req.user.userId),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            if (member.chapter) {
                await updateChapterBadge(member.chapter);
            }

            return response(
                res,
                StatusCodes.OK,
                `Member ${member.isActive === 1 ? "enabled" : "disabled"
                } successfully`,
                updatedMember
            );
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/:id/renew")
    async renewMembership(
        @Param("id") id: string,
        @Body() body: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const { amount, years, paymentMode, transactionId } = body;

            if (!amount || !years || !paymentMode) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "Amount, Years and Payment Mode are required"
                );
            }

            if (paymentMode !== "Cash" && !transactionId) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "Transaction ID required for non-cash payments"
                );
            }

            if (!ObjectId.isValid(id)) {
                return response(
                    res,
                    StatusCodes.BAD_REQUEST,
                    "Invalid Member Id"
                );
            }

            const renewalRepo = AppDataSource.getMongoRepository(MembershipRenewal);

            const member = await this.memberRepository.findOne({
                where: {
                    _id: new ObjectId(id),
                    isDelete: 0
                }
            });

            if (!member) {
                return response(res, StatusCodes.NOT_FOUND, "Member not found");
            }

            const lastHistory = await renewalRepo.findOne({
                where: { memberId: member.id },
                order: { createdAt: "DESC" }
            });

            const baseDate =
                member.renewalDate && member.renewalDate > new Date()
                    ? new Date(member.renewalDate)
                    : new Date();

            const newRenewalDate = new Date(baseDate);
            newRenewalDate.setFullYear(
                newRenewalDate.getFullYear() + Number(years)
            );

            const history = renewalRepo.create({
                memberId: member.id,
                amount: Number(amount),
                years: Number(years),
                paymentMode,
                transactionId: paymentMode === "Cash" ? null : transactionId,
                previousHistoryId: lastHistory ? lastHistory.id : null,
                paymentDate: new Date(),
                previousRenewalDate: member.renewalDate,
                newRenewalDate,
                createdBy: new ObjectId(req.user.userId)
            });

            await renewalRepo.save(history);

            const wasInactive = member.isActive === 0;

            member.annualFee = Number(amount);
            member.paymentMode = paymentMode;
            member.transactionId =
                paymentMode === "Cash" ? null : transactionId;
            member.paymentDate = new Date();
            member.renewalDate = newRenewalDate;
            member.isActive = 1;

            await this.memberRepository.save(member);

            if (wasInactive) {
                const suspensionRepo = AppDataSource.getMongoRepository(SuspensionHistory);
                await suspensionRepo.save({
                    memberId: member.id,
                    reason: "Membership Renewal",
                    action: "Activated",
                    actionBy: new ObjectId(req.user.userId),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                if (member.chapter) {
                    await updateChapterBadge(member.chapter);
                }
            }

            return response(res, StatusCodes.OK, "Membership renewed successfully", {
                renewalDate: newRenewalDate,
                previousHistoryId: history.previousHistoryId
            });

        } catch (err) {
            console.error(err);
            return response(res, StatusCodes.INTERNAL_SERVER_ERROR, "Server error");
        }
    }
    @Get("/referredby-list")
    async getReferredByList(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const search = req.query.search?.toString();

            const pipeline: any[] = [];

            pipeline.push(
                { $match: { isDelete: 0 } },
                {
                    $project: {
                        _id: 1,
                        name: "$fullName",
                        phoneNumber: 1,
                        source: { $literal: "MEMBER" }
                    }
                }
            );

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { name: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({
                $unionWith: {
                    coll: "adminusers",
                    pipeline: [
                        { $match: { isDelete: 0 } },
                        {
                            $project: {
                                _id: 1,
                                name: "$name",
                                phoneNumber: 1,
                                source: { $literal: "ADMINUSER" }
                            }
                        }
                    ]
                }
            });

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { name: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({
                $sort: {
                    isActive: -1,
                    name: -1
                }
            });

            const result =
                await this.memberRepository.aggregate(pipeline).toArray();

            return response(
                res,
                200,
                "Referred by list fetched",
                result
            );

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }

}
