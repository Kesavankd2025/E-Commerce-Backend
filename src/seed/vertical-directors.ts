import { AppDataSource } from "../data-source";
import { VerticalDirectorRole } from "../entity/VerticalDirectorRole";

export async function seedVerticalDirectors() {
    const roleRepo = AppDataSource.getMongoRepository(VerticalDirectorRole);

    const predefinedRoles = [
        "Training Director",
        "121 Director",
        "Referral Director",
        "Attendance Director",
        "Business Resource Director",
        "Event Director",
        "Membership Director",
        "Visitor Director"
    ];

    for (const roleName of predefinedRoles) {
        const code = roleName.toLowerCase().replace(/\s+/g, "_");

        const existingRoles = await roleRepo.find({
            where: { name: roleName }
        });

        if (existingRoles.length === 0) {
            const newRole = new VerticalDirectorRole();
            newRole.name = roleName;
            newRole.code = code;
            newRole.isActive = 1;
            newRole.isDelete = 0;
            await roleRepo.save(newRole);
        } else if (existingRoles.length > 1) {
            const keepRole = existingRoles[0];

            if (keepRole.code !== code) {
                keepRole.code = code;
                await roleRepo.save(keepRole);
            }

            const idsToDelete = existingRoles.slice(1).map(r => r._id);
            if (idsToDelete.length > 0) {
                await roleRepo.deleteMany({ _id: { $in: idsToDelete } });
            }
        } else if (existingRoles.length === 1 && existingRoles[0].code !== code) {
            existingRoles[0].code = code;
            await roleRepo.save(existingRoles[0]);
        }
    }

    console.log("🌟 Vertical Director Roles seeded successfully");
}
