import {
    JsonController,
    Get,
    Res
} from "routing-controllers";
import { Response } from "express";
import { AppDataSource } from "../../data-source";
import { VerticalDirectorAssignment } from "../../entity/VerticalDirectorAssignment";
import response from "../../utils/response";

@JsonController("/vertical-directors")
export class VerticalDirectorController {

    private assignmentRepo = AppDataSource.getMongoRepository(VerticalDirectorAssignment);

    @Get("/list")
    async listAssignments(@Res() res: Response) {
        try {
            const data = await this.assignmentRepo.aggregate([
                {
                    $match: { isDelete: 0 }
                },
                {
                    $lookup: {
                        from: "vertical_director_roles",
                        localField: "roleId",
                        foreignField: "_id",
                        as: "role"
                    }
                },
                { $unwind: "$role" },
                {
                    $lookup: {
                        from: "member",
                        let: { memberId: "$memberId" },
                        pipeline: [
                            {
                                $match: { $expr: { $eq: ["$_id", "$$memberId"] } }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    profileImage: 1,
                                    fullName: 1,
                                    phoneNumber: 1,
                                    email: 1,
                                    companyName: 1
                                }
                            }
                        ],
                        as: "member"
                    }
                },
                { $unwind: "$member" },
                {
                    $project: {
                        _id: 1,
                        roleName: "$role.name",
                        roleCode: "$role.code",
                        member: {
                            id: "$member._id",
                            profileImage: "$member.profileImage",
                            fullName: "$member.fullName",
                            phoneNumber: "$member.phoneNumber",
                            email: "$member.email",
                            companyName: "$member.companyName"
                        }
                    }
                }
            ]).toArray();

            return response(res, 200, "Success", data);

        } catch (err) {
            console.error(err);
            return response(res, 500, "Failed to fetch assignments");
        }
    }
}
