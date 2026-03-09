import { ObjectId } from "mongodb";
import { AppDataSource } from "../data-source";
import { Chapter } from "../entity/Chapter";
import { Member } from "../entity/Member";
import { Badge } from "../entity/Badge";
import { BadgeType } from "../enum/badges";

export const updateChapterBadge = async (chapterId: string | ObjectId) => {
    try {
        const chapterRepo = AppDataSource.getMongoRepository(Chapter);
        const memberRepo = AppDataSource.getMongoRepository(Member);
        const badgeRepo = AppDataSource.getMongoRepository(Badge);

        const chapter = await chapterRepo.findOneBy({ _id: new ObjectId(chapterId) });
        if (!chapter) return;

        if (chapter.isActive === 0 || chapter.isDelete === 1) {
            let primeBadge = await badgeRepo.findOneBy({ name: { $regex: /^Prime$/i }, type: BadgeType.CHAPTER, isDelete: 0 });
            let eliteBadge = await badgeRepo.findOneBy({ name: { $regex: /^Elite$/i }, type: BadgeType.CHAPTER, isDelete: 0 });

            if (chapter.badgeIds) {
                chapter.badgeIds = chapter.badgeIds.filter(id => {
                    const isPrime = primeBadge && id.equals(primeBadge.id);
                    const isElite = eliteBadge && id.equals(eliteBadge.id);
                    return !isPrime && !isElite;
                });
                await chapterRepo.save(chapter);
            }
            return;
        }

        const activeMembersCount = await memberRepo.count({
            chapter: new ObjectId(chapterId),
            isActive: 1,
            isDelete: 0
        });

        const primeBadge = await badgeRepo.findOneBy({ name: { $regex: /^Prime$/i }, type: BadgeType.CHAPTER, isDelete: 0 });
        const eliteBadge = await badgeRepo.findOneBy({ name: { $regex: /^Elite$/i }, type: BadgeType.CHAPTER, isDelete: 0 });

        if (!primeBadge || !eliteBadge) {
            console.warn("⚠️ Chapter badges (Prime/Elite) not found in database. Please ensure they are seeded.");
            return;
        }

        const allChapterBadges = await badgeRepo.find({ where: { type: BadgeType.CHAPTER, isDelete: 0 } });
        const allChapterBadgeIds = allChapterBadges.map(b => b.id.toString());

        if (!chapter.badgeIds) chapter.badgeIds = [];

        chapter.badgeIds = chapter.badgeIds.filter(id => !allChapterBadgeIds.includes(id.toString()));

        if (activeMembersCount >= 60) {
            chapter.badgeIds.push(eliteBadge.id);
        } else if (activeMembersCount >= 40) {
            chapter.badgeIds.push(primeBadge.id);
        }

        await chapterRepo.save(chapter);

        console.log(`Updated Chapter ${chapter.chapterName} Badge based on ${activeMembersCount} members`);
    } catch (error) {
        console.error("Error updating chapter badge:", error);
    }
};
