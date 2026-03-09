import { ObjectId } from "mongodb";
import { Role } from "../entity/Role.Permission";

export function hasPermission(
    role: Role,
    moduleId: string | ObjectId,
    action: "view" | "add" | "edit" | "delete"
): boolean {
    if (!role?.permissions?.length) return false;

    const moduleObjectId =
        typeof moduleId === "string" ? new ObjectId(moduleId) : moduleId;

    const permission = role.permissions.find(
        p => p.moduleId.toString() === moduleObjectId.toString()
    );

    return Boolean(permission?.actions?.[action]);
}
function calculateYearsBetween(start: Date, end: Date): number {
  const startDate = new Date(start);
  const endDate = new Date(end);

  let years = endDate.getFullYear() - startDate.getFullYear();

  const anniversary =
    new Date(startDate);
  anniversary.setFullYear(startDate.getFullYear() + years);

  if (endDate < anniversary) {
    years -= 1;
  }

  return Math.max(years, 1);
}
export { calculateYearsBetween };