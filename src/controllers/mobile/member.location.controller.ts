import {
    JsonController,
    UseBefore,
    Req,
    Res,
    Post,
    Body,
    Get,
    Patch,
    Param,
    QueryParams
} from "routing-controllers";
import { Request } from "express";
import { AppDataSource } from "../../data-source";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import { handleErrorResponse } from "../../utils";
import { MemberLocation } from "../../entity/MemberLocation";
import { Member } from "../../entity/Member";
import { ConnectionRequests } from "../../entity/ConnectionRequest";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/member-location")
export class MemberLocationController {
    private memberLocationRepo = AppDataSource.getMongoRepository(MemberLocation);
    private connectionRepo = AppDataSource.getMongoRepository(ConnectionRequests);

    @Post("/create")
    async createPinnedLocation(
        @Body() body: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {

            const { name, location } = body;

            if (!name) {
                return response(res, 400, "Location name is required");
            }

            if (
                !location ||
                location.latitude === undefined ||
                location.longitude === undefined
            ) {
                return response(res, 400, "Latitude and Longitude are required");
            }

            const memberId = new ObjectId(req.user.userId);

            const pin = new MemberLocation();

            pin.memberId = memberId;
            pin.name = name;
            pin.location = {
                name: location.name || "",
                latitude: Number(location.latitude),
                longitude: Number(location.longitude)
            };

            pin.isActive = 1;
            pin.isDelete = 0;
            pin.createdBy = memberId;

            const saved =
                await this.memberLocationRepo.save(pin);

            return response(
                res,
                201,
                "Location pinned successfully",
                saved
            );

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async getLocations(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const memberId = new ObjectId(req.user.userId);

            const locations = await this.memberLocationRepo.find({
                where: {
                    memberId: memberId,
                    isDelete: 0,
                    // isActive: 1
                },
                order: {
                    createdAt: "DESC"
                }
            });

            return response(
                res,
                200,
                "Locations fetched successfully",
                locations
            );
        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }

    @Patch("/:id")
    async updatePinnedLocation(
        @Param("id") id: string,
        @Body() body: any,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const location = await this.memberLocationRepo.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0,
                memberId: new ObjectId(req.user.userId)
            });

            if (!location) {
                return response(res, StatusCodes.NOT_FOUND, "Location not found or not authorized");
            }

            if (body.name) {
                location.name = body.name;
            }

            if (body.location) {
                if (
                    body.location.latitude === undefined ||
                    body.location.longitude === undefined
                ) {
                    return response(res, 400, "Latitude and Longitude are required");
                }

                location.location = {
                    name: body.location.name || location.location.name || "",
                    latitude: Number(body.location.latitude),
                    longitude: Number(body.location.longitude)
                };
            }

            location.updatedBy = new ObjectId(req.user.userId);

            const updated = await this.memberLocationRepo.save(location);

            return response(res, StatusCodes.OK, "Location updated successfully", updated);

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }

    @Get("/nearby-list")
    async getNearbyMembers(
        @QueryParams() query: any,
        @Res() res: Response,
        @Req() req: RequestWithUser
    ) {
        try {
            const lat = Number(query.lat);
            const lon = Number(query.lon);

            if (isNaN(lat) || isNaN(lon)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid latitude or longitude");
            }

            const loggedInUserId = new ObjectId(req.user.userId);
            const rangeKm = 7;

            // Convert KM to degrees
            const degLat = rangeKm / 110.574;
            const degLon = rangeKm / (111.32 * Math.cos(lat * (Math.PI / 180)));

            const minLat = lat - degLat;
            const maxLat = lat + degLat;
            const minLon = lon - degLon;
            const maxLon = lon + degLon;

            const roughLocations = await this.memberLocationRepo.find({
                where: {
                    isActive: 1,
                    isDelete: 0,
                    "location.latitude": { $gte: minLat, $lte: maxLat },
                    "location.longitude": { $gte: minLon, $lte: maxLon },
                    memberId: { $ne: loggedInUserId }
                }
            });

            const exactLocations = roughLocations.filter(loc => {
                const dist = this.getDistanceFromLatLonInKm(
                    lat,
                    lon,
                    loc.location.latitude,
                    loc.location.longitude
                );
                return dist <= rangeKm;
            });

            if (exactLocations.length === 0) {
                return response(res, StatusCodes.OK, "No nearby members found", []);
            }

            const memberIds = [
                ...new Set(exactLocations.map(l => l.memberId.toString()))
            ].map(id => new ObjectId(id));

            const memberRepo = AppDataSource.getMongoRepository(Member);

            const pipeline = [
                {
                    $match: {
                        _id: { $in: memberIds }
                    }
                },
                {
                    $lookup: {
                        from: "businesscategories",
                        localField: "businessCategory",
                        foreignField: "_id",
                        as: "category"
                    }
                },
                { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
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
                    $lookup: {
                        from: "connection_request",
                        let: { memberId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$isActive", 1] },
                                            { $eq: ["$isDelete", 0] },
                                            { $ne: ["$status", "Declined"] },
                                            {
                                                $or: [
                                                    {
                                                        $and: [
                                                            { $eq: ["$createdBy", loggedInUserId] },
                                                            { $eq: ["$memberId", "$$memberId"] }
                                                        ]
                                                    },
                                                    {
                                                        $and: [
                                                            { $eq: ["$memberId", loggedInUserId] },
                                                            { $eq: ["$createdBy", "$$memberId"] }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                }
                            },
                            { $sort: { updatedAt: -1 } }
                        ],
                        as: "connectionData"
                    }
                },
                {
                    $addFields: {
                        isConnected: {
                            $cond: {
                                if: { $gt: [{ $size: "$connectionData" }, 0] },
                                then: {
                                    $switch: {
                                        branches: [
                                            { case: { $eq: [{ $arrayElemAt: ["$connectionData.status", 0] }, "Pending"] }, then: "Requested" },
                                            { case: { $eq: [{ $arrayElemAt: ["$connectionData.status", 0] }, "Approved"] }, then: "Approved" }
                                        ],
                                        default: "Not Requested"
                                    }
                                },
                                else: "Not Requested"
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        fullName: 1,
                        companyName: 1,
                        categoryName: "$category.name",
                        chapterName: "$chapterDetails.chapterName",
                        profileImage: 1,
                        isConnected: 1
                    }
                }
            ];

            const members = await memberRepo.aggregate(pipeline).toArray();

            const memberMap = new Map(
                members.map(m => [m._id.toString(), m])
            );

            const result = exactLocations.map(loc => {
                const member = memberMap.get(loc.memberId.toString());
                if (!member) return null;

                return {
                    memberId: member._id,
                    memberName: member.fullName,
                    companyName: member.companyName,
                    categoryName: member.categoryName,
                    chapterName: member.chapterName,
                    profileImage: member.profileImage,
                    location: loc.location,
                    isConnected: member.isConnected
                };
            }).filter(item => item !== null);

            return response(
                res,
                StatusCodes.OK,
                "Nearby members fetched successfully",
                result
            );

        } catch (error) {
            console.error(error);
            return handleErrorResponse(error, res);
        }
    }


    private getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371;
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;
        return d;
    }

    private deg2rad(deg: number) {
        return deg * (Math.PI / 180);
    }
}
