import { hasPermission } from "../utils/common.function";

export const canAccess = (feature: string, action: any) => {
    return async (req, res, next) => {
        const role = req.user.role; // populated role

        if (!hasPermission(role, feature, action)) {
            return res.status(403).json({ message: "Permission denied" });
        }

        next();
    };
};
