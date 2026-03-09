import {
    ExpressMiddlewareInterface,
    UnauthorizedError,
} from "routing-controllers";
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt";
import { AppDataSource } from "../data-source";
import { Member } from "../entity/Member";
import { Admin } from "../entity/Admin";
import { AdminUser } from "../entity/AdminUser";
import { Customer } from "../entity/Customer";
import { ObjectId } from "mongodb";

import { UserToken } from "../entity/UserToken";

export interface AuthPayload {
    userId: string;
    role?: string;
    roleId?: string;
    userType?: "ADMIN" | "ADMIN_USER" | "MEMBER" | "CUSTOMER";
}

export class AuthMiddleware implements ExpressMiddlewareInterface {
    async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                throw new UnauthorizedError("Authorization header missing");
            }

            if (!authHeader.startsWith("Bearer ")) {
                throw new UnauthorizedError("Invalid authorization format");
            }

            const token = authHeader.split(" ")[1];

            if (!token) {
                throw new UnauthorizedError("Token missing");
            }
            const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

            if (!decoded || typeof decoded !== "object" || !decoded.id) {
                throw new Error("Invalid token payload");
            }

            // Check if user is still active in database
            const userId = decoded.id;
            const userType = decoded.userType;
            let user: any = null;

            if (userType === "MEMBER") {
                user = await AppDataSource.getMongoRepository(Member).findOneBy({
                    _id: new ObjectId(userId),
                    isDelete: 0
                });
            } else if (userType === "ADMIN") {
                user = await AppDataSource.getMongoRepository(Admin).findOneBy({
                    _id: new ObjectId(userId),
                    isDelete: 0
                });
            } else if (userType === "ADMIN_USER") {
                user = await AppDataSource.getMongoRepository(AdminUser).findOneBy({
                    _id: new ObjectId(userId),
                    isDelete: 0
                });
            } else if (userType === "CUSTOMER") {
                user = await AppDataSource.getMongoRepository(Customer).findOneBy({
                    _id: new ObjectId(userId),
                    isDelete: 0
                });
            }

            if (!user) {
                throw new UnauthorizedError("User not found or account deleted");
            }

            if (!user.isActive) {
                throw new UnauthorizedError("Account is inactive. Please contact admin.");
            }

            const activeTokenRecord = await AppDataSource.getMongoRepository(UserToken).findOneBy({
                userId: new ObjectId(userId),
                token: token
            });

            if (!activeTokenRecord) {
                throw new UnauthorizedError("Session expired. Another login detected.");
            }

            (req as any).user = {
                ...decoded,
                userId: decoded.id
            };

            next();
        } catch (error: any) {
            if (error instanceof UnauthorizedError) {
                throw error;
            }
            throw new UnauthorizedError("Invalid or expired token");
        }
    }
}
