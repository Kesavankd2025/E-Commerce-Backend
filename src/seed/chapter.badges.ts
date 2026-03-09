import { AppDataSource } from "../data-source";
import { Badge } from "../entity/Badge";
import { BadgeType } from "../enum/badges";

export async function seedChapterBadges() {
    try {
        const badgeRepo = AppDataSource.getMongoRepository(Badge);

        const badgesToSeed = [
            { name: "Prime", type: BadgeType.CHAPTER },
            { name: "Elite", type: BadgeType.CHAPTER }
        ];

        for (const badgeData of badgesToSeed) {
            const existing = await badgeRepo.findOneBy({
                name: { $regex: new RegExp(`^${badgeData.name}$`, "i") },
                type: badgeData.type,
                isDelete: 0
            });

            if (!existing) {
                const badge = badgeRepo.create({
                    ...badgeData,
                    isActive: 1,
                    isDelete: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                await badgeRepo.save(badge);
                console.log(`✅ Seeded Chapter Badge: ${badgeData.name}`);
            }
        }
    } catch (error) {
        console.error("❌ Error seeding chapter badges:", error);
    }
}
